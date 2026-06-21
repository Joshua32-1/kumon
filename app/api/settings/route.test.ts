import { describe, it, expect } from "vitest"
import { SYSTEM_CONFIG_KEYS, settingsUpdateSchema } from "./route"

// The keys SettingsForm.handleSave() submits on every save. If the form starts
// writing a new key, add it here AND to SYSTEM_CONFIG_KEYS — this guard exists
// because omitting center_name 422'd the entire settings save.
const KEYS_THE_UI_WRITES = [
  "center_name",
  "subject_fees",
  "max_leave_months",
  "cron_jobs",
] as const

describe("settings update whitelist", () => {
  it("accepts every key the Settings UI submits", () => {
    for (const key of KEYS_THE_UI_WRITES) {
      expect(SYSTEM_CONFIG_KEYS).toContain(key)
    }
  })

  it("validates a real save payload", () => {
    const payload = {
      updates: KEYS_THE_UI_WRITES.map((key) => ({ key, value: { x: 1 } })),
    }
    expect(settingsUpdateSchema.safeParse(payload).success).toBe(true)
  })

  it("rejects an unknown / typo'd key", () => {
    const result = settingsUpdateSchema.safeParse({
      updates: [{ key: "bogus_key", value: {} }],
    })
    expect(result.success).toBe(false)
  })
})
