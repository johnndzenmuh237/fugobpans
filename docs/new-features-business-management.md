# New Features: Business Management Module (Expenses, Budgets, Debts, Sales, Inventory, Income Statement)

Added on top of the existing ERP without changing any existing behavior —
purely additive (new tables via `database/migration-5-business.sql`, new
service/controller/routes, new admin pages). Existing fee/payment/payroll
flows are untouched.

## Why this was added
The public website and the fee/payment/payroll system already matched the
school flyer closely. What was still missing was the *business side* the
school owner needs to actually run the place day to day: where money goes
(expenses), whether spending is on track (budgets), who still owes the
school or a supplier (debts, including unpaid staff salaries), what's been
sold (sales), what's in stock (inventory), and a real profit/loss view
(income statement) — all computed from the ledger, never hard-coded.

## 1. Expense Tracker
- `expense_categories` (Manager-configurable — 15 starter categories
  pre-seeded: Salaries, Utilities, Electricity, Water, Internet, School
  Supplies, Maintenance, Repairs, Transport, Marketing, Rent, Equipment,
  Cleaning, Stock Purchases, Other).
- `expenses` — reference (`EXP-2026-000001`), category, amount, date,
  payment method, vendor, notes.
- Manager or Accountant: **Business Management → Expenses**
  (`/admin/expenses.html`).

## 2. Budgets
- One budget per category per month (`budgets`, unique on
  `category_id + period`).
- **Business Management → Budgets** shows spent vs. budget, % used, and
  flags "Over Budget" / "Near Limit" live from real expense totals.
- Manager-only (Accountant can view expenses/sales/debts but budget
  targets are a Manager decision).

## 3. Debts & Credit Management (incl. unpaid staff salaries)
- `debts` / `debt_payments` — a generic debtor register. A debt can be
  entered manually (e.g. a supplier owes the school, or a parent/customer
  owes for something outside school fees) or created **automatically**
  from an unpaid/partially-paid credit sale (see Sales, below).
- Partial payments are supported; once `amount_paid >= total_amount` the
  status flips to `PAID` and it disappears from the *outstanding* list but
  stays in `debt_payments` history (spec requirement: never lose the
  record, just stop counting it as outstanding).
- **Unpaid staff salaries** are shown on the same page, pulled live from
  `payroll_items` where `status != 'PAID'` — no separate table needed,
  since payroll already tracks this. `payroll_items` gained `amount_paid`
  and a `PARTIALLY_PAID` status so a salary can be paid in installments
  just like a customer debt.
- **Business Management → Debts & Salaries** (`/admin/debts.html`).

## 4. Sales Tracking + Inventory/Stock
- `products` — name, category, unit, purchase/selling price, quantity on
  hand, minimum stock (for low-stock warnings).
- `stock_movements` — every purchase, sale, or manual adjustment is
  logged against a product (immutable history, like the audit log).
- Recording a **stock purchase** (`POST /api/business/products/:id/purchase`)
  increases `quantity_on_hand` *and* automatically books a matching
  expense under "Stock Purchases" — so it flows straight into the income
  statement without double entry.
- Recording a **sale** (`POST /api/business/sales`) decrements stock for
  every line item and, if the customer pays less than the total, **automatically
  creates a Debt** for the shortfall (never counted as collected cash —
  spec §25). Sales and inventory live at **Business Management → Sales**
  and **→ Inventory**.

## 5. Income Statement & Reports
- `GET /api/business/income-statement?from=&to=` — the core calculation:
  - **Income** = successful school-fee payments + cash actually collected
    from sales + debt collections in the period.
  - **Expenses** = every booked expense (grouped by category) + salaries
    actually paid in the period.
  - **Net Profit/Loss** = Income − Expenses.
- `GET /api/business/reports/monthly?period=YYYY-MM`,
  `/reports/yearly?year=YYYY` (with a month-by-month breakdown), and
  `/reports/custom?from=&to=` all reuse the same calculation for the
  period requested.
- **Business Management → Income Statement** (`/admin/income-statement.html`)
  gives the Manager/Accountant a quick-range picker (Today / This Week /
  This Month / Previous Month / This Year / Previous Year / Custom Range)
  plus a full year-by-month table.
- The Manager **Overview** dashboard (`/admin/dashboard.html`) now also
  shows: today's and this month's income/expenses/profit-loss, outstanding
  debts, outstanding salaries, total sales, stock value, and low-stock
  item count — every figure a live query (`dashboardService.businessSummary()`),
  nothing cached or invented.

## Roles
- **Manager**: full access to everything above, including category and
  budget configuration.
- **Accountant**: can record expenses, sales, stock purchases, and debt/
  salary payments, and can view the income statement and reports — but
  cannot configure expense categories or set budgets (Manager-only).

## Applying this to an existing database
This is additive — nothing existing is dropped or altered destructively.
Run once against your database:

```bash
node scripts/apply-migration.js database/migration-5-business.sql
```

(A brand-new database created from `database/schema.sql` already includes
all of this — no separate migration needed.)
