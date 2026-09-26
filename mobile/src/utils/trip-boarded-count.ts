import type { TripStudents } from '@/services/trip.service'

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
  const checkedIn = new Set(
    roster.students.filter((s) => s.status === 'CHECKED_IN').map((s) => s.studentId),
  )
  let pending = 0
  for (const id of new Set(sessionStudentIds)) {
    if (!checkedIn.has(id)) pending += 1
  }
  return { boarded: roster.summary.boarded + pending, total: roster.summary.total }
}
