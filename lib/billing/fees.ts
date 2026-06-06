export type KumonSubject = "ENGLISH" | "INDONESIAN" | "MATHEMATICS"
export type SchoolLevel = "ELEMENTARY" | "SECONDARY"

export const SUBJECT_LABELS: Record<KumonSubject, string> = {
  ENGLISH: "English",
  INDONESIAN: "Bahasa Indonesia",
  MATHEMATICS: "Matematika",
}

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  ELEMENTARY: "TK/SD",
  SECONDARY: "SMP/SMA",
}

export const ALL_SUBJECTS: KumonSubject[] = ["ENGLISH", "INDONESIAN", "MATHEMATICS"]

/** Default per-subject fees (IDR). TK/SD = elementary tier, SMP/SMA = secondary tier. */
export const DEFAULT_SUBJECT_FEES: SubjectFeeConfig = {
  elementary: { english: 480_000, indonesian: 480_000, mathematics: 480_000 },
  secondary: { english: 530_000, indonesian: 530_000, mathematics: 530_000 },
}

export interface SubjectFeeConfig {
  elementary: Record<Lowercase<KumonSubject>, number>
  secondary: Record<Lowercase<KumonSubject>, number>
}

export interface InvoiceLineItem {
  subject: KumonSubject
  label: string
  unit_amount: number
}

export interface ComputeResult {
  lines: InvoiceLineItem[]
  total: number
}

export function parseSubjectFees(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: Record<string, any> | null | undefined
): SubjectFeeConfig {
  if (!value || Object.keys(value).length === 0) return DEFAULT_SUBJECT_FEES
  return {
    elementary: { ...DEFAULT_SUBJECT_FEES.elementary, ...(value.elementary ?? {}) },
    secondary: { ...DEFAULT_SUBJECT_FEES.secondary, ...(value.secondary ?? {}) },
  }
}

export function computeInvoiceLineItems(
  schoolLevel: SchoolLevel,
  subjects: KumonSubject[],
  feeConfig: SubjectFeeConfig
): ComputeResult {
  const tier = schoolLevel === "ELEMENTARY" ? feeConfig.elementary : feeConfig.secondary
  const lines: InvoiceLineItem[] = subjects.map((subject) => ({
    subject,
    label: SUBJECT_LABELS[subject],
    unit_amount: tier[subject.toLowerCase() as Lowercase<KumonSubject>] ?? 0,
  }))
  const total = lines.reduce((sum, l) => sum + l.unit_amount, 0)
  return { lines, total }
}

type LineItemForMessage = Pick<InvoiceLineItem, "label" | "unit_amount">

export function formatLineItemsForMessage(lines: LineItemForMessage[]): string {
  return lines.map((l) => `• ${l.label}: ${formatRupiahSimple(l.unit_amount)}`).join("\n")
}

/** Student enrollment block for WhatsApp (parent verification). */
export function formatStudentEnrollmentForWhatsApp(
  studentName: string,
  schoolLevel: SchoolLevel,
  subjectLabels: string[]
): string {
  const subjectsText =
    subjectLabels.length > 0 ? subjectLabels.join(", ") : "—"
  return (
    `Data siswa:\n` +
    `• Nama: ${studentName}\n` +
    `• Tingkat: ${SCHOOL_LEVEL_LABELS[schoolLevel]}\n` +
    `• Mata pelajaran: ${subjectsText}`
  )
}

/** WhatsApp body for payment reminder / confirmation (includes per-subject breakdown). */
export function formatPaymentDetailsForWhatsApp(
  monthName: string,
  year: number,
  lineItems: LineItemForMessage[],
  totalFormatted: string,
  statusPhrase: string
): string {
  const period = `SPP Kumon bulan ${monthName} ${year}`
  if (lineItems.length > 0) {
    return (
      `${period}:\n\n` +
      `${formatLineItemsForMessage(lineItems)}\n\n` +
      `Total: *${totalFormatted}* — ${statusPhrase}.`
    )
  }
  return `${period} sebesar *${totalFormatted}* — ${statusPhrase}.`
}

function formatRupiahSimple(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
