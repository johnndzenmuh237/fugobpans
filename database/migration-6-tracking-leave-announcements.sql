-- =====================================================================
-- Migration 6: Tracking-code self-service, manual Mobile Money payments,
-- leave request workflow, parent announcements, student behavior notes.
-- Purely additive — no existing table, column, or row is removed.
-- Safe to run against a database that already has migrations 2-5 applied.
-- =====================================================================

-- ---- Tracking codes (self-service lookup without needing a login) ----
-- A short random code, not sequential/guessable, given to every student
-- at registration and every employee/teacher/worker at hiring. Anyone can
-- look up ONLY their own record with it — never a list of everyone else's.
ALTER TABLE students ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(12) UNIQUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(12) UNIQUE;

-- ---- Leave / permission requests (employee_leave already existed but had ----
-- ---- no approve/decline workflow — this adds one without touching what's there) ----
DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE employee_leave ADD COLUMN IF NOT EXISTS status leave_status NOT NULL DEFAULT 'PENDING';
ALTER TABLE employee_leave ADD COLUMN IF NOT EXISTS leave_type VARCHAR(40) NOT NULL DEFAULT 'OTHER';
ALTER TABLE employee_leave ADD COLUMN IF NOT EXISTS decision_note VARCHAR(300);
ALTER TABLE employee_leave ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id);
ALTER TABLE employee_leave ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE employee_leave ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_leave_employee ON employee_leave(employee_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_status ON employee_leave(status);

-- ---- Parent / general announcements board ----
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(20) NOT NULL DEFAULT 'ALL', -- ALL | PARENTS | STAFF
  pinned BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | ARCHIVED
  posted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status, pinned DESC, created_at DESC);

-- ---- Student behavior / complaint / commendation notes from teachers ----
CREATE TABLE IF NOT EXISTS student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  type VARCHAR(20) NOT NULL DEFAULT 'GENERAL', -- BEHAVIOR | COMPLAINT | COMMENDATION | GENERAL
  note VARCHAR(500) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_notes(student_id, created_at DESC);

-- ---- School's own receiving numbers for manual Mobile Money payments ----
-- (payments table / payment_status already had 'PENDING', so no change
-- needed there — a manually submitted payment is simply inserted as
-- PENDING and later flipped to SUCCESSFUL/FAILED by the Manager.)
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS momo_mtn_number VARCHAR(30);
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS momo_mtn_name VARCHAR(100);
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS momo_orange_number VARCHAR(30);
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS momo_orange_name VARCHAR(100);
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS support_call_number VARCHAR(30);
