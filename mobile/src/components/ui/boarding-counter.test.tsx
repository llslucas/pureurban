import { screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { BoardingCounter } from '@/components/ui/boarding-counter'
import { renderUi } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { motion, typography } from '@/lib/tokens'

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style)
}

afterEach(() => {
  jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false)
  jest.restoreAllMocks()
})

describe('BoardingCounter', () => {
  it('shows boarded/total as the hero number with the "embarcados" caption', async () => {
    await renderUi(<BoardingCounter summary={{ boarded: 3, total: 4 }} />)
    expect(screen.getByText('3/4')).toBeTruthy()
    expect(screen.getByText('embarcados')).toBeTruthy()
    expect(screen.getByLabelText('3 de 4 embarcados')).toBeTruthy()
  })

  it('uses tabular display-count capped at 1.5x font scale, denominator muted', async () => {
    await renderUi(<BoardingCounter summary={{ boarded: 3, total: 4 }} />)
    const count = screen.getByTestId('boarding-counter-value')
    const style = StyleSheet.flatten(count.props.style)
    expect(style.fontSize).toBe(typography.displayCount.fontSize)
    expect(style.fontVariant).toEqual(['tabular-nums'])
    expect(count.props.maxFontSizeMultiplier).toBe(1.5)
    expect(StyleSheet.flatten(screen.getByText('/4').props.style).color).toBe(lightPalette.textMuted)
  })

  it('shows "—" and an empty bar while the summary is undefined', async () => {
    await renderUi(<BoardingCounter summary={undefined} />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(styleOf('boarding-counter-fill').width).toBe('0%')
  })

  it('bar: 8dp surfaceStrong track, success fill at the boarded ratio', async () => {
    await renderUi(<BoardingCounter summary={{ boarded: 3, total: 4 }} />)
    expect(styleOf('boarding-counter-track')).toMatchObject({
      height: 8,
      backgroundColor: lightPalette.surfaceStrong,
    })
    expect(styleOf('boarding-counter-fill')).toMatchObject({
      backgroundColor: lightPalette.success,
      width: '75%',
    })
  })

  it('animates the bar to the new ratio in 400ms', async () => {
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    const { rerender } = await renderUi(<BoardingCounter summary={{ boarded: 1, total: 4 }} />)
    rerender(<BoardingCounter summary={{ boarded: 2, total: 4 }} />)
    expect(withTiming).toHaveBeenLastCalledWith(0.5, { duration: motion.progress })
  })

  it('reduced motion: jumps without animating', async () => {
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true)
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    const { rerender } = await renderUi(<BoardingCounter summary={{ boarded: 1, total: 4 }} />)
    rerender(<BoardingCounter summary={{ boarded: 2, total: 4 }} />)
    expect(withTiming).not.toHaveBeenCalled()
  })
})
