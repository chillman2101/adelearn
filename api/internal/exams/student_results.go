package exams

import (
	"context"
	"database/sql"
	"errors"
)

type ExamStudentResult struct {
	StudentID            string   `json:"student_id"`
	StudentName          string   `json:"student_name"`
	AccessGenerated      bool     `json:"access_generated"`
	Attempts             int      `json:"attempts"`
	CompletedAttempts    int      `json:"completed_attempts"`
	Status               string   `json:"status"`
	ScorePoints          *float64 `json:"score_points,omitempty"`
	MaxPoints            float64  `json:"max_points"`
	ScorePercent         *float64 `json:"score_percent,omitempty"`
	PendingManualGrading bool     `json:"pending_manual_grading"`
}

type resultAttempt struct {
	number    int
	status    string
	submitted sql.NullTime
	score     sql.NullFloat64
	pending   bool
}

func (r *Repository) StudentResults(ctx context.Context, examID string) ([]ExamStudentResult, error) {
	var policy string
	var maxPoints float64
	err := r.DB.QueryRowContext(ctx, `SELECT e.score_policy,COALESCE((SELECT sum(points) FROM exam_questions WHERE exam_id=e.id),0) FROM exams e WHERE e.id=$1`, examID).Scan(&policy, &maxPoints)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := r.DB.QueryContext(ctx, `
		SELECT s.id::text,s.name,COALESCE(EXISTS(SELECT 1 FROM exam_student_access a WHERE a.exam_id=e.id AND a.student_id=s.id AND a.revoked_at IS NULL),false),COALESCE(sa.attempt_number,0),COALESCE(sa.status,''),sa.submitted_at,sa.score_points,COALESCE(sa.pending_manual_grading,false)
		FROM exams e
		JOIN students s ON s.class_id=e.class_id AND s.archived_at IS NULL
		LEFT JOIN student_attempts sa ON sa.exam_id=e.id AND sa.student_id=s.id
		WHERE e.id=$1
		ORDER BY lower(s.name),s.id,sa.attempt_number`, examID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type groupedResult struct {
		result   ExamStudentResult
		access   bool
		attempts []resultAttempt
	}
	grouped := make([]*groupedResult, 0)
	byStudent := make(map[string]*groupedResult)
	for rows.Next() {
		var studentID, name string
		var accessActive bool
		var attempt resultAttempt
		if err = rows.Scan(&studentID, &name, &accessActive, &attempt.number, &attempt.status, &attempt.submitted, &attempt.score, &attempt.pending); err != nil {
			return nil, err
		}
		item := byStudent[studentID]
		if item == nil {
			item = &groupedResult{result: ExamStudentResult{StudentID: studentID, StudentName: name, MaxPoints: maxPoints, Status: "Belum mulai"}}
			byStudent[studentID] = item
			grouped = append(grouped, item)
		}
		item.access = item.access || accessActive
		if attempt.status != "" {
			item.attempts = append(item.attempts, attempt)
		}
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}

	out := make([]ExamStudentResult, 0, len(grouped))
	for _, item := range grouped {
		item.result.AccessGenerated = item.access
		item.result.Attempts = len(item.attempts)
		completed := make([]resultAttempt, 0, len(item.attempts))
		activeAttempt := false
		for _, attempt := range item.attempts {
			if attempt.status == "in_progress" {
				item.result.Status = "Sedang mengerjakan"
				activeAttempt = true
				continue
			}
			completed = append(completed, attempt)
		}
		item.result.CompletedAttempts = len(completed)
		if len(completed) > 0 {
			score, pending := selectResultScore(policy, completed)
			item.result.ScorePoints = score
			item.result.PendingManualGrading = pending
			if pending {
				item.result.Status = "Menunggu penilaian"
			} else if !activeAttempt {
				item.result.Status = "Selesai"
			}
			if score != nil && maxPoints > 0 {
				percent := *score / maxPoints * 100
				item.result.ScorePercent = &percent
			}
		} else if item.result.Status != "Sedang mengerjakan" && !item.access {
			item.result.Status = "Akses belum dibuat"
		}
		out = append(out, item.result)
	}
	return out, nil
}

func selectResultScore(policy string, attempts []resultAttempt) (*float64, bool) {
	selected := attempts
	if policy == "highest" || policy == "average" {
		for _, attempt := range attempts {
			if attempt.pending {
				return nil, true
			}
		}
	}
	if policy == "latest" {
		latest := attempts[0]
		for _, attempt := range attempts[1:] {
			if attempt.number > latest.number || (attempt.number == latest.number && attempt.submitted.Valid && (!latest.submitted.Valid || attempt.submitted.Time.After(latest.submitted.Time))) {
				latest = attempt
			}
		}
		selected = []resultAttempt{latest}
	} else if policy == "highest" {
		best := attempts[0]
		for _, attempt := range attempts[1:] {
			if attempt.score.Valid && (!best.score.Valid || attempt.score.Float64 > best.score.Float64) {
				best = attempt
			}
		}
		selected = []resultAttempt{best}
	}

	pending := false
	for _, attempt := range selected {
		pending = pending || attempt.pending
	}
	if pending {
		return nil, true
	}
	if policy == "average" {
		var total float64
		count := 0
		for _, attempt := range selected {
			if attempt.score.Valid {
				total += attempt.score.Float64
				count++
			}
		}
		if count == 0 {
			return nil, false
		}
		average := total / float64(count)
		return &average, false
	}
	if len(selected) == 0 || !selected[0].score.Valid {
		return nil, false
	}
	score := selected[0].score.Float64
	return &score, false
}
