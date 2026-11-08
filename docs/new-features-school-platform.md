# School platform upgrade — what was added

**Roles:** OWNER, PRINCIPAL, VICE_PRINCIPAL, ADMINISTRATOR, ACADEMIC_ADMIN, PARENT (added to MANAGER, ACCOUNTANT, TEACHER, EMPLOYEE, STUDENT).

| Area | Where |
|---|---|
| Owner login / dashboard / accounts / records | `/owner/login.html`, `/owner/dashboard.html`, `/owner/management.html`, `/owner/records.html` |
| Password change / reset | `/change-password.html`, `/forgot-password.html`, `/reset-password.html` |
| Result & expense approvals | `/admin/approvals.html` |
| Student attendance | `/teacher/student-attendance.html`, `/admin/student-attendance.html` |
| Timetable & terms | `/admin/timetable.html`, `/teacher/schedule.html` |
| Parents | `/admin/parents.html`, `/parent/dashboard.html` |
| Messages & announcements | `/messages.html` |
| Student promotion / transfer / withdrawal / discipline / history | `/admin/student-profile.html?id=…` |
| Notification bell (counter, sender, department, open record) | every portal page (`layout.js`) |

**Rules enforced on the server (not just hidden in the menu):** only the Owner creates management accounts and there is only ever one Owner; each management account has Owner-set permissions (students, teachers, academics, finance, announcements, reports, registrations); teachers see only their own classes; parents/students see only their own children/self; teacher marks are *submitted* and only become visible after approval; approved marks are locked and every change keeps the old value; every class/session/status change is recorded; deactivating a manager revokes the login but keeps all records and their name on past actions; accountant expenses wait for approval and don't count until approved.

**Database:** run `npm run upgrade-db` (applies migrations 6–8, safe to repeat). Create the Owner once with `npm run create-owner -- "Name" email`.
**Deploying:** see `docs/DEPLOYMENT-render-neon-firebase.md`.
**Tests:** `npm run smoke-test` against a throwaway database (71 checks of the rules above).
