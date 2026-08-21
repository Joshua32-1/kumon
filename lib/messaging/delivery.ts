// Pure helpers for the Meta WhatsApp delivery webhook. No I/O: verifies the
// X-Hub-Signature-256 HMAC and normalizes Meta's status-callback payload into
// flat delivery events. The route does the DB updates.
import type { MessageDeliveryStatus } from "@/types/database"

/** Verify Meta's X-Hub-Signature-256 header: "sha256=" + HMAC-SHA256(appSecret, rawBody). */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  // Fail closed when the secret or signature is missing (mirrors verifyMidtransSignature).
  if (!appSecret || !signatureHeader) return false
  const prefix = "sha256="
  if (!signatureHeader.startsWith(prefix)) return false
  const incoming = signatureHeader.slice(prefix.length)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto")
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex")
  // Constant-time compare on byte length (timingSafeEqual throws on length mismatch).
  const expectedBuf = Buffer.from(expected, "utf8")
  const incomingBuf = Buffer.from(incoming, "utf8")
  if (expectedBuf.length !== incomingBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, incomingBuf)
}

export interface MetaStatusEvent {
  wamid: string
  status: MessageDeliveryStatus
  timestamp: number | null
  errorCode: string | null
  errorTitle: string | null
}

/**
 * Forward-progress rank so out-of-order callbacks never downgrade a successful state.
 * FAILED ranks above SENT (a sent message can later fail) but BELOW DELIVERED/READ, so a
 * late `failed` callback can never overwrite a message Meta already confirmed delivered/read.
 */
export const DELIVERY_STATUS_RANK: Record<MessageDeliveryStatus, number> = {
  SENT: 1,
  FAILED: 2,
  DELIVERED: 3,
  READ: 4,
}

function mapStatus(raw: unknown): MessageDeliveryStatus | null {
  switch (raw) {
    case "sent":
      return "SENT"
    case "delivered":
      return "DELIVERED"
    case "read":
      return "READ"
    case "failed":
      return "FAILED"
    default:
      return null
  }
}

/** Extract normalized delivery events from a Meta webhook payload. Unknown shapes → []. */
export function parseMetaStatusEvents(payload: unknown): MetaStatusEvent[] {
  const events: MetaStatusEvent[] = []
  if (!payload || typeof payload !== "object") return events
  const entries = (payload as { entry?: unknown }).entry
  if (!Array.isArray(entries)) return events

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown }).changes
    if (!Array.isArray(changes)) continue
    for (const change of changes) {
      const value = (change as { value?: unknown }).value
      const statuses = (value as { statuses?: unknown } | undefined)?.statuses
      if (!Array.isArray(statuses)) continue
      for (const s of statuses) {
        const obj = s as Record<string, unknown>
        const wamid = typeof obj.id === "string" ? obj.id : null
        const status = mapStatus(obj.status)
        if (!wamid || !status) continue

        const tsRaw = obj.timestamp
        const tsNum =
          typeof tsRaw === "string"
            ? Number(tsRaw)
            : typeof tsRaw === "number"
              ? tsRaw
              : NaN

        let errorCode: string | null = null
        let errorTitle: string | null = null
        const errors = obj.errors
        if (Array.isArray(errors) && errors.length > 0) {
          const e = errors[0] as Record<string, unknown>
          errorCode = e.code != null ? String(e.code) : null
          errorTitle =
            typeof e.title === "string"
              ? e.title
              : typeof e.message === "string"
                ? e.message
                : null
        }

        events.push({
          wamid,
          status,
          timestamp: Number.isFinite(tsNum) ? tsNum : null,
          errorCode,
          errorTitle,
        })
      }
    }
  }
  return events
}

/**
 * Max identifiers per PostgREST filter. Both `select().in()` and `update().in()` put the
 * list in the URL, so an unbounded batch would blow past gateway URL limits.
 */
export const DELIVERY_BATCH_SIZE = 100

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Collapse to one event per wamid, keeping the highest-ranked status. A single payload can
 * carry both `delivered` and `read` for the same message — applying them in arrival order
 * would cost two writes and, if they arrived out of order, the rank guard would drop the
 * better one.
 */
export function dedupeStatusEvents(events: MetaStatusEvent[]): MetaStatusEvent[] {
  const best = new Map<string, MetaStatusEvent>()
  for (const e of events) {
    const prev = best.get(e.wamid)
    if (!prev || DELIVERY_STATUS_RANK[e.status] > DELIVERY_STATUS_RANK[prev.status]) {
      best.set(e.wamid, e)
    }
  }
  return [...best.values()]
}

export interface DeliveryUpdatePlan {
  ids: string[]
  status: MessageDeliveryStatus
  timestampIso: string
  errorCode: string | null
  errorTitle: string | null
}

/**
 * Decide which rows move forward, grouped so every row sharing an identical patch updates
 * in one statement. A bulk read marks hundreds of messages at the same instant, so in
 * practice this collapses to a handful of groups regardless of batch size.
 *
 * Ordering within a group is irrelevant; `ids` is what the caller filters on.
 */
export function planDeliveryUpdates(
  events: MetaStatusEvent[],
  current: { id: string; wamid: string; status: MessageDeliveryStatus }[],
  nowIso: string
): DeliveryUpdatePlan[] {
  const byWamid = new Map(current.map((r) => [r.wamid, r]))
  const groups = new Map<string, DeliveryUpdatePlan>()

  for (const e of events) {
    const row = byWamid.get(e.wamid)
    if (!row) continue
    // Forward progress only — never let a late callback downgrade a better state.
    if (DELIVERY_STATUS_RANK[e.status] <= DELIVERY_STATUS_RANK[row.status]) continue

    const timestampIso = e.timestamp
      ? new Date(e.timestamp * 1000).toISOString()
      : nowIso
    const errorCode = e.status === "FAILED" ? e.errorCode : null
    const errorTitle = e.status === "FAILED" ? e.errorTitle : null

    const key = `${e.status}|${timestampIso}|${errorCode ?? ""}|${errorTitle ?? ""}`
    const existing = groups.get(key)
    if (existing) existing.ids.push(row.id)
    else groups.set(key, { ids: [row.id], status: e.status, timestampIso, errorCode, errorTitle })
  }

  return [...groups.values()]
}

/** Statuses a row may currently hold and still be moved forward to `target`. */
export function statusesBelow(target: MessageDeliveryStatus): MessageDeliveryStatus[] {
  const rank = DELIVERY_STATUS_RANK[target]
  return (Object.keys(DELIVERY_STATUS_RANK) as MessageDeliveryStatus[]).filter(
    (s) => DELIVERY_STATUS_RANK[s] < rank
  )
}
