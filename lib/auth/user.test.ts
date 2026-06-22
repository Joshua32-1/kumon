import { describe, it, expect, vi, beforeEach } from "vitest"

const getUser = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}))

import { requireUser } from "./user"

describe("requireUser", () => {
  beforeEach(() => getUser.mockReset())

  it("returns null when a user is present", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null })
    expect(await requireUser()).toBeNull()
  })

  it("returns a 401 UNAUTHORIZED envelope when no user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await requireUser()
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    expect(await res!.json()).toEqual({
      data: null,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    })
  })

  it("returns 401 when the user is null even if an error is set", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "jwt expired" } })
    const res = await requireUser()
    expect(res!.status).toBe(401)
  })
})
