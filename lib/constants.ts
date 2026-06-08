export const DEFAULT_REMINDER_DAYS = [1, 11, 21]
export const BILLABLE_STUDENT_STATUSES = ["ACTIVE", "TEMPORARY_LEAVE"] as const

/** Ten 30-min morning slots on reminder days (09:00–13:30 WIB) → up to 1000 sends at batch 100. */
export const REMINDER_SLOT_COUNT = 10
/** Slots below this run Phase 1 only; this slot and above also chase overdue/prior-month. */
export const REMINDER_PHASE2_START_SLOT = 10
export const REMINDER_SLOT_START_MINUTES_WIB = 9 * 60
export const REMINDER_SLOT_INTERVAL_MIN = 30
export const REMINDER_SLOT_INFER_OFFSET_MIN = 15
