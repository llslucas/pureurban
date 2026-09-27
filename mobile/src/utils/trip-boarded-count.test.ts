import type { TripStudents } from '@/services/trip.service'
import { tripBoardedCount } from '@/utils/trip-boarded-count'

function roster(boarded: number, total: number, checkedIn: string[] = [], notReturning: string[] = []): TripStudents {
  return {
    students: [
      ...checkedIn.map((studentId) => ({
        studentId,
        name: studentId,
        status: 'CHECKED_IN' as const,
        checkedInAt: '2026-09-26T21:00:00.000Z',
      })),
      ...notReturning.map((studentId) => ({
        studentId,
        name: studentId,
        status: 'NOT_RETURNING' as const,
        checkedInAt: null,
      })),
      { studentId: 'ana', name: 'Ana Souza', status: 'NOT_CHECKED_IN', checkedInAt: null },
    ],
    summary: { boarded, total },
  }
}

describe('tripBoardedCount', () => {
  it('is undefined without a roster (the HUD shows "—")', () => {
    expect(tripBoardedCount(undefined, ['ana'])).toBeUndefined()
  })

  it('adds this session\'s check-ins the roster does not reflect yet', () => {
    expect(tripBoardedCount(roster(11, 38), ['ana'])).toEqual({ boarded: 12, total: 38 })
  })

  it('does not count twice once the refetched roster shows the student CHECKED_IN', () => {
    expect(tripBoardedCount(roster(12, 38, ['ana']), ['ana'])).toEqual({ boarded: 12, total: 38 })
  })

  it('counts a repeated id once', () => {
    expect(tripBoardedCount(roster(0, 4), ['ana', 'ana'])).toEqual({ boarded: 1, total: 4 })
  })

  it('never exceeds the trip total', () => {
    expect(tripBoardedCount(roster(38, 38), ['ana', 'ghost'])).toEqual({ boarded: 38, total: 38 })
  })

  it('is the server summary alone with no session check-ins', () => {
    expect(tripBoardedCount(roster(3, 4), [])).toEqual({ boarded: 3, total: 4 })
  })

  it('a NOT_RETURNING student who boards anyway joins the total too (R6)', () => {
    expect(tripBoardedCount(roster(30, 31, [], ['bia']), ['bia'])).toEqual({ boarded: 31, total: 32 })
  })

  it('does not count the rejoined student twice once the roster shows them CHECKED_IN', () => {
    expect(tripBoardedCount(roster(31, 32, ['bia']), ['bia'])).toEqual({ boarded: 31, total: 32 })
  })

  it('an id outside the roster still only adds to boarded, capped by the total', () => {
    expect(tripBoardedCount(roster(30, 31, [], ['bia']), ['ghost', 'other'])).toEqual({ boarded: 31, total: 31 })
  })
})
