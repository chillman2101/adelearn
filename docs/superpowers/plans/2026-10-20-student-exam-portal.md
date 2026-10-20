# Portal Siswa dan Pengerjaan Ujian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an authenticated student portal for exam-specific credentials, single-device sessions, and exam attempts.

**Architecture:** Go owns credential verification, opaque session validation, attempt state, answer persistence, and scoring. Next.js uses HttpOnly cookies and same-origin route handlers as a browser-facing proxy; `proxy.js` checks active student sessions before rendering protected pages. Student and teacher shells share design tokens but show separate navigation.

**Tech Stack:** Go 1.x, PostgreSQL, `database/sql`, Next.js 16 App Router JavaScript, React 19, PostgreSQL migrations, OpenAPI 3.1.

**Spec:** `docs/superpowers/specs/2026-10-20-student-exam-portal-design.md`

## Global Constraints

- Each generated five-character credential is scoped to one exam.
- A newer login replaces the active session for that credential.
- Session tokens are opaque, stored hashed in PostgreSQL, and held by the browser only in an HttpOnly cookie.
- Every student API endpoint checks the current active session and exam scope.
- Published exam snapshots are authoritative and answer keys must not reach the student browser.
- Follow existing REST error shapes and UI components; preserve teacher workflows.
- Do not commit or push.
- Automated tests are not included unless requested; verify with builds and code review.

## Review Focus

- **Login is replayed from another device:** the first token must fail API and page session checks after the second login.
- **A session is revoked by regenerating credentials:** subsequent checks must fail and protected pages redirect to login.
- **A student requests another exam or an answer key:** API scope must reject cross-exam access and strip all key fields.
- **A student refreshes or disconnects during an attempt:** the same in-progress attempt and timer must resume without duplicating attempts.
- **Two devices start concurrently:** locking/uniqueness must permit only one active attempt and one active login session.
- **Timer expiry races with autosave or submit:** the attempt must end once and ignore later answer writes.

## File Structure

### API

- Create `api/migrations/007_student_sessions.sql` — active session token hash and expiry on exam access rows.
- Create `api/migrations/008_teacher_accounts.sql` — teacher username, password hash, and persisted teacher sessions.
- Create `api/migrations/009_student_attempts.sql` — attempts, per-attempt question order, and persisted answers.
- Create `api/internal/exams/student.go` — session login/current/logout, student exam projection, attempt lifecycle, answer persistence, and score calculation.
- Create `api/internal/teachers/auth.go` — seeded teacher login, session validation, logout, and password change.
- Modify `api/internal/exams/types.go` — session, student-safe exam, attempt, and answer response types.
- Modify `api/internal/http/router.go` — role-specific auth middleware, teacher endpoints, student endpoints, and stable error mapping.
- Modify `api/openapi.yaml` — document student auth and attempt contracts.

### Web

- Create `web/app/proxy.js` — protect `/student/*` pages and redirect based on active session validation.
- Create `web/app/proxy.js` — protect teacher/student routes and redirect based on active session validation.
- Create `web/app/api/auth/login/route.js` — call role-specific Go login and set HttpOnly cookie.
- Create `web/app/api/auth/setup/route.js` — bootstrap the first teacher account and set its session cookie.
- Create `web/app/api/auth/logout/route.js` — revoke and clear the cookie.
- Create `web/app/api/auth/session/route.js` — expose safe session profile to the app.
- Create `web/app/api/proxy/[...path]/route.js` — same-origin authenticated proxy for existing and student APIs.
- Create `web/components/AppFrame.js` — render distinct student, teacher, and login shells using pathname.
- Create `web/components/student/StudentWorkspace.js` — student navigation and identity display.
- Create `web/app/login/page.js` — role selector and login form.
- Create `web/app/setup/page.js` — one-time first-teacher account setup.
- Create `web/app/student/page.js` — exam overview, confirmation, and current attempt entry.
- Create `web/app/student/settings/page.js` — read-only profile/context and logout.
- Modify `web/app/settings/page.js` — teacher username display and change-password form.
- Create `web/app/student/attempt/[id]/page.js` — resumable question flow, navigation, autosave, timer, and submit confirmation.
- Create `web/components/student/StudentExamRunner.js` — question-type input renderers and saved-answer status.
- Modify `web/app/layout.js` — use `AppFrame` and preserve existing teacher settings context.
- Modify `web/lib/api.js` — student same-origin API functions.
- Modify `web/app/globals.css` — responsive student-shell, login, exam, dialog, and attempt styles.

## Implementation Tasks

### Task 1: Teacher and student session models and authentication API

- Add migrations for student session hash and expiry, teacher username/password hash, and teacher sessions.
- Implement teacher first-account bootstrap, login, password change, logout, and session validation. Implement student login, opaque random token generation, hashed persistence, session validation, logout, and invalidation on access regeneration.
- Require active teacher authentication for all existing management routes, with safe setup/login/session exceptions.
- Register endpoints and define response/error contract in OpenAPI.
- Build the API and inspect SQL/session invalidation paths.

### Task 2: Exam-safe projection and attempt persistence

- Add attempt schema with per-student/exam attempt number, status, start/end time, answers, score, and stable per-attempt question ordering.
- Implement authenticated student exam projection and attempt start/resume, answer save, submit, and timer-expiry behavior.
- Enforce schedule, repeat count, exam status, and exam/student ownership in SQL-backed service methods.
- Implement objective scoring for all existing question data shapes; leave essay points pending manual grading.
- Ensure student responses remove `correct`, `accepted_answers`, `rubric`, and other answer-key fields recursively.
- Build the API and review query transaction boundaries and response sanitization.

### Task 3: Same-origin cookie/session boundary

- Add role-aware login/setup/logout/session route handlers that set, validate, and clear the HttpOnly cookie.
- Add authenticated backend proxy route for existing teacher APIs and student attempt/exam APIs.
- Add `proxy.js` session checks for both role route guards and role redirects.
- Build the web app and inspect redirect behavior for login, active, and stale sessions.

### Task 4: Student shell and portal pages

- Refactor root shell into separate teacher/student/login presentations without changing teacher menus.
- Add login, Ujian overview, and read-only Pengaturan pages.
- Add a custom start confirmation modal describing timer persistence and non-cancelable attempts.
- Add logout and responsive behavior.
- Add one-time teacher setup, role-selecting login, and the teacher settings password-change form.
- Build the web app and inspect affected teacher routes remain rendered.

### Task 5: Exam runner and recovery

- Add rendering/input for all eight question types using safe exam payloads.
- Add question navigation, autosave, saved status, timer, resume, and final-submit confirmation.
- Add server-side auto-expiration and prevent writes after attempt completion.
- Build both apps and review the complete student flow against the spec.
