# New Features: Teacher Results Upload & Student Self-Service Portal

Added on top of the original 114-point spec without changing any existing
behavior — purely additive (new role, new table, new routes, new pages).

## 1. Teacher Exam Results Upload

**The problem this solves:** a teacher should never have to type a
student's name to enter a grade — the roster must come from what's
already registered.

**How it works:**
1. Manager assigns a teacher to a class (`class_teacher_id`) and/or to a
   specific subject within a class (`class_subjects` table, via
   **Categories & Classes → Assign Subject Teacher**).
2. That teacher logs in and visits **Upload Results**
   (`/teacher/results.html`). They pick their class, subject, term, and
   session — all derived from their own assignments
   (`GET /api/results/my-classes`, `/my-subjects`) — never a free-text
   student list.
3. The page calls `GET /api/results/sheet`, which returns every ACTIVE
   student in that class already filled in with any existing score
   (`server/services/examResultsService.js#getResultsSheet`). The teacher
   only ever types a **score**, never a name.
4. Saving calls `POST /api/results`, which is a database-level upsert
   (`UNIQUE (student_id, subject_id, term, academic_session_id)`) — so
   correcting a score later just overwrites that one row instead of
   creating a duplicate.
5. `assertTeacherOwnsClassSubject()` runs server-side before every save —
   a teacher cannot enter results for a class/subject they were never
   assigned to, even by guessing IDs.

**Where a teacher sees their own load:** `/teacher/dashboard.html` and
`/teacher/classes.html` show exactly how many classes and how many total
students are assigned to them — computed from the same assignment data,
not typed in anywhere.

## 2. Student Self-Service Portal

**The problem this solves:** a student/guardian should be able to check
registration status, fees, payments, and results without calling or
visiting the office — but the spec's "no public account creation" rule
(§2) still applies, so this can't be a signup form.

**How it works:**
1. A `STUDENT` role was added to the `user_role` enum
   (`database/migration-2-student-portal.sql` for existing databases;
   already included in `schema.sql` for new ones).
2. `users.linked_student_id` links a login to exactly one student record.
3. The Manager (never the public) creates this login from
   **Students → [a student's profile] → Create Student Portal Login**
   (`POST /api/students/:id/login`) — same pattern already used for
   employee logins, so no new account-creation surface is exposed
   publicly.
4. The student logs in at the same shared `/login.html` as everyone else
   and lands on `/student/dashboard.html`, which calls `GET
   /api/students/me` — a route that only ever returns the caller's *own*
   linked record (`req.user.linkedStudentId`), never an arbitrary ID.
5. The dashboard shows three tabs: **Profile** (personal + guardian info
   as entered at registration), **Fees & Payments** (every invoice and
   payment — online or office — exactly as the Manager/Accountant sees
   it), and **Results** (every score a teacher has entered for them).
   Everything is read-only from the student's side.

## Self-service for Teachers and Employees too

The same "see your own record without anyone searching for you" pattern
was extended to Teacher and Employee logins:
- `GET /api/employees/me` returns the caller's own employee record
  (profile, salary history, attendance summary) — used by
  `/teacher/profile.html` and `/employee/profile.html`.
- Both check-in pages (`/teacher/attendance.html`,
  `/employee/attendance.html`) show the logged-in worker's own history,
  not a searchable directory of everyone.

This is deliberately **not** a searchable directory of other people's
data — each login only ever unlocks its own linked record, which is what
keeps this consistent with the role-permission boundaries already defined
in the original spec (§80, §81).

## What did NOT change

- No existing route, table, column, or page was removed or altered.
- The original MANAGER/ACCOUNTANT/TEACHER/EMPLOYEE roles, their
  permissions, and every page built before this addition work exactly as
  they did — `STUDENT` is a fifth, additive role, not a replacement.
- Public registration (`POST /api/registrations`) is untouched — it still
  creates no login. Student logins are always Manager-initiated, exactly
  like employee logins already were.
