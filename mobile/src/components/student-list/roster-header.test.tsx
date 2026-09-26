import { screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { RosterHeader, rosterLegend } from '@/components/student-list/roster-header'
import { renderUi } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import type { BoardingStatus, TripStudentItem } from '@/services/trip.service'

function studentsWith(...statuses: BoardingStatus[]): TripStudentItem[] {
  return statuses.map((status, i) => ({
    studentId: `student-${i}`,
    name: `Aluno ${i}`,
    status,
    checkedInAt: null,
  }))
}

describe('rosterLegend', () => {
  it('counts boarded and waiting from the summary and not-returning from the rows', () => {
    const students = studentsWith('CHECKED_IN', 'NOT_CHECKED_IN')
    expect(rosterLegend(students, { boarded: 1, total: 2 })).toBe(
      '1 embarcou · 0 não vão voltar · 1 aguardando',
    )
  })

  it('pluralizes and keeps "aguardando" invariable', () => {
    const students = studentsWith('CHECKED_IN', 'CHECKED_IN', 'NOT_RETURNING', 'NOT_RETURNING', 'NOT_CHECKED_IN')
    expect(rosterLegend(students, { boarded: 2, total: 3 })).toBe(
      '2 embarcaram · 2 não vão voltar · 1 aguardando',
    )
  })

  it('singular for one not-returning student', () => {
    const students = studentsWith('CHECKED_IN', 'NOT_RETURNING')
    expect(rosterLegend(students, { boarded: 1, total: 1 })).toBe(
      '1 embarcou · 1 não vai voltar · 0 aguardando',
    )
  })

  it('waiting follows the summary even when the rows disagree (cache between event and refetch)', () => {
    const students = studentsWith('NOT_CHECKED_IN', 'NOT_CHECKED_IN', 'NOT_CHECKED_IN')
    expect(rosterLegend(students, { boarded: 0, total: 5 })).toBe(
      '0 embarcaram · 0 não vão voltar · 5 aguardando',
    )
  })

  it('never shows a negative waiting count', () => {
    expect(rosterLegend([], { boarded: 3, total: 2 })).toBe('3 embarcaram · 0 não vão voltar · 0 aguardando')
  })

  it('empty roster keeps all three terms', () => {
    expect(rosterLegend([], { boarded: 0, total: 0 })).toBe('0 embarcaram · 0 não vão voltar · 0 aguardando')
  })
})

describe('RosterHeader', () => {
  it('shows the server count in the BoardingCounter and the legend below it', async () => {
    await renderUi(
      <RosterHeader summary={{ boarded: 1, total: 2 }} students={studentsWith('CHECKED_IN', 'NOT_CHECKED_IN')} />,
    )
    expect(screen.getByTestId('roster-counter').props.accessibilityLabel).toBe('1 de 2 embarcados')
    expect(screen.getByTestId('roster-legend')).toHaveTextContent('1 embarcou · 0 não vão voltar · 1 aguardando')
    expect(StyleSheet.flatten(screen.getByTestId('roster-legend').props.style).color).toBe(lightPalette.textMuted)
  })

  it('never renders the "X/Y embarcados" sentence', async () => {
    await renderUi(<RosterHeader summary={{ boarded: 1, total: 2 }} students={studentsWith('CHECKED_IN')} />)
    expect(screen.queryByText(/\d+\/\d+ embarcados/)).toBeNull()
  })
})
