package exams

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"math/big"
	"strings"
	"time"
)

var ErrStudentExamUnavailable = errors.New("Ujian belum dapat dikerjakan.")
var ErrAttemptLimit = errors.New("Kesempatan mengerjakan ujian sudah habis.")
var ErrAttemptNotFound = errors.New("Percobaan ujian tidak ditemukan.")
var ErrAttemptClosed = errors.New("Percobaan sudah dikirim atau waktu sudah habis.")

type StudentAttemptSummary struct {
	ID            string     `json:"id"`
	AttemptNumber int        `json:"attempt_number"`
	Status        string     `json:"status"`
	StartedAt     time.Time  `json:"started_at"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	SubmittedAt   *time.Time `json:"submitted_at,omitempty"`
	ScorePoints   *float64   `json:"score_points,omitempty"`
	PendingManual bool       `json:"pending_manual_grading"`
}

type StudentExamView struct {
	ID              string                  `json:"id"`
	Title           string                  `json:"title"`
	Subject         string                  `json:"subject"`
	ClassName       string                  `json:"class_name"`
	StartsAt        time.Time               `json:"starts_at"`
	CheckInEndsAt   time.Time               `json:"checkin_ends_at"`
	Status          string                  `json:"status"`
	TimerEnabled    bool                    `json:"timer_enabled"`
	DurationMinutes *int                    `json:"duration_minutes"`
	RepeatCount     int                     `json:"repeat_count"`
	QuestionCount   int                     `json:"question_count"`
	TotalPoints     float64                 `json:"total_points"`
	Attempts        []StudentAttemptSummary `json:"attempts"`
	AttemptsLeft    int                     `json:"attempts_left"`
	ActiveAttemptID string                  `json:"active_attempt_id,omitempty"`
}

type StudentQuestion struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"`
	Prompt string          `json:"prompt"`
	Data   json.RawMessage `json:"data"`
	Points float64         `json:"points"`
}

type StudentAttempt struct {
	ID            string                     `json:"id"`
	AttemptNumber int                        `json:"attempt_number"`
	Status        string                     `json:"status"`
	StartedAt     time.Time                  `json:"started_at"`
	ExpiresAt     *time.Time                 `json:"expires_at,omitempty"`
	SubmittedAt   *time.Time                 `json:"submitted_at,omitempty"`
	Answers       map[string]json.RawMessage `json:"answers"`
	Questions     []StudentQuestion          `json:"questions"`
	ScorePoints   *float64                   `json:"score_points,omitempty"`
	PendingManual bool                       `json:"pending_manual_grading"`
}

func (r *Repository) StudentExam(ctx context.Context, session StudentSession) (StudentExamView, error) {
	var view StudentExamView
	err := r.DB.QueryRowContext(ctx, `SELECT e.id::text,e.title,COALESCE(sub.name,e.subject),COALESCE(c.name,''),e.starts_at,e.checkin_ends_at,e.status,e.timer_enabled,e.duration_minutes,e.repeat_count,e.question_count,COALESCE((SELECT sum(points) FROM exam_questions WHERE exam_id=e.id),0) FROM exam_student_access a JOIN students s ON s.id=a.student_id JOIN exams e ON e.id=a.exam_id LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN subjects sub ON sub.id=e.subject_id WHERE a.id=$1 AND a.session_token_hash=$2 AND a.session_expires_at>now() AND a.revoked_at IS NULL AND s.archived_at IS NULL`, session.AccessID, session.sessionHash).Scan(&view.ID, &view.Title, &view.Subject, &view.ClassName, &view.StartsAt, &view.CheckInEndsAt, &view.Status, &view.TimerEnabled, &view.DurationMinutes, &view.RepeatCount, &view.QuestionCount, &view.TotalPoints)
	if errors.Is(err, sql.ErrNoRows) {
		return view, ErrInvalidStudentSession
	}
	if err != nil {
		return view, err
	}
	view.Attempts = []StudentAttemptSummary{}
	rows, err := r.DB.QueryContext(ctx, `SELECT id::text,attempt_number,status,started_at,expires_at,submitted_at,score_points,pending_manual_grading FROM student_attempts WHERE exam_id=$1 AND student_id=$2 ORDER BY attempt_number`, view.ID, session.StudentID)
	if err != nil {
		return view, err
	}
	used := 0
	for rows.Next() {
		var item StudentAttemptSummary
		var expires, submitted sql.NullTime
		var score sql.NullFloat64
		if err = rows.Scan(&item.ID, &item.AttemptNumber, &item.Status, &item.StartedAt, &expires, &submitted, &score, &item.PendingManual); err != nil {
			rows.Close()
			return view, err
		}
		if expires.Valid {
			item.ExpiresAt = &expires.Time
		}
		if submitted.Valid {
			item.SubmittedAt = &submitted.Time
		}
		if score.Valid {
			value := score.Float64
			item.ScorePoints = &value
		}
		if item.Status == "in_progress" {
			view.ActiveAttemptID = item.ID
		}
		view.Attempts = append(view.Attempts, item)
		used++
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return view, err
	}
	rows.Close()
	view.AttemptsLeft = view.RepeatCount + 1 - used
	if view.AttemptsLeft < 0 {
		view.AttemptsLeft = 0
	}
	return view, nil
}

func (r *Repository) StartStudentAttempt(ctx context.Context, session StudentSession) (StudentAttempt, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return StudentAttempt{}, err
	}
	defer tx.Rollback()
	var examID, status string
	var starts, checkinEnd time.Time
	var timer bool
	var minutes sql.NullInt64
	var repeats int
	err = tx.QueryRowContext(ctx, `SELECT e.id::text,e.status,e.starts_at,e.checkin_ends_at,e.timer_enabled,e.duration_minutes,e.repeat_count FROM exam_student_access a JOIN exams e ON e.id=a.exam_id JOIN students s ON s.id=a.student_id WHERE a.id=$1 AND a.session_token_hash=$2 AND a.session_expires_at>now() AND a.revoked_at IS NULL AND s.archived_at IS NULL FOR UPDATE OF a`, session.AccessID, session.sessionHash).Scan(&examID, &status, &starts, &checkinEnd, &timer, &minutes, &repeats)
	if errors.Is(err, sql.ErrNoRows) {
		return StudentAttempt{}, ErrInvalidStudentSession
	}
	if err != nil {
		return StudentAttempt{}, err
	}
	var currentID string
	var currentExpires sql.NullTime
	err = tx.QueryRowContext(ctx, `SELECT id::text,expires_at FROM student_attempts WHERE exam_id=$1 AND student_id=$2 AND status='in_progress' FOR UPDATE`, examID, session.StudentID).Scan(&currentID, &currentExpires)
	if err == nil {
		if currentExpires.Valid && !currentExpires.Time.After(time.Now().UTC()) {
			if err = finishAttemptTx(ctx, tx, currentID, "expired"); err != nil {
				return StudentAttempt{}, err
			}
		} else {
			if err = tx.Commit(); err != nil {
				return StudentAttempt{}, err
			}
			return r.StudentAttempt(ctx, session, currentID)
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return StudentAttempt{}, err
	}
	if status != "published" || time.Now().Before(starts) || time.Now().After(checkinEnd) {
		return StudentAttempt{}, ErrStudentExamUnavailable
	}
	var used int
	if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM student_attempts WHERE exam_id=$1 AND student_id=$2`, examID, session.StudentID).Scan(&used); err != nil {
		return StudentAttempt{}, err
	}
	if used >= repeats+1 {
		return StudentAttempt{}, ErrAttemptLimit
	}
	type item struct {
		id       string
		snapshot []byte
		points   float64
	}
	rows, err := tx.QueryContext(ctx, `SELECT id::text,published_snapshot,points FROM exam_questions WHERE exam_id=$1 ORDER BY position`, examID)
	if err != nil {
		return StudentAttempt{}, err
	}
	questions := []item{}
	for rows.Next() {
		var q item
		if err = rows.Scan(&q.id, &q.snapshot, &q.points); err != nil {
			rows.Close()
			return StudentAttempt{}, err
		}
		questions = append(questions, q)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return StudentAttempt{}, err
	}
	rows.Close()
	if len(questions) == 0 {
		return StudentAttempt{}, ErrStudentExamUnavailable
	}
	order := make([]int, len(questions))
	for i := range order {
		order[i] = i
	}
	if err = secureShuffleValues(order); err != nil {
		return StudentAttempt{}, err
	}
	var attemptID string
	var started time.Time
	var expires any
	started = time.Now().UTC()
	if timer && minutes.Valid {
		expires = started.Add(time.Duration(minutes.Int64) * time.Minute)
	}
	err = tx.QueryRowContext(ctx, `INSERT INTO student_attempts(access_id,student_id,exam_id,attempt_number,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id::text,started_at`, session.AccessID, session.StudentID, examID, used+1, expires).Scan(&attemptID, &started)
	if err != nil {
		return StudentAttempt{}, err
	}
	for position, index := range order {
		snapshot, prepErr := randomizeAttemptSnapshot(questions[index].snapshot)
		if prepErr != nil {
			return StudentAttempt{}, prepErr
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO student_attempt_questions(attempt_id,exam_question_id,position,snapshot,points) VALUES($1,$2,$3,$4::jsonb,$5)`, attemptID, questions[index].id, position+1, string(snapshot), questions[index].points); err != nil {
			return StudentAttempt{}, err
		}
	}
	if err = tx.Commit(); err != nil {
		return StudentAttempt{}, err
	}
	return r.StudentAttempt(ctx, session, attemptID)
}

func secureShuffleValues(values []int) error {
	for i := len(values) - 1; i > 0; i-- {
		j, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return err
		}
		values[i], values[j.Int64()] = values[j.Int64()], values[i]
	}
	return nil
}

func (r *Repository) StudentAttempt(ctx context.Context, session StudentSession, attemptID string) (StudentAttempt, error) {
	var attempt StudentAttempt
	var answersRaw []byte
	var expires, submitted sql.NullTime
	var score sql.NullFloat64
	err := r.DB.QueryRowContext(ctx, `SELECT a.id::text,a.attempt_number,a.status,a.started_at,a.expires_at,a.submitted_at,a.answers,a.score_points,a.pending_manual_grading FROM student_attempts a JOIN exam_student_access access ON access.id=$4 AND access.student_id=a.student_id AND access.exam_id=a.exam_id WHERE a.id=$1 AND a.student_id=$2 AND a.exam_id=$3 AND access.session_token_hash=$5 AND access.session_expires_at>now() AND access.revoked_at IS NULL`, attemptID, session.StudentID, session.ExamID, session.AccessID, session.sessionHash).Scan(&attempt.ID, &attempt.AttemptNumber, &attempt.Status, &attempt.StartedAt, &expires, &submitted, &answersRaw, &score, &attempt.PendingManual)
	if errors.Is(err, sql.ErrNoRows) {
		return attempt, ErrAttemptNotFound
	}
	if err != nil {
		return attempt, err
	}
	if expires.Valid {
		attempt.ExpiresAt = &expires.Time
	}
	if submitted.Valid {
		attempt.SubmittedAt = &submitted.Time
	}
	if score.Valid {
		value := score.Float64
		attempt.ScorePoints = &value
	}
	attempt.Answers = map[string]json.RawMessage{}
	if len(answersRaw) > 0 {
		if err = json.Unmarshal(answersRaw, &attempt.Answers); err != nil {
			return attempt, err
		}
	}
	if attempt.Status == "in_progress" && attempt.ExpiresAt != nil && !attempt.ExpiresAt.After(time.Now().UTC()) {
		if err = r.finishAttempt(ctx, attempt.ID, "expired"); err != nil {
			return attempt, err
		}
		return r.StudentAttempt(ctx, session, attempt.ID)
	}
	rows, err := r.DB.QueryContext(ctx, `SELECT exam_question_id::text,snapshot,points FROM student_attempt_questions WHERE attempt_id=$1 ORDER BY position`, attempt.ID)
	if err != nil {
		return attempt, err
	}
	defer rows.Close()
	attempt.Questions = []StudentQuestion{}
	for rows.Next() {
		var id string
		var raw []byte
		var points float64
		if err = rows.Scan(&id, &raw, &points); err != nil {
			return attempt, err
		}
		var full map[string]json.RawMessage
		if err = json.Unmarshal(raw, &full); err != nil {
			return attempt, err
		}
		var question StudentQuestion
		question.ID = id
		question.Points = points
		_ = json.Unmarshal(full["type"], &question.Type)
		_ = json.Unmarshal(full["prompt"], &question.Prompt)
		data := full["data"]
		if data == nil {
			data = json.RawMessage(`{}`)
		}
		question.Data, err = sanitizeQuestionDataForType(question.Type, data)
		if err != nil {
			return attempt, err
		}
		attempt.Questions = append(attempt.Questions, question)
	}
	return attempt, rows.Err()
}

func (r *Repository) SaveStudentAnswer(ctx context.Context, session StudentSession, attemptID, questionID string, answer json.RawMessage) error {
	if !json.Valid(answer) {
		return errors.New("Jawaban tidak valid.")
	}
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	var expires sql.NullTime
	err = tx.QueryRowContext(ctx, `SELECT a.status,a.expires_at FROM student_attempts a JOIN exam_student_access access ON access.id=$4 AND access.student_id=a.student_id AND access.exam_id=a.exam_id WHERE a.id=$1 AND a.student_id=$2 AND a.exam_id=$3 AND access.session_token_hash=$5 AND access.session_expires_at>now() AND access.revoked_at IS NULL FOR UPDATE OF a`, attemptID, session.StudentID, session.ExamID, session.AccessID, session.sessionHash).Scan(&status, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrAttemptNotFound
	}
	if err != nil {
		return err
	}
	if status != "in_progress" {
		return ErrAttemptClosed
	}
	if expires.Valid && !expires.Time.After(time.Now().UTC()) {
		if err = finishAttemptTx(ctx, tx, attemptID, "expired"); err != nil {
			return err
		}
		_ = tx.Commit()
		return ErrAttemptClosed
	}
	var exists bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM student_attempt_questions WHERE attempt_id=$1 AND exam_question_id=$2)`, attemptID, questionID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrAttemptNotFound
	}
	if _, err = tx.ExecContext(ctx, `UPDATE student_attempts SET answers=jsonb_set(answers,ARRAY[$2],$3::jsonb,true) WHERE id=$1`, attemptID, questionID, string(answer)); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) SubmitStudentAttempt(ctx context.Context, session StudentSession, attemptID string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	err = tx.QueryRowContext(ctx, `SELECT a.status FROM student_attempts a JOIN exam_student_access access ON access.id=$4 AND access.student_id=a.student_id AND access.exam_id=a.exam_id WHERE a.id=$1 AND a.student_id=$2 AND a.exam_id=$3 AND access.session_token_hash=$5 AND access.session_expires_at>now() AND access.revoked_at IS NULL FOR UPDATE OF a`, attemptID, session.StudentID, session.ExamID, session.AccessID, session.sessionHash).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrAttemptNotFound
	}
	if err != nil {
		return err
	}
	if status != "in_progress" {
		return ErrAttemptClosed
	}
	if err = finishAttemptTx(ctx, tx, attemptID, "submitted"); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) finishAttempt(ctx context.Context, attemptID, status string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = finishAttemptTx(ctx, tx, attemptID, status); err != nil {
		return err
	}
	return tx.Commit()
}

func finishAttemptTx(ctx context.Context, tx *sql.Tx, attemptID, status string) error {
	var answersRaw []byte
	if err := tx.QueryRowContext(ctx, `SELECT answers FROM student_attempts WHERE id=$1 AND status='in_progress' FOR UPDATE`, attemptID).Scan(&answersRaw); err != nil {
		return err
	}
	answers := map[string]json.RawMessage{}
	if err := json.Unmarshal(answersRaw, &answers); err != nil {
		return err
	}
	rows, err := tx.QueryContext(ctx, `SELECT exam_question_id::text,snapshot,points FROM student_attempt_questions WHERE attempt_id=$1`, attemptID)
	if err != nil {
		return err
	}
	var score float64
	pending := false
	for rows.Next() {
		var id string
		var raw []byte
		var points float64
		if err = rows.Scan(&id, &raw, &points); err != nil {
			rows.Close()
			return err
		}
		var question map[string]json.RawMessage
		if err = json.Unmarshal(raw, &question); err != nil {
			rows.Close()
			return err
		}
		var typ string
		_ = json.Unmarshal(question["type"], &typ)
		var data map[string]any
		_ = json.Unmarshal(question["data"], &data)
		if typ == "essay" {
			pending = true
			continue
		}
		score += scoreAnswer(typ, data, answers[id], points)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	_, err = tx.ExecContext(ctx, `UPDATE student_attempts SET status=$2,submitted_at=now(),score_points=$3,pending_manual_grading=$4 WHERE id=$1`, attemptID, status, score, pending)
	return err
}

func sanitizeQuestionData(raw json.RawMessage) (json.RawMessage, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	clean := stripAnswerKeys(value)
	return json.Marshal(clean)
}

func randomizeAttemptSnapshot(raw []byte) ([]byte, error) {
	var question map[string]json.RawMessage
	if err := json.Unmarshal(raw, &question); err != nil {
		return nil, err
	}
	var typ string
	_ = json.Unmarshal(question["type"], &typ)
	var data map[string]json.RawMessage
	if err := json.Unmarshal(question["data"], &data); err != nil {
		return nil, err
	}
	shuffleField := func(field string) error {
		var values []json.RawMessage
		if err := json.Unmarshal(data[field], &values); err != nil {
			return err
		}
		order := make([]int, len(values))
		for i := range order {
			order[i] = i
		}
		if err := secureShuffleValues(order); err != nil {
			return err
		}
		shuffled := make([]json.RawMessage, len(values))
		for i, index := range order {
			shuffled[i] = values[index]
		}
		data[field], _ = json.Marshal(shuffled)
		return nil
	}
	switch typ {
	case "single_choice", "multi_select":
		if len(data["options"]) > 0 {
			if err := shuffleField("options"); err != nil {
				return nil, err
			}
		}
	case "true_false":
		if len(data["statements"]) > 0 {
			if err := shuffleField("statements"); err != nil {
				return nil, err
			}
		}
	case "ordering":
		var items []map[string]any
		if err := json.Unmarshal(data["items"], &items); err != nil {
			return nil, err
		}
		correctOrder := make([]string, 0, len(items))
		for _, item := range items {
			if id, ok := item["id"].(string); ok {
				correctOrder = append(correctOrder, id)
			}
		}
		data["correct_order"], _ = json.Marshal(correctOrder)
		if len(items) > 0 {
			if err := shuffleField("items"); err != nil {
				return nil, err
			}
		}
	case "matching":
		var pairs []map[string]any
		if err := json.Unmarshal(data["pairs"], &pairs); err != nil {
			return nil, err
		}
		choices := make([]map[string]string, 0, len(pairs))
		for _, pair := range pairs {
			choices = append(choices, map[string]string{"id": stringValue(pair["id"]), "text": stringValue(pair["right"])})
		}
		order := make([]int, len(choices))
		for i := range order {
			order[i] = i
		}
		if err := secureShuffleValues(order); err != nil {
			return nil, err
		}
		shuffled := make([]map[string]string, len(choices))
		for i, index := range order {
			shuffled[i] = choices[index]
		}
		data["choices"], _ = json.Marshal(shuffled)
		if len(pairs) > 0 {
			if err := shuffleField("pairs"); err != nil {
				return nil, err
			}
		}
	}
	question["data"], _ = json.Marshal(data)
	return json.Marshal(question)
}

func sanitizeQuestionDataForType(typ string, raw json.RawMessage) (json.RawMessage, error) {
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	if typ == "matching" {
		pairs := asSlice(data["pairs"])
		for _, pair := range pairs {
			delete(asMap(pair), "right")
		}
	}
	if typ == "ordering" {
		delete(data, "correct_order")
	}
	return json.Marshal(stripAnswerKeys(data))
}

func stripAnswerKeys(value any) any {
	switch item := value.(type) {
	case map[string]any:
		for key, child := range item {
			if key == "correct" || key == "accepted_answers" || key == "rubric" || key == "manual_grading" {
				delete(item, key)
				continue
			}
			item[key] = stripAnswerKeys(child)
		}
		return item
	case []any:
		for i := range item {
			item[i] = stripAnswerKeys(item[i])
		}
		return item
	default:
		return value
	}
}

func scoreAnswer(typ string, data map[string]any, raw json.RawMessage, points float64) float64 {
	if len(raw) == 0 {
		return 0
	}
	var answer any
	if json.Unmarshal(raw, &answer) != nil {
		return 0
	}
	switch typ {
	case "single_choice":
		selected, _ := answer.(string)
		for _, option := range asSlice(data["options"]) {
			row := asMap(option)
			if row["id"] == selected && row["correct"] == true {
				return points
			}
		}
	case "multi_select":
		selected := stringSet(asSlice(asMap(answer)["selected"]))
		correct, got := 0, 0
		for _, option := range asSlice(data["options"]) {
			row := asMap(option)
			if row["correct"] == true {
				correct++
				if selected[stringValue(row["id"])] {
					got++
				}
			}
		}
		if correct > 0 {
			return points * float64(got) / float64(correct)
		}
	case "true_false":
		given := asMap(answer)
		statements := asSlice(data["statements"])
		correct := 0
		for _, statement := range statements {
			row := asMap(statement)
			value, ok := given[stringValue(row["id"])]
			if ok && value == row["correct"] {
				correct++
			}
		}
		if len(statements) > 0 {
			return points * float64(correct) / float64(len(statements))
		}
	case "short_answer":
		value, _ := asMap(answer)["text"].(string)
		if accepted(value, asSlice(data["accepted_answers"])) {
			return points
		}
	case "fill_blank":
		given := asMap(asMap(answer)["blanks"])
		blanks := asSlice(data["blanks"])
		correct := 0
		for _, blank := range blanks {
			row := asMap(blank)
			if value, ok := given[stringValue(row["id"])].(string); ok && accepted(value, asSlice(row["accepted_answers"])) {
				correct++
			}
		}
		if len(blanks) > 0 {
			return points * float64(correct) / float64(len(blanks))
		}
	case "matching":
		given := asMap(asMap(answer)["pairs"])
		pairs := asSlice(data["pairs"])
		correct := 0
		for _, pair := range pairs {
			row := asMap(pair)
			id := stringValue(row["id"])
			if given[id] == id {
				correct++
			}
		}
		if len(pairs) > 0 {
			return points * float64(correct) / float64(len(pairs))
		}
	case "ordering":
		given := asSlice(asMap(answer)["order"])
		items := asSlice(data["items"])
		correctOrder := asSlice(data["correct_order"])
		if len(correctOrder) > 0 {
			items = make([]any, len(correctOrder))
			for i, id := range correctOrder {
				items[i] = map[string]any{"id": id}
			}
		}
		correct := 0
		for i, item := range items {
			if i < len(given) && given[i] == asMap(item)["id"] {
				correct++
			}
		}
		if len(items) > 0 {
			return points * float64(correct) / float64(len(items))
		}
	}
	return 0
}

func asMap(value any) map[string]any {
	result, _ := value.(map[string]any)
	if result == nil {
		return map[string]any{}
	}
	return result
}
func asSlice(value any) []any      { result, _ := value.([]any); return result }
func stringValue(value any) string { result, _ := value.(string); return result }
func stringSet(values []any) map[string]bool {
	out := map[string]bool{}
	for _, value := range values {
		if text, ok := value.(string); ok {
			out[text] = true
		}
	}
	return out
}
func accepted(value string, answers []any) bool {
	value = strings.TrimSpace(value)
	for _, answer := range answers {
		if expected, ok := answer.(string); ok && strings.EqualFold(value, strings.TrimSpace(expected)) {
			return true
		}
	}
	return false
}
