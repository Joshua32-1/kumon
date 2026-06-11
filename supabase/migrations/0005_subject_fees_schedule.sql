-- Historical fee schedule for period-accurate invoicing.
-- Each entry: { year, month, fees } = rates effective from that billing month forward.

INSERT INTO system_config (key, value, updated_at)
SELECT
  'subject_fees_schedule',
  jsonb_build_array(
    jsonb_build_object(
      'year', 2020,
      'month', 1,
      'fees', value
    )
  ),
  NOW()
FROM system_config
WHERE key = 'subject_fees'
ON CONFLICT (key) DO NOTHING;