"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface SettingsFormProps {
  initialConfig: Record<string, unknown>
}

function getNum(config: Record<string, unknown>, key: string, field: string): number {
  const val = config[key] as Record<string, number> | undefined
  return val?.[field] ?? 0
}

function getStr(config: Record<string, unknown>, key: string, field: string): string {
  const val = config[key] as Record<string, string> | undefined
  return val?.[field] ?? ""
}

export function SettingsForm({ initialConfig }: SettingsFormProps) {
  const [centerName, setCenterName] = useState(
    getStr(initialConfig, "center_name", "name")
  )
  const [monthlyFee, setMonthlyFee] = useState(
    String(getNum(initialConfig, "monthly_fee", "amount"))
  )
  const [maxLeaveMonths, setMaxLeaveMonths] = useState(
    String(getNum(initialConfig, "max_leave_months", "months"))
  )
  const [isLoading, setIsLoading] = useState(false)

  async function handleSave() {
    setIsLoading(true)

    const updates = [
      { key: "center_name", value: { name: centerName } },
      { key: "monthly_fee", value: { amount: Number(monthlyFee) } },
      { key: "max_leave_months", value: { months: Number(maxLeaveMonths) } },
    ]

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    })

    setIsLoading(false)

    if (!res.ok) {
      toast.error("Gagal menyimpan pengaturan.")
      return
    }
    toast.success("Pengaturan berhasil disimpan.")
  }

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi Center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="center_name">Nama Center</Label>
            <Input
              id="center_name"
              value={centerName}
              onChange={(e) => setCenterName(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pembayaran</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="monthly_fee">SPP Bulanan (IDR)</Label>
            <Input
              id="monthly_fee"
              type="number"
              value={monthlyFee}
              onChange={(e) => setMonthlyFee(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aturan Cuti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="max_leave">Maks. Bulan Cuti Berturut-turut</Label>
            <Input
              id="max_leave"
              type="number"
              value={maxLeaveMonths}
              onChange={(e) => setMaxLeaveMonths(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isLoading}>
        {isLoading ? "Menyimpan..." : "Simpan Pengaturan"}
      </Button>
    </div>
  )
}
