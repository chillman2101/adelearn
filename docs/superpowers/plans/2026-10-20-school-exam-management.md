# School Exam Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first teacher-facing release for managing exams and a reusable question bank for one class.

**Architecture:** Start a small web monorepo with a Next.js teacher interface, a Go REST API, and PostgreSQL. Keep question type validation and scoring rules in Go domain packages, store published question snapshots on exam items, and expose focused APIs consumed by the teacher interface. Student attempt screens, reporting, and spreadsheet import remain later phases.

**Tech Stack:** Proposed call: Next.js App Router with JavaScript, Go REST API, PostgreSQL, and local development file storage behind an interface for question images. The current folder contains only a PDF, so no existing implementation or stack can be extended.

**Spec:** `docs/superpowers/specs/2026-10-20-school-exam-management-design.md`

## Global Constraints

- The first release is for one class.
- Teacher-facing exam and question management is the first implementation phase.
- Question types: single-answer multiple choice, multi-select, true/false statements, short answer, fill-in, essay, matching, and ordering.
- Images can be attached to question prompts and answer options.
- Every question has a numeric weight; incorrect selections in multi-select, matching, and ordering add no points and do not subtract points.
- Show both earned/maximum points and the equivalent score out of 100.
- Bank questions can be selected individually, drawn randomly by count and filters, or authored directly in an exam.
- Publish-time snapshots keep published exams unchanged when bank questions are later edited.
- Exam check-in has a start and end time; each attempt must start before the end time. An enabled timer begins at check-in and continues after the check-in window closes.
- Reconnection resumes the same attempt; student answers are autosaved. Student attempt screens are not part of this first teacher-facing release.
- Full student result screens and teacher reports are deferred.
- Do not commit or push unless explicitly requested.
- Automated tests are not included in this plan unless requested; tasks use implementation review and manual acceptance walkthroughs.
- Use REST requests for answer saves and PostgreSQL as the durable source of truth; no WebSocket or Redis dependency in the first release.

## Review Focus

- **A bank question changes after being selected:** a published exam must continue showing its saved snapshot. Verify by publishing, editing the source question, and inspecting the published exam snapshot.
- **Random selection returns fewer questions than requested:** the teacher must see a clear validation error and the exam must not publish with an incomplete set. Verify with filters that match fewer bank questions than the requested count.
- **An answer option is shuffled:** the correct-answer identity must remain attached to that option. Verify with a multi-select question whose options are reordered in the saved exam preview.
- **A numeric score has no valid denominator:** block publishing when total question weight is zero and prevent division by zero in the score conversion helper.
- **Image upload fails or is unsupported:** preserve the question text, show a useful error, and do not save a broken media reference. Verify with an unsupported image format and an interrupted local upload.

---

## File Structure

Create the following focused structure. If the project gains a scaffold before execution, adapt paths to its conventions without changing API behavior or feature scope.

### API

- `api/go.mod` — Go module and pinned dependencies.
- `api/openapi.yaml` — reviewed REST contract shared by handlers and the web client.
- `api/cmd/server/main.go` — application startup and graceful shutdown.
- `api/internal/config/config.go` — database, server, and media configuration.
- `api/internal/db/postgres.go` — PostgreSQL connection and migration startup.
- `api/internal/http/router.go` — route registration and middleware.
- `api/internal/questions/types.go` — question type constants and typed payloads.
- `api/internal/questions/validate.go` — per-type validation and bank filters.
- `api/internal/questions/repository.go` — question persistence interfaces and PostgreSQL implementation.
- `api/internal/questions/handler.go` — question bank HTTP endpoints.
- `api/internal/exams/types.go` — exam settings, question-source selection, and score policy types.
- `api/internal/exams/service.go` — exam validation, random selection, and publish snapshot logic.
- `api/internal/exams/repository.go` — exam persistence interfaces and PostgreSQL implementation.
- `api/internal/exams/handler.go` — exam HTTP endpoints.
- `api/internal/media/storage.go` — local development media storage interface and implementation.
- `api/migrations/001_exam_question_schema.sql` — class, subject, topic, question, media, exam, and snapshot schema.

### Web

- `web/package.json` — Next.js scripts and dependencies.
- `web/app/layout.js` — application shell.
- `web/app/page.js` — teacher dashboard entry point and navigation.
- `web/app/questions/page.js` — searchable and filterable question bank.
- `web/app/questions/new/page.js` — question authoring entry point.
- `web/app/questions/[id]/page.js` — question editing.
- `web/app/exams/page.js` — exam list and status filters.
- `web/app/exams/new/page.js` — exam settings and question composition flow.
- `web/app/exams/[id]/page.js` — exam review, edit, and publish view.
- `web/components/questions/QuestionEditor.js` — type-specific editor and prompt/option media inputs.
- `web/components/questions/QuestionBankFilters.js` — combined keyword and metadata filters.
- `web/components/exams/ExamSettingsForm.js` — schedule, timer, repeats, and scoring policy.
- `web/components/exams/ExamQuestionComposer.js` — manual bank selection, random draw, and inline question creation.
- `web/lib/api.js` — typed-by-convention API client and error mapping.

### Root

- `README.md` — local setup and run instructions.
- `.env.example` — non-secret API and database configuration names.
- Use the developer machine's local PostgreSQL service; Docker is not required.

## Contract Decisions

- `api/openapi.yaml` is the API contract; no separate Postman collection is needed for the first local build.
- Question and exam endpoints use JSON over `/api/v1`; validation failures return HTTP 400 with a stable `{ "code": "...", "message": "...", "field_errors": { ... } }` shape.
- The first phase is a local teacher authoring workspace. Teacher sign-in, student accounts, public deployment, and role enforcement are deferred until the student workflow is planned. Do not expose this phase's API to a public network.
- The student attempt phase should save each answer through an idempotent REST write; timer state comes from persisted attempt start time and duration, not an in-memory cache.
- Reconsider WebSocket or Server-Sent Events only if teachers need live exam-room status or server-to-client alerts. Add Redis only if measured needs arise for cross-instance event fan-out, caching, or background queues; never make it the durable answer store.

## API Interfaces

### Question bank

- `GET /api/v1/questions` accepts `q`, `subject_id`, `topic_id`, `class_id`, `type`, `difficulty`, `tag`, `created_by`, and `used` filters; filters combine with AND semantics.
- `POST /api/v1/questions` creates a bank question.
- `GET /api/v1/questions/{id}` returns the question and media references.
- `PUT /api/v1/questions/{id}` updates a bank question.
- `DELETE /api/v1/questions/{id}` archives a question rather than deleting published snapshots.
- `POST /api/v1/media` stores a supported image and returns a stable media ID and URL.

### Exams

- `GET /api/v1/exams` lists exams with status, subject, class, and date filters.
- `POST /api/v1/exams` creates a draft with schedule, timer, retry count, and score policy.
- `GET /api/v1/exams/{id}` returns settings and the draft question composition or published snapshots.
- `PUT /api/v1/exams/{id}` updates a draft exam.
- `PUT /api/v1/exams/{id}/questions` replaces its draft composition with explicit bank questions, random-selection rules, and/or inline questions.
- `POST /api/v1/exams/{id}/publish` validates the exam and freezes question content and answer keys into exam snapshots.

## Task 1: Bootstrap the web, API, and database development environment

**Files:**
- Create: root files listed under Root.
- Create: API startup and configuration files listed under API.
- Create: web entry files listed under Web.

**Interfaces:**
- Produces: local Next.js app, Go HTTP server, and PostgreSQL service with configuration read from environment variables.

- [ ] Create the minimal Go server and configuration loader with `GET /healthz` returning HTTP 200 and `{"status":"ok"}`.
- [ ] Add `api/openapi.yaml` for health, question-bank, media, and exam endpoints; include request/response schemas, the stable validation-error shape, and examples for all eight question types.
- [ ] Create the minimal Next.js shell and a teacher dashboard placeholder with navigation links to Questions and Exams.
- [ ] Document local PostgreSQL setup and `.env.example`; keep actual credentials out of the repository.
- [ ] Document how to start each service and confirm the app shell and health endpoint are reachable.

**Manual acceptance:** A new developer can follow README instructions, start the local database, web app, and API, and open the teacher dashboard.

## Task 2: Implement question types, validation, and bank persistence

**Files:**
- Create: `api/internal/questions/types.go`
- Create: `api/internal/questions/validate.go`
- Create: `api/internal/questions/repository.go`
- Create: `api/internal/questions/handler.go`
- Create: `api/internal/media/storage.go`
- Create: `api/migrations/001_exam_question_schema.sql`
- Modify: `api/internal/http/router.go`

**Interfaces:**
- Produces: `Question` with `ID`, `Type`, `Prompt`, `Options`, `AnswerKey`, `Points`, `SubjectID`, `TopicID`, `ClassID`, `Difficulty`, `Tags`, `CreatedBy`, and media IDs.
- Produces: `ValidateQuestion(q Question) error` enforcing the eight approved question types and their required data.
- Produces: repository methods `List(ctx, QuestionFilters)`, `Get(ctx, id)`, `Create(ctx, Question)`, `Update(ctx, id, Question)`, and `Archive(ctx, id)`.
- Consumes: the question and media schemas in `api/openapi.yaml`.

- [ ] Define stable option/item IDs so answer keys remain associated with answer content after display ordering changes.
- [ ] Add migrations for subjects, topics, classes, questions, answer options/items, tags, question-tag links, media references, and creator metadata.
- [ ] Implement validation for single choice, multi-select, true/false statement groups, short answer alternatives, fill-in blanks, essays, matching pairs, and ordering items.
- [ ] Implement case-insensitive and edge-whitespace-insensitive matching for short answers and fill-ins; accept any teacher-entered alternative.
- [ ] Implement combined question bank filters with AND semantics and an explicit `used` filter derived from exam references.
- [ ] Implement image upload validation and local development storage for prompt and option media.
- [ ] Register CRUD/archive endpoints and use consistent JSON validation errors.
- [ ] Keep handler status codes and payloads aligned with `api/openapi.yaml`.

**Manual acceptance:** Create, edit, search, filter, and archive examples of each question type; attach an image to a prompt and an option; confirm the saved answer key is tied to stable option IDs.

## Task 3: Build the teacher question bank and question editor

**Files:**
- Create: `web/app/questions/page.js`
- Create: `web/app/questions/new/page.js`
- Create: `web/app/questions/[id]/page.js`
- Create: `web/components/questions/QuestionEditor.js`
- Create: `web/components/questions/QuestionBankFilters.js`
- Modify: `web/lib/api.js`
- Modify: `web/app/layout.js`

**Interfaces:**
- Consumes: question list/detail/create/update/archive endpoints from Task 2.
- Produces: teacher workflows to author, edit, search, filter, and archive reusable questions.

- [ ] Implement the bank table with keyword search and combined subject, topic, class, type, difficulty, tag, creator, and used filters.
- [ ] Implement the type selector and type-specific form fields for all eight question types.
- [ ] Add image attachment inputs for question prompts and answer options.
- [ ] Provide weight input and validation for each question.
- [ ] Show field-level errors returned by the API and prevent saving invalid question data.
- [ ] Implement question editing and archive confirmation.

**Manual acceptance:** A teacher can create and update one question of every type, find a question using multiple filters, and see validation feedback without losing entered content.

## Task 4: Implement exam settings, composition, random selection, and publishing

**Files:**
- Create: `api/internal/exams/types.go`
- Create: `api/internal/exams/service.go`
- Create: `api/internal/exams/repository.go`
- Create: `api/internal/exams/handler.go`
- Modify: `api/migrations/001_exam_question_schema.sql`
- Modify: `api/internal/http/router.go`

**Interfaces:**
- Produces: `Exam` settings with `Title`, `SubjectID`, `ClassID`, `CheckInStartsAt`, `CheckInEndsAt`, optional `DurationMinutes`, `RepeatCount`, `ScorePolicy`, and status.
- Produces: `QuestionSource` variants for manual bank IDs, random bank filter plus requested count, and inline question payloads.
- Produces: `PublishExam(ctx, examID) error` which validates and snapshots all selected question content, options, answer keys, and weights.
- Produces: score policy enum `highest`, `latest`, or `average`.
- Consumes: exam and composition schemas in `api/openapi.yaml`.

- [ ] Add exams, draft exam items, source selections, and immutable published snapshot columns/tables.
- [ ] Validate schedule order, nonnegative repeat count, positive requested question count, and total question weight greater than zero before publish.
- [ ] Implement manual bank-question selection and random draw from combined filters.
- [ ] Reject a random draw when matching bank questions are fewer than requested, and return the matched/requested counts.
- [ ] Allow a draft to mix manually selected bank questions, random selections, and inline questions.
- [ ] Add an option to persist inline questions into the question bank.
- [ ] On publish, resolve random draws once and create the immutable question snapshots used for every student.
- [ ] Keep published snapshots unchanged when source bank questions are edited or archived.
- [ ] Register exam list, create, detail/update, composition, and publish endpoints.
- [ ] Keep handler status codes and payloads aligned with `api/openapi.yaml`.

**Manual acceptance:** Create and publish exams using each source method and a mixed composition; verify the requested random count, snapshot immutability, schedule validations, repeat count, score policy, and total-points validation.

## Task 5: Build teacher exam management and composition UI

**Files:**
- Create: `web/app/exams/page.js`
- Create: `web/app/exams/new/page.js`
- Create: `web/app/exams/[id]/page.js`
- Create: `web/components/exams/ExamSettingsForm.js`
- Create: `web/components/exams/ExamQuestionComposer.js`
- Modify: `web/lib/api.js`
- Modify: `web/app/page.js`

**Interfaces:**
- Consumes: exam list/detail/create/update/composition/publish endpoints from Task 4 and question bank endpoints from Task 2.
- Produces: teacher workflow to draft, configure, compose, review, and publish an exam.

- [ ] Implement an exam list with draft/published status, class, subject, and check-in date filters.
- [ ] Implement exam settings for title, class, subject, check-in start/end, timer toggle and duration, repeat count, and final-score dropdown.
- [ ] Add question-count input before composition.
- [ ] Implement tabs or sections for manual bank selection, random bank draw, and inline question creation; allow a mixed composition.
- [ ] Add controls to choose whether inline questions are also saved to the bank.
- [ ] Show the selected question count, total points, and point-to-100 conversion in the review view.
- [ ] Add draft preview and publish confirmation; published exams are read-only in this phase.
- [ ] Display useful API errors, including unavailable random draw counts and invalid schedules.

**Manual acceptance:** A teacher can create a draft, set all exam rules, compose it with any combination of sources, inspect total points, publish it, and confirm later bank edits do not alter the published view.

## Task 6: Walk through first-class acceptance scenarios

**Files:**
- Modify: `README.md` with a concise teacher workflow and known phase boundary.

**Interfaces:**
- Consumes: the running web, API, and database environment from Tasks 1-5.
- Produces: a recorded manual acceptance checklist for the first teacher-facing release.

- [ ] Walk through a single-answer exam with selected bank questions and a scheduled timer.
- [ ] Walk through a multi-select exam using random selection, shuffled answer options in preview, and partial numeric weights.
- [ ] Walk through an exam mixing manual bank questions, randomly selected questions, and new inline questions.
- [ ] Walk through image upload failure and insufficient random-bank count; confirm no invalid exam can be published.
- [ ] Confirm that retry count, final score policy, check-in window, and points/100 display persist after reload.
- [ ] Update the README with the exact setup steps and list student attempt screens and reports as later work.

---

## Deferred Student Attempt Phase

The following approved behaviors remain in the design but are not implemented by the first teacher-facing release: student sign-in/role access, attempt creation/check-in, per-student question-order shuffling, option shuffling in the student view, REST answer autosave, reconnection/resume, timer expiry, allowed repeats, automatic result calculation, essay review UI, and result/report screens. They should be planned after the teacher exam and question workflows are accepted. Real-time sockets and Redis remain optional and should be added only if a concrete live-update or scaling need appears.
