import { screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { TripCard, type TripCardProps } from '@/components/trip/trip-card'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { radius, typography } from '@/lib/tokens'

const hidden = { includeHiddenElements: true }

function renderCard(props: Partial<TripCardProps> = {}) {
  return renderUi(
    <TripCard
      type="OUTBOUND"
      status="ACTIVE"
      routeName="Linha Centro - Universidade"
      summary={{ boarded: 3, total: 4 }}
      startedAt="2026-09-06T09:00:05.000Z"
      {...props}
    />,
  )
}

function chipIcon(): string | undefined {
  return screen
    .getByTestId('trip-card-status', hidden)
    .findAll((node: TestNode) => typeof node.props.name === 'string')[0]?.props.name
}

describe('TripCard', () => {
  it('active: type overline, route name, "Em andamento" chip, counter and start time without seconds', async () => {
    await renderCard()
    const overline = screen.getByText('Viagem de ida')
    expect(StyleSheet.flatten(overline.props.style).textTransform).toBe('uppercase')
    const name = screen.getByText('Linha Centro - Universidade')
    expect(StyleSheet.flatten(name.props.style).fontSize).toBe(typography.titleLg.fontSize)
    expect(screen.getByText('Em andamento')).toBeTruthy()
    expect(chipIcon()).toBe('progress-clock')
    expect(screen.getByText('3/4')).toBeTruthy()
    expect(screen.getByText(/^Iniciada às \d{2}:\d{2}$/)).toBeTruthy()
  })

  it('return trip reads "Viagem de retorno"', async () => {
    await renderCard({ type: 'RETURN' })
    expect(screen.getByText('Viagem de retorno')).toBeTruthy()
  })

  it('completed: "Concluída" chip with flag-checkered, final count, no start time', async () => {
    await renderCard({ status: 'COMPLETED' })
    expect(screen.getByText('Concluída')).toBeTruthy()
    expect(chipIcon()).toBe('flag-checkered')
    expect(screen.getByText('3/4')).toBeTruthy()
    expect(screen.queryByText(/Iniciada às/)).toBeNull()
  })

  it('empty class: hides the counter and says so', async () => {
    await renderCard({ summary: { boarded: 0, total: 0 } })
    expect(screen.getByText('Nenhum aluno nesta rota')).toBeTruthy()
    expect(screen.queryByTestId('boarding-counter')).toBeNull()
  })

  it('summary still loading: counter shows "—"', async () => {
    await renderCard({ summary: undefined })
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('is a level-1 card: canvas, hairline border, radius lg', async () => {
    await renderCard()
    expect(StyleSheet.flatten(screen.getByTestId('trip-card').props.style)).toMatchObject({
      backgroundColor: lightPalette.canvas,
      borderColor: lightPalette.hairline,
      borderWidth: 1,
      borderRadius: radius.lg,
    })
  })
})
