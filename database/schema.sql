-- =====================================================================
-- FUGOBPANS School Business Management ERP — PostgreSQL schema
-- Full Gospel Bilingual Nursery and Primary School, Souza
-- No Firebase anywhere. Plain relational tables, foreign keys enforce
-- the relationships described in the master spec (§82, §109).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---- Internal users (Manager, Accountant, Teacher, Employee, Student logins) ----
CREATE TYPE user_role AS ENUM ('MANAGER', 'ACCOUNTANT', 'TEACHER', 'EMPLOYEE', 'STUDENT');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  linked_employee_id UUID, -- set for TEACHER/EMPLOYEE roles, references employees(id)
  linked_student_id UUID, -- set for STUDENT role, references students(id) (added below via FK once students exists)
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Academic structure (Manager-configurable, never hard-coded) ----
CREATE TABLE academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(20) NOT NULL UNIQUE, -- e.g. '2026/2027'
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | ARCHIVED
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL, -- Pre-Nursery, Nursery, Primary
  display_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name VARCHAR(60) NOT NULL, -- Nursery 1, Class 3, ...
  capacity INT,
  class_teacher_id UUID, -- references employees(id), nullable
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_classes_category ON classes(category_id);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE class_subjects (
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID, -- references employees(id)
  PRIMARY KEY (class_id, subject_id)
);
CREATE INDEX idx_class_subjects_teacher ON class_subjects(teacher_id);


-- ---- Fee structures: Session + Category + Class (spec §29) ----
CREATE TABLE fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  registration_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  school_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) GENERATED ALWAYS AS (registration_fee + school_fee + other_fees) STORED,
  installment_allowed BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academic_session_id, class_id)
);

-- ---- Public registration -> Student (spec §11, §21, §111) ----
CREATE TYPE registration_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number VARCHAR(30) UNIQUE NOT NULL, -- REG-2026-000001
  class_id UUID NOT NULL REFERENCES classes(id),
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  -- Student details captured directly (no account, no document upload — spec §2, §3)
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80),
  last_name VARCHAR(80) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(10) NOT NULL,
  nationality VARCHAR(60),
  birthplace VARCHAR(100),
  previous_school VARCHAR(150),
  previous_class VARCHAR(60),
  -- Guardian details
  guardian_name VARCHAR(150) NOT NULL,
  guardian_relationship VARCHAR(40),
  guardian_phone VARCHAR(30) NOT NULL,
  guardian_whatsapp VARCHAR(30),
  guardian_email VARCHAR(150),
  guardian_address VARCHAR(200),
  emergency_contact VARCHAR(30),
  status registration_status NOT NULL DEFAULT 'PENDING',
  student_id UUID, -- filled once converted to a student (always, immediately — spec §21)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_registrations_class ON registrations(class_id);
CREATE INDEX idx_registrations_session ON registrations(academic_session_id);

-- ---- Students (auto-created from a registration, or added manually by Manager) ----
CREATE TYPE student_status AS ENUM ('ACTIVE', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN');

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code VARCHAR(30) UNIQUE NOT NULL, -- STU-2026-000001
  registration_id UUID REFERENCES registrations(id), -- null if added manually
  class_id UUID NOT NULL REFERENCES classes(id),
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80),
  last_name VARCHAR(80) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(10) NOT NULL,
  guardian_name VARCHAR(150) NOT NULL,
  guardian_relationship VARCHAR(40),
  guardian_phone VARCHAR(30) NOT NULL,
  guardian_whatsapp VARCHAR(30),
  guardian_email VARCHAR(150),
  guardian_address VARCHAR(200),
  status student_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_session ON students(academic_session_id);

-- ---- Exam results (spec addendum: teacher results-entry + student portal) ----
-- One row per student/subject/term/session. UNIQUE constraint means a
-- teacher re-saving a score UPDATEs it rather than creating a duplicate.
CREATE TABLE exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  term VARCHAR(40) NOT NULL, -- e.g. 'Sequence 1' — school-defined, not hard-coded
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) NOT NULL DEFAULT 20,
  remarks VARCHAR(300),
  entered_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, term, academic_session_id)
);
CREATE INDEX idx_results_class ON exam_results(class_id, term);
CREATE INDEX idx_results_student ON exam_results(student_id);

-- ---- Invoices & payments (online + office, one shared ledger — spec §27) ----
CREATE TYPE invoice_status AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'FULLY_PAID', 'OVERPAID');

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(30) UNIQUE NOT NULL, -- INV-2026-000001
  student_id UUID NOT NULL REFERENCES students(id),
  fee_structure_id UUID NOT NULL REFERENCES fee_structures(id),
  total_amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  status invoice_status NOT NULL DEFAULT 'UNPAID',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_student ON invoices(student_id);
CREATE INDEX idx_invoices_status ON invoices(status);

CREATE TYPE payment_method AS ENUM ('MTN_MOMO', 'ORANGE_MONEY', 'OFFICE_CASH', 'OFFICE_OTHER');
CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED');

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number VARCHAR(30) UNIQUE, -- set once SUCCESSFUL; REC-2026-000001
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  student_id UUID NOT NULL REFERENCES students(id),
  amount NUMERIC(12,2) NOT NULL,
  method payment_method NOT NULL,
  transaction_reference VARCHAR(80) UNIQUE NOT NULL, -- enforces idempotency (spec §87)
  status payment_status NOT NULL DEFAULT 'PENDING',
  recorded_by UUID REFERENCES users(id), -- null for online/system-verified payments
  notes VARCHAR(300),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_student ON payments(student_id);

-- ---- Departments & positions (worker structure, spec §42-44) ----
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL, -- Teacher, Cleaner, Security, Accountant, Driver, ...
  department_id UUID REFERENCES departments(id),
  default_salary NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Employees / workers (every role, not just teachers — spec §42) ----
CREATE TYPE employment_type AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT');
CREATE TYPE employee_status AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(30) UNIQUE NOT NULL, -- EMP-2026-000001
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(10),
  phone VARCHAR(30) NOT NULL,
  whatsapp VARCHAR(30),
  email VARCHAR(150),
  address VARCHAR(200),
  emergency_contact VARCHAR(30),
  position_id UUID NOT NULL REFERENCES positions(id),
  department_id UUID REFERENCES departments(id),
  employment_type employment_type NOT NULL DEFAULT 'FULL_TIME',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status employee_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_position ON employees(position_id);

ALTER TABLE users ADD CONSTRAINT fk_users_employee FOREIGN KEY (linked_employee_id) REFERENCES employees(id);
ALTER TABLE users ADD CONSTRAINT fk_users_student FOREIGN KEY (linked_student_id) REFERENCES students(id);
ALTER TABLE classes ADD CONSTRAINT fk_classes_teacher FOREIGN KEY (class_teacher_id) REFERENCES employees(id);

-- ---- Attendance (auto-populated roster, auto-absence — spec §45, §49) ----
CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY', 'NOT_MARKED');

CREATE TABLE employee_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  status attendance_status NOT NULL DEFAULT 'NOT_MARKED',
  check_in_time TIMESTAMPTZ,
  marked_by UUID REFERENCES users(id), -- null if self-marked by the employee
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
CREATE INDEX idx_att_date ON employee_attendance(date);

CREATE TABLE employee_leave (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(200),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Salary & payroll (history preserved, never overwritten — spec §59) ----
CREATE TABLE salary_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  basic_salary NUMERIC(12,2) NOT NULL,
  allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonuses NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) GENERATED ALWAYS AS (basic_salary + allowances + bonuses - deductions) STORED,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_salary_employee ON salary_history(employee_id, effective_date DESC);

CREATE TYPE payroll_status AS ENUM ('PENDING', 'APPROVED', 'PAID');

CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period VARCHAR(7) NOT NULL UNIQUE, -- '2026-09'
  status payroll_status NOT NULL DEFAULT 'PENDING',
  total_net NUMERIC(14,2) NOT NULL DEFAULT 0,
  employee_count INT NOT NULL DEFAULT 0,
  generated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  basic_salary NUMERIC(12,2) NOT NULL,
  allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL,
  status payroll_status NOT NULL DEFAULT 'PENDING',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payroll_items_run ON payroll_items(payroll_run_id);

-- ---- Notifications (Manager activity feed — spec §61-63) ----
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_role user_role, -- null if targeted at a specific user instead
  to_user_id UUID REFERENCES users(id),
  title VARCHAR(150) NOT NULL,
  message VARCHAR(500) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'INFO', -- INFO | SUCCESS | WARNING | ERROR
  link VARCHAR(200),
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_role ON notifications(to_role, created_at DESC);

-- ---- Audit log (immutable — spec §93) ----
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  user_name VARCHAR(150),
  user_role VARCHAR(20),
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  ip VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ---- School settings (singleton row — spec §90, §92) ----
CREATE TABLE school_settings (
  id INT PRIMARY KEY DEFAULT 1,
  name VARCHAR(150) NOT NULL,
  motto VARCHAR(200),
  logo_url VARCHAR(300),
  address VARCHAR(200),
  phone VARCHAR(30),
  whatsapp VARCHAR(30),
  email VARCHAR(150),
  website VARCHAR(150),
  currency VARCHAR(10) NOT NULL DEFAULT 'FCFA',
  attendance_cutoff TIME NOT NULL DEFAULT '09:00',
  registration_open BOOLEAN NOT NULL DEFAULT true,
  CHECK (id = 1)
);

-- ---- Sequence counters (atomic, gap-free-enough numbering — spec §88) ----
CREATE TABLE id_counters (
  prefix VARCHAR(20) PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
);

-- ---- Real customer reviews (moderated — never auto-published, spec addendum) ----
CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(1000) NOT NULL,
  photo_url VARCHAR(300),
  status review_status NOT NULL DEFAULT 'PENDING',
  featured BOOLEAN NOT NULL DEFAULT false,
  moderated_by UUID REFERENCES users(id),
  moderated_at TIMESTAMPTZ,
  submitted_ip VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_status ON reviews(status, created_at DESC);

-- ---- Class assignments (teacher-posted, student-visible) ----
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID REFERENCES subjects(id),
  academic_session_id UUID NOT NULL REFERENCES academic_sessions(id),
  title VARCHAR(200) NOT NULL,
  description VARCHAR(2000),
  due_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assignments_class ON assignments(class_id, due_date);
