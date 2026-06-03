"use client"

import { use } from "react"
import useSWR from "swr"
import Link from "next/link"
import { PageHeader } from "@/components/shared/PageHeader"
import { InvoiceCard } from "@/features/payments/components/InvoiceCard"
import { Button } from "@/components/ui/button"

const fetcher = (url: string) => fetch(url).then((r) => r.json()).then((r) => r.data)

interface PageProps {
  params: Promise<{ id: string }>
}

export default function PaymentDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { data: invoice, isLoading, mutate } = useSWR(`/api/payments/${id}`, fetcher)

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">Memuat...</div>
  }

  if (!invoice) {
    return <div className="text-muted-foreground py-12 text-center text-sm">Tagihan tidak ditemukan.</div>
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Link href="/payments">
          <Button variant="ghost" size="sm">← Kembali</Button>
        </Link>
      </div>
      <PageHeader
        title={`Tagihan ${invoice.students?.full_name}`}
        description={`ID: ${invoice.id}`}
      />
      <div className="max-w-lg">
        <InvoiceCard invoice={invoice} onUpdate={() => mutate()} />
      </div>
    </>
  )
}
