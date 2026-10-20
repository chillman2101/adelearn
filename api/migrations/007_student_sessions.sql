ALTER TABLE exam_student_access
    ADD COLUMN IF NOT EXISTS session_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;
