package exams

import (
	"adelearn/api/internal/questions"
	"encoding/json"
	"time"
)

type StudentAccess struct {
	StudentID   string    `json:"student_id"`
	StudentName string    `json:"student_name"`
	UserID      string    `json:"user_id"`
	Password    string    `json:"password,omitempty"`
	GeneratedAt time.Time `json:"generated_at"`
}

type FieldErrors map[string]string

func (e FieldErrors) Error() string { return "exam validation failed" }

type Exam struct {
	ID              string         `json:"id"`
	Title           string         `json:"title"`
	SubjectID       string         `json:"subject_id,omitempty"`
	ClassID         string         `json:"class_id,omitempty"`
	Subject         string         `json:"subject"`
	Class           string         `json:"class"`
	StartsAt        time.Time      `json:"starts_at"`
	CheckInEndsAt   time.Time      `json:"checkin_ends_at"`
	TimerEnabled    bool           `json:"timer_enabled"`
	DurationMinutes *int           `json:"duration_minutes"`
	RepeatCount     int            `json:"repeat_count"`
	ScorePolicy     string         `json:"score_policy"`
	QuestionCount   int            `json:"question_count"`
	TotalPoints     float64        `json:"total_points"`
	Status          string         `json:"status"`
	Questions       []ExamQuestion `json:"questions,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
}
type ExamQuestion struct {
	ID         string              `json:"id,omitempty"`
	SourceKind string              `json:"source_kind"`
	QuestionID string              `json:"question_id,omitempty"`
	SaveToBank bool                `json:"save_to_bank,omitempty"`
	Points     float64             `json:"points,omitempty"`
	Question   *questions.Question `json:"question,omitempty"`
	Snapshot   json.RawMessage     `json:"snapshot,omitempty"`
}
type Composition struct {
	Questions []ExamQuestion `json:"questions"`
	Random    []RandomDraw   `json:"random,omitempty"`
}
type RandomDraw struct {
	Count      int    `json:"count"`
	SubjectID  string `json:"subject_id,omitempty"`
	TopicID    string `json:"topic_id,omitempty"`
	Type       string `json:"type,omitempty"`
	Difficulty string `json:"difficulty,omitempty"`
	Tag        string `json:"tag,omitempty"`
}

var ScorePolicies = []string{"highest", "latest", "average"}
