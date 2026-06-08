-- Stable per-invoice pay tokens for lazy Midtrans checkout (/pay/{token})

ALTER TABLE invoices
  ADD COLUMN payment_access_token TEXT,
  ADD COLUMN midtrans_snap_created_at TIMESTAMPTZ;

UPDATE invoices
SET payment_access_token = encode(gen_random_bytes(16), 'hex')
WHERE payment_access_token IS NULL;

ALTER TABLE invoices
  ALTER COLUMN payment_access_token SET NOT NULL;

CREATE UNIQUE INDEX invoices_payment_access_token_idx
  ON invoices (payment_access_token);
