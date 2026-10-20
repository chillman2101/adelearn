package exams

import (
	"context"
	cryptorand "crypto/rand"
	"database/sql"
	"errors"
	"math/big"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var ErrNoStudents = errors.New("Belum ada siswa aktif di kelas ujian ini.")

func (r *Repository) ListStudentAccess(ctx context.Context, examID string) ([]StudentAccess, error) {
	var exists bool
	if err := r.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id=$1)`, examID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrNotFound
	}
	rows, err := r.DB.QueryContext(ctx, `SELECT s.id::text,s.name,COALESCE(a.user_id,''),a.generated_at FROM exams e JOIN students s ON s.class_id=e.class_id AND s.archived_at IS NULL LEFT JOIN exam_student_access a ON a.exam_id=e.id AND a.student_id=s.id AND a.revoked_at IS NULL WHERE e.id=$1 ORDER BY lower(s.name),s.id`, examID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StudentAccess{}
	for rows.Next() {
		var item StudentAccess
		var generatedAt sql.NullTime
		if err := rows.Scan(&item.StudentID, &item.StudentName, &item.UserID, &generatedAt); err != nil {
			return nil, err
		}
		if generatedAt.Valid {
			item.GeneratedAt = generatedAt.Time
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repository) GenerateStudentAccessForStudent(ctx context.Context, examID, studentID string) (StudentAccess, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return StudentAccess{}, err
	}
	defer tx.Rollback()

	var classID sql.NullString
	if err = tx.QueryRowContext(ctx, `SELECT class_id::text FROM exams WHERE id=$1 FOR UPDATE`, examID).Scan(&classID); errors.Is(err, sql.ErrNoRows) {
		return StudentAccess{}, ErrNotFound
	} else if err != nil {
		return StudentAccess{}, err
	}
	if !classID.Valid || classID.String == "" {
		return StudentAccess{}, FieldErrors{"class_id": "Pilih kelas ujian terlebih dahulu."}
	}
	var item StudentAccess
	if err = tx.QueryRowContext(ctx, `SELECT id::text,name FROM students WHERE id=$1 AND class_id=$2 AND archived_at IS NULL FOR UPDATE`, studentID, classID.String).Scan(&item.StudentID, &item.StudentName); errors.Is(err, sql.ErrNoRows) {
		return StudentAccess{}, ErrNoStudents
	} else if err != nil {
		return StudentAccess{}, err
	}

	for attempt := 0; attempt < 20; attempt++ {
		item.UserID, err = randomCode("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5)
		if err != nil {
			return StudentAccess{}, err
		}
		var exists bool
		if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM exam_student_access WHERE user_id=$1)`, item.UserID).Scan(&exists); err != nil {
			return StudentAccess{}, err
		}
		if !exists {
			break
		}
		item.UserID = ""
	}
	if item.UserID == "" {
		return StudentAccess{}, errors.New("Gagal membuat ID siswa yang unik. Coba lagi.")
	}
	password, err := randomCode("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", 5)
	if err != nil {
		return StudentAccess{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return StudentAccess{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE exam_student_access SET revoked_at=now(),session_token_hash=NULL,session_expires_at=NULL WHERE exam_id=$1 AND student_id=$2 AND revoked_at IS NULL`, examID, studentID); err != nil {
		return StudentAccess{}, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO exam_student_access(exam_id,student_id,user_id,password_hash) VALUES($1,$2,$3,$4)`, examID, studentID, item.UserID, string(hash)); err != nil {
		return StudentAccess{}, err
	}
	item.Password = password
	item.GeneratedAt = time.Now().UTC()
	if err = tx.Commit(); err != nil {
		return StudentAccess{}, err
	}
	return item, nil
}

func (r *Repository) GenerateStudentAccess(ctx context.Context, examID string) ([]StudentAccess, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var classID sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT class_id::text FROM exams WHERE id=$1 FOR UPDATE`, examID).Scan(&classID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if !classID.Valid || classID.String == "" {
		return nil, FieldErrors{"class_id": "Pilih kelas ujian terlebih dahulu."}
	}

	rows, err := tx.QueryContext(ctx, `SELECT id::text,name FROM students WHERE class_id=$1 AND archived_at IS NULL ORDER BY lower(name),id`, classID.String)
	if err != nil {
		return nil, err
	}
	type candidate struct{ id, name string }
	candidates := []candidate{}
	for rows.Next() {
		var item candidate
		if err = rows.Scan(&item.id, &item.name); err != nil {
			rows.Close()
			return nil, err
		}
		candidates = append(candidates, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(candidates) == 0 {
		return nil, ErrNoStudents
	}

	credentials := make([]StudentAccess, 0, len(candidates))
	hashes := make([]string, 0, len(candidates))
	reservedUserIDs := make(map[string]struct{}, len(candidates))
	for _, student := range candidates {
		var userID string
		for attempt := 0; attempt < 20; attempt++ {
			userID = ""
			userID, err = randomCode("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5)
			if err != nil {
				return nil, err
			}
			if _, reserved := reservedUserIDs[userID]; reserved {
				continue
			}
			var exists bool
			if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM exam_student_access WHERE user_id=$1)`, userID).Scan(&exists); err != nil {
				return nil, err
			}
			if !exists {
				reservedUserIDs[userID] = struct{}{}
				break
			}
			userID = ""
		}
		if userID == "" {
			return nil, errors.New("Gagal membuat ID siswa yang unik. Coba generate ulang.")
		}
		password, err := randomCode("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", 5)
		if err != nil {
			return nil, err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		credentials = append(credentials, StudentAccess{StudentID: student.id, StudentName: student.name, UserID: userID, Password: password, GeneratedAt: time.Now().UTC()})
		hashes = append(hashes, string(hash))
	}

	if _, err = tx.ExecContext(ctx, `UPDATE exam_student_access SET revoked_at=now(),session_token_hash=NULL,session_expires_at=NULL WHERE exam_id=$1 AND revoked_at IS NULL`, examID); err != nil {
		return nil, err
	}
	for index, credential := range credentials {
		if _, err = tx.ExecContext(ctx, `INSERT INTO exam_student_access(exam_id,student_id,user_id,password_hash) VALUES($1,$2,$3,$4)`, examID, credential.StudentID, credential.UserID, hashes[index]); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return credentials, nil
}

func randomCode(alphabet string, length int) (string, error) {
	result := make([]byte, length)
	limit := big.NewInt(int64(len(alphabet)))
	for index := range result {
		number, err := cryptorand.Int(cryptorand.Reader, limit)
		if err != nil {
			return "", err
		}
		result[index] = alphabet[number.Int64()]
	}
	return string(result), nil
}
