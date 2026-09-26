import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { SHORTCUT_HEIGHT, ShortcutCard } from '@/components/student-home/shortcut-card'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { motion, radius, typography } from '@/lib/tokens'

const hidden = { includeHiddenElements: true }

async function renderCard() {
  const onPress = jest.fn()
  await renderUi(<ShortcutCard label="Meu QR" icon="qrcode" onPress={onPress} />)
  return onPress
}

afterEach(() => {
  jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false)
  jest.restoreAllMocks()
})

describe('ShortcutCard', () => {
  it('is a button named by its label and fires onPress', async () => {
    const onPress = await renderCard()
    const button = screen.getByRole('button', { name: 'Meu QR' })
    fireEvent.press(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('level-1 card, 112dp tall, large radius, stretching to share the row', async () => {
    await renderCard()
    const card = StyleSheet.flatten(screen.getByTestId('shortcut-card').props.style)
    expect(card).toMatchObject({
      minHeight: SHORTCUT_HEIGHT,
      borderRadius: radius.lg,
      backgroundColor: lightPalette.canvas,
      borderColor: lightPalette.hairline,
      borderWidth: 1,
    })
    expect(SHORTCUT_HEIGHT).toBe(112)
    expect(StyleSheet.flatten(screen.getByTestId('shortcut-card-slot').props.style).flex).toBe(1)
  })

  it('32dp MDI icon and a title-type label', async () => {
    await renderCard()
    const icon = screen
      .getByTestId('shortcut-card', hidden)
      .findAll((node: TestNode) => node.props.name === 'qrcode' && typeof node.props.size === 'number')[0]
    expect(icon.props.size).toBe(32)
    expect(StyleSheet.flatten(screen.getByText('Meu QR').props.style).fontSize).toBe(typography.title.fontSize)
  })

  it('press scales to 0.97 and back', async () => {
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderCard()
    fireEvent(screen.getByTestId('shortcut-card'), 'pressIn')
    fireEvent(screen.getByTestId('shortcut-card'), 'pressOut')
    expect(withTiming.mock.calls.map(([value]) => value)).toEqual([motion.pressScale, 1])
  })

  it('reduced motion: pressing does not scale', async () => {
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true)
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderCard()
    fireEvent(screen.getByTestId('shortcut-card'), 'pressIn')
    fireEvent(screen.getByTestId('shortcut-card'), 'pressOut')
    expect(withTiming).not.toHaveBeenCalled()
  })
})
