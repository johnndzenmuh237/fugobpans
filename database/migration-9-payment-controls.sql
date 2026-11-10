-- =====================================================================
-- Migration 9 — Payment controls & reliability (additive only; nothing dropped or rewritten)
--   1. Payment verification history (who approved/rejected, when) — append-only
--   2. Payment evidence (screenshots) + extra columns for evidence-submitted payments
--   3. Fee installment schedules (templates + per-invoice snapshots)
--   4. Reminder / messaging settings, outbox and reminder log (SMS / WhatsApp)
--   5. One-time codes (tracking-number recovery, optional record-lookup verification)
--   6. Mobile Money reconciliation (statement imports, lines, resolutions)
-- Apply:  npm run upgrade-db      (or: node scripts/apply-migration.js database/migration-9-payment-controls.sql)
-- Safe to run twice.
-- =====================================================================

-- ---------- 2. payments: columns used by evidence-submitted payments ----------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS submitted_by_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_phone VARCHAR(30);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(300);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at);

CREATE TABLE IF NOT EXISTS payment_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  mime VARCHAR(40) NOT NULL,
  size_bytes INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  data BYTEA NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_payment ON payment_evidence(payment_id);
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON payment_evidence(sha256);

-- ---------- 1. Verification history (append-only) ----------
CREATE TABLE IF NOT EXISTS payment_verification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  event VARCHAR(24) NOT NULL CHECK (event IN ('SUBMITTED','VERIFIED','REJECTED','INFO_REQUESTED','RECORDED','GATEWAY_CONFIRMED','FLAGGED')),
  from_status VARCHAR(12),
  to_status VARCHAR(12),
  amount NUMERIC(12,2),
  receipt_number VARCHAR(30),
  actor_id UUID REFERENCES users(id),
  actor_name VARCHAR(150) NOT NULL,   -- snapshot: stays correct even if the person later leaves
  actor_role VARCHAR(30),
  note VARCHAR(500),
  ip VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pvh_payment ON payment_verification_history(payment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pvh_created ON payment_verification_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvh_actor ON payment_verification_history(actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION forbid_history_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment_verification_history is append-only (% not allowed)', TG_OP;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pvh_append_only ON payment_verification_history;
CREATE TRIGGER trg_pvh_append_only BEFORE UPDATE OR DELETE ON payment_verification_history
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();

-- Backfill one entry per payment already in the ledger so history is never blank for old money.
INSERT INTO payment_verification_history (payment_id, event, from_status, to_status, amount, receipt_number, actor_id, actor_name, actor_role, note, created_at)
SELECT p.id, CASE WHEN u.id IS NULL THEN 'GATEWAY_CONFIRMED' ELSE 'RECORDED' END, NULL, 'SUCCESSFUL', p.amount, p.receipt_number,
       u.id, COALESCE(u.name, 'Payment gateway / system'), u.role::text, 'Backfilled from the existing ledger', COALESCE(p.paid_at, p.created_at)
FROM payments p LEFT JOIN users u ON u.id = p.recorded_by
WHERE p.status = 'SUCCESSFUL'
  AND NOT EXISTS (SELECT 1 FROM payment_verification_history h WHERE h.payment_id = p.id);

-- ---------- 3. Installments ----------
-- Template per fee structure (the owner edits this) ...
CREATE TABLE IF NOT EXISTS fee_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id UUID NOT NULL REFERENCES fee_structures(id),
  name VARCHAR(80) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fee_inst_fs ON fee_installments(fee_structure_id, sort_order);
-- ... and a frozen copy on each invoice, so changing the template never rewrites a family's agreement.
CREATE TABLE IF NOT EXISTS invoice_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  name VARCHAR(80) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_inst_invoice ON invoice_installments(invoice_id, sort_order);

-- ---------- 4. Messaging / reminders ----------
-- Credentials (Twilio, WhatsApp Cloud, SMS gateway) live in environment variables, never in this table.
CREATE TABLE IF NOT EXISTS messaging_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  provider VARCHAR(20) NOT NULL DEFAULT 'NONE' CHECK (provider IN ('NONE','TWILIO','WHATSAPP_CLOUD','HTTP_GATEWAY')),
  channel VARCHAR(10) NOT NULL DEFAULT 'SMS' CHECK (channel IN ('SMS','WHATSAPP','BOTH')),
  days_before INT[] NOT NULL DEFAULT '{7,3,1}',
  remind_on_due BOOLEAN NOT NULL DEFAULT true,
  overdue_every_days INT NOT NULL DEFAULT 7 CHECK (overdue_every_days >= 0),
  max_overdue_reminders INT NOT NULL DEFAULT 6 CHECK (max_overdue_reminders >= 0),
  outstanding_every_days INT NOT NULL DEFAULT 0 CHECK (outstanding_every_days >= 0),
  template_upcoming TEXT NOT NULL DEFAULT 'Dear {guardian}, {student}''s school fee instalment of {amount} FCFA is due on {due_date}. Outstanding balance: {balance} FCFA. Thank you. — {school}',
  template_due TEXT NOT NULL DEFAULT 'Dear {guardian}, {student}''s school fee instalment of {amount} FCFA is due TODAY ({due_date}). Outstanding balance: {balance} FCFA. — {school}',
  template_overdue TEXT NOT NULL DEFAULT 'Dear {guardian}, {student}''s school fee instalment of {amount} FCFA was due on {due_date} and is now overdue. Outstanding balance: {balance} FCFA. Please pay or call {phone}. — {school}',
  template_balance TEXT NOT NULL DEFAULT 'Dear {guardian}, {student} has an outstanding school fee balance of {balance} FCFA. Please settle it or call {phone}. — {school}',
  require_otp_for_lookup BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO messaging_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS message_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('REMINDER','OTP','NOTICE')),
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('SMS','WHATSAPP')),
  to_phone VARCHAR(30) NOT NULL,
  student_id UUID REFERENCES students(id),
  invoice_id UUID REFERENCES invoices(id),
  body TEXT NOT NULL,                 -- one-time codes are stored as '[code hidden]'
  status VARCHAR(16) NOT NULL CHECK (status IN ('SENT','FAILED','NOT_CONFIGURED','MANUAL')),
  provider VARCHAR(20),
  provider_message_id VARCHAR(120),
  error VARCHAR(300),
  sent_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON message_outbox(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_student ON message_outbox(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  installment_id UUID REFERENCES invoice_installments(id),
  kind VARCHAR(20) NOT NULL,          -- UPCOMING:7 | DUE | OVERDUE | BALANCE
  sent_on DATE NOT NULL,
  outbox_id UUID REFERENCES message_outbox(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminder_lookup ON reminder_log(invoice_id, installment_id, kind, sent_on DESC);
-- A given reminder can only ever be logged once per day (stops double-sends if the job runs twice).
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_day
  ON reminder_log(invoice_id, COALESCE(installment_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, sent_on);

-- ---------- 5. One-time codes ----------
CREATE TABLE IF NOT EXISTS phone_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose VARCHAR(10) NOT NULL CHECK (purpose IN ('RECOVERY','LOOKUP')),
  phone_norm VARCHAR(12) NOT NULL,    -- last 9 digits of the guardian's number
  student_id UUID REFERENCES students(id),
  code_hash CHAR(64) NOT NULL,        -- HMAC of the code; the code itself is never stored
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otps_phone ON phone_otps(phone_norm, purpose, created_at DESC);

-- ---------- 6. Reconciliation ----------
CREATE TABLE IF NOT EXISTS statement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(12) NOT NULL CHECK (provider IN ('MTN_MOMO','ORANGE_MONEY')),
  filename VARCHAR(200),
  file_sha256 CHAR(64) NOT NULL,
  rows_read INT NOT NULL DEFAULT 0,
  rows_added INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  imported_by UUID REFERENCES users(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, file_sha256)
);
CREATE TABLE IF NOT EXISTS statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES statement_imports(id),
  provider VARCHAR(12) NOT NULL,
  tx_id VARCHAR(80) NOT NULL,
  tx_id_norm VARCHAR(80) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  tx_time TIMESTAMPTZ,
  counterparty VARCHAR(40),
  raw JSONB,
  UNIQUE (provider, tx_id_norm)
);
CREATE INDEX IF NOT EXISTS idx_stmt_time ON statement_lines(provider, tx_time);
CREATE TABLE IF NOT EXISTS reconciliation_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id),
  line_id UUID REFERENCES statement_lines(id),
  outcome VARCHAR(24) NOT NULL CHECK (outcome IN ('MATCHED_MANUALLY','ACCEPTED_DIFFERENCE','INVESTIGATED','WRITTEN_OFF')),
  note VARCHAR(500) NOT NULL,
  resolved_by UUID NOT NULL REFERENCES users(id),
  resolved_by_name VARCHAR(150) NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (payment_id IS NOT NULL OR line_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_recon_res_payment ON reconciliation_resolutions(payment_id);
CREATE INDEX IF NOT EXISTS idx_recon_res_line ON reconciliation_resolutions(line_id);
