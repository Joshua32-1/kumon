import { describe, it, expect } from "vitest"
import {
  toCsv,
  buildPaymentLedgerRows,
  buildPaymentLedgerCsv,
  PAYMENT_LEDGER_HEADERS,
  type PaymentLedgerRow,
} from "@/lib/reports/csv"

describe("toCsv", () => {
  it("joins headers and rows with CRLF", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2")
  })

  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(toCsv(["name"], [["Budi, Jr."]])).toBe('name\r\n"Budi, Jr."')
    expect(toCsv(["name"], [['say "hi"']])).toBe('name\r\n"say ""hi"""')
    expect(toCsv(["name"], [["line1\nline2"]])).toBe('name\r\n"line1\nline2"')
  })

  it("emits just the header row for no data", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b")
  })

  it("neutralizes spreadsheet formula injection with a leading apostrophe", () => {
    expect(toCsv(["name"], [["=SUM(A1)"]])).toBe("name\r\n'=SUM(A1)")
    expect(toCsv(["name"], [["@cmd"]])).toBe("name\r\n'@cmd")
    // a formula that also needs quoting (contains a comma) gets both treatments
    expect(toCsv(["name"], [["=cmd,x"]])).toBe('name\r\n"\'=cmd,x"')
  })
})

describe("buildPaymentLedgerRows", () => {
  const row = (partial: Partial<PaymentLedgerRow> = {}): PaymentLedgerRow => ({
    month: 6,
    year: 2026,
    student_name: "Ani Wijaya",
    status: "PAID",
    amount: 480_000,
    paid_at: "2026-06-10T03:00:00Z",
    ...partial,
  })

  it("maps fields in header order and stringifies numbers", () => {
    expect(buildPaymentLedgerRows([row()])).toEqual([
      ["6", "2026", "Ani Wijaya", "PAID", "480000", "2026-06-10T03:00:00Z"],
    ])
  })

  it("renders a null paid_at as empty", () => {
    expect(buildPaymentLedgerRows([row({ status: "PENDING", paid_at: null })])[0][5]).toBe("")
  })
})

describe("buildPaymentLedgerCsv", () => {
  it("escapes a student name with a comma so columns stay aligned", () => {
    const csv = buildPaymentLedgerCsv([
      {
        month: 6,
        year: 2026,
        student_name: "Santoso, Budi",
        status: "PAID",
        amount: 530_000,
        paid_at: null,
      },
    ])
    const lines = csv.split("\r\n")
    expect(lines[0]).toBe(PAYMENT_LEDGER_HEADERS.join(","))
    expect(lines[1]).toBe('6,2026,"Santoso, Budi",PAID,530000,')
  })
})
