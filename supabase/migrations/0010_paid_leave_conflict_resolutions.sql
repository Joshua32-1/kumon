-- 0010: Persisted resolutions for paid-leave conflicts. A PAID invoice whose
-- billing month also has a temporary_leaves row stays on the dashboard panel
-- (all-time, no longer current-month-onward) until the admin marks it handled
-- ("Tandai selesai"); one row here per resolved invoice.

CREATE TABLE paid_leave_conflict_resolutions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
  note        TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE paid_leave_conflict_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON paid_leave_conflict_resolutions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
