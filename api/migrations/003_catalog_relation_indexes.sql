-- Catalog IDs are the source of truth for live relationships.
-- Questions remain reusable across classes. Preserve legacy class values but
-- remove the live foreign-key relationship and do not use them in the API.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_class_id_fkey;
CREATE INDEX IF NOT EXISTS questions_subject_id_idx ON questions (subject_id);
CREATE INDEX IF NOT EXISTS questions_topic_id_idx ON questions (topic_id);
CREATE INDEX IF NOT EXISTS exams_subject_id_idx ON exams (subject_id);
CREATE INDEX IF NOT EXISTS exams_class_id_idx ON exams (class_id);

COMMENT ON COLUMN questions.class_id IS 'Legacy metadata only; no live class relationship. Bank questions are reusable across classes.';
COMMENT ON COLUMN questions.class_label IS 'Legacy display metadata only; bank questions are reusable across classes.';
