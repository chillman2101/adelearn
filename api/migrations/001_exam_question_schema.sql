CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    points NUMERIC(8,2) NOT NULL CHECK (points > 0),
    subject TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    class_label TEXT NOT NULL DEFAULT 'Kelas pertama',
    difficulty TEXT NOT NULL DEFAULT 'Sedang',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by TEXT NOT NULL DEFAULT 'Guru',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS questions_type_idx ON questions (question_type);
CREATE INDEX IF NOT EXISTS questions_subject_idx ON questions (subject);
CREATE INDEX IF NOT EXISTS questions_topic_idx ON questions (topic);
CREATE INDEX IF NOT EXISTS questions_class_idx ON questions (class_label);
CREATE INDEX IF NOT EXISTS questions_difficulty_idx ON questions (difficulty);
CREATE INDEX IF NOT EXISTS questions_tags_idx ON questions USING GIN (tags);

CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    class_label TEXT NOT NULL DEFAULT 'Kelas pertama',
    starts_at TIMESTAMPTZ NOT NULL,
    checkin_ends_at TIMESTAMPTZ NOT NULL,
    timer_enabled BOOLEAN NOT NULL DEFAULT true,
    duration_minutes INTEGER,
    repeat_count INTEGER NOT NULL DEFAULT 0 CHECK (repeat_count >= 0),
    score_policy TEXT NOT NULL DEFAULT 'highest' CHECK (score_policy IN ('highest', 'latest', 'average')),
    question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (checkin_ends_at > starts_at),
    CHECK ((timer_enabled = false) OR (duration_minutes IS NOT NULL AND duration_minutes > 0))
);

CREATE INDEX IF NOT EXISTS exams_status_idx ON exams (status, starts_at);

CREATE TABLE IF NOT EXISTS exam_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    source_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
    inline_snapshot JSONB,
    published_snapshot JSONB,
    points NUMERIC(8,2) NOT NULL CHECK (points > 0),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('bank_manual', 'bank_random', 'inline')),
    UNIQUE (exam_id, position)
);

CREATE INDEX IF NOT EXISTS exam_questions_source_idx ON exam_questions (source_question_id);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS questions_touch_updated_at ON questions;
CREATE TRIGGER questions_touch_updated_at BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS exams_touch_updated_at ON exams;
CREATE TRIGGER exams_touch_updated_at BEFORE UPDATE ON exams
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
