package questions

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var ErrNotFound = errors.New("question not found")

type Repository struct{ DB *sql.DB }

func (r *Repository) List(ctx context.Context, f Filters) ([]Question, error) {
	query := `SELECT q.id::text,COALESCE(s.id::text,''),COALESCE(t.id::text,''),q.question_type,q.prompt,q.payload,q.points,COALESCE(s.name,''),COALESCE(t.name,''),q.class_label,q.difficulty,q.tags,q.created_by,EXISTS(SELECT 1 FROM exam_questions e WHERE e.source_question_id=q.id),q.created_at,q.updated_at FROM questions q LEFT JOIN subjects s ON s.id=q.subject_id LEFT JOIN topics t ON t.id=q.topic_id WHERE q.archived_at IS NULL`
	args := []any{}
	add := func(expr string, value any) {
		args = append(args, value)
		query += fmt.Sprintf(" AND "+expr, "$"+fmt.Sprint(len(args)))
	}
	if f.Query != "" {
		args = append(args, "%"+f.Query+"%")
		p := "$" + fmt.Sprint(len(args))
		query += " AND (q.prompt ILIKE " + p + " OR q.payload::text ILIKE " + p + ")"
	}
	if f.SubjectID != "" {
		add("q.subject_id::text = %s", f.SubjectID)
	}
	if f.TopicID != "" {
		add("q.topic_id::text = %s", f.TopicID)
	}
	if f.Type != "" {
		add("q.question_type = %s", f.Type)
	}
	if f.Difficulty != "" {
		add("q.difficulty = %s", f.Difficulty)
	}
	if f.CreatedBy != "" {
		add("q.created_by = %s", f.CreatedBy)
	}
	if f.Tag != "" {
		args = append(args, f.Tag)
		query += " AND q.tags ? $" + fmt.Sprint(len(args))
	}
	if f.Used == "true" {
		query += " AND EXISTS(SELECT 1 FROM exam_questions e WHERE e.source_question_id=q.id)"
	}
	if f.Used == "false" {
		query += " AND NOT EXISTS(SELECT 1 FROM exam_questions e WHERE e.source_question_id=q.id)"
	}
	query += " ORDER BY q.updated_at DESC LIMIT 500"
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Question{}
	for rows.Next() {
		var q Question
		var tags []byte
		if err = rows.Scan(&q.ID, &q.SubjectID, &q.TopicID, &q.Type, &q.Prompt, &q.Data, &q.Points, &q.Subject, &q.Topic, &q.Class, &q.Difficulty, &tags, &q.CreatedBy, &q.Used, &q.CreatedAt, &q.UpdatedAt); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(tags, &q.Tags); err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// DuplicatePrompts returns normalized prompts already present in the active bank.
func (r *Repository) DuplicatePrompts(ctx context.Context, prompts []string) (map[string]bool, error) {
	duplicates := map[string]bool{}
	if len(prompts) == 0 {
		return duplicates, nil
	}
	args := make([]any, len(prompts))
	marks := make([]string, len(prompts))
	for i, prompt := range prompts {
		args[i] = normalizePrompt(prompt)
		marks[i] = fmt.Sprintf("$%d", i+1)
	}
	query := `SELECT DISTINCT regexp_replace(lower(trim(prompt)), '[[:space:]]+', ' ', 'g') FROM questions WHERE archived_at IS NULL AND regexp_replace(lower(trim(prompt)), '[[:space:]]+', ' ', 'g') IN (` + strings.Join(marks, ",") + `)`
	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var prompt string
		if err := rows.Scan(&prompt); err != nil {
			return nil, err
		}
		duplicates[prompt] = true
	}
	return duplicates, rows.Err()
}

func normalizePrompt(prompt string) string {
	return strings.ToLower(strings.Join(strings.Fields(prompt), " "))
}

func (r *Repository) Get(ctx context.Context, id string) (Question, error) {
	var q Question
	var tags []byte
	err := r.DB.QueryRowContext(ctx, `SELECT q.id::text,COALESCE(s.id::text,''),COALESCE(t.id::text,''),q.question_type,q.prompt,q.payload,q.points,COALESCE(s.name,''),COALESCE(t.name,''),q.class_label,q.difficulty,q.tags,q.created_by,EXISTS(SELECT 1 FROM exam_questions e WHERE e.source_question_id=q.id),q.created_at,q.updated_at FROM questions q LEFT JOIN subjects s ON s.id=q.subject_id LEFT JOIN topics t ON t.id=q.topic_id WHERE q.id=$1 AND q.archived_at IS NULL`, id).Scan(&q.ID, &q.SubjectID, &q.TopicID, &q.Type, &q.Prompt, &q.Data, &q.Points, &q.Subject, &q.Topic, &q.Class, &q.Difficulty, &tags, &q.CreatedBy, &q.Used, &q.CreatedAt, &q.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return q, ErrNotFound
	}
	if err == nil {
		err = json.Unmarshal(tags, &q.Tags)
	}
	return q, err
}
func (r *Repository) Create(ctx context.Context, q Question) (Question, error) {
	if err := Validate(q); err != nil {
		return q, err
	}
	if len(q.Tags) == 0 {
		q.Tags = []string{}
	}
	if len(q.Data) == 0 {
		q.Data = json.RawMessage(`{}`)
	}
	if err := resolveCatalogIDs(ctx, r.DB, &q); err != nil {
		return q, err
	}
	tags, _ := json.Marshal(q.Tags)
	err := r.DB.QueryRowContext(ctx, `INSERT INTO questions(question_type,prompt,payload,points,subject,topic,difficulty,tags,created_by,subject_id,topic_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,'')::uuid,NULLIF($11,'')::uuid) RETURNING id::text,created_at,updated_at`, q.Type, strings.TrimSpace(q.Prompt), q.Data, q.Points, q.Subject, q.Topic, defaultString(q.Difficulty, "Sedang"), tags, defaultString(q.CreatedBy, "Guru"), q.SubjectID, q.TopicID).Scan(&q.ID, &q.CreatedAt, &q.UpdatedAt)
	if err != nil {
		return q, err
	}
	return r.Get(ctx, q.ID)
}

type catalogQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func resolveCatalogIDs(ctx context.Context, db catalogQueryer, q *Question) error {
	if q.SubjectID != "" {
		err := db.QueryRowContext(ctx, `SELECT id::text,name FROM subjects WHERE id::text=$1`, q.SubjectID).Scan(&q.SubjectID, &q.Subject)
		if errors.Is(err, sql.ErrNoRows) {
			return FieldErrors{"subject_id": "Pilih mata pelajaran yang tersedia."}
		}
		if err != nil {
			return err
		}
	} else if strings.TrimSpace(q.Subject) != "" {
		err := db.QueryRowContext(ctx, `SELECT id::text,name FROM subjects WHERE lower(name)=lower($1)`, strings.TrimSpace(q.Subject)).Scan(&q.SubjectID, &q.Subject)
		if errors.Is(err, sql.ErrNoRows) {
			return FieldErrors{"subject_id": "Pilih mata pelajaran yang tersedia."}
		}
		if err != nil {
			return err
		}
	}
	if q.TopicID != "" {
		err := db.QueryRowContext(ctx, `SELECT id::text,name FROM topics WHERE id::text=$1 AND (subject_id IS NULL OR subject_id=NULLIF($2,'')::uuid)`, q.TopicID, q.SubjectID).Scan(&q.TopicID, &q.Topic)
		if errors.Is(err, sql.ErrNoRows) {
			return FieldErrors{"topic_id": "Topik tidak sesuai dengan mata pelajaran yang dipilih."}
		}
		if err != nil {
			return err
		}
	} else if strings.TrimSpace(q.Topic) != "" {
		err := db.QueryRowContext(ctx, `SELECT id::text,name FROM topics WHERE lower(name)=lower($1) AND (subject_id IS NULL OR subject_id=NULLIF($2,'')::uuid) ORDER BY subject_id NULLS LAST LIMIT 1`, strings.TrimSpace(q.Topic), q.SubjectID).Scan(&q.TopicID, &q.Topic)
		if errors.Is(err, sql.ErrNoRows) {
			return FieldErrors{"topic_id": "Pilih topik yang sesuai dengan mata pelajaran."}
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) Import(ctx context.Context, items []Question) ([]Question, error) {
	if len(items) == 0 || len(items) > 500 {
		return nil, fmt.Errorf("Jumlah soal harus antara 1 sampai 500")
	}
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	for i := range items {
		q := &items[i]
		if err := Validate(*q); err != nil {
			return nil, fmt.Errorf("soal baris %d: %w", i+1, err)
		}
		if q.Tags == nil {
			q.Tags = []string{}
		}
		if len(q.Data) == 0 {
			q.Data = json.RawMessage(`{}`)
		}
		if strings.TrimSpace(q.Subject) != "" && q.SubjectID == "" {
			if _, err = tx.ExecContext(ctx, `INSERT INTO subjects(name) VALUES($1) ON CONFLICT (lower(name)) DO NOTHING`, strings.TrimSpace(q.Subject)); err != nil {
				return nil, err
			}
		}
		if q.SubjectID == "" && strings.TrimSpace(q.Subject) != "" {
			if err = tx.QueryRowContext(ctx, `SELECT id::text,name FROM subjects WHERE lower(name)=lower($1)`, strings.TrimSpace(q.Subject)).Scan(&q.SubjectID, &q.Subject); err != nil {
				return nil, err
			}
		}
		if strings.TrimSpace(q.Topic) != "" && strings.TrimSpace(q.Subject) != "" {
			if _, err = tx.ExecContext(ctx, `INSERT INTO topics(name,subject_id) VALUES($1,NULLIF($2,'')::uuid) ON CONFLICT (subject_id,lower(name)) DO NOTHING`, strings.TrimSpace(q.Topic), q.SubjectID); err != nil {
				return nil, err
			}
		}
		if err = resolveCatalogIDs(ctx, tx, q); err != nil {
			return nil, fmt.Errorf("soal baris %d: %w", i+1, err)
		}
		tags, _ := json.Marshal(q.Tags)
		err = tx.QueryRowContext(ctx, `INSERT INTO questions(question_type,prompt,payload,points,subject,topic,difficulty,tags,created_by,subject_id,topic_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,'')::uuid,NULLIF($11,'')::uuid) RETURNING id::text,created_at,updated_at`, q.Type, strings.TrimSpace(q.Prompt), q.Data, q.Points, q.Subject, q.Topic, defaultString(q.Difficulty, "Sedang"), tags, defaultString(q.CreatedBy, "Guru"), q.SubjectID, q.TopicID).Scan(&q.ID, &q.CreatedAt, &q.UpdatedAt)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return items, nil
}
func (r *Repository) Update(ctx context.Context, id string, q Question) (Question, error) {
	if err := Validate(q); err != nil {
		return q, err
	}
	if len(q.Data) == 0 {
		q.Data = json.RawMessage(`{}`)
	}
	if q.Tags == nil {
		q.Tags = []string{}
	}
	if err := resolveCatalogIDs(ctx, r.DB, &q); err != nil {
		return q, err
	}
	tags, _ := json.Marshal(q.Tags)
	err := r.DB.QueryRowContext(ctx, `UPDATE questions SET question_type=$2,prompt=$3,payload=$4,points=$5,subject=$6,topic=$7,difficulty=$8,tags=$9,subject_id=NULLIF($10,'')::uuid,topic_id=NULLIF($11,'')::uuid WHERE id=$1 AND archived_at IS NULL RETURNING id::text,created_by,created_at,updated_at`, id, q.Type, strings.TrimSpace(q.Prompt), q.Data, q.Points, q.Subject, q.Topic, defaultString(q.Difficulty, "Sedang"), tags, q.SubjectID, q.TopicID).Scan(&q.ID, &q.CreatedBy, &q.CreatedAt, &q.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return q, ErrNotFound
	}
	if err != nil {
		return q, err
	}
	return r.Get(ctx, q.ID)
}
func (r *Repository) Archive(ctx context.Context, id string) error {
	res, err := r.DB.ExecContext(ctx, `UPDATE questions SET archived_at=now() WHERE id=$1 AND archived_at IS NULL`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
func defaultString(s, f string) string {
	if strings.TrimSpace(s) == "" {
		return f
	}
	return s
}
