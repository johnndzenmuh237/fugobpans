# FUGOBPAN — Property, Landlord & Tenant Management System

Converted from the old school ERP. Keeps the proven foundation (login, audit log, notifications, manual Mobile Money confirmation, expenses, budgets, debts, reviews) and replaces the school domain with property management.

**What is in it** — properties, **lands**, completed & **uncompleted** buildings (with % complete) · houses/units · admin-managed categories · landlords/owners · tenants with live months paid/owing/advance · contracts & renewals · versioned Terms & Conditions with recorded acceptance · digital receipts (HTML + PDF, WhatsApp/email share) · pending-payment confirmation · rent reminders · maintenance + workers (costs flow into expenses) · expenses, budgets, **debt tracking**, **financial records / income statement** · **explainable AI analytics** · 9 exportable reports (CSV/Excel, print-to-PDF) · global search · notification centre · audit log · role/permission manager · **public real-estate website with enquiries** · **tenant dashboard with announcements per house category / property**.

See `docs/deployment.md` to run it. Staff pages live in `public/admin/`, one JS module each in `public/assets/js/pages/`; backend in `server/` (`services/` hold the business logic).

**Honest limits** — "AI analytics" is rule-based (every insight states its numbers); it does not call an LLM. WhatsApp reminders open a pre-written chat (no automatic SMS/WhatsApp/email sending yet). Photos are URLs, not uploads. Reports export CSV (opens in Excel) and print to PDF.


**Payment controls (migration 9)** — verification history, SMS/WhatsApp fee reminders, tracking-number recovery, MoMo/Orange reconciliation and granular manager permissions: see `docs/new-features-payment-controls.md`.
