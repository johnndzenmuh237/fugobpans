-- =====================================================================
-- Migration 2: Student portal + Teacher exam results
-- Purely additive — no existing table, column, or row is altered or
-- dropped. Safe to run against a database that already has schema.sql
-- applied. For a BRAND NEW database, schema.sql already includes all of
-- this (see the updated CREATE TYPE user_role line there), so you only
-- need this file if your database was created before this migration.
-- =====================================================================

-- Add STUDENT as a valid login role, alongside MANAGER/ACCOUNTANT/TEACHER/EMPLOYEE.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'STUDENT';

-- A login can now optionally be linked to a student record (Manager-created only —
-- there is still no public account creation; see docs on this).
ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_student_id UUID REFERENCES students(id);

-- Which teacher teaches which subject in which class (needed so a teacher's
-- results-entry page only ever shows classes/subjects actually assigned to them).
-- class_subjects already exists in schema.sql with a teacher_id column — this
-- migration just adds an index for the lookup pattern the new page uses.
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON class_subjects(teacher_id);

-- Exam results — one row per student, per subject, per term, per session.
-- UNIQUE constraint means re-saving a result UPDATEs it instead of creating
-- a duplicate row, so a teacher can correct an entry without any special UI.
CREATE TABLE IF NOT EXISTS exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  term VARCHAR(40) NOT NULL, -- e.g. 'Sequence 1', 'Term 1' — school-defined, not hard-coded
  score NUMERIC(5,2) NOT NULL, -- out of whatever max the school uses (e.g. /20)
  max_score NUMERIC(5,2) NOT NULL DEFAULT 20,
  remarks VARCHAR(300),
  entered_by UUID REFERENCES users(id), -- the teacher who entered/last edited it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, term, academic_session_id)
);
CREATE INDEX IF NOT EXISTS idx_results_class ON exam_results(class_id, term);
CREATE INDEX IF NOT EXISTS idx_results_student ON exam_results(student_id);
