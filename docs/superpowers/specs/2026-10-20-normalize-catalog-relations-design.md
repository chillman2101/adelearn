# Normalize Catalog Relations Design

## Intent

Make UUID foreign keys the source of truth for subject and topic relationships on questions, and class and subject relationships on exams. Bank questions are reusable across classes, so questions must not be restricted by class.

## Goals

- Backfill and enforce `questions.subject_id`, `questions.topic_id`, `exams.class_id`, and `exams.subject_id`.
- Make create, update, list, get, random selection, and import use IDs for relationships.
- Keep readable `class`, `subject`, and `topic` names in API responses by joining the catalog tables.
- Remove class filtering from the bank, random selection, and question editor so bank questions can be used across classes.
- Keep legacy text columns during this change to avoid destructive data removal; stop using them as relational keys.
- Preserve snapshots as historical display data, since published exam snapshots are immutable copies rather than live relationships.

## Non-goals

- Removing legacy text columns in this migration.
- Replacing `created_by` with a user ID; the repository has no user catalog or authentication identity yet.
- Changing the existing exam-to-question UUID relationship.

## Design

Add a forward-only migration that indexes the existing catalog foreign keys and removes the legacy `questions.class_id` foreign-key constraint. Preserve old question class values as unused metadata. Exams retain `class_id`; questions have no live class relationship. For topics, resolve by both name and subject; reject ambiguous or unresolvable mappings instead of silently assigning the wrong topic.

API request types gain `subject_id`, `topic_id`, and `class_id`. Catalog IDs determine relationships. Human-readable names remain response fields resolved through joins so existing screens can keep rendering labels. Legacy name-only request compatibility may resolve names to catalog IDs at the boundary during transition, but all database writes use IDs.

Question and exam list/get queries join catalog names. Question filters compare ID columns with ID filters. Random draw filters and frontend forms carry IDs. Import resolves/creates catalog entries transactionally, then inserts using their IDs.

## Constraints and risks

- Existing records may have blank or unmatched labels. Migration must report/fail on unresolved required exam-class or subject mappings rather than fabricate a relationship.
- Duplicate catalog names are currently case-insensitively unique for classes and subjects; topic uniqueness is scoped by subject.
- Existing published snapshots retain copied labels by design.
- No migration should delete label columns or catalog entries.

## Acceptance

- Existing question subject/topic and exam class/subject values have valid catalog foreign keys.
- Bank and random question selection are not restricted by class.
- ID-based filters return the matching records.
- Create/update/import persist the selected IDs and return labels via joins.
- Random question selection honors subject/topic/class IDs.
- Existing exam snapshots and bank-question display remain readable.
