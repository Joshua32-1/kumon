// Midtrans Snap + Core API (server-side only)
// Requires MIDTRANS_SERVER_KEY env var.

let _snap: MidtransSnap | null = null
let _core: MidtransCore | null = null

interface MidtransSnap {
  createTransaction(params: object): Promise<{ token: string; redirect_url: string }>
}

export interface MidtransTransactionStatus {
  order_id: string
  transaction_status: string
  fraud_status?: string
  transaction_id?: string
  gross_amount: string
  expiry_time?: string
}

interface MidtransCore {
  transaction: {
    expire(orderId: string): Promise<unknown>
    status(orderId: string): Promise<MidtransTransactionStatus>
  }
}

export function getMidtransSnap(): MidtransSnap {
  if (!_snap) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const midtransClient = require("midtrans-client")
    _snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
    }) as MidtransSnap
  }
  return _snap
}

function getMidtransCore(): MidtransCore {
  if (!_core) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const midtransClient = require("midtrans-client")
    _core = new midtransClient.CoreApi({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
    }) as MidtransCore
  }
  return _core
}

/** Fetch transaction status from Midtrans Core API (for reconciliation). */
export async function getMidtransTransactionStatus(
  orderId: string
): Promise<MidtransTransactionStatus | null> {
  try {
    const response = await getMidtransCore().transaction.status(orderId)
    return response as MidtransTransactionStatus
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : undefined
    const message = err instanceof Error ? err.message : String(err)
    if (statusCode === 404 || message.toLowerCase().includes("doesn't exist")) {
      return null
    }
    throw err
  }
}

/** Best-effort expire so stale Snap links are less likely to accept payment. */
export async function invalidateMidtransOrder(orderId: string | null | undefined): Promise<void> {
  if (!orderId) return
  try {
    await getMidtransCore().transaction.expire(orderId)
  } catch (err) {
    console.warn(`Midtrans expire failed for ${orderId}:`, err)
  }
}

export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  incomingSignature: string
): boolean {
  // Fail closed when the server key or signature is missing. Without this, an
  // unset MIDTRANS_SERVER_KEY (route falls back to "") lets anyone forge a
  // settlement by hashing over an empty key and mark invoices PAID.
  if (!serverKey || !incomingSignature) return false
  const crypto = require("crypto")
  const expected = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex")
  // Constant-time comparison. Compare on BYTE length (not JS string length):
  // timingSafeEqual throws if the buffers differ in byte length, and a
  // multi-byte incoming signature could match string-length while differing in
  // bytes. Mismatched length is itself a fail, so returning false is correct.
  const expectedBuf = Buffer.from(expected, "utf8")
  const incomingBuf = Buffer.from(incomingSignature, "utf8")
  if (expectedBuf.length !== incomingBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, incomingBuf)
}
