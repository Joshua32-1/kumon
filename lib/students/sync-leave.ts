/**
 * Builds the PostgREST `not in` filter value used by the daily leave-status sync
 * to reactivate students who have no leave row for the current month. Returns
 * `null` for an empty list so the caller can skip the `.not()` clause entirely.
 *
 * The UUID list goes into the PostgREST query string — fine at single-center
 * scale (tens of concurrent leaves), revisit if that assumption breaks.
 */
export function buildLeaveExclusionFilter(onLeaveIds: string[]): string | null {
  if (onLeaveIds.length === 0) return null
  return `(${onLeaveIds.map((id) => `"${id}"`).join(",")})`
}
