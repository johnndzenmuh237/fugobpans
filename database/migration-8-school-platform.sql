-- =====================================================================
-- Migration 8 — School platform upgrade (additive only; nothing dropped)
-- Safe to run on Neon. Run AFTER migration-7:
--   node scripts/apply-migration.js database/migration-8-school-platform.sql
-- =====================================================================

ALTER TYPE student_status ADD VALUE IF NOT EXISTS 'TRANSFERRED';

-- ---- Notifications: sender/department/record link + PER-USER read state ----
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_user_id UUID REFERENCES users(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_name VARCHAR(150);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_role VARCHAR(30);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS department VARCHAR(60);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity VARCHAR(40);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id UUID;
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(to_user_id, created_at DESC);
-- Role-wide notifications used one shared "read" flag; this gives every person their own.
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

-- ---- Parents ----
CREATE TABLE IF NOT EXISTS parent_students (
  parent_user_id UUID NOT NULL REFERENCES users(id),
  student_id UUID NOT NULL REFERENCES students(id),
  relationship VARCHAR(40),
  linked_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_user_id, student_id)
);

-- ---- Messaging (direct, between real accounts) ----
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id),
  sender_name VARCHAR(150) NOT NULL,
  sender_role VARCHAR(30) NOT NULL,
  recipient_id UUID NOT NULL REFERENCES users(id),
  subject VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  student_id UUID REFERENCES students(id),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_recipient ON messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender_id, created_at DESC);

-- ---- Student attendance (previously only staff attendance existed) ----
CREATE TABLE IF NOT EXISTS student_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  attendance_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  note VARCHAR(200),
  marked_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_stu_att_class_date ON student_attendance(class_id, attendance_date);

-- ---- Results: approval workflow + permanent revision history ----
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'APPROVED'; -- rows that already exist stay visible
ALTER TABLE exam_results ALTER COLUMN status SET DEFAULT 'SUBMITTED';                              -- new teacher entries need review
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS review_note VARCHAR(300);

CREATE TABLE IF NOT EXISTS exam_result_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL,
  student_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  academic_session_id UUID NOT NULL,
  term VARCHAR(40) NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) NOT NULL,
  remarks VARCHAR(300),
  status VARCHAR(12),
  entered_by UUID,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_result_rev_student ON exam_result_revisions(student_id, archived_at DESC);

-- Whenever a mark changes, the previous value is kept forever (cannot be bypassed by app code).
CREATE OR REPLACE FUNCTION log_result_revision() RETURNS trigger AS $$
BEGIN
  IF OLD.score IS DISTINCT FROM NEW.score OR OLD.max_score IS DISTINCT FROM NEW.max_score OR OLD.remarks IS DISTINCT FROM NEW.remarks THEN
    INSERT INTO exam_result_revisions (result_id, student_id, subject_id, academic_session_id, term, score, max_score, remarks, status, entered_by)
    VALUES (OLD.id, OLD.student_id, OLD.subject_id, OLD.academic_session_id, OLD.term, OLD.score, OLD.max_score, OLD.remarks, OLD.status, OLD.entered_by);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_result_revision ON exam_results;
CREATE TRIGGER trg_result_revision BEFORE UPDATE ON exam_results FOR EACH ROW EXECUTE FUNCTION log_result_revision();

-- ---- Student history: every class/session/status change is recorded, never overwritten ----
CREATE TABLE IF NOT EXISTS student_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  event_type VARCHAR(24) NOT NULL,
  from_class_id UUID REFERENCES classes(id),
  to_class_id UUID REFERENCES classes(id),
  from_session_id UUID REFERENCES academic_sessions(id),
  to_session_id UUID REFERENCES academic_sessions(id),
  from_status VARCHAR(20),
  to_status VARCHAR(20),
  note VARCHAR(300),
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_history ON student_history(student_id, created_at DESC);

CREATE OR REPLACE FUNCTION log_student_history() RETURNS trigger AS $$
DECLARE actor UUID; ev TEXT; nt TEXT;
BEGIN
  actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
  ev := NULLIF(current_setting('app.event_type', true), '');
  nt := NULLIF(current_setting('app.note', true), '');
  IF TG_OP = 'INSERT' THEN
    INSERT INTO student_history (student_id, event_type, to_class_id, to_session_id, to_status, changed_by)
    VALUES (NEW.id, 'ADMITTED', NEW.class_id, NEW.academic_session_id, NEW.status::text, actor);
  ELSIF NEW.class_id IS DISTINCT FROM OLD.class_id OR NEW.academic_session_id IS DISTINCT FROM OLD.academic_session_id OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO student_history (student_id, event_type, from_class_id, to_class_id, from_session_id, to_session_id, from_status, to_status, note, changed_by)
    VALUES (NEW.id,
            COALESCE(ev, CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status::text ELSE 'CLASS_CHANGE' END),
            OLD.class_id, NEW.class_id, OLD.academic_session_id, NEW.academic_session_id, OLD.status::text, NEW.status::text, nt, actor);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_student_history ON students;
CREATE TRIGGER trg_student_history AFTER INSERT OR UPDATE ON students FOR EACH ROW EXECUTE FUNCTION log_student_history();

-- Backfill: give every existing student an "ADMITTED" starting point so history is never empty.
INSERT INTO student_history (student_id, event_type, to_class_id, to_session_id, to_status, created_at)
SELECT s.id, 'ADMITTED', s.class_id, s.academic_session_id, s.status::text, s.created_at
FROM students s WHERE NOT EXISTS (SELECT 1 FROM student_history h WHERE h.student_id = s.id);

-- ---- Disciplinary records ----
CREATE TABLE IF NOT EXISTS disciplinary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(40),
  severity VARCHAR(10) NOT NULL DEFAULT 'MINOR' CHECK (severity IN ('MINOR','MAJOR','SEVERE')),
  description TEXT NOT NULL,
  action_taken TEXT,
  recorded_by UUID REFERENCES users(id),
  recorded_by_name VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discipline_student ON disciplinary_records(student_id, incident_date DESC);

-- ---- Terms and timetable ----
CREATE TABLE IF NOT EXISTS terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  name VARCHAR(40) NOT NULL,
  start_date DATE,
  end_date DATE,
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academic_session_id, name)
);
CREATE TABLE IF NOT EXISTS timetable_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  teacher_employee_id UUID REFERENCES employees(id),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(40),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timetable_class ON timetable_slots(class_id, weekday, start_time);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_slots(teacher_employee_id, weekday, start_time);

-- ---- Teacher/staff details ----
ALTER TABLE employees ADD COLUMN IF NOT EXISTS qualifications TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS responsibilities TEXT;
CREATE TABLE IF NOT EXISTS employee_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  period VARCHAR(40) NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewer_name VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Expense approval workflow (existing rows count as approved) ----
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status VARCHAR(10) NOT NULL DEFAULT 'APPROVED';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_note VARCHAR(300);

-- ---- Fee structures: separate examination fee (total stays a generated column; existing totals unchanged since exam_fee = 0) ----
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS exam_fee NUMERIC(12,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fee_structures' AND column_name='total' AND generation_expression LIKE '%exam_fee%') THEN
    ALTER TABLE fee_structures DROP COLUMN total;
    ALTER TABLE fee_structures ADD COLUMN total NUMERIC(12,2) GENERATED ALWAYS AS (registration_fee + school_fee + exam_fee + other_fees) STORED;
  END IF;
END $$;
