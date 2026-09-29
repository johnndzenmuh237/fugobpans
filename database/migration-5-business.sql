-- =====================================================================
-- Migration 5: Business Management module
-- Expense tracking, budgets, debt/credit management (incl. unpaid staff
-- salaries), sales, and inventory/stock — the pieces needed to turn the
-- existing fee/payroll ledger into a full income-statement / profit &
-- loss view for the Manager and Accountant. Purely additive: no existing
-- table, column, or row is altered destructively. Safe to run against a
-- database that already has schema.sql (+ migrations 2-4) applied.
-- =====================================================================

-- ---- Expense categories (Manager-configurable, never hard-coded) ----
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Starter categories so the Expense Tracker isn't empty on first use —
-- the Manager can rename/deactivate/add more from Settings at any time.
INSERT INTO expense_categories (name) VALUES
  ('Salaries'), ('Utilities'), ('Electricity'), ('Water'), ('Internet'),
  ('School Supplies'), ('Maintenance'), ('Repairs'), ('Transport'),
  ('Marketing'), ('Rent'), ('Equipment'), ('Cleaning'), ('Stock Purchases'), ('Other')
ON CONFLICT (name) DO NOTHING;

-- ---- Expenses ----
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(30) UNIQUE NOT NULL, -- EXP-2026-000001
  category_id UUID NOT NULL REFERENCES expense_categories(id),
  description VARCHAR(300),
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'CASH', -- CASH | MOMO | BANK | OTHER
  vendor VARCHAR(150),
  recorded_by UUID REFERENCES users(id),
  auto_generated BOOLEAN NOT NULL DEFAULT false, -- true for stock-purchase-linked expenses
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- ---- Budgets (per expense category, per month) ----
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES expense_categories(id),
  period VARCHAR(7) NOT NULL, -- '2027-01'
  amount NUMERIC(12,2) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, period)
);

-- ---- Products / inventory ----
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80),
  unit VARCHAR(30) NOT NULL DEFAULT 'unit',
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_on_hand NUMERIC(12,2) NOT NULL DEFAULT 0,
  minimum_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  supplier VARCHAR(150),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  type stock_movement_type NOT NULL,
  quantity NUMERIC(12,2) NOT NULL, -- positive for purchases/adjustments in, negative for sales/adjustments out
  reference VARCHAR(60), -- links back to a sale reference, expense reference, or manual note
  notes VARCHAR(300),
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON stock_movements(product_id, created_at DESC);

-- ---- Sales (cash or credit) ----
DO $$ BEGIN
  CREATE TYPE sale_payment_status AS ENUM ('PAID', 'PARTIALLY_PAID', 'UNPAID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number VARCHAR(30) UNIQUE NOT NULL, -- SALE-2026-000001
  customer_name VARCHAR(150),
  customer_phone VARCHAR(30),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  status sale_payment_status NOT NULL DEFAULT 'UNPAID',
  payment_method VARCHAR(30) NOT NULL DEFAULT 'CASH',
  sold_by UUID REFERENCES users(id),
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(12,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- ---- Debts / credit register (product credit sales + any standalone debt) ----
DO $$ BEGIN
  CREATE TYPE debt_status AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(30) UNIQUE NOT NULL, -- DEBT-2026-000001
  debtor_name VARCHAR(150) NOT NULL,
  debtor_contact VARCHAR(60),
  description VARCHAR(300),
  sale_id UUID REFERENCES sales(id), -- set automatically when created from a credit sale
  total_amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  due_date DATE,
  status debt_status NOT NULL DEFAULT 'UNPAID',
  notes VARCHAR(500),
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);

CREATE TABLE IF NOT EXISTS debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'CASH',
  recorded_by UUID REFERENCES users(id),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id);

-- ---- Payroll: support partial salary payments (spec: PARTIALLY PAID status) ----
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS due_date DATE;
DO $$ BEGIN
  ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
EXCEPTION WHEN duplicate_object THEN null; END $$;
-- Backfill: any item already PAID has amount_paid = its net_salary.
UPDATE payroll_items SET amount_paid = net_salary WHERE status = 'PAID' AND amount_paid = 0;
