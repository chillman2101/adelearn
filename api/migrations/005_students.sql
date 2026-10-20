CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS students_class_id_idx ON students (class_id);
CREATE INDEX IF NOT EXISTS students_name_idx ON students (lower(name));

DROP TRIGGER IF EXISTS students_touch_updated_at ON students;
CREATE TRIGGER students_touch_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
