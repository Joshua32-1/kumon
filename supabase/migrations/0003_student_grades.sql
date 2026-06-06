-- ============================================================
-- STUDENT GRADE ENUM + INVOICE BILLING ENHANCEMENTS
-- ============================================================

CREATE TYPE student_grade AS ENUM (
  'TK_1', 'TK_2',
  'SD_1', 'SD_2', 'SD_3', 'SD_4', 'SD_5', 'SD_6',
  'SMP_1', 'SMP_2', 'SMP_3',
  'SMA_1', 'SMA_2', 'SMA_3'
);

-- PAID_OLD_LINK added in 0002 (must commit before use in partial index below).

-- Migrate grade TEXT -> student_grade
ALTER TABLE students ADD COLUMN grade_new student_grade;

UPDATE students SET grade_new = CASE
  WHEN upper(trim(replace(grade, ' ', '_'))) = 'TK_1' THEN 'TK_1'::student_grade
  WHEN upper(trim(replace(grade, ' ', '_'))) = 'TK_2' THEN 'TK_2'::student_grade
  WHEN upper(trim(replace(grade, ' ', '_'))) IN ('SD_1','SD_2','SD_3','SD_4','SD_5','SD_6') THEN upper(trim(replace(grade, ' ', '_')))::student_grade
  WHEN upper(trim(replace(grade, ' ', '_'))) IN ('SMP_1','SMP_2','SMP_3') THEN upper(trim(replace(grade, ' ', '_')))::student_grade
  WHEN upper(trim(replace(grade, ' ', '_'))) IN ('SMA_1','SMA_2','SMA_3') THEN upper(trim(replace(grade, ' ', '_')))::student_grade
  WHEN upper(trim(grade)) ~ '^TK[ _-]?1' THEN 'TK_1'::student_grade
  WHEN upper(trim(grade)) ~ '^TK[ _-]?2' THEN 'TK_2'::student_grade
  WHEN upper(trim(grade)) ~ '^SD[ _-]?1' THEN 'SD_1'::student_grade
  WHEN upper(trim(grade)) ~ '^SD[ _-]?2' THEN 'SD_2'::student_grade
  WHEN upper(trim(grade)) ~ '^SD[ _-]?3' THEN 'SD_3'::student_grade
  WHEN upper(trim(grade)) ~ '^SD[ _-]?4' THEN 'SD_4'::student_grade
  WHEN upper(trim(grade)) ~ '^SD[ _-]?5' THEN 'SD_5'::student_grade
  WHEN upper(trim(grade)) ~ '^SD[ _-]?6' THEN 'SD_6'::student_grade
  WHEN upper(trim(grade)) ~ '^SMP[ _-]?1' THEN 'SMP_1'::student_grade
  WHEN upper(trim(grade)) ~ '^SMP[ _-]?2' THEN 'SMP_2'::student_grade
  WHEN upper(trim(grade)) ~ '^SMP[ _-]?3' THEN 'SMP_3'::student_grade
  WHEN upper(trim(grade)) ~ '^SMA[ _-]?1' THEN 'SMA_1'::student_grade
  WHEN upper(trim(grade)) ~ '^SMA[ _-]?2' THEN 'SMA_2'::student_grade
  WHEN upper(trim(grade)) ~ '^SMA[ _-]?3' THEN 'SMA_3'::student_grade
  WHEN school_level = 'SECONDARY' THEN 'SMP_1'::student_grade
  ELSE 'SD_1'::student_grade
END
WHERE grade_new IS NULL;

UPDATE students SET grade_new = 'SD_1'::student_grade WHERE grade_new IS NULL;

ALTER TABLE students DROP COLUMN grade;
ALTER TABLE students RENAME COLUMN grade_new TO grade;
ALTER TABLE students ALTER COLUMN grade SET NOT NULL;

-- Invoice: billing snapshot, order history
ALTER TABLE invoices
  ADD COLUMN school_level_at_billing school_level,
  ADD COLUMN midtrans_order_ids TEXT[] NOT NULL DEFAULT '{}';

UPDATE invoices i
SET school_level_at_billing = COALESCE(
  (SELECT s.school_level FROM students s WHERE s.id = i.student_id),
  'ELEMENTARY'::school_level
)
WHERE school_level_at_billing IS NULL;

UPDATE invoices
SET midtrans_order_ids = ARRAY[midtrans_order_id]
WHERE midtrans_order_id IS NOT NULL
  AND (midtrans_order_ids = '{}' OR midtrans_order_ids IS NULL);

ALTER TABLE invoices ALTER COLUMN school_level_at_billing SET NOT NULL;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_student_month_year_key;

CREATE UNIQUE INDEX invoices_student_month_year_active_idx
  ON invoices (student_id, month, year)
  WHERE status NOT IN ('CANCELLED', 'PAID_OLD_LINK');