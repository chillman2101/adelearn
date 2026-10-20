package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"adelearn/api/internal/exams"
	"adelearn/api/internal/teachers"
)

type sessionContextKey struct{}

type authenticatedSession struct {
	Role    string                `json:"role"`
	Teacher *teachers.Session     `json:"teacher,omitempty"`
	Student *exams.StudentSession `json:"student,omitempty"`
}

func bearerToken(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(value) < 8 || !strings.EqualFold(value[:7], "Bearer ") {
		return ""
	}
	return strings.TrimSpace(value[7:])
}

func (a *API) teacherAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, err := a.Teachers.Authenticate(r.Context(), bearerToken(r))
		if err != nil {
			fail(w, http.StatusUnauthorized, "unauthorized", "Sesi guru tidak aktif. Silakan login kembali.", nil)
			return
		}
		ctx := context.WithValue(r.Context(), sessionContextKey{}, authenticatedSession{Role: "teacher", Teacher: &session})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *API) studentAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, err := a.Exams.AuthenticateStudent(r.Context(), bearerToken(r))
		if err != nil {
			fail(w, http.StatusUnauthorized, "unauthorized", err.Error(), nil)
			return
		}
		ctx := context.WithValue(r.Context(), sessionContextKey{}, authenticatedSession{Role: "student", Student: &session})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Role     string `json:"role"`
		Username string `json:"username"`
		UserID   string `json:"user_id"`
		Password string `json:"password"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	switch body.Role {
	case "teacher":
		session, token, err := a.Teachers.Login(r.Context(), body.Username, body.Password)
		if err != nil {
			fail(w, 401, "invalid_credentials", "Username atau sandi tidak sesuai.", nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "session": authenticatedSession{Role: "teacher", Teacher: &session}})
	case "student":
		session, token, err := a.Exams.StudentLogin(r.Context(), body.UserID, body.Password)
		if err != nil {
			fail(w, 401, "invalid_credentials", "ID atau sandi tidak sesuai.", nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "session": authenticatedSession{Role: "student", Student: &session}})
	default:
		fail(w, 400, "validation_error", "Pilih jenis akun.", map[string]string{"role": "Pilih guru atau siswa."})
	}
}

func (a *API) studentLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID   string `json:"user_id"`
		Password string `json:"password"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	session, token, err := a.Exams.StudentLogin(r.Context(), body.UserID, body.Password)
	if err != nil {
		fail(w, 401, "invalid_credentials", "ID atau sandi tidak sesuai.", nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "session": authenticatedSession{Role: "student", Student: &session}})
}

func (a *API) authSession(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if session, err := a.Teachers.Authenticate(r.Context(), token); err == nil {
		writeJSON(w, http.StatusOK, authenticatedSession{Role: "teacher", Teacher: &session})
		return
	}
	if session, err := a.Exams.AuthenticateStudent(r.Context(), token); err == nil {
		writeJSON(w, http.StatusOK, authenticatedSession{Role: "student", Student: &session})
		return
	}
	fail(w, http.StatusUnauthorized, "unauthorized", "Sesi sudah tidak aktif. Silakan login kembali.", nil)
}

func (a *API) studentSession(w http.ResponseWriter, r *http.Request) {
	session := r.Context().Value(sessionContextKey{}).(authenticatedSession)
	writeJSON(w, http.StatusOK, session)
}

func (a *API) studentExam(w http.ResponseWriter, r *http.Request) {
	session := readAuthSession(r).Student
	view, err := a.Exams.StudentExam(r.Context(), *session)
	if err != nil {
		handleStudentErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (a *API) startStudentAttempt(w http.ResponseWriter, r *http.Request) {
	session := readAuthSession(r).Student
	attempt, err := a.Exams.StartStudentAttempt(r.Context(), *session)
	if err != nil {
		handleStudentErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, attempt)
}

func (a *API) getStudentAttempt(w http.ResponseWriter, r *http.Request) {
	session := readAuthSession(r).Student
	attempt, err := a.Exams.StudentAttempt(r.Context(), *session, r.PathValue("id"))
	if err != nil {
		handleStudentErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, attempt)
}

func (a *API) saveStudentAnswer(w http.ResponseWriter, r *http.Request) {
	session := readAuthSession(r).Student
	var body struct {
		QuestionID string          `json:"question_id"`
		Answer     json.RawMessage `json:"answer"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	if err := a.Exams.SaveStudentAnswer(r.Context(), *session, r.PathValue("id"), body.QuestionID, body.Answer); err != nil {
		handleStudentErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) submitStudentAttempt(w http.ResponseWriter, r *http.Request) {
	session := readAuthSession(r).Student
	if err := a.Exams.SubmitStudentAttempt(r.Context(), *session, r.PathValue("id")); err != nil {
		handleStudentErr(w, err)
		return
	}
	attempt, err := a.Exams.StudentAttempt(r.Context(), *session, r.PathValue("id"))
	if err != nil {
		handleStudentErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, attempt)
}

func handleStudentErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, exams.ErrInvalidStudentSession), errors.Is(err, exams.ErrStudentAccessRevoked):
		fail(w, http.StatusUnauthorized, "unauthorized", err.Error(), nil)
	case errors.Is(err, exams.ErrAttemptNotFound):
		fail(w, http.StatusNotFound, "not_found", err.Error(), nil)
	case errors.Is(err, exams.ErrAttemptLimit), errors.Is(err, exams.ErrAttemptClosed), errors.Is(err, exams.ErrStudentExamUnavailable):
		fail(w, http.StatusConflict, "exam_unavailable", err.Error(), nil)
	default:
		handleErr(w, err)
	}
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if err := a.Teachers.Logout(r.Context(), token); err != nil {
		handleErr(w, err)
		return
	}
	if err := a.Exams.StudentLogout(r.Context(), token); err != nil {
		handleErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) changeTeacherPassword(w http.ResponseWriter, r *http.Request) {
	session, err := a.Teachers.Authenticate(r.Context(), bearerToken(r))
	if err != nil {
		fail(w, 401, "unauthorized", "Sesi guru tidak aktif. Silakan login kembali.", nil)
		return
	}
	var body struct {
		OldPassword string `json:"old_password"`
		NewUsername string `json:"new_username"`
		NewPassword string `json:"new_password"`
	}
	if err = decode(r, &body); err != nil {
		fail(w, 400, "invalid_json", "Format data tidak valid.", nil)
		return
	}
	if err = a.Teachers.ChangeCredentials(r.Context(), session, bearerToken(r), body.OldPassword, body.NewUsername, body.NewPassword); err != nil {
		if errors.Is(err, teachers.ErrInvalidPassword) {
			fail(w, 400, "invalid_password", err.Error(), nil)
		} else {
			fail(w, 400, "validation_error", err.Error(), nil)
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func readAuthSession(r *http.Request) authenticatedSession {
	session, _ := r.Context().Value(sessionContextKey{}).(authenticatedSession)
	return session
}
