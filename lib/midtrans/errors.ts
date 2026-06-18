// Pure error-classification helpers for Midtrans calls (extracted from
// features/payments/service.ts so the retry policy can be unit-tested).

export function getErrorStatusCode(err: unknown): number | undefined {
  if (err && typeof err === "object" && "statusCode" in err) {
    return (err as { statusCode: number }).statusCode
  }
  return undefined
}

export function isRetryableMidtransError(err: unknown): boolean {
  const statusCode = getErrorStatusCode(err)
  if (
    statusCode === 429 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504
  ) {
    return true
  }
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    message.includes("rate limit") ||
    message.includes("too many") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  )
}
