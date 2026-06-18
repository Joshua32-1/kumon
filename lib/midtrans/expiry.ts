// Pure Snap-page / expiry time math (extracted from features/payments/service.ts).
// `now` and `expiryHours` are parameters so the predicates are deterministic in
// tests; the service supplies `getMidtransPageExpiryHours()` and the default now.

/** Parse a Midtrans timestamp ("YYYY-MM-DD HH:MM:SS" in WIB, or ISO) to epoch ms. */
export function parseMidtransExpiryTime(expiryTime: string): number {
  if (expiryTime.includes("T")) return new Date(expiryTime).getTime()
  return new Date(`${expiryTime.replace(" ", "T")}+07:00`).getTime()
}

export function isExpiryTimeInFuture(
  expiryTime: string | undefined,
  now: number = Date.now()
): boolean {
  if (!expiryTime) return false
  return parseMidtransExpiryTime(expiryTime) > now
}

/** True while a Snap page created at `snapCreatedAt` is still within its lifetime. */
export function isWithinSnapPageWindow(
  snapCreatedAt: string | null,
  expiryHours: number,
  now: number = Date.now()
): boolean {
  if (!snapCreatedAt) return false
  const expiryMs = expiryHours * 60 * 60 * 1000
  return now - new Date(snapCreatedAt).getTime() < expiryMs
}
