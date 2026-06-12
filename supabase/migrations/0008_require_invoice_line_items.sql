-- 0008: An invoice must have at least one line item.
-- Defense in depth for issue #4: a student with no billable subjects must not get an invoice
-- (and therefore no reminders). Generation already skips such students; the recalc path is
-- guarded in app code. This guard makes the empty-line-items case impossible from ANY caller
-- (including direct authenticated RPC calls). CREATE OR REPLACE — these supersede 0007's bodies.

CREATE OR REPLACE FUNCTION create_invoice_with_lines(
  p_invoice jsonb,
  p_lines jsonb,
  p_reminder_days int[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_student_id uuid := (p_invoice->>'student_id')::uuid;
  v_month int := (p_invoice->>'month')::int;
  v_year int := (p_invoice->>'year')::int;
  v_whatsapp text;
BEGIN
  -- Runs before the invoice insert, so no invoice and no reminders are created.
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'invoice must have at least one line item' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO invoices (
    student_id, month, year, amount, status, due_date,
    created_by, school_level_at_billing, payment_access_token
  ) VALUES (
    v_student_id,
    v_month,
    v_year,
    (p_invoice->>'amount')::int,
    'PENDING',
    (p_invoice->>'due_date')::date,
    NULLIF(p_invoice->>'created_by', '')::uuid,
    (p_invoice->>'school_level_at_billing')::school_level,
    p_invoice->>'payment_access_token'
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_line_items (invoice_id, subject, label, unit_amount)
  SELECT v_invoice_id,
         (l->>'subject')::kumon_subject,
         l->>'label',
         (l->>'unit_amount')::int
  FROM jsonb_array_elements(p_lines) AS l;

  IF p_reminder_days IS NOT NULL AND array_length(p_reminder_days, 1) > 0 THEN
    SELECT whatsapp_number INTO v_whatsapp
    FROM contacts
    WHERE student_id = v_student_id AND is_primary = true
    LIMIT 1;

    IF v_whatsapp IS NOT NULL THEN
      INSERT INTO payment_reminders (
        invoice_id, student_id, reminder_number, scheduled_date, status, whatsapp_number
      )
      SELECT v_invoice_id, v_student_id, d.ord::int,
             make_date(v_year, v_month, d.day),
             'PENDING', v_whatsapp
      FROM unnest(p_reminder_days) WITH ORDINALITY AS d(day, ord);
    END IF;
  END IF;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION regenerate_invoice_lines(
  p_invoice_id uuid,
  p_amount int,
  p_school_level school_level,
  p_lines jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status payment_status;
BEGIN
  SELECT status INTO v_status FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'invoice % not found', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status NOT IN ('PENDING', 'OVERDUE') THEN
    RAISE EXCEPTION 'cannot regenerate invoice in status %', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'invoice must have at least one line item' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM invoice_line_items WHERE invoice_id = p_invoice_id;

  INSERT INTO invoice_line_items (invoice_id, subject, label, unit_amount)
  SELECT p_invoice_id,
         (l->>'subject')::kumon_subject,
         l->>'label',
         (l->>'unit_amount')::int
  FROM jsonb_array_elements(p_lines) AS l;

  UPDATE invoices
  SET amount = p_amount,
      school_level_at_billing = p_school_level,
      midtrans_payment_url = NULL,
      midtrans_order_id = NULL,
      midtrans_snap_created_at = NULL
  WHERE id = p_invoice_id;
END;
$$;
