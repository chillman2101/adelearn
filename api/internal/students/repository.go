package students

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"
)

var ErrNotFound = errors.New("student not found")

type FieldErrors map[string]string

func (e FieldErrors) Error() string { return "student validation failed" }

type Student struct {
	ID        string    `json:"id"`
	ClassID   string    `json:"class_id"`
	Class     string    `json:"class"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Filters struct {
	ClassID string
	Query   string
}

type Repository struct{ DB *sql.DB }

func (r *Repository) List(ctx context.Context, filters Filters) ([]Student, error) {
	query := `SELECT s.id::text,s.class_id::text,c.name,s.name,s.created_at,s.updated_at FROM students s JOIN classes c ON c.id=s.class_id WHERE s.archived_at IS NULL`
	args := []any{}
	if filters.ClassID != "" {
		args = append(args, filters.ClassID)
		query += ` AND s.class_id=$` + itoa(len(args))
	}
	if filters.Query != "" {
		args = append(args, "%"+filters.Query+"%")
		query += ` AND s.name ILIKE $` + itoa(len(args))
	}
	query += ` ORDER BY lower(s.name),s.id LIMIT 1000`
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Student{}
	for rows.Next() {
		var item Student
		if err := rows.Scan(&item.ID, &item.ClassID, &item.Class, &item.Name, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repository) Get(ctx context.Context, id string) (Student, error) {
	var item Student
	err := r.DB.QueryRowContext(ctx, `SELECT s.id::text,s.class_id::text,c.name,s.name,s.created_at,s.updated_at FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=$1 AND s.archived_at IS NULL`, id).Scan(&item.ID, &item.ClassID, &item.Class, &item.Name, &item.CreatedAt, &item.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Student{}, ErrNotFound
	}
	return item, err
}

func (r *Repository) Create(ctx context.Context, item Student) (Student, error) {
	if err := validate(&item); err != nil {
		return Student{}, err
	}
	err := r.DB.QueryRowContext(ctx, `INSERT INTO students(class_id,name) VALUES($1,$2) RETURNING id::text,created_at,updated_at`, item.ClassID, item.Name).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return Student{}, err
	}
	return r.Get(ctx, item.ID)
}

func (r *Repository) Update(ctx context.Context, id string, item Student) (Student, error) {
	if err := validate(&item); err != nil {
		return Student{}, err
	}
	result, err := r.DB.ExecContext(ctx, `UPDATE students SET class_id=$2,name=$3 WHERE id=$1 AND archived_at IS NULL`, id, item.ClassID, item.Name)
	if err != nil {
		return Student{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return Student{}, err
	}
	if count == 0 {
		return Student{}, ErrNotFound
	}
	return r.Get(ctx, id)
}

func (r *Repository) Archive(ctx context.Context, id string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE students SET archived_at=now() WHERE id=$1 AND archived_at IS NULL`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrNotFound
	}
	if _, err = tx.ExecContext(ctx, `UPDATE exam_student_access SET revoked_at=now() WHERE student_id=$1 AND revoked_at IS NULL`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func validate(item *Student) error {
	item.Name = strings.TrimSpace(item.Name)
	fields := FieldErrors{}
	if item.Name == "" {
		fields["name"] = "Nama siswa wajib diisi."
	}
	if strings.TrimSpace(item.ClassID) == "" {
		fields["class_id"] = "Pilih kelas siswa."
	}
	if len(fields) > 0 {
		return fields
	}
	return nil
}

func itoa(value int) string {
	return strconv.Itoa(value)
}
