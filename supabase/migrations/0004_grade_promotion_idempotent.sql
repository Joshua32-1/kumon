-- ============================================================
-- IDEMPOTENT ANNUAL GRADE PROMOTION
-- ============================================================

INSERT INTO system_config (key, value) VALUES
  ('grade_promotion', '{"year": null}')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION promote_grades_annual(p_promotion_year INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_year INTEGER;
  v_promoted INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_inactive INTEGER := 0;
BEGIN
  SELECT (value->>'year')::INTEGER
  INTO v_last_year
  FROM system_config
  WHERE key = 'grade_promotion'
  FOR UPDATE;

  SELECT COUNT(*)::INTEGER INTO v_inactive FROM students WHERE status = 'INACTIVE';

  IF v_last_year IS NOT NULL AND v_last_year >= p_promotion_year THEN
    SELECT COUNT(*)::INTEGER INTO v_unchanged
    FROM students
    WHERE status IN ('ACTIVE', 'TEMPORARY_LEAVE');

    RETURN jsonb_build_object(
      'already_promoted', true,
      'promotion_year', v_last_year,
      'promoted', 0,
      'unchanged', v_unchanged,
      'skipped_inactive', v_inactive
    );
  END IF;

  WITH eligible AS (
    SELECT
      id,
      grade,
      CASE grade
        WHEN 'TK_1' THEN 'TK_2'::student_grade
        WHEN 'TK_2' THEN 'SD_1'::student_grade
        WHEN 'SD_1' THEN 'SD_2'::student_grade
        WHEN 'SD_2' THEN 'SD_3'::student_grade
        WHEN 'SD_3' THEN 'SD_4'::student_grade
        WHEN 'SD_4' THEN 'SD_5'::student_grade
        WHEN 'SD_5' THEN 'SD_6'::student_grade
        WHEN 'SD_6' THEN 'SMP_1'::student_grade
        WHEN 'SMP_1' THEN 'SMP_2'::student_grade
        WHEN 'SMP_2' THEN 'SMP_3'::student_grade
        WHEN 'SMP_3' THEN 'SMA_1'::student_grade
        WHEN 'SMA_1' THEN 'SMA_2'::student_grade
        WHEN 'SMA_2' THEN 'SMA_3'::student_grade
        WHEN 'SMA_3' THEN 'SMA_3'::student_grade
      END AS new_grade
    FROM students
    WHERE status IN ('ACTIVE', 'TEMPORARY_LEAVE')
  ),
  updated AS (
    UPDATE students s
    SET
      grade = e.new_grade,
      school_level = CASE
        WHEN e.new_grade::text LIKE 'SMP_%' OR e.new_grade::text LIKE 'SMA_%'
          THEN 'SECONDARY'::school_level
        ELSE 'ELEMENTARY'::school_level
      END
    FROM eligible e
    WHERE s.id = e.id
      AND e.new_grade IS DISTINCT FROM s.grade
    RETURNING s.id
  )
  SELECT COUNT(*)::INTEGER INTO v_promoted FROM updated;

  SELECT COUNT(*)::INTEGER INTO v_unchanged
  FROM students
  WHERE status IN ('ACTIVE', 'TEMPORARY_LEAVE')
    AND grade = 'SMA_3'::student_grade;

  UPDATE system_config
  SET value = jsonb_build_object('year', p_promotion_year, 'promoted_at', NOW())
  WHERE key = 'grade_promotion';

  RETURN jsonb_build_object(
    'already_promoted', false,
    'promotion_year', p_promotion_year,
    'promoted', v_promoted,
    'unchanged', v_unchanged,
    'skipped_inactive', v_inactive
  );
END;
$$;

GRANT EXECUTE ON FUNCTION promote_grades_annual(INTEGER) TO service_role;