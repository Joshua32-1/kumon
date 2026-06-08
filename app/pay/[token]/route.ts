import { type NextRequest, NextResponse } from "next/server"
import { paymentService } from "@/features/payments/service"
import { AppError } from "@/lib/errors"

function payMessageHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #fafafa; color: #1a1a1a; }
    main { max-width: 28rem; margin: 4rem auto; padding: 1.5rem; background: #fff; border-radius: 12px; border: 1px solid #e5e5e5; }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { margin: 0; line-height: 1.5; color: #525252; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${body}</p>
  </main>
</body>
</html>`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const outcome = await paymentService.resolvePayPage(token)

    if (outcome.kind === "redirect") {
      return NextResponse.redirect(outcome.url)
    }

    return new NextResponse(payMessageHtml(outcome.title, outcome.body), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  } catch (err) {
    if (err instanceof AppError) {
      return new NextResponse(
        payMessageHtml("Gagal membuka pembayaran", err.message),
        { status: err.statusCode, headers: { "Content-Type": "text/html; charset=utf-8" } }
      )
    }
    console.error("Pay page error:", err)
    return new NextResponse(
      payMessageHtml(
        "Gagal membuka pembayaran",
        "Terjadi kesalahan. Silakan coba lagi atau hubungi pusat Kumon."
      ),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  }
}
