# Payment controls & reliability upgrade

Run `npm run upgrade-db` (applies **migration 9**, additive, safe to repeat). Nothing existing is dropped or renamed.

| # | Feature | Where | How it works |
|---|---|---|---|
| 1 | **Verification history** | `/admin/pending-payments.html` (queue) · `/admin/payment-history.html` (all decisions) | Every submit / verify / reject / "more info" / staff-recorded / gateway-confirmed payment writes a row with **name, role, date-time and IP**. The table is append-only (a database trigger refuses UPDATE and DELETE). Old payments were back-filled once. |
| 2 | **Payment reminders** | `/admin/fee-reminders.html` · `npm run send-reminders` (Render cron included) | Before due date (default 7/3/1 days), on it, repeated when overdue, or a plain balance nudge for invoices without a schedule. Part-payments chase only the unpaid remainder; paying ahead silences later reminders. Never sent twice in a day. SMS / WhatsApp through Twilio, WhatsApp Cloud API or a generic SMS gateway. Without a provider nothing is claimed as sent — the page shows who is due with Call / WhatsApp buttons and a "Mark as sent" log. |
| 3 | **Tracking-number recovery** | `/recover-tracking.html` (linked from the student page) | Phone number → 6-digit code by SMS/WhatsApp → tracking number(s). Same reply whether or not the number is registered; code stored only as a hash, 10-minute life, single use, 5 tries, 3 codes/phone/hour, per-IP limits, audit-logged. Optional: switch on the same code check before a record is shown on the public student page. |
| 4 | **Reconciliation** | `/admin/reconciliation.html` | Import the CSV statement from the MTN MoMo / Orange Money merchant portal; compares by transaction ID and amount. Reports matched, amount differs, money received but not recorded, recorded but missing from statement, proven-but-awaiting-verification. Each difference can be resolved with a permanent note. Verifiers also see "found in statement" next to a pending payment. |
| 5 | **Granular manager permissions** | Owner → Principals & Administrators → *Detailed powers* | Register students · verify/reject payments · record payments & issue receipts · create/change fees & instalments · view financial reports · manage reminders · reconcile. Enforced on the server for every request; menus only hide links. Existing accounts keep exactly the access they had until the Owner changes it. An explicit untick wins, even for the legacy MANAGER role. |

## The payment rule (unchanged in spirit, now enforced end to end)
A screenshot and a transaction ID **never** credit a student. A public submission (`/api/public-payments/submit`, on the student page) creates a **PENDING** payment; only a person holding *approve_payments* can verify it, in one locked transaction that also issues the receipt and writes the history row. The verifier may correct the amount to what actually arrived; the correction is recorded.

## Things you must do / know
* **Messaging credentials** go in server environment variables (see `.env.example`). The Owner picks the provider in *Fee Reminders → Settings*; the page shows which variables are still missing. WhatsApp Cloud API needs a Meta-approved template.
* **Instalment schedules** are set per fee in *Fee Reminders → Instalment schedules* (must add up to the fee). New invoices get a frozen copy; use "Apply to students who have no schedule" for existing ones.
* **Reconciliation is by statement import.** MTN and Orange do not offer schools a lookup API without a merchant agreement; if you obtain one, write its lines into `statement_lines` and the same report works.
* Staff recording an MTN/Orange payment must now enter the **real transaction ID** (cash is unaffected), otherwise it can't be reconciled.
* Fixed along the way: new student registrations were not being given a **tracking code** (run `node scripts/backfill-tracking-codes.js` once for students registered earlier); oversized uploads now return a clear message instead of an error.
* Tests: `npm test` (40 checks: phone/CSV/statement parsing, reminder scheduling, permission matrix, screenshot validation, route wiring, verify/reject logic). Run `npm run smoke-test` against a test database for the end-to-end checks.
