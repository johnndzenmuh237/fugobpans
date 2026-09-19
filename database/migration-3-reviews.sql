-- =====================================================================
-- Migration 3: Real customer review/testimonial system
-- Purely additive. Reviews are NEVER shown publicly until a Manager
-- approves them — there is no auto-publish path anywhere in the code.
-- =====================================================================

CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150), -- optional, never displayed publicly
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(1000) NOT NULL,
  photo_url VARCHAR(300), -- optional
  status review_status NOT NULL DEFAULT 'PENDING',
  featured BOOLEAN NOT NULL DEFAULT false,
  moderated_by UUID REFERENCES users(id),
  moderated_at TIMESTAMPTZ,
  submitted_ip VARCHAR(60), -- for spam/abuse review only, never displayed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_status ON reviews(status, created_at DESC);
