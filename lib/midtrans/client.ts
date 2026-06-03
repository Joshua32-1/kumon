// Midtrans Snap client (server-side only)
// Uses midtrans-client package. Requires MIDTRANS_SERVER_KEY env var.

let _snap: MidtransSnap | null = null

interface MidtransSnap {
  createTransaction(params: object): Promise<{ token: string; redirect_url: string }>
}

export function getMidtransSnap(): MidtransSnap {
  if (!_snap) {
    // Dynamic require to avoid issues with Edge runtime
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

export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  incomingSignature: string
): boolean {
  const crypto = require("crypto")
  const hash = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex")
  return hash === incomingSignature
}
