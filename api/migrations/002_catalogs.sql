CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_name_unique ON subjects (lower(name));

CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS classes_name_unique ON classes (lower(name));

CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS topics_name_subject_unique ON topics (subject_id, lower(name));

INSERT INTO subjects(name)
SELECT DISTINCT trim(v) FROM (SELECT subject v FROM questions UNION SELECT subject FROM exams) s
WHERE trim(v) <> '' ON CONFLICT DO NOTHING;
INSERT INTO subjects(name) VALUES ('Matematika') ON CONFLICT DO NOTHING;
INSERT INTO classes(name)
SELECT DISTINCT trim(v) FROM (SELECT class_label v FROM questions UNION SELECT class_label FROM exams) c
WHERE trim(v) <> '' ON CONFLICT DO NOTHING;
INSERT INTO classes(name) VALUES ('Kelas 8A') ON CONFLICT DO NOTHING;
INSERT INTO topics(subject_id, name)
SELECT DISTINCT s.id, trim(q.topic) FROM questions q
LEFT JOIN subjects s ON lower(s.name)=lower(NULLIF(trim(q.subject), ''))
WHERE trim(q.topic) <> '' ON CONFLICT DO NOTHING;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES topics(id);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id);

UPDATE questions q SET subject_id=s.id FROM subjects s WHERE q.subject_id IS NULL AND lower(s.name)=lower(NULLIF(trim(q.subject), ''));
UPDATE questions q SET class_id=c.id FROM classes c WHERE q.class_id IS NULL AND lower(c.name)=lower(NULLIF(trim(q.class_label), ''));
UPDATE questions q SET topic_id=t.id FROM topics t WHERE q.topic_id IS NULL AND lower(t.name)=lower(NULLIF(trim(q.topic), '')) AND (t.subject_id=q.subject_id OR t.subject_id IS NULL);
UPDATE exams e SET subject_id=s.id FROM subjects s WHERE e.subject_id IS NULL AND lower(s.name)=lower(NULLIF(trim(e.subject), ''));
UPDATE exams e SET class_id=c.id FROM classes c WHERE e.class_id IS NULL AND lower(c.name)=lower(NULLIF(trim(e.class_label), ''));
