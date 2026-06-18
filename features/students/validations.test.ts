import { describe, it, expect } from "vitest"
import {
  phoneRegex,
  createStudentSchema,
  setLeaveBulkSchema,
  cancelLeaveSchema,
} from "@/features/students/validations"

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

describe("phoneRegex", () => {
  it("accepts +62 numbers of valid length", () => {
    expect(phoneRegex.test("+6281234567890")).toBe(true)
  })

  it("rejects malformed numbers", () => {
    expect(phoneRegex.test("081234567890")).toBe(false) // no +62
    expect(phoneRegex.test("+62812")).toBe(false) // too short
    expect(phoneRegex.test("+1234567890")).toBe(false) // wrong country code
  })
})

describe("createStudentSchema", () => {
  const valid = {
    full_name: "Budi",
    grade: "SD_1",
    subjects: ["ENGLISH"],
    enrolled_at: "2026-06-15",
    contact: { full_name: "Ibu Budi", relationship: "Ibu", whatsapp_number: "+6281234567890" },
  }

  it("normalizes enrolled_at to the first of the month", () => {
    const result = createStudentSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.enrolled_at).toBe("2026-06-01")
  })

  it("requires at least one subject", () => {
    expect(createStudentSchema.safeParse({ ...valid, subjects: [] }).success).toBe(false)
  })

  it("rejects an invalid grade", () => {
    expect(createStudentSchema.safeParse({ ...valid, grade: "GRADE_9" }).success).toBe(false)
  })

  it("rejects a contact with a bad whatsapp number", () => {
    const result = createStudentSchema.safeParse({
      ...valid,
      contact: { ...valid.contact, whatsapp_number: "0812" },
    })
    expect(result.success).toBe(false)
  })
})

describe("setLeaveBulkSchema", () => {
  it("dedupes student_ids", () => {
    const result = setLeaveBulkSchema.safeParse({
      month: 6,
      year: 2026,
      student_ids: [UUID_A, UUID_B, UUID_A],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.student_ids).toEqual([UUID_A, UUID_B])
  })

  it("requires at least one student", () => {
    expect(setLeaveBulkSchema.safeParse({ month: 6, year: 2026, student_ids: [] }).success).toBe(false)
  })
})

describe("cancelLeaveSchema", () => {
  it("defaults regenerate_invoice to false", () => {
    const result = cancelLeaveSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.regenerate_invoice).toBe(false)
  })
})
