import { describe, it, expect } from "vitest"
import {
  buildPaymentReminderMessage,
  buildPaymentConfirmationMessage,
  buildReminderTemplateComponents,
  buildConfirmationTemplateComponents,
  normalizeLineItems,
  subjectLabelsFromLineItems,
} from "@/lib/messaging/templates"
import { makeInvoice } from "@/lib/test/factories"

const PAY_URL = "https://pay.example.test/abc123"

describe("normalizeLineItems", () => {
  it("drops items missing label or unit_amount and preserves order", () => {
    const result = normalizeLineItems([
      { label: "A", unit_amount: 1 },
      { label: "B" },
      { unit_amount: 2 },
      { label: "C", unit_amount: 3 },
    ])
    expect(result).toEqual([
      { label: "A", unit_amount: 1 },
      { label: "C", unit_amount: 3 },
    ])
  })

  it("keeps a zero unit_amount (only null/undefined are dropped)", () => {
    expect(normalizeLineItems([{ label: "Free", unit_amount: 0 }])).toEqual([
      { label: "Free", unit_amount: 0 },
    ])
  })
})

describe("subjectLabelsFromLineItems", () => {
  it("extracts the labels in order", () => {
    expect(
      subjectLabelsFromLineItems([
        { label: "Matematika", unit_amount: 1 },
        { label: "English", unit_amount: 2 },
      ])
    ).toEqual(["Matematika", "English"])
  })
})

describe("buildPaymentReminderMessage", () => {
  it("contains the reminder greeting, payment link, and 'not yet received' status", () => {
    const msg = buildPaymentReminderMessage({
      contactName: "Budi",
      studentName: "Ani",
      schoolLevel: "ELEMENTARY",
      invoice: makeInvoice({ month: 1, year: 2026, amount: 480_000 }),
      paymentUrl: PAY_URL,
      lineItems: [{ label: "Matematika", unit_amount: 480_000 }],
    })
    expect(msg).toContain("Halo Bapak/Ibu Budi,")
    expect(msg).toContain("Ini adalah pengingat pembayaran untuk siswa Ani:")
    expect(msg).toContain("Data siswa:")
    expect(msg).toContain(PAY_URL)
    expect(msg).toContain("belum kami terima")
    expect(msg).toContain("Terima kasih 🙏")
  })
})

describe("buildPaymentConfirmationMessage", () => {
  it("uses the confirmation copy, 'already received' status, and no payment link", () => {
    const msg = buildPaymentConfirmationMessage({
      contactName: "Budi",
      studentName: "Ani",
      schoolLevel: "ELEMENTARY",
      invoice: makeInvoice({ month: 1, year: 2026, amount: 480_000 }),
      lineItems: [{ label: "Matematika", unit_amount: 480_000 }],
    })
    expect(msg).toContain("Pembayaran untuk siswa Ani:")
    expect(msg).toContain("telah kami terima")
    expect(msg).toContain("Terima kasih 🙏")
    // Confirmation is not a reminder and carries no payment URL.
    expect(msg).not.toContain("pengingat")
    expect(msg).not.toContain("https://")
  })
})

// Helper: index a body component's named params by parameter_name.
function paramMap(components: ReturnType<typeof buildReminderTemplateComponents>) {
  const body = components[0]
  const entries = body.parameters.map((p) => [p.parameter_name ?? "", p.text] as const)
  return { names: body.parameters.map((p) => p.parameter_name), map: Object.fromEntries(entries) }
}

describe("buildReminderTemplateComponents", () => {
  it("builds one body component with the 6 named reminder params, in order", () => {
    const components = buildReminderTemplateComponents({
      contactName: "Budi Santoso",
      studentName: "Ani Wijaya",
      invoice: makeInvoice({ month: 1, year: 2026, amount: 480_000 }),
      paymentUrl: PAY_URL,
      lineItems: [
        { label: "Matematika", unit_amount: 480_000 },
        { label: "English", unit_amount: 480_000 },
      ],
    })
    expect(components).toHaveLength(1)
    expect(components[0].type).toBe("body")

    const { names, map } = paramMap(components)
    expect(names).toEqual([
      "nama_orang_tua",
      "nama_siswa",
      "bulan_tagihan",
      "total_tagihan",
      "link_pembayaran",
      "mata_pelajaran",
    ])
    expect(map.nama_orang_tua).toBe("Budi Santoso")
    expect(map.nama_siswa).toBe("Ani Wijaya")
    expect(map.bulan_tagihan).toBe("Januari 2026")
    expect(map.total_tagihan).toContain("480.000")
    expect(map.link_pembayaran).toBe(PAY_URL)
    expect(map.mata_pelajaran).toBe("Matematika, English")
  })

  it("uses an em dash for subjects when there are no line items", () => {
    const components = buildReminderTemplateComponents({
      contactName: "Budi",
      studentName: "Ani",
      invoice: makeInvoice(),
      paymentUrl: PAY_URL,
      lineItems: [],
    })
    expect(paramMap(components).map.mata_pelajaran).toBe("—")
  })
})

describe("buildConfirmationTemplateComponents", () => {
  it("builds the 5 named confirmation params and omits link_pembayaran", () => {
    const components = buildConfirmationTemplateComponents({
      contactName: "Budi Santoso",
      studentName: "Ani Wijaya",
      invoice: makeInvoice({ month: 1, year: 2026, amount: 480_000 }),
      lineItems: [{ label: "Matematika", unit_amount: 480_000 }],
    })
    const { names, map } = paramMap(components)
    expect(names).toEqual([
      "nama_orang_tua",
      "nama_siswa",
      "bulan_tagihan",
      "total_tagihan",
      "mata_pelajaran",
    ])
    expect(names).not.toContain("link_pembayaran")
    expect(map.nama_orang_tua).toBe("Budi Santoso")
    expect(map.bulan_tagihan).toBe("Januari 2026")
    expect(map.mata_pelajaran).toBe("Matematika")
  })
})
