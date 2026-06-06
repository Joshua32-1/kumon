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
  'WAIVED'
);

CREATE TYPE reminder_status AS ENUM (
  'PENDING',
  'SENT',
  'FAILED'
);

-- ============================================================
-- STUDENTS
-- ============================================================

CREATE TABLE students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  grade           TEXT,
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

-- Only one primary contact per student
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
  midtrans_order_id         TEXT UNIQUE,
  midtrans_payment_url      TEXT,
  midtrans_transaction_id   TEXT,
  notes                     TEXT,
  created_by                UUID REFERENCES auth.users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invoices_student_month_year_key
    UNIQUE (student_id, month, year)
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
  ('whatsapp_provider', '{"provider": "fonnte"}');

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporary_leaves  ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config     ENABLE ROW LEVEL SECURITY;

-- Authenticated users = admins in this system
CREATE POLICY "admin_all" ON students          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON contacts          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_all" ON invoices          FOR ALL TO authenticated USING (true) WITH CHECK (true);
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