package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"adelearn/api/internal/catalogs"
	"adelearn/api/internal/exams"
	"adelearn/api/internal/media"
	"adelearn/api/internal/questions"
	"adelearn/api/internal/settings"
	"adelearn/api/internal/students"
	"adelearn/api/internal/teachers"
)

type API struct {
	Questions *questions.Repository
	Exams     *exams.Repository
	Media     media.Store
	Catalogs  *catalogs.Repository
	Settings  *settings.Repository
	Students  *students.Repository
	Teachers  *teachers.Repository
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	registerTeacher := func(pattern string, handler http.HandlerFunc) { mux.Handle(pattern, a.teacherAuth(handler)) }
	for _, kind := range []string{"subjects", "classes", "topics", "teachers"} {
		k := kind
		listHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			items, err := a.Catalogs.List(r.Context(), k, r.URL.Query().Get("subject_id"))
			if err != nil {
				handleErr(w, err)
				return
			}
			writeJSON(w, 200, items)
		})
		createHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Name      string `json:"name"`
				SubjectID string `json:"subject_id"`
			}
			if err := decode(r, &body); err != nil {
				fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
				return
			}
			if strings.TrimSpace(body.Name) == "" {
				fail(w, 400, "validation_error", "Nama wajib diisi.", map[string]string{"name": "Nama wajib diisi."})
				return
			}
			item, err := a.Catalogs.Create(r.Context(), k, body.Name, body.SubjectID)
			if err != nil {
				handleErr(w, err)
				return
			}
			writeJSON(w, 201, item)
		})
		if k == "teachers" {
			registerTeacher("GET /api/v1/teachers", listHandler)
			registerTeacher("POST /api/v1/teachers", createHandler)
		} else {
			registerTeacher("GET /api/v1/"+k, listHandler)
			registerTeacher("POST /api/v1/"+k, createHandler)
		}
	}
	registerTeacher("GET /api/v1/questions", a.listQuestions)
	registerTeacher("GET /api/v1/questions/import-template", a.questionImportTemplate)
	registerTeacher("POST /api/v1/questions/import/preview", a.previewQuestionImport)
	registerTeacher("POST /api/v1/questions/import", a.importQuestions)
	registerTeacher("GET /api/v1/students", a.listStudents)
	registerTeacher("POST /api/v1/students", a.createStudent)
	registerTeacher("GET /api/v1/students/{id}", a.getStudent)
	registerTeacher("PUT /api/v1/students/{id}", a.updateStudent)
	registerTeacher("DELETE /api/v1/students/{id}", a.archiveStudent)
	registerTeacher("POST /api/v1/questions", a.createQuestion)
	registerTeacher("GET /api/v1/questions/{id}", a.getQuestion)
	registerTeacher("PUT /api/v1/questions/{id}", a.updateQuestion)
	registerTeacher("DELETE /api/v1/questions/{id}", a.archiveQuestion)
	registerTeacher("POST /api/v1/media", a.uploadMedia)
	mux.HandleFunc("GET /media/", a.Media.Serve)
	registerTeacher("GET /api/v1/exams", a.listExams)
	registerTeacher("GET /api/v1/settings", a.getSettings)
	registerTeacher("PUT /api/v1/settings", a.saveSettings)
	registerTeacher("POST /api/v1/exams", a.createExam)
	registerTeacher("GET /api/v1/exams/{id}", a.getExam)
	registerTeacher("GET /api/v1/exams/{id}/results", a.getExamStudentResults)
	registerTeacher("GET /api/v1/exams/{id}/student-access", a.listExamStudentAccess)
	registerTeacher("POST /api/v1/exams/{id}/student-access/generate", a.generateExamStudentAccess)
	registerTeacher("POST /api/v1/exams/{id}/student-access/{student_id}/generate", a.generateExamStudentAccessForStudent)
	registerTeacher("PUT /api/v1/exams/{id}", a.updateExam)
	registerTeacher("PUT /api/v1/exams/{id}/schedule", a.updateExamSchedule)
	registerTeacher("PUT /api/v1/exams/{id}/questions", a.replaceExamQuestions)
	registerTeacher("POST /api/v1/exams/{id}/publish", a.publishExam)
	mux.HandleFunc("POST /api/v1/auth/login", a.login)
	mux.HandleFunc("POST /api/v1/auth/logout", a.logout)
	mux.HandleFunc("GET /api/v1/auth/session", a.authSession)
	mux.HandleFunc("POST /api/v1/auth/change-password", a.changeTeacherPassword)
	mux.HandleFunc("POST /api/v1/student/login", a.studentLogin)
	mux.Handle("GET /api/v1/student/session", a.studentAuth(http.HandlerFunc(a.studentSession)))
	mux.Handle("GET /api/v1/student/exam", a.studentAuth(http.HandlerFunc(a.studentExam)))
	mux.Handle("POST /api/v1/student/attempts", a.studentAuth(http.HandlerFunc(a.startStudentAttempt)))
	mux.Handle("GET /api/v1/student/attempts/{id}", a.studentAuth(http.HandlerFunc(a.getStudentAttempt)))
	mux.Handle("PUT /api/v1/student/attempts/{id}/answers", a.studentAuth(http.HandlerFunc(a.saveStudentAnswer)))
	mux.Handle("POST /api/v1/student/attempts/{id}/submit", a.studentAuth(http.HandlerFunc(a.submitStudentAttempt)))
	return withCORS(mux)
}

func (a *API) getSettings(w http.ResponseWriter, r *http.Request) {
	value, err := a.Settings.Get(r.Context())
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func (a *API) saveSettings(w http.ResponseWriter, r *http.Request) {
	var value settings.Settings
	if err := decode(r, &value); err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	fields := map[string]string{}
	if strings.TrimSpace(value.ClassID) == "" {
		fields["class_id"] = "Pilih kelas terlebih dahulu."
	}
	if strings.TrimSpace(value.TeacherID) == "" {
		fields["teacher_id"] = "Pilih guru terlebih dahulu."
	}
	if strings.TrimSpace(value.AcademicYear) == "" {
		fields["academic_year"] = "Tahun ajaran wajib diisi."
	}
	if len(fields) > 0 {
		fail(w, http.StatusBadRequest, "validation_error", "Lengkapi pengaturan kelas, guru, dan tahun ajaran.", fields)
		return
	}
	out, err := a.Settings.Save(r.Context(), value)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *API) listStudents(w http.ResponseWriter, r *http.Request) {
	items, err := a.Students.List(r.Context(), students.Filters{ClassID: r.URL.Query().Get("class_id"), Query: r.URL.Query().Get("q")})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) createStudent(w http.ResponseWriter, r *http.Request) {
	var item students.Student
	if err := decode(r, &item); err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	out, err := a.Students.Create(r.Context(), item)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (a *API) getStudent(w http.ResponseWriter, r *http.Request) {
	item, err := a.Students.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) updateStudent(w http.ResponseWriter, r *http.Request) {
	var item students.Student
	if err := decode(r, &item); err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	out, err := a.Students.Update(r.Context(), r.PathValue("id"), item)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *API) archiveStudent(w http.ResponseWriter, r *http.Request) {
	if err := a.Students.Archive(r.Context(), r.PathValue("id")); err != nil {
		handleErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type apiError struct {
	Code        string            `json:"code"`
	Message     string            `json:"message"`
	FieldErrors map[string]string `json:"field_errors,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, code, message string, fields map[string]string) {
	writeJSON(w, status, apiError{code, message, fields})
}
func decode(r *http.Request, v any) error {
	d := json.NewDecoder(io.LimitReader(r.Body, 10<<20))
	d.DisallowUnknownFields()
	return d.Decode(v)
}
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func handleErr(w http.ResponseWriter, err error) {
	var qf questions.FieldErrors
	var ef exams.FieldErrors
	var sf students.FieldErrors
	switch {
	case errors.As(err, &qf):
		fail(w, 400, "validation_error", "Periksa kembali data yang dimasukkan.", qf)
	case errors.As(err, &ef):
		fail(w, 400, "validation_error", "Periksa kembali data ujian.", ef)
	case errors.As(err, &sf):
		fail(w, 400, "validation_error", "Periksa kembali data siswa.", sf)
	case errors.Is(err, questions.ErrNotFound), errors.Is(err, exams.ErrNotFound), errors.Is(err, students.ErrNotFound):
		fail(w, 404, "not_found", "Data tidak ditemukan.", nil)
	case errors.Is(err, exams.ErrInsufficientQuestions):
		fail(w, 400, "insufficient_questions", err.Error(), nil)
	case errors.Is(err, exams.ErrNoStudents):
		fail(w, 400, "no_students", err.Error(), nil)
	default:
		log.Printf("request failed: %v", err)
		fail(w, 500, "internal_error", "Terjadi kesalahan pada server.", nil)
	}
}
func (a *API) listQuestions(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	out, err := a.Questions.List(r.Context(), questions.Filters{Query: v.Get("q"), SubjectID: v.Get("subject_id"), TopicID: v.Get("topic_id"), Type: v.Get("type"), Difficulty: v.Get("difficulty"), Tag: v.Get("tag"), CreatedBy: v.Get("created_by"), Used: v.Get("used")})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) questionImportTemplate(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="adelearn-template-impor-soal.csv"`)
	if err := questions.WriteImportTemplate(w); err != nil {
		log.Printf("write import template: %v", err)
	}
}
func (a *API) previewQuestionImport(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		fail(w, 400, "invalid_upload", "Ukuran file maksimal 10 MB.", nil)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		fail(w, 400, "invalid_upload", "Pilih file Excel atau CSV.", nil)
		return
	}
	defer file.Close()
	content, err := io.ReadAll(io.LimitReader(file, (10<<20)+1))
	if err != nil || len(content) > 10<<20 {
		fail(w, 400, "invalid_upload", "File tidak dapat dibaca atau melebihi 10 MB.", nil)
		return
	}
	rows, err := questions.ParseImportFile(header.Filename, content)
	if err != nil {
		fail(w, 400, "invalid_import_file", err.Error(), nil)
		return
	}
	prompts := make([]string, 0, len(rows))
	for _, row := range rows {
		if len(row.Errors) == 0 {
			prompts = append(prompts, row.Question.Prompt)
		}
	}
	existing, err := a.Questions.DuplicatePrompts(r.Context(), prompts)
	if err != nil {
		handleErr(w, err)
		return
	}
	seen := map[string]bool{}
	for i := range rows {
		if len(rows[i].Errors) > 0 {
			continue
		}
		key := strings.ToLower(strings.Join(strings.Fields(rows[i].Question.Prompt), " "))
		if existing[key] {
			if rows[i].Warnings == nil {
				rows[i].Warnings = map[string]string{}
			}
			rows[i].Warnings["duplicate"] = "Pertanyaan yang sama sudah ada di bank soal."
		}
		if seen[key] {
			if rows[i].Warnings == nil {
				rows[i].Warnings = map[string]string{}
			}
			rows[i].Warnings["duplicate_in_file"] = "Pertanyaan ini juga muncul lebih dari sekali dalam file."
		}
		seen[key] = true
	}
	writeJSON(w, 200, map[string]any{"rows": rows, "count": len(rows)})
}
func (a *API) importQuestions(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Questions []questions.Question `json:"questions"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, 400, "invalid_json", "Format data impor tidak valid.", nil)
		return
	}
	items, err := a.Questions.Import(r.Context(), body.Questions)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, map[string]any{"imported": len(items), "questions": items})
}
func (a *API) createQuestion(w http.ResponseWriter, r *http.Request) {
	var q questions.Question
	if err := decode(r, &q); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	out, err := a.Questions.Create(r.Context(), q)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, out)
}
func (a *API) getQuestion(w http.ResponseWriter, r *http.Request) {
	out, err := a.Questions.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) updateQuestion(w http.ResponseWriter, r *http.Request) {
	var q questions.Question
	if err := decode(r, &q); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	out, err := a.Questions.Update(r.Context(), r.PathValue("id"), q)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) archiveQuestion(w http.ResponseWriter, r *http.Request) {
	if err := a.Questions.Archive(r.Context(), r.PathValue("id")); err != nil {
		handleErr(w, err)
		return
	}
	w.WriteHeader(204)
}
func (a *API) uploadMedia(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, (5<<20)+(128<<10))
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		fail(w, 400, "invalid_upload", "Pilih gambar maksimal 5 MB.", nil)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		fail(w, 400, "invalid_upload", "Pilih file gambar terlebih dahulu.", nil)
		return
	}
	defer file.Close()
	kind := header.Header.Get("Content-Type")
	if !strings.HasPrefix(kind, "image/") {
		fail(w, 400, "invalid_upload", "File harus berupa gambar.", nil)
		return
	}
	out, err := a.Media.Save(file, header.Filename, kind)
	if err != nil {
		fail(w, 400, "invalid_upload", err.Error(), nil)
		return
	}
	writeJSON(w, 201, out)
}
func (a *API) serveMedia(w http.ResponseWriter, r *http.Request) { a.Media.Serve(w, r) }
func (a *API) listExams(w http.ResponseWriter, r *http.Request) {
	out, err := a.Exams.List(r.Context())
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) createExam(w http.ResponseWriter, r *http.Request) {
	var e exams.Exam
	if err := decode(r, &e); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	out, err := a.Exams.Save(r.Context(), e)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, out)
}
func (a *API) getExam(w http.ResponseWriter, r *http.Request) {
	out, err := a.Exams.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) getExamStudentResults(w http.ResponseWriter, r *http.Request) {
	items, err := a.Exams.StudentResults(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) listExamStudentAccess(w http.ResponseWriter, r *http.Request) {
	items, err := a.Exams.ListStudentAccess(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) generateExamStudentAccess(w http.ResponseWriter, r *http.Request) {
	items, err := a.Exams.GenerateStudentAccess(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) generateExamStudentAccessForStudent(w http.ResponseWriter, r *http.Request) {
	item, err := a.Exams.GenerateStudentAccessForStudent(r.Context(), r.PathValue("id"), r.PathValue("student_id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) updateExam(w http.ResponseWriter, r *http.Request) {
	var e exams.Exam
	if err := decode(r, &e); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	e.ID = r.PathValue("id")
	out, err := a.Exams.Save(r.Context(), e)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) updateExamSchedule(w http.ResponseWriter, r *http.Request) {
	var body struct {
		StartsAt      time.Time `json:"starts_at"`
		CheckInEndsAt time.Time `json:"checkin_ends_at"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, 400, "invalid_json", "Format jadwal tidak valid.", nil)
		return
	}
	if err := a.Exams.UpdateSchedule(r.Context(), r.PathValue("id"), body.StartsAt, body.CheckInEndsAt); err != nil {
		handleErr(w, err)
		return
	}
	value, err := a.Exams.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}
func (a *API) replaceExamQuestions(w http.ResponseWriter, r *http.Request) {
	var c exams.Composition
	if err := decode(r, &c); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	if err := a.Exams.Compose(r.Context(), r.PathValue("id"), c); err != nil {
		handleErr(w, err)
		return
	}
	out, err := a.Exams.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (a *API) publishExam(w http.ResponseWriter, r *http.Request) {
	if err := a.Exams.Publish(r.Context(), r.PathValue("id")); err != nil {
		handleErr(w, err)
		return
	}
	out, err := a.Exams.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}
