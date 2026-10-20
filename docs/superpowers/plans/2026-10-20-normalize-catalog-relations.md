# Normalize Catalog Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make catalog UUIDs the source of truth for question subject/topic and exam class/subject relationships, while keeping bank questions reusable across classes.

**Architecture:** Keep the existing catalog foreign keys and verified data backfill, add indexes, and remove the question-class foreign key in a forward migration. Update Go repositories and request/response types to query and write IDs while deriving display labels with joins; update web forms and filters to submit IDs.

**Tech Stack:** PostgreSQL migrations, Go `database/sql`, Next.js JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-20-normalize-catalog-relations-design.md`

## Global Constraints

- Preserve legacy label columns and published snapshots during this migration.
- IDs define live relationships; labels are display values only.
- Bank questions have no class restriction; exam class belongs to the exam.
- Do not assign unresolved or ambiguous labels to an arbitrary catalog row.
- Do not commit or push changes.

## Review Focus

- Legacy blank/unmatched exam class or subject values: migration reports the rows and does not fabricate a relation.
- Topic names reused under different subjects: backfill selects the topic scoped to the matching subject.
- ID filters: compare UUID fields, not their display names.
- Name-only callers during transition: resolve at the API boundary and persist only IDs.
- Random draw and import paths: use subject/topic IDs and never restrict by class.

---

### Task 1: Catalog foreign-key migration

**Files:**
- Create: `api/migrations/003_catalog_relation_indexes.sql`

**Interfaces:**
- Consumes: current catalog tables and legacy `subject`, `topic`, and `class_label` values.
- Produces: indexed live catalog IDs for questions and exams, with no question-class relationship.

- [x] Preserve existing question class values but drop their foreign-key constraint, add indexes for live catalog foreign keys, and do not create/use `questions.class_id` for new records.
- [x] Confirm the existing `002_catalogs.sql` backfill covers the current rows and review up-from-current-schema compatibility.

### Task 2: Question API and repository

**Files:**
- Modify: `api/internal/questions/types.go`
- Modify: `api/internal/questions/handler.go`
- Modify: `api/internal/questions/repository.go`
- Modify: `api/internal/http/router.go` if import payload mapping requires it.

**Interfaces:**
- Consumes: `subject_id` and `topic_id` request/filter values.
- Produces: ID-backed persistence with display names in `Question` responses.

- [x] Change list/get to join subject/topic catalogs and scan IDs plus display names; stop returning a meaningful question class value.
- [x] Change filters to compare subject/topic UUID columns and remove class filtering.
- [x] Change create/update/import to resolve/validate IDs and write relationship columns.
- [x] Preserve transitional name-only input resolution at the boundary if existing clients still send labels.

### Task 3: Exam API and repository

**Files:**
- Modify: `api/internal/exams/types.go`
- Modify: `api/internal/exams/repository.go`

**Interfaces:**
- Consumes: exam `subject_id` and `class_id`; random draw catalog IDs.
- Produces: ID-backed exam persistence, joined display labels, and ID-based random filters.

- [x] Change list/get/save to join or write catalog IDs.
- [x] Change random draw resolution to use subject/topic IDs and remove class filtering.
- [x] Preserve question snapshot labels as copied historical content.

### Task 4: Web forms and filters

**Files:**
- Modify: question editor, exam builder, question bank filter page, and relevant API client code under `web/`.

**Interfaces:**
- Consumes: catalog selector IDs and API response IDs.
- Produces: ID-based create/update/filter/random payloads while rendering names.

- [x] Keep separate form state for catalog IDs and display labels where needed; remove class controls from question bank/random/question editor flows.
- [x] Ensure imports and inline-to-bank saves follow the new request contract.
- [x] Preserve existing UI labels and selection behavior.

### Task 5: Verification

**Files:**
- Review migration, repository queries, and frontend request payloads.

- [x] Run Go formatting and Go build; review question CRUD/filter, exam CRUD, and random draw queries.
- [x] Run the frontend production build and inspect the changed request/response flows.
- [x] Check local database relation mappings and apply migration 003.
