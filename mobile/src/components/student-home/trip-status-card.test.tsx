import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, Text } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { STATE_FADE_MS, TripStatusCard } from '@/components/student-home/trip-status-card'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { motion, radius, typography } from '@/lib/tokens'

const hidden = { includeHiddenElements: true }

afterEach(() => {
  jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false)
  jest.restoreAllMocks()
})

describe('TripStatusCard', () => {
  it('level-1 card with the uppercase "Viagem de volta" overline', async () => {
    await renderUi(<TripStatusCard stateKey="none" detail="Carregando sua viagem..." />)
    const card = StyleSheet.flatten(screen.getByTestId('trip-status-card').props.style)
    expect(card).toMatchObject({
      backgroundColor: lightPalette.canvas,
      borderColor: lightPalette.hairline,
      borderRadius: radius.lg,
    })
    const overline = screen.getByText('Viagem de volta')
    expect(StyleSheet.flatten(overline.props.style).textTransform).toBe('uppercase')
    expect(screen.getByText('Carregando sua viagem...')).toBeTruthy()
  })

  it('renders chip, title, detail, caption and children', async () => {
    await renderUi(
      <TripStatusCard
        stateKey="waiting"
        chip={{ label: 'Aguardando', icon: 'clock-outline', tone: 'neutral' }}
        title="Viagem de volta em andamento"
        detail="detalhe"
        caption="Iniciada às 18:00"
      >
        <Text>filho</Text>
      </TripStatusCard>,
    )
    expect(screen.getByText('Aguardando')).toBeTruthy()
    const icon = screen
      .getByTestId('trip-status-card-chip', hidden)
      .findAll((node: TestNode) => node.props.name === 'clock-outline')
    expect(icon.length).toBeGreaterThan(0)
    const title = screen.getByText('Viagem de volta em andamento')
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(typography.title.fontSize)
    expect(screen.getByText('detalhe')).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByText('Iniciada às 18:00').props.style).fontSize).toBe(
      typography.caption.fontSize,
    )
    expect(screen.getByText('filho')).toBeTruthy()
  })

  it('without chip there is no chip', async () => {
    await renderUi(<TripStatusCard stateKey="none" detail="d" />)
    expect(screen.queryByTestId('trip-status-card-chip')).toBeNull()
  })

  it('fades in over 250ms and replays when the state changes', async () => {
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    const { rerender } = render(<TripStatusCard stateKey="waiting" title="a" />)
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: STATE_FADE_MS })
    expect(STATE_FADE_MS).toBe(250)

    rerender(<TripStatusCard stateKey="waiting" title="b" />)
    expect(withTiming).toHaveBeenCalledTimes(1)

    rerender(<TripStatusCard stateKey="registered" title="c" />)
    expect(withTiming).toHaveBeenCalledTimes(2)
  })

  it('reduced motion: 120ms cross-fade', async () => {
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true)
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    render(<TripStatusCard stateKey="waiting" title="a" />)
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: motion.reduced })
  })
})
