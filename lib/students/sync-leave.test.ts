import { describe, it, expect } from "vitest"
import { buildLeaveExclusionFilter } from "@/lib/students/sync-leave"

describe("buildLeaveExclusionFilter", () => {
  it("returns null for an empty list so the caller can skip the clause", () => {
    expect(buildLeaveExclusionFilter([])).toBeNull()
  })

  it("quotes a single id", () => {
    expect(buildLeaveExclusionFilter(["abc"])).toBe('("abc")')
  })

  it("quotes and comma-joins multiple ids", () => {
    expect(buildLeaveExclusionFilter(["a", "b", "c"])).toBe('("a","b","c")')
  })

  it("wraps realistic UUIDs in double quotes", () => {
    const ids = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]
    expect(buildLeaveExclusionFilter(ids)).toBe(
      '("11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222")'
    )
  })
})
