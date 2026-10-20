-- Initial teacher login. Password is stored as a bcrypt hash (cost 12).
UPDATE teachers
SET username = 'ellydadwiap',
    password_hash = '$2b$12$lBMZgzwbIyiTsHyCccTVROvMUU4jA4iRqVuvVugbqemOuiL.5VHbG'
WHERE lower(name) = lower('ellydadwiap')
  AND NOT EXISTS (
      SELECT 1 FROM teachers other
      WHERE lower(other.username) = lower('ellydadwiap') AND other.id <> teachers.id
  );

INSERT INTO teachers (name, username, password_hash)
SELECT 'ellydadwiap', 'ellydadwiap', '$2b$12$lBMZgzwbIyiTsHyCccTVROvMUU4jA4iRqVuvVugbqemOuiL.5VHbG'
WHERE NOT EXISTS (
    SELECT 1 FROM teachers WHERE lower(username) = lower('ellydadwiap')
)
  AND NOT EXISTS (
    SELECT 1 FROM teachers WHERE lower(name) = lower('ellydadwiap')
)
ON CONFLICT DO NOTHING;
