package exams

import (
	"context"
	cryptorand "crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidStudentCredentials = errors.New("ID atau sandi tidak sesuai.")
var ErrInvalidStudentSession = errors.New("Sesi siswa sudah tidak aktif. Silakan login kembali.")
var ErrStudentAccessRevoked = errors.New("Akses ujian ini sudah tidak berlaku.")

type StudentSession struct {
	AccessID       string    `json:"access_id"`
	StudentID      string    `json:"student_id"`
	StudentName    string    `json:"student_name"`
	ClassName      string    `json:"class_name"`
	ExamID         string    `json:"exam_id"`
	ExamTitle      string    `json:"exam_title"`
	Subject        string    `json:"subject"`
	StartsAt       time.Time `json:"starts_at"`
	CheckInEndsAt  time.Time `json:"checkin_ends_at"`
	ExamStatus     string    `json:"exam_status"`
	TimerEnabled   bool      `json:"timer_enabled"`
	DurationMinute *int      `json:"duration_minutes"`
	RepeatCount    int       `json:"repeat_count"`
	ScorePolicy    string    `json:"score_policy"`
	sessionHash    string
}

func (r *Repository) StudentLogin(ctx context.Context, userID, password string) (StudentSession, string, error) {
	var session StudentSession
	var passwordHash string
	var className sql.NullString
	var subject sql.NullString
	err := r.DB.QueryRowContext(ctx, `SELECT a.id::text,a.student_id::text,s.name,COALESCE(c.name,''),e.id::text,e.title,COALESCE(sub.name,e.subject),e.starts_at,e.checkin_ends_at,e.status,e.timer_enabled,e.duration_minutes,e.repeat_count,e.score_policy,a.password_hash FROM exam_student_access a JOIN students s ON s.id=a.student_id JOIN exams e ON e.id=a.exam_id LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN subjects sub ON sub.id=e.subject_id WHERE a.user_id=$1 AND a.revoked_at IS NULL AND s.archived_at IS NULL`, strings.TrimSpace(userID)).Scan(&session.AccessID, &session.StudentID, &session.StudentName, &className, &session.ExamID, &session.ExamTitle, &subject, &session.StartsAt, &session.CheckInEndsAt, &session.ExamStatus, &session.TimerEnabled, &session.DurationMinute, &session.RepeatCount, &session.ScorePolicy, &passwordHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return session, "", ErrInvalidStudentCredentials
		}
		return session, "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)) != nil {
		return StudentSession{}, "", ErrInvalidStudentCredentials
	}
	var secret [32]byte
	if _, err = cryptorand.Read(secret[:]); err != nil {
		return StudentSession{}, "", err
	}
	token := base64.RawURLEncoding.EncodeToString(secret[:])
	expires := time.Now().UTC().Add(24 * time.Hour)
	if _, err = r.DB.ExecContext(ctx, `UPDATE exam_student_access SET session_token_hash=$2,session_expires_at=$3 WHERE id=$1 AND revoked_at IS NULL`, session.AccessID, studentSessionHash(token), expires); err != nil {
		return StudentSession{}, "", err
	}
	session.ClassName = className.String
	session.Subject = subject.String
	session.sessionHash = studentSessionHash(token)
	return session, token, nil
}

func (r *Repository) AuthenticateStudent(ctx context.Context, token string) (StudentSession, error) {
	if token == "" {
		return StudentSession{}, ErrInvalidStudentSession
	}
	var session StudentSession
	err := r.DB.QueryRowContext(ctx, `SELECT a.id::text,a.student_id::text,s.name,COALESCE(c.name,''),e.id::text,e.title,COALESCE(sub.name,e.subject),e.starts_at,e.checkin_ends_at,e.status,e.timer_enabled,e.duration_minutes,e.repeat_count,e.score_policy FROM exam_student_access a JOIN students s ON s.id=a.student_id JOIN exams e ON e.id=a.exam_id LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN subjects sub ON sub.id=e.subject_id WHERE a.session_token_hash=$1 AND a.session_expires_at>now() AND a.revoked_at IS NULL AND s.archived_at IS NULL`, studentSessionHash(token)).Scan(&session.AccessID, &session.StudentID, &session.StudentName, &session.ClassName, &session.ExamID, &session.ExamTitle, &session.Subject, &session.StartsAt, &session.CheckInEndsAt, &session.ExamStatus, &session.TimerEnabled, &session.DurationMinute, &session.RepeatCount, &session.ScorePolicy)
	if errors.Is(err, sql.ErrNoRows) {
		return StudentSession{}, ErrInvalidStudentSession
	}
	session.sessionHash = studentSessionHash(token)
	return session, err
}

func (r *Repository) StudentLogout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	_, err := r.DB.ExecContext(ctx, `UPDATE exam_student_access SET session_token_hash=NULL,session_expires_at=NULL WHERE session_token_hash=$1`, studentSessionHash(token))
	return err
}

func studentSessionHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
