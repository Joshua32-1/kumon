-- 0014: Bulk invoice generation.
-- The automated monthly run previously called create_invoice_with_lines once per
-- student (one round-trip each), so ~500 students ≈ ~500 round-trips and risked the
-- cron timeout / partial generation. This server-side loop inserts the whole batch in
-- ONE call. Each student is wrapped in a sub-block so a single duplicate-active-invoice
-- conflict skips just that student instead of aborting the batch (matches the old
-- per-call 23505 skip). Returns the ids actually created; the caller derives the
-- skipped count from (attempted − created).
CREATE OR REPLACE FUNCTION create_invoices_with_lines(
  p_invoices jsonb,
  p_reminder_days int[]
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv jsonb;
  v_invoice_id uuid;
  v_student_id uuid;
  v_month int;
  v_year int;
  v_whatsapp text;
  v_last_day int;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR v_inv IN SELECT * FROM jsonb_array_elements(p_invoices)
  LOOP
    BEGIN
      v_student_id := (v_inv->>'student_id')::uuid;
      v_month := (v_inv->>'month')::int;
      v_year := (v_inv->>'year')::int;

      -- Defense in depth (matches the 0008/0012 single-row guard): never create an
      -- invoice without line items. Skip this row rather than RAISE so one bad payload
      -- can't abort the whole batch.
      IF (v_inv->'lines') IS NULL OR jsonb_array_length(v_inv->'lines') = 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO invoices (
        student_id, month, year, amount, status, due_date,
        created_by, school_level_at_billing, payment_access_token
      ) VALUES (
        v_student_id,
        v_month,
        v_year,
        (v_inv->>'amount')::int,
        'PENDING',
        (v_inv->>'due_date')::date,
        NULLIF(v_inv->>'created_by', '')::uuid,
        (v_inv->>'school_level_at_billing')::school_level,
        v_inv->>'payment_access_token'
      )
      RETURNING id INTO v_invoice_id;

      INSERT INTO invoice_line_items (invoice_id, subject, label, unit_amount)
      SELECT v_invoice_id,
             (l->>'subject')::kumon_subject,
             l->>'label',
             (l->>'unit_amount')::int
      FROM jsonb_array_elements(v_inv->'lines') AS l;

      -- Reminders only for students with a primary contact (matches create_invoice_with_lines).
      IF p_reminder_days IS NOT NULL AND array_length(p_reminder_days, 1) > 0 THEN
        SELECT whatsapp_number INTO v_whatsapp
        FROM contacts
        WHERE student_id = v_student_id AND is_primary = true
        LIMIT 1;

        IF v_whatsapp IS NOT NULL THEN
          -- Clamp each reminder day into the invoice month's [1, last_day] range (matches
          -- 0012): system_config.reminder_days is unvalidated, and an out-of-range day (e.g.
          -- 31) would make make_date() raise datetime_field_overflow — NOT unique_violation —
          -- which the per-row EXCEPTION block below would not catch, aborting the whole batch.
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

      v_ids := array_append(v_ids, v_invoice_id);
    EXCEPTION
      WHEN unique_violation THEN
        -- Active invoice for this (student, month, year) already exists (concurrent run
        -- or retry won the race). Skip this student; the sub-block rolls back its inserts.
        CONTINUE;
    END;
  END LOOP;

  RETURN v_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoices_with_lines(jsonb, int[]) TO authenticated, service_role;
