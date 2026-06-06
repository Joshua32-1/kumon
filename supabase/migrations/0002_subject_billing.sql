-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE kumon_subject AS ENUM (
  'ENGLISH',
  'INDONESIAN',
  'MATHEMATICS'
);

CREATE TYPE school_level AS ENUM (
  'ELEMENTARY',
  'SECONDARY'
);

-- ============================================================
-- ALTER STUDENTS
-- ============================================================

ALTER TABLE students
  ADD COLUMN school_level school_level NOT NULL DEFAULT 'ELEMENTARY';

-- ============================================================
-- STUDENT SUBJECTS
-- ============================================================

CREATE TABLE student_subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject     kumon_subject NOT NULL,
  enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT student_subjects_student_subject_key UNIQUE (student_id, subject)
);

-- ============================================================
-- INVOICE LINE ITEMS
-- ============================================================

CREATE TABLE invoice_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  subject     kumon_subject NOT NULL,
  label       TEXT NOT NULL,
  unit_amount INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invoice_line_items_invoice_subject_key UNIQUE (invoice_id, subject)
);

-- subject_fees seeded in 0001_initial_schema.sql

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE student_subjects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON student_subjects   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON invoice_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Must be in its own migration before 0003 references it (PG enum commit rule).
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'PAID_OLD_LINK';