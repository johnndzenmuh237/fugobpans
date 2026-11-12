# FUGOBPAN — Property, Landlord & Tenant Management System

Converted from the old school ERP. Keeps the proven foundation (login, audit log, notifications, manual Mobile Money confirmation, expenses, budgets, debts, reviews) and replaces the school domain with property management.

**What is in it** — properties, **lands**, completed & **uncompleted** buildings (with % complete) · houses/units · admin-managed categories · landlords/owners · tenants with live months paid/owing/advance · contracts & renewals · versioned Terms & Conditions with recorded acceptance · digital receipts (HTML + PDF, WhatsApp/email share) · pending-payment confirmation · rent reminders · maintenance + workers (costs flow into expenses) · expenses, budgets, **debt tracking**, **financial records / income statement** · **explainable AI analytics** · 9 exportable reports (CSV/Excel, print-to-PDF) · global search · notification centre · audit log · role/permission manager · **public real-estate website with enquiries** · **tenant dashboard with announcements per house category / property**.

See `docs/deployment.md` to run it. Staff pages live in `public/admin/`, one JS module each in `public/assets/js/pages/`; backend in `server/` (`services/` hold the business logic).

**Honest limits** — "AI analytics" is rule-based (every insight states its numbers); it does not call an LLM. WhatsApp reminders open a pre-written chat (no automatic SMS/WhatsApp/email sending yet). Photos are URLs, not uploads. Reports export CSV (opens in Excel) and print to PDF.


## Installing the app, messaging, notifications and phone push (added)

**Install (PWA).** One service worker (`public/sw.js`) + `manifest.webmanifest` serve every page. Chrome/Edge/Samsung show *Install app*; on iPhone use Share → Add to Home Screen. The *Install app* button explains the exact reason if a phone cannot install (in-app browser, already installed, no service worker...). Opening the installed app lands on the person's own dashboard if they are still signed in.

**Conversations** (`/communication.html`, API `/api/conversations`): Staff ↔ Management (any Owner / Manager / management post holding the *teachers* permission can answer) and Manager ↔ Owner (visible only to that manager and the Owner). Per-person unread markers, replies create bell notifications and phone pushes.

**Notifications.** Management with the *announcements* permission can send to one person or a group from *Notifications → Send notification*. History: `/notifications.html`.

**Phone push needs server keys.** Run `npm run vapid`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` on Render and redeploy. Without them everything works except background push (the Settings dialog says so). Limits: iPhone needs iOS 16.4+ **and** the app added to the Home Screen; the browser/phone must allow notifications; some Android makers' battery savers delay pushes.

**Salary.** Required when registering a worker; edit via Payroll → salary (history is kept). Visible to the worker themself, and to Owner/Manager/posts with *teachers* or *finance* permission only.

`npm run e2e` runs the API test suite against a throwaway database (see header of `scripts/e2e-communication.js`).
