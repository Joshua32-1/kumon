import { describe, it, expect } from "vitest"
import { paymentService } from "@/features/payments/service"

// Scale test for the automated generation path. _generateMonthlyInternal takes its
// Supabase client as an injectable param, so we feed it a fake that returns N synthetic
// students and records the bulk RPC call. This verifies the batch is processed in ONE
// RPC (not N) and every eligible student is generated.

type Row = Record<string, unknown>

interface FakeOpts {
  leaves?: Row[]
  invoices?: Row[]
}

function makeFakeClient(students: Row[], opts: FakeOpts = {}) {
  const tableRows: Record<string, Row[]> = {
    students,
    temporary_leaves: opts.leaves ?? [],
    invoices: opts.invoices ?? [],
    system_config: [],
    payment_reminders: [],
  }
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

  function builder(table: string) {
    const b: Record<string, unknown> = {}
    const chain = () => b
    Object.assign(b, {
      select: chain,
      update: chain,
      insert: chain,
      upsert: chain,
      delete: chain,
      eq: chain,
      neq: chain,
      lt: chain,
      lte: chain,
      gt: chain,
      gte: chain,
      in: chain,
      not: chain,
      is: chain,
      order: chain,
      limit: chain,
      returns: chain,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (
        resolve: (v: { data: Row[]; error: null }) => unknown,
        reject?: (e: unknown) => unknown
      ) => Promise.resolve({ data: tableRows[table] ?? [], error: null }).then(resolve, reject),
    })
    return b
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      if (name === "create_invoices_with_lines") {
        const invoices = (args.p_invoices as unknown[]) ?? []
        return { data: invoices.map((_, i) => `inv-${i}`), error: null }
      }
      return { data: null, error: null }
    },
  }

  return { client, rpcCalls }
}

function makeStudents(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `stu-${i}`,
    school_level: "ELEMENTARY",
    full_name: `Student ${i}`,
    enrolled_at: "2020-01-01",
    student_subjects: [{ subject: "MATHEMATICS", enrolled_at: "2020-01-01" }],
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run(client: unknown) {
  return paymentService._generateMonthlyInternal(
    { month: 6, year: 2026 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { supabase: client as any, createdBy: null }
  )
}

describe("generateMonthly at scale", () => {
  it("generates all 500 students in a single bulk RPC", async () => {
    const { client, rpcCalls } = makeFakeClient(makeStudents(500))

    const result = await run(client)

    expect(result.generated).toBe(500)
    expect(result.invoice_ids).toHaveLength(500)

    const bulkCalls = rpcCalls.filter((c) => c.name === "create_invoices_with_lines")
    expect(bulkCalls).toHaveLength(1)
    expect((bulkCalls[0].args.p_invoices as unknown[]).length).toBe(500)
  })

  it("skips ineligible students and bulk-inserts only the rest", async () => {
    const students = [
      ...makeStudents(10), // stu-0..stu-9 eligible
      { id: "leave-1", school_level: "ELEMENTARY", enrolled_at: "2020-01-01", student_subjects: [{ subject: "MATHEMATICS", enrolled_at: "2020-01-01" }] },
      { id: "no-subj", school_level: "ELEMENTARY", enrolled_at: "2020-01-01", student_subjects: [] },
      { id: "future", school_level: "ELEMENTARY", enrolled_at: "2030-01-01", student_subjects: [{ subject: "MATHEMATICS", enrolled_at: "2030-01-01" }] },
      { id: "has-inv", school_level: "ELEMENTARY", enrolled_at: "2020-01-01", student_subjects: [{ subject: "MATHEMATICS", enrolled_at: "2020-01-01" }] },
    ]
    const { client, rpcCalls } = makeFakeClient(students, {
      leaves: [{ student_id: "leave-1" }],
      invoices: [{ student_id: "has-inv", status: "PENDING", created_at: "2026-06-01" }],
    })

    const result = await run(client)

    expect(result.generated).toBe(10)
    expect(result.skipped_on_leave).toBe(1)
    expect(result.skipped_no_subjects).toBe(1)
    expect(result.skipped_before_enrollment).toBe(1)
    expect(result.skipped_existing).toBe(1)

    const bulkCalls = rpcCalls.filter((c) => c.name === "create_invoices_with_lines")
    expect(bulkCalls).toHaveLength(1)
    expect((bulkCalls[0].args.p_invoices as unknown[]).length).toBe(10)
  })

  it("counts batch rows the bulk RPC skipped (duplicate conflicts) as skipped_existing", async () => {
    const { client, rpcCalls } = makeFakeClient(makeStudents(5))
    // Make the fake RPC return fewer ids than submitted (2 rows lost to unique_violation).
    const original = client.rpc
    client.rpc = async (name: string, args: Record<string, unknown>) => {
      const res = await original(name, args)
      if (name === "create_invoices_with_lines" && Array.isArray(res.data)) {
        return { data: res.data.slice(0, 3), error: null }
      }
      return res
    }

    const result = await run(client)

    expect(result.generated).toBe(3)
    expect(result.skipped_existing).toBe(2)
    expect(rpcCalls.filter((c) => c.name === "create_invoices_with_lines")).toHaveLength(1)
  })
})
