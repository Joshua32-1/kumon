import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  formatMissingInvoicesAlert,
  formatCronFailureAlert,
  isAlertWorthyError,
  alertCronFailure,
} from "@/lib/alerts"
import { AppError, Errors } from "@/lib/errors"

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }))
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }))

describe("formatMissingInvoicesAlert", () => {
  it("includes the count, period, and each student", () => {
    const { subject, body } = formatMissingInvoicesAlert({
      month: 6,
      year: 2026,
      missing: [
        { id: "stu-1", name: "Ani" },
        { id: "stu-2", name: "Budi" },
      ],
    })
    expect(subject).toContain("2 siswa")
    expect(subject).toContain("2026")
    expect(body).toContain("Ani (stu-1)")
    expect(body).toContain("Budi (stu-2)")
    expect(body).toContain("generate-invoices")
  })
})

describe("formatCronFailureAlert", () => {
  it("names the job and includes the error", () => {
    const { subject, body } = formatCronFailureAlert({
      job: "generate-invoices",
      error: "boom",
    })
    expect(subject).toContain("generate-invoices")
    expect(body).toContain("boom")
  })
})

describe("isAlertWorthyError", () => {
  it("alerts on unexpected (non-AppError) throws", () => {
    expect(isAlertWorthyError(new Error("kaboom"))).toBe(true)
    expect(isAlertWorthyError("string error")).toBe(true)
  })

  it("alerts on 5xx AppErrors", () => {
    expect(isAlertWorthyError(Errors.INTERNAL("db down"))).toBe(true)
    expect(isAlertWorthyError(new AppError("X", "x", 500))).toBe(true)
  })

  it("does NOT alert on benign 4xx control-flow AppErrors", () => {
    expect(isAlertWorthyError(Errors.OUTSIDE_PROMOTION_WINDOW())).toBe(false)
    expect(isAlertWorthyError(Errors.BAD_REQUEST())).toBe(false)
  })
})

describe("alertCronFailure", () => {
  beforeEach(() => {
    sendEmailMock.mockReset().mockResolvedValue({ sent: true })
    process.env.ALERT_EMAIL_TO = "admin@test.local"
  })

  afterEach(() => {
    delete process.env.ALERT_EMAIL_TO
  })

  it("emails the admin on an unexpected (non-AppError) throw", async () => {
    await alertCronFailure("reconcile-payments", new Error("kaboom"))
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const arg = sendEmailMock.mock.calls[0][0]
    expect(arg.subject).toContain("reconcile-payments")
    expect(arg.text).toContain("kaboom")
  })

  it("emails the admin on a 5xx AppError", async () => {
    await alertCronFailure("mark-overdue", Errors.INTERNAL("db down"))
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
  })

  it("does NOT email on a benign 4xx AppError", async () => {
    await alertCronFailure("promote-grades", Errors.OUTSIDE_PROMOTION_WINDOW())
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})
