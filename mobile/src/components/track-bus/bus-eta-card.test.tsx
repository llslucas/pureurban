import { screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { BusEtaCard, type BusEtaCardProps, signalLossLabel } from '@/components/track-bus/bus-eta-card'
import { chipTones } from '@/components/ui/status-chip'
import { renderUi } from '@/components/ui/test-utils'
import { lightPalette, lightStatusTints } from '@/lib/palette'
import { radius, typography } from '@/lib/tokens'

const BASE: BusEtaCardProps = {
  eta: '~8 min',
  distance: '2,4 km de você',
  freshness: { kind: 'live' },
  caption: 'Última posição às 21:04 · precisão ~15 m',
  captionAccessibilityLabel: 'Última posição às 21:04, em -20.75555, -42.88173, precisão de cerca de 15 metros',
}

const hidden = { includeHiddenElements: true }
const CHIP_TONES = chipTones(lightPalette, lightStatusTints)

function style(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style)
}

afterEach(() => {
  jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false)
})

describe('signalLossLabel', () => {
  it('omits the minutes below one minute and floors them from there', () => {
    expect(signalLossLabel(0)).toBe('Sem sinal GPS')
    expect(signalLossLabel(0.9)).toBe('Sem sinal GPS')
    expect(signalLossLabel(1)).toBe('Sem sinal GPS há 1 min')
    expect(signalLossLabel(3.7)).toBe('Sem sinal GPS há 3 min')
  })
})

describe('BusEtaCard', () => {
  it('live: level-1 card with ETA in display-count, distance in title and the "Ao vivo" chip', async () => {
    await renderUi(<BusEtaCard {...BASE} />)

    expect(style('bus-eta-card')).toMatchObject({
      backgroundColor: lightPalette.canvas,
      borderColor: lightPalette.hairline,
      borderRadius: radius.lg,
    })
    expect(screen.getByText('Ônibus da sua rota')).toBeTruthy()

    expect(screen.getByTestId('bus-eta-value').props.children).toBe('~8 min')
    expect(screen.getByLabelText('Tempo estimado de chegada: ~8 min')).toBeTruthy()
    expect(style('bus-eta-value')).toMatchObject({
      fontSize: typography.displayCount.fontSize,
      fontVariant: ['tabular-nums'],
      color: lightPalette.text,
    })
    expect(style('bus-eta-distance')).toMatchObject({ fontSize: typography.title.fontSize })
    expect(screen.getByText('2,4 km de você')).toBeTruthy()

    expect(screen.getByTestId('bus-eta-live')).toBeTruthy()
    expect(screen.getByText('Ao vivo')).toBeTruthy()
    expect(style('bus-eta-live').backgroundColor).toBe(CHIP_TONES.success.background)
    expect(screen.getByTestId('bus-eta-live-halo', hidden)).toBeTruthy()
    expect(screen.queryByTestId('bus-eta-stale')).toBeNull()
  })

  it('stale under a minute: warning chip "Sem sinal GPS" instead of "Ao vivo"', async () => {
    await renderUi(<BusEtaCard {...BASE} freshness={{ kind: 'stale', minutes: 0 }} />)

    expect(screen.getByTestId('bus-eta-stale')).toBeTruthy()
    expect(screen.getByText('Sem sinal GPS')).toBeTruthy()
    expect(style('bus-eta-stale').backgroundColor).toBe(CHIP_TONES.warning.background)
    expect(screen.queryByTestId('bus-eta-live')).toBeNull()
    // The last point stays on screen.
    expect(screen.getByText('~8 min')).toBeTruthy()
  })

  it('stale for 3 minutes: "Sem sinal GPS há 3 min"', async () => {
    await renderUi(<BusEtaCard {...BASE} freshness={{ kind: 'stale', minutes: 3 }} />)
    expect(screen.getByText('Sem sinal GPS há 3 min')).toBeTruthy()
  })

  it('missing ETA keeps the hero shape with "—" and shows the pending line', async () => {
    await renderUi(
      <BusEtaCard
        {...BASE}
        eta={null}
        distance={null}
        pendingLine="Capturando sua localização para calcular a distância..."
      />,
    )
    expect(screen.getByTestId('bus-eta-value').props.children).toBe('—')
    expect(screen.getByLabelText('Tempo estimado indisponível')).toBeTruthy()
    expect(screen.queryByTestId('bus-eta-distance')).toBeNull()
    expect(screen.getByText('Capturando sua localização para calcular a distância...')).toBeTruthy()
  })

  it('caption in muted caption type, with the coordinates only in its accessibility label', async () => {
    await renderUi(<BusEtaCard {...BASE} />)

    const caption = screen.getByTestId('bus-eta-caption')
    expect(caption.props.children).toBe(BASE.caption)
    expect(caption.props.accessibilityLabel).toBe(BASE.captionAccessibilityLabel)
    expect(style('bus-eta-caption')).toMatchObject({
      fontSize: typography.caption.fontSize,
      color: lightPalette.textMuted,
    })
    expect(screen.queryByText(/-20\.75555/)).toBeNull()
    expect(screen.getByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
  })

  it('no text is dimmed with opacity', async () => {
    await renderUi(<BusEtaCard {...BASE} />)
    for (const id of ['bus-eta-value', 'bus-eta-distance', 'bus-eta-caption']) {
      expect(style(id).opacity).toBeUndefined()
    }
  })

  it('reduced motion: static dot, no pulsing halo', async () => {
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true)
    const withRepeat = jest.spyOn(Reanimated, 'withRepeat')

    await renderUi(<BusEtaCard {...BASE} />)

    expect(screen.getByTestId('bus-eta-live-dot', hidden)).toBeTruthy()
    expect(screen.queryByTestId('bus-eta-live-halo', hidden)).toBeNull()
    expect(withRepeat).not.toHaveBeenCalled()
    withRepeat.mockRestore()
  })
})
