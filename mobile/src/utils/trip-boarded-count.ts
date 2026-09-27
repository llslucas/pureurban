import type { BoardingStatus, TripStudents } from '@/services/trip.service'

export interface TripBoardedCount {
  boarded: number
  total: number
}

/**
 * Trip-wide count for the scan HUD: the cached server summary plus this
 * session's check-ins the roster doesn't show as CHECKED_IN yet. Counting ids,
 * not a blind +1, keeps a check-in from counting twice once the invalidated
 * roster comes back with it; queued ones keep adding until the queue drains.
 */
export function tripBoardedCount(
  roster: TripStudents | undefined,
  sessionStudentIds: Iterable<string>,
): TripBoardedCount | undefined {
  if (!roster) return undefined
  const idsWith = (status: BoardingStatus) =>
    new Set(roster.students.filter((s) => s.status === status).map((s) => s.studentId))
  const checkedIn = idsWith('CHECKED_IN')
  const notReturning = idsWith('NOT_RETURNING')
  let pending = 0
  let rejoined = 0
  for (const id of new Set(sessionStudentIds)) {
    if (checkedIn.has(id)) continue
    pending += 1
    // The summary leaves NOT_RETURNING students out of the total, but the API
    // counts one who boards anyway on both sides (get-trip-students use-case).
    if (notReturning.has(id)) rejoined += 1
  }
  // A queued check-in the server later rejects stays pending here; never show 39/38.
  const total = roster.summary.total + rejoined
  return { boarded: Math.min(roster.summary.boarded + pending, total), total }
}
