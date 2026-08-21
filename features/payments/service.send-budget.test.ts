import { describe, it, expect, vi, afterEach } from "vitest"
import { paymentService } from "./service"
import { PAYMENT_LINK_RUN_BUDGET_MS, REMINDER_BATCH_LIMIT_DEFAULT } from "@/lib/constants"
import { maxDuration } from "@/app/(dashboard)/payments/layout"

// Measured production cost of one send: the WHATSAPP_SEND_DELAY_MS sleep plus ~2.2s of
// Meta API + DB writes. delayMs is passed as 0 in these tests, so the stub only has to
// account for the ~2.2s of work.
const SEND_COST_MS = 2_200

function stubCandidates(n: number) {
  return vi.spyOn(paymentService, "listPaymentLinkSendCandidates").mockResolvedValue({
    month: 8,
    year: 2026,
    eligible: n,
    already_sent: 0,
    no_whatsapp: 0,
    no_link: 0,
    candidates: Array.from({ length: n }, (_, i) => ({
      invoice_id: `inv-${i}`,
      student_name: `Siswa ${i}`,
    })),
  })
}

/** Fake clock that only advances when a send happens. */
function stubClockAndSend(costMs = SEND_COST_MS) {
  let now = 1_000_000
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const send = vi
    .spyOn(paymentService, "sendPaymentReminderForInvoice")
    .mockImplementation(async () => {
      now += costMs
      return { ok: true }
    })
  return send
}

afterEach(() => vi.restoreAllMocks())

describe("sendPaymentLinksForPeriod run budget", () => {
  it("stops on the wall-clock budget and returns its counts instead of running past maxDuration", async () => {
    stubCandidates(400)
    const send = stubClockAndSend()

    const result = await paymentService.sendPaymentLinksForPeriod(8, 2026, { delayMs: 0 })

    const expectedSends = Math.ceil(PAYMENT_LINK_RUN_BUDGET_MS / SEND_COST_MS)
    expect(send).toHaveBeenCalledTimes(expectedSends)
    expect(result.truncated).toBe(true)
    // The whole point of stopping early: the counts survive.
    expect(result.sent).toBe(expectedSends)
    expect(result.processed).toBe(expectedSends)
    // ...and the loop stopped well short of the 400 candidates and of the batch cap.
    expect(expectedSends).toBeLessThan(REMINDER_BATCH_LIMIT_DEFAULT)
  })

  it("still truncates on the batch limit when sends are free", async () => {
    stubCandidates(500)
    const send = stubClockAndSend(0)

    const result = await paymentService.sendPaymentLinksForPeriod(8, 2026, {
      delayMs: 0,
      batchLimit: 5,
    })

    expect(send).toHaveBeenCalledTimes(5)
    expect(result.truncated).toBe(true)
    expect(result.processed).toBe(5)
  })

  it("leaves truncated false when the whole period fits in the budget", async () => {
    stubCandidates(10)
    const send = stubClockAndSend()

    const result = await paymentService.sendPaymentLinksForPeriod(8, 2026, { delayMs: 0 })

    expect(send).toHaveBeenCalledTimes(10)
    expect(result.truncated).toBe(false)
    expect(result.sent).toBe(10)
  })
})

// The budget is only meaningful relative to the ceiling it hides under, and that ceiling
// lives in a different file that nothing forces anyone to keep in sync. These assertions
// are the gate: deleting the layout breaks the import, and moving either number without
// the other fails here rather than in production at 300s.
describe("payments segment maxDuration", () => {
  it("stays at or under the Vercel Hobby ceiling", () => {
    // A deploy above 300 is rejected at the patchBuild step with `invalid_max_duration`,
    // *after* the build log reports success — so this fails loudly instead.
    expect(maxDuration).toBeLessThanOrEqual(300)
  })

  it("leaves the budget room for the tail it cannot measure", () => {
    // The guard is checked before a send, so a run overshoots by one (~2.7s), then pays
    // for two revalidatePath calls and the RSC re-render; cold start is outside the
    // budget entirely, since the clock starts at service entry, not request entry.
    expect(maxDuration * 1_000 - PAYMENT_LINK_RUN_BUDGET_MS).toBeGreaterThanOrEqual(55_000)
  })
})
