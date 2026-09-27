import { screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { CountdownPill, formatCountdown } from '@/components/ui/countdown-pill'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette, lightStatusTints } from '@/lib/palette'
import { fontFamily, radius } from '@/lib/tokens'

const hidden = { includeHiddenElements: true }

function textStyle() {
  return StyleSheet.flatten(screen.getByTestId('countdown-pill-text').props.style)
}

describe('formatCountdown', () => {
  it.each([
    [299_000, '4:59'],
    [90_000, '1:30'],
    [60_000, '1:00'],
    [1_200, '0:02'],
    [0, '0:00'],
    [-5_000, '0:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected)
  })
})

describe('CountdownPill', () => {
  it('renders one text node "<label> M:SS" on the warning tint, with timer-sand', async () => {
    await renderUi(<CountdownPill remainingMs={299_000} label="Desfazer em" />)
    expect(screen.getByText('Desfazer em 4:59')).toBeTruthy()
    const pill = StyleSheet.flatten(screen.getByTestId('countdown-pill').props.style)
    expect(pill.backgroundColor).toBe(lightStatusTints.warning)
    expect(pill.borderRadius).toBe(radius.full)
    const icons = screen
      .getByTestId('countdown-pill', hidden)
      .findAll((node: TestNode) => node.props.name === 'timer-sand')
    expect(icons.length).toBeGreaterThan(0)
    expect(textStyle().fontVariant).toEqual(['tabular-nums'])
  })

  it('outside the last 30s the text is ink', async () => {
    await renderUi(<CountdownPill remainingMs={31_000} label="Desfazer em" />)
    expect(textStyle().color).toBe(lightPalette.text)
  })

  it('last 30s: warning bold', async () => {
    await renderUi(<CountdownPill remainingMs={30_000} label="Desfazer em" />)
    expect(textStyle()).toMatchObject({ color: lightPalette.warning, fontFamily: fontFamily.bold })
  })

  it('announces politely, per minute rather than per second', async () => {
    await renderUi(<CountdownPill remainingMs={119_000} label="Desfazer em" />)
    const pill = screen.getByTestId('countdown-pill')
    expect(pill.props.accessibilityLiveRegion).toBe('polite')
    expect(pill.props.accessibilityLabel).toBe('Desfazer em até 2 min')
  })

  it('never announces zero minutes', async () => {
    await renderUi(<CountdownPill remainingMs={0} label="Desfazer em" />)
    expect(screen.getByTestId('countdown-pill').props.accessibilityLabel).toBe('Desfazer em até 1 min')
  })
})
