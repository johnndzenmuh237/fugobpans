# New Features: Tracking Codes, Manual MoMo Payments, Leave Requests, Announcements, Student Notes

Additive on top of everything already built (public website, fees/payments,
payroll, Business Management module). Nothing existing was removed; one
existing query (the absence sweep) was adjusted — see "What changed in
existing code" below.

## 1. Tracking codes (self-service, no login needed)
Every new student (at registration) and every new employee/teacher/worker
(when hired) now gets a random, non-sequential tracking code (e.g.
`7K4M9P2QR`) — see `server/utils/trackingCode.js`. It's shown prominently
on the registration success screen and should be given to every employee
when they're hired.

- **Parents/students**: `/track-student.html` → enter the code → see fee
  status (total/paid/balance, whether it's fully paid), exam results, and
  teacher notes. Nothing else is ever reachable — the code is the only key.
- **Teachers/workers/employees**: `/track-staff.html` → enter the code →
  see salary history, this month's attendance, and leave request history
  with the Manager's decision note.
- Both lookups are public (`/api/lookup/student/:code`,
  `/api/lookup/employee/:code`) and rate-limited (30 requests / 15 min per
  IP) to slow down brute-force guessing.
- **Existing students/employees** (created before this feature) won't have
  a code yet — run this once:
  ```bash
  node scripts/backfill-tracking-codes.js
  ```

## 2. Manual MTN/Orange Mobile Money payment
Alongside the existing Campay-powered "Pay via Prompt" flow, there's now a
manual path: the guardian sends money directly to the school's own MTN/
Orange number (set in Settings → `momoMtnNumber`/`momoOrangeNumber`, etc.)
and submits the transaction ID themselves.

- `POST /api/payments/manual` (public) — inserts a `PENDING` row in the
  existing `payments` table. The same `transaction_reference` uniqueness
  constraint that protects Campay payments protects this too — the same ID
  can never be submitted twice.
- **Manager/Accountant → Pending Payments** (`/admin/pending-payments.html`)
  — see every submission with the transaction ID, confirm (credits the
  invoice exactly like any other payment, invoice status recalculated
  automatically) or reject (with a reason) it.
- The registration success screen's "Pay Manually" button walks the
  guardian through this, including a note on where to find the
  transaction ID in their payment confirmation SMS, and a support phone
  number to call if confirmation is delayed.

## 3. Leave / permission requests
`employee_leave` already existed but had no approve/decline workflow —
this adds one (`leave_status` enum: PENDING/APPROVED/DECLINED).

- **Teacher/Employee → My Leave** (`/teacher/my-leave.html`,
  `/employee/my-leave.html`) — submit a request, see status and the
  Manager's note once decided.
- **Manager → Leave Requests** (`/admin/leave-requests.html`) — approve or
  decline, optionally with a note the employee will see.
- Also visible read-only via the staff tracking-code lookup.

### What changed in existing code
The daily absence-sweep query in `attendanceService.js` used to treat ANY
row in `employee_leave` as approved leave. Now that leave has a real
request/decision workflow, it was updated to only exempt someone from
being marked absent once their leave is `status = 'APPROVED'` — otherwise
a still-pending (or declined) request would have wrongly covered for an
absence. No existing leave rows were affected (the table had no UI to
create rows before this feature, so it was empty in practice).

## 4. Parent / general announcements
- **Public, no login**: `/announcements.html` — reads
  `GET /api/announcements/public`.
- **Manager → Announcements** (`/admin/announcements.html`) — post (with
  audience: Everyone/Parents/Staff, and optional pin-to-top), archive, or
  re-activate.

## 5. Student behavior / complaint / commendation notes
- **Teacher → Student Notes** (`/teacher/student-notes.html`) — pick one of
  your assigned students, add a note (Behavior/Complaint/Commendation/
  General).
- Visible to the parent via the student tracking-code lookup, and to staff
  via `GET /api/notes/student/:studentId`.

## Applying this to an existing database
```bash
node scripts/apply-migration.js database/migration-6-tracking-leave-announcements.sql
node scripts/backfill-tracking-codes.js
```
(A brand-new database created from `schema.sql` already includes
everything — no separate migration needed, and nothing to backfill.)

## 6. Staff-side registration (walk-in/physical registrations)
The Manager/Accountant portal now has **New Registration**
(`/admin/new-registration.html`) — the exact same form families use on the
public site, submitting to a staff-only endpoint
(`POST /api/registrations/staff`) instead of the public one, so office use
all day isn't limited by the public anti-spam rate limiter. Functionally
identical to the public flow (same validation, same tracking code
generation, same invoice creation) — just tagged in the audit log as
`STAFF_RECORD_REGISTRATION` so it's clear who entered it. Also linked from
the **Registrations** list page.

## 7. Student Dashboard (announcements + tracking code, one page)
`/track-student.html` is now framed as the **Student Dashboard**: general
school announcements (from the same board Managers post to) show at the
top for everyone, and the tracking-code box below loads that one
student's own fees/results/notes — all on the same page, no login. Linked
from the main site nav and the footer as "Student Dashboard".

## Settings to fill in
Under **Settings**, the Manager should fill in: `momoMtnNumber`,
`momoMtnName`, `momoOrangeNumber`, `momoOrangeName`, and
`supportCallNumber` — these power the manual payment screen and the
"call us if confirmation is delayed" message.
