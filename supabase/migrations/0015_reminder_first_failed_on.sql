-- 0015: anchor the FAILED reminder retry window to the first failure, not scheduled_date.
-- The window (REMINDER_FAILED_RETRY_WINDOW_DAYS) is meant to keep a reminder retryable until
-- the next cron run. It was measured from scheduled_date, which only matches the day a send is
-- actually attempted while the schedule and the cron cadence agree. When they drift — a
-- reminder_days config the vercel.json schedule does not follow, or simply a cron day that
-- never ran — the first attempt happens days after scheduled_date and the window can expire
-- before the next run, stranding the reminder exactly as it did before the window existed.
--
-- Stamped once, on the first transition into FAILED, so the clock starts when we actually
-- tried. Not refreshed on repeat failures: a sliding anchor would let a permanently-failing
-- number be retried forever, which is the guard the window exists to provide.
--
-- DATE (not TIMESTAMPTZ) because the window is counted in WIB calendar days and compared
-- against scheduled_date, which is already a DATE. The app stamps it via
-- todayInCenterTimezone() so the Asia/Jakarta rule stays in lib/utils.ts rather than being
-- duplicated into SQL.

-- IF NOT EXISTS because these are applied by hand in the SQL editor, where a re-paste of a
-- partially-applied file is a realistic mistake.
ALTER TABLE payment_reminders
  ADD COLUMN IF NOT EXISTS first_failed_on DATE;

COMMENT ON COLUMN payment_reminders.first_failed_on IS
  'WIB calendar day this reminder first failed to send. Stamped once by paymentService._markReminderFailed; the Phase 1 retry window measures from it, falling back to scheduled_date when NULL.';

-- Guarded backfill: preserves the previous behaviour for any row that is already FAILED at
-- apply time (its window keeps measuring from scheduled_date). A no-op on a database with no
-- FAILED rows, and safe to re-run.
UPDATE payment_reminders
SET first_failed_on = scheduled_date
WHERE status = 'FAILED' AND first_failed_on IS NULL;
