package exams

import (
	"adelearn/api/internal/questions"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrNotFound = errors.New("exam not found")
var ErrInsufficientQuestions = errors.New("Jumlah soal sesuai filter tidak mencukupi.")

type Repository struct {
	DB        *sql.DB
	Questions *questions.Repository
}

func Validate(e Exam) error {
	f := FieldErrors{}
	if strings.TrimSpace(e.Title) == "" {
		f["title"] = "Nama ujian wajib diisi."
	}
	if e.StartsAt.IsZero() {
		f["starts_at"] = "Waktu mulai wajib diisi."
	}
	if e.CheckInEndsAt.IsZero() || !e.CheckInEndsAt.After(e.StartsAt) {
		f["checkin_ends_at"] = "Batas check-in harus setelah waktu mulai."
	}
	if e.TimerEnabled && (e.DurationMinutes == nil || *e.DurationMinutes <= 0) {
		f["duration_minutes"] = "Isi durasi timer dalam menit."
	}
	if e.RepeatCount < 0 || e.RepeatCount > 10 {
		f["repeat_count"] = "Pilih pengulangan antara 0 sampai 10."
	}
	if e.QuestionCount < 1 || e.QuestionCount > 200 {
		f["question_count"] = "Jumlah soal harus antara 1 sampai 200."
	}
	valid := false
	for _, p := range ScorePolicies {
		if e.ScorePolicy == p {
			valid = true
		}
	}
	if !valid {
		f["score_policy"] = "Pilih kebijakan nilai akhir."
	}
	if len(f) > 0 {
		return f
	}
	return nil
}
func (r *Repository) List(ctx context.Context) ([]Exam, error) {
	rows, err := r.DB.QueryContext(ctx, `SELECT e.id::text,e.title,COALESCE(e.subject_id::text,''),COALESCE(e.class_id::text,''),COALESCE(s.name,e.subject),COALESCE(c.name,e.class_label),e.starts_at,e.checkin_ends_at,e.timer_enabled,e.duration_minutes,e.repeat_count,e.score_policy,e.question_count,e.status,e.created_at FROM exams e LEFT JOIN subjects s ON s.id=e.subject_id LEFT JOIN classes c ON c.id=e.class_id ORDER BY e.starts_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Exam{}
	for rows.Next() {
		var e Exam
		if err = rows.Scan(&e.ID, &e.Title, &e.SubjectID, &e.ClassID, &e.Subject, &e.Class, &e.StartsAt, &e.CheckInEndsAt, &e.TimerEnabled, &e.DurationMinutes, &e.RepeatCount, &e.ScorePolicy, &e.QuestionCount, &e.Status, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
func (r *Repository) Get(ctx context.Context, id string) (Exam, error) {
	var e Exam
	err := r.DB.QueryRowContext(ctx, `SELECT e.id::text,e.title,COALESCE(e.subject_id::text,''),COALESCE(e.class_id::text,''),COALESCE(s.name,e.subject),COALESCE(c.name,e.class_label),e.starts_at,e.checkin_ends_at,e.timer_enabled,e.duration_minutes,e.repeat_count,e.score_policy,e.question_count,e.status,e.created_at FROM exams e LEFT JOIN subjects s ON s.id=e.subject_id LEFT JOIN classes c ON c.id=e.class_id WHERE e.id=$1`, id).Scan(&e.ID, &e.Title, &e.SubjectID, &e.ClassID, &e.Subject, &e.Class, &e.StartsAt, &e.CheckInEndsAt, &e.TimerEnabled, &e.DurationMinutes, &e.RepeatCount, &e.ScorePolicy, &e.QuestionCount, &e.Status, &e.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return e, ErrNotFound
	}
	if err != nil {
		return e, err
	}
	rows, err := r.DB.QueryContext(ctx, `SELECT id::text,source_kind,COALESCE(source_question_id::text,''),points,COALESCE(published_snapshot,inline_snapshot) FROM exam_questions WHERE exam_id=$1 ORDER BY position`, id)
	if err != nil {
		return e, err
	}
	defer rows.Close()
	e.Questions = []ExamQuestion{}
	for rows.Next() {
		var q ExamQuestion
		var snapshot []byte
		if err = rows.Scan(&q.ID, &q.SourceKind, &q.QuestionID, &q.Points, &snapshot); err != nil {
			return e, err
		}
		if snapshot != nil {
			q.Snapshot = json.RawMessage(snapshot)
		}
		if q.SourceKind != "inline" && q.Snapshot == nil {
			qq, getErr := r.Questions.Get(ctx, q.QuestionID)
			if getErr == nil {
				q.Question = &qq
			}
		}
		e.Questions = append(e.Questions, q)
	}
	for _, q := range e.Questions {
		e.TotalPoints += q.Points
	}
	return e, rows.Err()
}
func (r *Repository) Save(ctx context.Context, e Exam) (Exam, error) {
	if e.ScorePolicy == "" {
		e.ScorePolicy = "highest"
	}
	if err := Validate(e); err != nil {
		return e, err
	}
	if err := resolveExamCatalogIDs(ctx, r.DB, &e); err != nil {
		return e, err
	}
	if e.ID == "" {
		err := r.DB.QueryRowContext(ctx, `INSERT INTO exams(title,subject,class_label,starts_at,checkin_ends_at,timer_enabled,duration_minutes,repeat_count,score_policy,question_count,subject_id,class_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULLIF($11,'')::uuid,NULLIF($12,'')::uuid) RETURNING id::text,created_at`, e.Title, e.Subject, e.Class, e.StartsAt, e.CheckInEndsAt, e.TimerEnabled, e.DurationMinutes, e.RepeatCount, e.ScorePolicy, e.QuestionCount, e.SubjectID, e.ClassID).Scan(&e.ID, &e.CreatedAt)
		if err != nil {
			return e, err
		}
		return r.Get(ctx, e.ID)
	}
	res, err := r.DB.ExecContext(ctx, `UPDATE exams SET title=$2,subject=$3,class_label=$4,starts_at=$5,checkin_ends_at=$6,timer_enabled=$7,duration_minutes=$8,repeat_count=$9,score_policy=$10,question_count=$11,subject_id=NULLIF($12,'')::uuid,class_id=NULLIF($13,'')::uuid WHERE id=$1 AND status='draft'`, e.ID, e.Title, e.Subject, e.Class, e.StartsAt, e.CheckInEndsAt, e.TimerEnabled, e.DurationMinutes, e.RepeatCount, e.ScorePolicy, e.QuestionCount, e.SubjectID, e.ClassID)
	if err != nil {
		return e, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return e, ErrNotFound
	}
	return r.Get(ctx, e.ID)
}

func (r *Repository) UpdateSchedule(ctx context.Context, id string, startsAt, checkInEndsAt time.Time) error {
	if !checkInEndsAt.After(startsAt) {
		return FieldErrors{"checkin_ends_at": "Batas check-in harus setelah waktu mulai."}
	}
	result, err := r.DB.ExecContext(ctx, `UPDATE exams SET starts_at=$2,checkin_ends_at=$3 WHERE id=$1`, id, startsAt, checkInEndsAt)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

type examCatalogQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func resolveExamCatalogIDs(ctx context.Context, db examCatalogQueryer, e *Exam) error {
	if e.SubjectID != "" {
		err := db.QueryRowContext(ctx, `SELECT id::text,name FROM subjects WHERE id::text=$1`, e.SubjectID).Scan(&e.SubjectID, &e.Subject)
		if errors.Is(err, sql.ErrNoRows) {
			return FieldErrors{"subject_id": "Pilih mata pelajaran yang tersedia."}
		}
		if err != nil {
			return err
		}
	} else if strings.TrimSpace(e.Subject) != "" {
		err := db.QueryRowContext(ctx, `SELECT id::text,name FROM subjects WHERE lower(name)=lower($1)`, strings.TrimSpace(e.Subject)).Scan(&e.SubjectID, &e.Subject)
		if errors.Is(err, sql.ErrNoRows) {
			return FieldErrors{"subject_id": "Pilih mata pelajaran yang tersedia."}
		}
		if err != nil {
			return err
		}
	}
	if e.ClassID != "" {
		err := db.QueryRowContext(ctx, `SELECT id::text,name FROM classes WHERE id::text=$1`, e.ClassID).Scan(&e.ClassID, &e.Class)
		if errors.Is(err, sql.ErrNoRows) {
			return FieldErrors{"class_id": "Pilih kelas yang tersedia."}
		}
		if err != nil {
			return err
		}
	} else if strings.TrimSpace(e.Class) != "" {
		err := db.QueryRowContext(ctx, `SELECT id::text,name FROM classes WHERE lower(name)=lower($1)`, strings.TrimSpace(e.Class)).Scan(&e.ClassID, &e.Class)
		if errors.Is(err, sql.ErrNoRows) {
			return FieldErrors{"class_id": "Pilih kelas yang tersedia."}
		}
		if err != nil {
			return err
		}
	}
	return nil
}
func (r *Repository) Compose(ctx context.Context, id string, c Composition) error {
	e, err := r.Get(ctx, id)
	if err != nil {
		return err
	}
	if e.Status != "draft" {
		return fmt.Errorf("ujian yang sudah dipublikasikan tidak dapat diubah")
	}
	if len(c.Questions)+sumRandom(c.Random) > e.QuestionCount {
		return FieldErrors{"question_count": "Jumlah soal melebihi jumlah yang ditentukan."}
	}
	resolved := []ExamQuestion{}
	selectedIDs := map[string]bool{}
	for _, q := range c.Questions {
		if q.SourceKind == "inline" && q.Question != nil {
			if err = questions.Validate(*q.Question); err != nil {
				return err
			}
			if q.SaveToBank {
				bankQuestion, saveErr := r.Questions.Create(ctx, *q.Question)
				if saveErr != nil {
					return saveErr
				}
				q.QuestionID = bankQuestion.ID
			}
			raw, _ := json.Marshal(q.Question)
			points := q.Question.Points
			if q.Points > 0 {
				points = q.Points
			}
			resolved = append(resolved, ExamQuestion{SourceKind: "inline", Points: points, Snapshot: raw})
			continue
		}
		if q.QuestionID != "" {
			if selectedIDs[q.QuestionID] {
				return FieldErrors{"questions": "Soal yang sama tidak dapat dimasukkan dua kali."}
			}
			bank, getErr := r.Questions.Get(ctx, q.QuestionID)
			if getErr != nil {
				return getErr
			}
			p := bank.Points
			if q.Points > 0 {
				p = q.Points
			}
			resolved = append(resolved, ExamQuestion{SourceKind: "bank_manual", QuestionID: bank.ID, Points: p})
			selectedIDs[bank.ID] = true
		}
	}
	for _, draw := range c.Random {
		filter := questions.Filters{SubjectID: draw.SubjectID, TopicID: draw.TopicID, Type: draw.Type, Difficulty: draw.Difficulty, Tag: draw.Tag}
		available, listErr := r.Questions.List(ctx, filter)
		if listErr != nil {
			return listErr
		}
		candidates := available[:0]
		for _, q := range available {
			if !selectedIDs[q.ID] {
				candidates = append(candidates, q)
			}
		}
		if draw.Count < 1 || len(candidates) < draw.Count {
			return fmt.Errorf("%w tersedia %d dari %d soal yang diminta", ErrInsufficientQuestions, len(candidates), draw.Count)
		}
		perm := randomPermutation(len(candidates))
		for _, i := range perm[:draw.Count] {
			q := candidates[i]
			resolved = append(resolved, ExamQuestion{SourceKind: "bank_random", QuestionID: q.ID, Points: q.Points})
			selectedIDs[q.ID] = true
		}
	}
	if len(resolved) > e.QuestionCount {
		return FieldErrors{"questions": "Jumlah soal melebihi jumlah yang ditentukan."}
	}
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `DELETE FROM exam_questions WHERE exam_id=$1`, id); err != nil {
		return err
	}
	for i, q := range resolved {
		var snap any
		if q.Snapshot != nil {
			snap = q.Snapshot
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO exam_questions(exam_id,position,source_question_id,inline_snapshot,points,source_kind) VALUES($1,$2,NULLIF($3,'')::uuid,$4,$5,$6)`, id, i+1, q.QuestionID, snap, q.Points, q.SourceKind); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (r *Repository) Publish(ctx context.Context, id string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	var expectedCount int
	if err = tx.QueryRowContext(ctx, `SELECT status,question_count FROM exams WHERE id=$1 FOR UPDATE`, id).Scan(&status, &expectedCount); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if status != "draft" {
		return fmt.Errorf("ujian sudah dipublikasikan")
	}
	rows, err := tx.QueryContext(ctx, `SELECT eq.id::text,COALESCE(eq.source_question_id::text,''),eq.inline_snapshot,eq.points FROM exam_questions eq WHERE eq.exam_id=$1 ORDER BY position`, id)
	if err != nil {
		return err
	}
	type item struct {
		id, questionID string
		snapshot       []byte
		points         float64
	}
	items := []item{}
	total := 0.0
	for rows.Next() {
		var it item
		if err = rows.Scan(&it.id, &it.questionID, &it.snapshot, &it.points); err != nil {
			rows.Close()
			return err
		}
		total += it.points
		items = append(items, it)
	}
	rows.Close()
	if len(items) == 0 || total <= 0 || len(items) != expectedCount {
		return FieldErrors{"questions": "Tambahkan soal berbobot lebih dari 0 sebelum publikasi."}
	}
	for _, it := range items {
		snap := it.snapshot
		if it.questionID != "" {
			var typ, prompt string
			var payload, tags []byte
			var pts float64
			var subjectID, topicID, subject, topic, class, difficulty, createdBy string
			if err = tx.QueryRowContext(ctx, `SELECT q.question_type,q.prompt,q.payload,q.points,COALESCE(q.subject_id::text,''),COALESCE(q.topic_id::text,''),COALESCE(s.name,q.subject),COALESCE(t.name,q.topic),q.class_label,q.difficulty,q.tags,q.created_by FROM questions q LEFT JOIN subjects s ON s.id=q.subject_id LEFT JOIN topics t ON t.id=q.topic_id WHERE q.id=$1`, it.questionID).Scan(&typ, &prompt, &payload, &pts, &subjectID, &topicID, &subject, &topic, &class, &difficulty, &tags, &createdBy); err != nil {
				return err
			}
			obj := map[string]any{"type": typ, "prompt": prompt, "data": json.RawMessage(payload), "points": it.points, "subject_id": subjectID, "topic_id": topicID, "subject": subject, "topic": topic, "class": class, "difficulty": difficulty, "tags": json.RawMessage(tags), "created_by": createdBy}
			snap, err = json.Marshal(obj)
			if err != nil {
				return err
			}
		}
		if _, err = tx.ExecContext(ctx, `UPDATE exam_questions SET published_snapshot=$2::jsonb WHERE id=$1`, it.id, string(snap)); err != nil {
			return err
		}
	}
	_, err = tx.ExecContext(ctx, `UPDATE exams SET status='published',published_at=$2,question_count=$3 WHERE id=$1`, id, time.Now(), len(items))
	if err != nil {
		return err
	}
	return tx.Commit()
}
func sumRandom(items []RandomDraw) int {
	n := 0
	for _, it := range items {
		n += it.Count
	}
	return n
}
func randomPermutation(n int) []int {
	out := make([]int, n)
	for i := range out {
		out[i] = i
	}
	seed := time.Now().UnixNano()
	for i := n - 1; i > 0; i-- {
		seed = seed*6364136223846793005 + 1
		j := int((seed>>32)&0x7fffffff) % (i + 1)
		out[i], out[j] = out[j], out[i]
	}
	return out
}
