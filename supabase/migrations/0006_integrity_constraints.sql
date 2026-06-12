-- 0006: Defensive integrity constraints surfaced by QA edge-case testing.
-- Adds DB-level backstops behind the zod validation layer so direct/service
-- writes cannot store negative money, out-of-range billing periods, blank names,
-- or non-positive reminder numbers. App code already produces compliant values;
-- these only reject corruption.
--
-- PRE-FLIGHT (run first; every row must return 0 or the matching ALTER will fail):
--   SELECT count(*) FROM invoices            WHERE amount < 0;
--   SELECT count(*) FROM invoice_line_items  WHERE unit_amount < 0;
--   SELECT count(*) FROM invoices            WHERE year NOT BETWEEN 2000 AND 2100;
--   SELECT count(*) FROM temporary_leaves    WHERE year NOT BETWEEN 2000 AND 2100;
--   SELECT count(*) FROM payment_reminders   WHERE reminder_number < 1;
--   SELECT count(*) FROM students            WHERE length(btrim(full_name)) = 0;
--   SELECT count(*) FROM contacts            WHERE length(btrim(full_name)) = 0;
-- If any are non-zero, clean those rows before applying (do NOT silently rewrite
-- financial amounts — investigate them first).

ALTER TABLE invoices
  ADD CONSTRAINT invoices_amount_nonneg CHECK (amount >= 0);

ALTER TABLE invoice_line_items
  ADD CONSTRAINT invoice_line_items_unit_amount_nonneg CHECK (unit_amount >= 0);

-- Billing-period sanity. zod bounds new writes to 2020-2100; allow 2000 here so
-- any legitimate historical backfill is not rejected, while still blocking 0 /
-- negative / 5-digit garbage years.
ALTER TABLE invoices
  ADD CONSTRAINT invoices_year_range CHECK (year BETWEEN 2000 AND 2100);

ALTER TABLE temporary_leaves
  ADD CONSTRAINT temporary_leaves_year_range CHECK (year BETWEEN 2000 AND 2100);

-- reminder_number grows past 3 via overdue catch-up reminders
-- (ensureOverdueCatchUpReminder increments max+1), so only a lower bound is safe.
ALTER TABLE payment_reminders
  ADD CONSTRAINT payment_reminders_number_positive CHECK (reminder_number >= 1);

-- Non-blank display names (zod requires >= 2 chars; DB only had NOT NULL).
ALTER TABLE students
  ADD CONSTRAINT students_full_name_not_blank CHECK (length(btrim(full_name)) > 0);

ALTER TABLE contacts
  ADD CONSTRAINT contacts_full_name_not_blank CHECK (length(btrim(full_name)) > 0);
