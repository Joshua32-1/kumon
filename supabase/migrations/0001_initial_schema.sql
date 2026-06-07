-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE student_status AS ENUM (
  'ACTIVE',
  'TEMPORARY_LEAVE',
  'INACTIVE'
);

CREATE TYPE payment_status AS ENUM (
  'PENDING',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'WAIVED',
  'PAID_OLD_LINK'
);

CREATE TYPE reminder_status AS ENUM (
  'PENDING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE kumon_subject AS ENUM (
  'ENGLISH',
  'INDONESIAN',
  'MATHEMATICS'
);

CREATE TYPE school_level AS ENUM (
  'ELEMENTARY',
  'SECONDARY'
);

CREATE TYPE student_grade AS ENUM (
  'TK_1', 'TK_2',
  'SD_1', 'SD_2', 'SD_3', 'SD_4', 'SD_5', 'SD_6',
  'SMP_1', 'SMP_2', 'SMP_3',
  'SMA_1', 'SMA_2', 'SMA_3'
);

-- ============================================================
-- STUDENTS
-- ============================================================

CREATE TABLE students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  grade           student_grade NOT NULL,
  school_level    school_level NOT NULL DEFAULT 'ELEMENTARY',
  status          student_status NOT NULL DEFAULT 'ACTIVE',
  enrolled_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  deactivated_at  TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONTACTS
-- ============================================================

CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  relationship    TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX contacts_student_primary_idx
  ON contacts(student_id) WHERE is_primary = TRUE;

-- ============================================================
-- TEMPORARY LEAVES
-- ============================================================

CREATE TABLE temporary_leaves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month           INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year            INTEGER NOT NULL,
  reason          TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT temporary_leaves_student_month_year_key
    UNIQUE (student_id, month, year)
);

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
-- INVOICES
-- ============================================================

CREATE TABLE invoices (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  month                     INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                      INTEGER NOT NULL,
  amount                    INTEGER NOT NULL,
  status                    payment_status NOT NULL DEFAULT 'PENDING',
  due_date                  DATE NOT NULL,
  paid_at                   TIMESTAMPTZ,
  school_level_at_billing   school_level NOT NULL,
  midtrans_order_id         TEXT UNIQUE,
  midtrans_order_ids        TEXT[] NOT NULL DEFAULT '{}',
  midtrans_payment_url      TEXT,
  midtrans_transaction_id   TEXT,
  notes                     TEXT,
  created_by                UUID REFERENCES auth.users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one active invoice per student per billing month.
CREATE UNIQUE INDEX invoices_student_month_year_active_idx
  ON invoices (student_id, month, year)
  WHERE status NOT IN ('CANCELLED', 'PAID_OLD_LINK');

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

-- ============================================================
-- PAYMENT REMINDERS
-- ============================================================

CREATE TABLE payment_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reminder_number INTEGER NOT NULL,
  scheduled_date  DATE NOT NULL,
  sent_at         TIMESTAMPTZ,
  status          reminder_status NOT NULL DEFAULT 'PENDING',
  whatsapp_number TEXT NOT NULL,
  message_preview TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SYSTEM CONFIG
-- ============================================================

CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_config (key, value) VALUES
  ('subject_fees',      '{"elementary": {"english": 480000, "indonesian": 480000, "mathematics": 480000}, "secondary": {"english": 530000, "indonesian": 530000, "mathematics": 530000}}'),
  ('reminder_days',     '{"days": [1, 11, 21]}'),
  ('max_leave_months',  '{"months": 3}'),
  ('center_name',       '{"name": "Kumon Center"}'),
  ('whatsapp_provider', '{"provider": "fonnte"}'),
  ('grade_promotion',   '{"year": null}');

INSERT INTO system_config (key, value, updated_at)
SELECT
  'subject_fees_schedule',
  jsonb_build_array(
    jsonb_build_object(
      'year', 2020,
      'month', 1,
      'fees', value
    )
  ),
  NOW()
FROM system_config
WHERE key = 'subject_fees';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_subjects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporary_leaves  ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON students          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON contacts          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON student_subjects  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON invoices          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON invoice_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON payment_reminders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON temporary_leaves  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON system_config     FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
