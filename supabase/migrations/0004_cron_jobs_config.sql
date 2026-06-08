INSERT INTO system_config (key, value) VALUES
  (
    'cron_jobs',
    '{
      "generate_invoices": {"enabled": true},
      "backfill_payment_links": {"enabled": true},
      "send_reminders": {"enabled": true},
      "reconcile_payments": {"enabled": true},
      "promote_grades": {"enabled": true}
    }'
  )
ON CONFLICT (key) DO NOTHING;
