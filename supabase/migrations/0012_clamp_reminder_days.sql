-- 0012: Guard create_invoice_with_lines against out-of-range reminder days.
-- system_config.reminder_days is unvalidated; a value like 29/30/31 would make make_date() throw on
-- short months (e.g. make_date(2026, 2, 31)) and abort the whole invoice-creation transaction.
-- Clamp each day into the target month's valid range so generation never crashes. Body is otherwise
-- identical to 0008's create_invoice_with_lines. CREATE OR REPLACE preserves existing GRANTs.

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
  v_last_day int;
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
      -- Last calendar day of the invoice month (28–31). Reminder days are clamped into [1, last_day]
      -- so a misconfigured day can never produce an invalid date.
      v_last_day := EXTRACT(
        DAY FROM (date_trunc('month', make_date(v_year, v_month, 1)) + INTERVAL '1 month - 1 day')
      )::int;

      INSERT INTO payment_reminders (
        invoice_id, student_id, reminder_number, scheduled_date, status, whatsapp_number
      )
      SELECT v_invoice_id, v_student_id, d.ord::int,
             make_date(v_year, v_month, GREATEST(1, LEAST(d.day, v_last_day))),
             'PENDING', v_whatsapp
      FROM unnest(p_reminder_days) WITH ORDINALITY AS d(day, ord);
    END IF;
  END IF;

  RETURN v_invoice_id;
END;
$$;
