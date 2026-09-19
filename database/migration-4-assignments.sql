-- =====================================================================
-- Migration 4: Class assignments
-- A teacher assigned to a class (class_teacher_id) or to a specific
-- subject in that class (class_subjects.teacher_id) can post an
-- assignment. Students see only assignments for their own class.
-- Purely additive.
-- =====================================================================

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID REFERENCES subjects(id), -- optional: some assignments aren't subject-specific
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  title VARCHAR(200) NOT NULL,
  description VARCHAR(2000),
  due_date DATE,
  created_by UUID REFERENCES users(id), -- the teacher's login id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assignments_class ON assignments(class_id, due_date);
