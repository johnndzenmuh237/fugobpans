-- =====================================================================
-- Migration 7 — Owner/Director + management hierarchy (additive only)
-- Adds roles, account lifecycle columns, management-post history and
-- secure password-reset tokens. Nothing is dropped or rewritten.
-- Run: node scripts/apply-migration.js database/migration-7-owner-management.sql
-- =====================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PRINCIPAL';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'VICE_PRINCIPAL';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMINISTRATOR';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ACADEMIC_ADMIN';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PARENT';

-- status stays VARCHAR: ACTIVE | SUSPENDED | DEACTIVATED (deactivated = left the school; row is never deleted)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS replaced_by UUID REFERENCES users(id);

-- NOTE: the "only one OWNER" rule is enforced in application code (scripts/create-owner.js and
-- the API never creates an OWNER), because a new enum value cannot be used in the same transaction.

-- Who held which management post, and when (institutional history survives staff changes).
CREATE TABLE IF NOT EXISTS management_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  position VARCHAR(40) NOT NULL,
  job_title VARCHAR(100),
  department_id UUID REFERENCES departments(id),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  end_reason TEXT,
  assigned_by UUID REFERENCES users(id),
  ended_by UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_mgmt_assign_user ON management_assignments(user_id, starts_at DESC);

-- Password reset: only a SHA-256 hash of the token is stored, single use, short expiry.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
