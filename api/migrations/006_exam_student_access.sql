CREATE TABLE IF NOT EXISTS exam_student_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS exam_student_access_student_idx ON exam_student_access (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS exam_student_access_active_student_unique ON exam_student_access (exam_id, student_id) WHERE revoked_at IS NULL;
