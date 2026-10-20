package settings

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

type Settings struct {
	ClassID      string `json:"class_id"`
	Class        string `json:"class"`
	TeacherID    string `json:"teacher_id"`
	TeacherName  string `json:"teacher_name"`
	AcademicYear string `json:"academic_year"`
}

type Repository struct{ DB *sql.DB }

func (r *Repository) Get(ctx context.Context) (Settings, error) {
	var value Settings
	err := r.DB.QueryRowContext(ctx, `SELECT COALESCE(s.class_id::text,''),COALESCE(c.name,''),COALESCE(s.teacher_id::text,''),COALESCE(t.name,''),s.academic_year FROM app_settings s LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN teachers t ON t.id=s.teacher_id WHERE s.id=1`).Scan(&value.ClassID, &value.Class, &value.TeacherID, &value.TeacherName, &value.AcademicYear)
	if errors.Is(err, sql.ErrNoRows) {
		return Settings{}, nil
	}
	return value, err
}

func (r *Repository) Save(ctx context.Context, value Settings) (Settings, error) {
	value.AcademicYear = strings.TrimSpace(value.AcademicYear)
	err := r.DB.QueryRowContext(ctx, `INSERT INTO app_settings(id,class_id,teacher_id,academic_year) VALUES(1,NULLIF($1,'')::uuid,NULLIF($2,'')::uuid,$3) ON CONFLICT(id) DO UPDATE SET class_id=EXCLUDED.class_id,teacher_id=EXCLUDED.teacher_id,academic_year=EXCLUDED.academic_year,updated_at=now() RETURNING COALESCE(class_id::text,''),academic_year`, value.ClassID, value.TeacherID, value.AcademicYear).Scan(&value.ClassID, &value.AcademicYear)
	if err != nil {
		return Settings{}, err
	}
	return r.Get(ctx)
}
