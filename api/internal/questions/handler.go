package questions

import (
	"encoding/json"
	"net/http"
)

type QuestionHandler struct{ Repository *Repository }

func (h QuestionHandler) List(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	result, err := h.Repository.List(r.Context(), Filters{Query: v.Get("q"), SubjectID: v.Get("subject_id"), TopicID: v.Get("topic_id"), Type: v.Get("type"), Difficulty: v.Get("difficulty"), Tag: v.Get("tag"), CreatedBy: v.Get("created_by"), Used: v.Get("used")})
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	json.NewEncoder(w).Encode(result)
}
