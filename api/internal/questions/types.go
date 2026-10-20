package questions

import (
	"encoding/json"
	"time"
)

const (
	SingleChoice = "single_choice"
	MultiSelect  = "multi_select"
	TrueFalse    = "true_false"
	ShortAnswer  = "short_answer"
	FillBlank    = "fill_blank"
	Essay        = "essay"
	Matching     = "matching"
	Ordering     = "ordering"
)

var Types = []string{SingleChoice, MultiSelect, TrueFalse, ShortAnswer, FillBlank, Essay, Matching, Ordering}

type Question struct {
	ID         string          `json:"id"`
	SubjectID  string          `json:"subject_id,omitempty"`
	TopicID    string          `json:"topic_id,omitempty"`
	Type       string          `json:"type"`
	Prompt     string          `json:"prompt"`
	Data       json.RawMessage `json:"data"`
	Points     float64         `json:"points"`
	Subject    string          `json:"subject"`
	Topic      string          `json:"topic"`
	Class      string          `json:"class"`
	Difficulty string          `json:"difficulty"`
	Tags       []string        `json:"tags"`
	CreatedBy  string          `json:"created_by"`
	Used       bool            `json:"used"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

type Filters struct {
	Query      string
	SubjectID  string
	TopicID    string
	Type       string
	Difficulty string
	Tag        string
	CreatedBy  string
	Used       string
}
