-- =====================================================================
-- Migration 9 — Conversations (staff<->management, manager<->owner), web push, notification preferences.
-- Additive only: nothing is dropped or rewritten. Safe to re-run (IF NOT EXISTS everywhere).
-- Applied automatically by `npm run upgrade-db` (runs on every Render deploy).
-- =====================================================================

-- One thread per (channel, participant). STAFF_MANAGEMENT: participant = the staff member; any authorised
-- manager can read/reply. MANAGER_OWNER: participant = the manager; only that manager and the Owner can see it.
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('STAFF_MANAGEMENT','MANAGER_OWNER')),
  participant_id UUID NOT NULL REFERENCES users(id),
  subject VARCHAR(150) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'MESSAGE' CHECK (category IN ('MESSAGE','REQUEST','QUESTION','COMPLAINT')),
  status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_participant ON conversations(participant_id, channel, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_channel ON conversations(channel, last_message_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  sender_name VARCHAR(150) NOT NULL,
  sender_role VARCHAR(30) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_convmsg_conv ON conversation_messages(conversation_id, created_at);

-- Per-person read marker (each manager has their own, so one manager reading does not hide it from another).
CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Web Push: one row per browser/device. Endpoint is unique; expired ones (HTTP 404/410) are deleted on send.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(300),
  failures INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,   -- master switch for background push to this person
  push_messages BOOLEAN NOT NULL DEFAULT true,  -- replies / new conversation messages
  push_updates BOOLEAN NOT NULL DEFAULT true,   -- everything else (announcements from management, system alerts)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
