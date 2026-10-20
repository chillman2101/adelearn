export const API = "/api/proxy";

export async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    cache: "no-store",
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "Permintaan gagal.");
    error.fieldErrors = body.field_errors || {};
    error.code = body.code;
    throw error;
  }
  return body;
}
export const questionsApi = {
  list: (filters = {}) =>
    request(
      `/questions?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))}`,
    ),
  get: (id) => request(`/questions/${id}`),
  save: (question, id) =>
    request(`/questions${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(question),
    }),
  archive: (id) => request(`/questions/${id}`, { method: "DELETE" }),
  previewImport: (formData) => request("/questions/import/preview", { method: "POST", body: formData }),
  import: (questions) => request("/questions/import", { method: "POST", body: JSON.stringify({ questions }) }),
};
export const examsApi = {
  list: () => request("/exams"),
  get: (id) => request(`/exams/${id}`),
  results: (id) => request(`/exams/${id}/results`),
  save: (exam, id) =>
    request(`/exams${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(exam),
    }),
  updateSchedule: (id, schedule) => request(`/exams/${id}/schedule`, { method: "PUT", body: JSON.stringify(schedule) }),
  compose: (id, composition) =>
    request(`/exams/${id}/questions`, {
      method: "PUT",
      body: JSON.stringify(composition),
    }),
  publish: (id) => request(`/exams/${id}/publish`, { method: "POST" }),
  studentAccess: (id) => request(`/exams/${id}/student-access`),
  generateStudentAccess: (id) => request(`/exams/${id}/student-access/generate`, { method: "POST" }),
  generateStudentAccessForStudent: (id, studentId) => request(`/exams/${id}/student-access/${studentId}/generate`, { method: "POST" }),
};
export const catalogsApi = {
  list: (kind, subjectId) => request(`/${kind}${subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : ""}`),
  create: (kind, name, subjectId) => request(`/${kind}`, { method: "POST", body: JSON.stringify({ name, ...(subjectId ? { subject_id: subjectId } : {}) }) }),
};
export const settingsApi = {
  get: () => request("/settings"),
  save: (settings) => request("/settings", { method: "PUT", body: JSON.stringify(settings) }),
};
export const studentsApi = {
  list: (filters = {}) => request(`/students?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))}`),
  get: (id) => request(`/students/${id}`),
  save: (student, id) => request(`/students${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(student) }),
  archive: (id) => request(`/students/${id}`, { method: "DELETE" }),
};

export const studentApi = {
  exam: () => request("/student/exam"),
  startAttempt: () => request("/student/attempts", { method: "POST" }),
  attempt: (id) => request(`/student/attempts/${id}`),
  saveAnswer: (attemptId, questionId, answer) => request(`/student/attempts/${attemptId}/answers`, { method: "PUT", body: JSON.stringify({ question_id: questionId, answer }) }),
  submitAttempt: (id) => request(`/student/attempts/${id}/submit`, { method: "POST" }),
};
