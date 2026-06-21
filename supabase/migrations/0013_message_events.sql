-- 0013: WhatsApp message delivery tracking.
-- payment_reminders.status records only the Meta send-API result ("accepted"), not
-- whether the message reached the parent. This table stores the Meta message id (wamid)
-- captured on send and is updated by the Meta delivery webhook (sent/delivered/read/failed).
-- A standalone table (not columns on payment_reminders) covers BOTH reminders and
-- payment confirmations — confirmations never create a payment_reminders row.

CREATE TYPE message_event_type AS ENUM ('REMINDER', 'CONFIRMATION');
CREATE TYPE message_delivery_status AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

CREATE TABLE message_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid         TEXT NOT NULL UNIQUE,                 -- Meta message id (messages[0].id)
  message_type  message_event_type NOT NULL,
  invoice_id    UUID REFERENCES invoices(id) ON DELETE CASCADE,
  reminder_id   UUID REFERENCES payment_reminders(id) ON DELETE SET NULL,
  recipient     TEXT NOT NULL,
  status        message_delivery_status NOT NULL DEFAULT 'SENT',
  error_code    TEXT,
  error_title   TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at  TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  failed_at     TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX message_events_invoice_idx ON message_events (invoice_id);

CREATE TRIGGER update_message_events_updated_at
  BEFORE UPDATE ON message_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE message_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON message_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
