ALTER TABLE student_attempts ADD COLUMN IF NOT EXISTS student_id UUID;

UPDATE student_attempts attempt
SET student_id=access.student_id
FROM exam_student_access access
WHERE attempt.access_id=access.id AND attempt.student_id IS NULL;

ALTER TABLE student_attempts ALTER COLUMN student_id SET NOT NULL;
ALTER TABLE student_attempts DROP CONSTRAINT IF EXISTS student_attempts_student_id_fkey;
ALTER TABLE student_attempts
    ADD CONSTRAINT student_attempts_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE student_attempts DROP CONSTRAINT IF EXISTS student_attempts_access_id_attempt_number_key;
DROP INDEX IF EXISTS student_attempts_one_active_idx;

ALTER TABLE student_attempts ALTER COLUMN access_id DROP NOT NULL;
ALTER TABLE student_attempts DROP CONSTRAINT IF EXISTS student_attempts_access_id_fkey;
ALTER TABLE student_attempts
    ADD CONSTRAINT student_attempts_access_id_fkey
    FOREIGN KEY (access_id) REFERENCES exam_student_access(id) ON DELETE SET NULL;

WITH active_attempts AS (
    SELECT id,
           row_number() OVER (PARTITION BY exam_id,student_id ORDER BY started_at DESC,id DESC) AS position
    FROM student_attempts
    WHERE status='in_progress'
)
UPDATE student_attempts attempt
SET status='expired',submitted_at=COALESCE(attempt.submitted_at,now())
FROM active_attempts
WHERE attempt.id=active_attempts.id AND active_attempts.position>1;

WITH numbered_attempts AS (
    SELECT id,
           row_number() OVER (PARTITION BY exam_id,student_id ORDER BY started_at,attempt_number,id) AS next_number
    FROM student_attempts
)
UPDATE student_attempts attempt
SET attempt_number=numbered_attempts.next_number::integer
FROM numbered_attempts
WHERE attempt.id=numbered_attempts.id;

ALTER TABLE student_attempts
    ADD CONSTRAINT student_attempts_exam_student_attempt_number_key
    UNIQUE (exam_id,student_id,attempt_number);

CREATE UNIQUE INDEX IF NOT EXISTS student_attempts_one_active_student_idx
    ON student_attempts (exam_id,student_id) WHERE status='in_progress';
CREATE INDEX IF NOT EXISTS student_attempts_exam_student_idx
    ON student_attempts (exam_id,student_id);
