CREATE TABLE IF NOT EXISTS student_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_id UUID NOT NULL REFERENCES exam_student_access(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    score_points NUMERIC(10,2),
    pending_manual_grading BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (access_id, attempt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS student_attempts_one_active_idx ON student_attempts (access_id) WHERE status='in_progress';
CREATE INDEX IF NOT EXISTS student_attempts_exam_idx ON student_attempts (exam_id, access_id);

CREATE TABLE IF NOT EXISTS student_attempt_questions (
    attempt_id UUID NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
    exam_question_id UUID NOT NULL REFERENCES exam_questions(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK (position > 0),
    snapshot JSONB NOT NULL,
    points NUMERIC(8,2) NOT NULL CHECK (points > 0),
    PRIMARY KEY (attempt_id, exam_question_id),
    UNIQUE (attempt_id, position)
);
