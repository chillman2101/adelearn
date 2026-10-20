package questions

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type FieldErrors map[string]string

func (e FieldErrors) Error() string { return "question validation failed" }

func Validate(q Question) error {
	errorsByField := FieldErrors{}
	if strings.TrimSpace(q.Prompt) == "" {
		errorsByField["prompt"] = "Tulis pertanyaan terlebih dahulu."
	}
	if q.Points <= 0 {
		errorsByField["points"] = "Bobot soal harus lebih dari 0."
	}
	supported := false
	for _, questionType := range Types {
		if q.Type == questionType {
			supported = true
			break
		}
	}
	if !supported {
		errorsByField["type"] = "Pilih tipe soal yang tersedia."
	}

	var data map[string]any
	if len(q.Data) > 0 {
		if err := json.Unmarshal(q.Data, &data); err != nil {
			errorsByField["data"] = "Data soal tidak terbaca."
		}
	}
	if data == nil {
		data = map[string]any{}
	}

	switch q.Type {
	case SingleChoice, MultiSelect:
		options := objects(data["options"])
		correct := 0
		for _, option := range options {
			if option["correct"] == true {
				correct++
			}
		}
		if len(options) < 2 {
			errorsByField["data.options"] = "Tambahkan minimal dua pilihan jawaban."
		}
		if (q.Type == SingleChoice && correct != 1) || (q.Type == MultiSelect && correct < 2) {
			errorsByField["data.options"] = "Tandai jawaban benar sesuai tipe soal."
		}
	case TrueFalse:
		if len(objects(data["statements"])) == 0 {
			errorsByField["data.statements"] = "Tambahkan minimal satu pernyataan."
		}
	case ShortAnswer:
		if len(stringsList(data["accepted_answers"])) == 0 {
			errorsByField["data.accepted_answers"] = "Tambahkan minimal satu jawaban yang diterima."
		}
	case FillBlank:
		if len(objects(data["blanks"])) == 0 {
			errorsByField["data.blanks"] = "Tambahkan minimal satu bagian isian."
		}
	case Matching:
		if len(objects(data["pairs"])) < 2 {
			errorsByField["data.pairs"] = "Tambahkan minimal dua pasangan."
		}
	case Ordering:
		if len(objects(data["items"])) < 2 {
			errorsByField["data.items"] = "Tambahkan minimal dua item untuk diurutkan."
		}
	}

	if len(errorsByField) > 0 {
		return errorsByField
	}
	return nil
}

func objects(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if object, ok := item.(map[string]any); ok {
			result = append(result, object)
		}
	}
	return result
}

func stringsList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if value, ok := item.(string); ok && strings.TrimSpace(value) != "" {
			result = append(result, strings.TrimSpace(value))
		}
	}
	return result
}

func Decode(raw json.RawMessage, target any) error {
	if len(raw) == 0 {
		return errors.New("empty question data")
	}
	if err := json.Unmarshal(raw, target); err != nil {
		return fmt.Errorf("decode question data: %w", err)
	}
	return nil
}
