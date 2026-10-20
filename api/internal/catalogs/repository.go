package catalogs

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

type Item struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	SubjectID string `json:"subject_id,omitempty"`
}

type Repository struct{ DB *sql.DB }

func table(kind string) (string, bool) {
	switch kind {
	case "subjects":
		return "subjects", true
	case "classes":
		return "classes", true
	case "teachers":
		return "teachers", true
	case "topics":
		return "topics", true
	default:
		return "", false
	}
}

func (r *Repository) List(ctx context.Context, kind, subjectID string) ([]Item, error) {
	t, ok := table(kind)
	if !ok {
		return nil, errors.New("invalid catalog")
	}
	query := `SELECT id::text,name FROM ` + t
	args := []any{}
	if kind == "topics" && subjectID != "" {
		query += " WHERE subject_id=$1"
		args = append(args, subjectID)
	}
	query += " ORDER BY lower(name)"
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var item Item
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, err
		}
		if kind == "topics" && subjectID != "" {
			item.SubjectID = subjectID
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repository) Create(ctx context.Context, kind, name, subjectID string) (Item, error) {
	t, ok := table(kind)
	if !ok {
		return Item{}, errors.New("invalid catalog")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return Item{}, errors.New("name is required")
	}
	var item Item
	if kind == "topics" {
		var err error
		if subjectID == "" {
			err = r.DB.QueryRowContext(ctx, `SELECT id::text,name FROM topics WHERE subject_id IS NULL AND lower(name)=lower($1)`, name).Scan(&item.ID, &item.Name)
		} else {
			err = r.DB.QueryRowContext(ctx, `SELECT id::text,name FROM topics WHERE subject_id=$1 AND lower(name)=lower($2)`, subjectID, name).Scan(&item.ID, &item.Name)
		}
		if err == nil {
			item.SubjectID = subjectID
			return item, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return item, err
		}
		if subjectID == "" {
			err = r.DB.QueryRowContext(ctx, `INSERT INTO topics(name) VALUES($1) RETURNING id::text,name`, name).Scan(&item.ID, &item.Name)
		} else {
			err = r.DB.QueryRowContext(ctx, `INSERT INTO topics(name,subject_id) VALUES($1,$2) RETURNING id::text,name`, name, subjectID).Scan(&item.ID, &item.Name)
		}
		item.SubjectID = subjectID
		return item, err
	}
	err := r.DB.QueryRowContext(ctx, `SELECT id::text,name FROM `+t+` WHERE lower(name)=lower($1)`, name).Scan(&item.ID, &item.Name)
	if err == nil {
		return item, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return item, err
	}
	err = r.DB.QueryRowContext(ctx, `INSERT INTO `+t+`(name) VALUES($1) RETURNING id::text,name`, name).Scan(&item.ID, &item.Name)
	return item, err
}
