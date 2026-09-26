import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { BoardingCounter, type BoardingSummary } from '@/components/ui/boarding-counter'
import { lightPalette } from '@/lib/palette'
import { spacing, typography } from '@/lib/tokens'
import type { TripStudentItem } from '@/services/trip.service'

// "Waiting" comes from the summary, not from counting NOT_CHECKED_IN rows, so it
// agrees with the counter while the cache sits between an SSE event and its refetch.
// The server exposes no not-returning total, so that one is counted from the rows.
export function rosterLegend(
  students: readonly Pick<TripStudentItem, 'status'>[],
  summary: BoardingSummary,
): string {
  const boarded = summary.boarded
  const notReturning = students.filter((s) => s.status === 'NOT_RETURNING').length
  const waiting = Math.max(0, summary.total - summary.boarded)
  return [
    `${boarded} ${boarded === 1 ? 'embarcou' : 'embarcaram'}`,
    `${notReturning} ${notReturning === 1 ? 'não vai voltar' : 'não vão voltar'}`,
    `${waiting} aguardando`,
  ].join(' · ')
}

interface RosterHeaderProps {
  summary: BoardingSummary
  students: readonly TripStudentItem[]
}

export function RosterHeader({ summary, students }: RosterHeaderProps) {
  return (
    <View style={styles.header}>
      <BoardingCounter summary={summary} testID="roster-counter" />
      <Text style={styles.legend} testID="roster-legend">
        {rosterLegend(students, summary)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    gap: spacing[2],
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    backgroundColor: lightPalette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightPalette.hairline,
  },
  legend: {
    ...typography.body,
    color: lightPalette.textMuted,
  },
})
