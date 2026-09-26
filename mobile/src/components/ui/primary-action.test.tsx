import { fireEvent, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { PrimaryAction, type PrimaryActionVariant } from '@/components/ui/primary-action'
import { renderUi } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { motion, spacing } from '@/lib/tokens'

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }))

const mockSelection = jest.mocked(Haptics.selectionAsync)

async function renderAction(props: Partial<React.ComponentProps<typeof PrimaryAction>> = {}) {
  const onPress = jest.fn()
  await renderUi(<PrimaryAction label="Tentar novamente" onPress={onPress} {...props} />)
  return onPress
}

// Paper puts `contentStyle` on a View above the label; walk up to it.
function contentMinHeight(testID = 'primary-action'): number | undefined {
  let node = screen.getByTestId(`${testID}-text`).parent
  while (node) {
    const minHeight = StyleSheet.flatten(node.props.style)?.minHeight
    if (typeof minHeight === 'number') return minHeight
    node = node.parent
  }
  return undefined
}

function containerStyle(testID = 'primary-action') {
  return StyleSheet.flatten(screen.getByTestId(`${testID}-container`).props.style)
}

beforeEach(() => jest.clearAllMocks())

afterEach(() => {
  jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false)
  jest.restoreAllMocks()
})

describe('PrimaryAction', () => {
  it('renders the label and fires onPress', async () => {
    const onPress = await renderAction()
    fireEvent.press(screen.getByText('Tentar novamente'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it.each<[PrimaryActionVariant, number]>([
    ['primary', spacing.actionHeight],
    ['secondary', spacing.actionHeight],
    ['danger', spacing.actionHeight],
    ['on-color', spacing.actionHeight],
    ['quiet', spacing.touchMin],
  ])('%s is at least %idp tall', async (variant, height) => {
    await renderAction({ variant })
    expect(contentMinHeight()).toBe(height)
    expect(contentMinHeight()).toBeGreaterThanOrEqual(spacing.touchMin)
  })

  it.each<[PrimaryActionVariant, string | undefined]>([
    ['primary', lightPalette.primary],
    ['danger', lightPalette.error],
    ['on-color', lightPalette.onPrimary],
    ['secondary', lightPalette.canvas],
  ])('%s paints the palette role', async (variant, background) => {
    await renderAction({ variant })
    expect(containerStyle().backgroundColor).toBe(background)
  })

  it('secondary uses the strong border (hairline misses 3:1)', async () => {
    await renderAction({ variant: 'secondary' })
    expect(containerStyle().borderColor).toBe(lightPalette.borderStrong)
  })

  it('on-color takes the overlay tone as the label color', async () => {
    await renderAction({ variant: 'on-color', color: lightPalette.success })
    const label = StyleSheet.flatten(screen.getByTestId('primary-action-text').props.style)
    expect(label.color).toBe(lightPalette.success)
  })

  it('loading swaps the icon for a spinner, keeps the label and swallows presses', async () => {
    const onPress = await renderAction({ loading: true, icon: 'refresh' })
    expect(screen.getByText('Tentar novamente')).toBeTruthy()
    expect(screen.queryByTestId('primary-action-icon-container')).toBeNull()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    fireEvent.press(screen.getByText('Tentar novamente'))
    fireEvent.press(screen.getByText('Tentar novamente'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('forwards id to the button container (the DOM id on web)', async () => {
    await renderAction({ id: 'login-submit' })
    expect(screen.getByTestId('primary-action-container').props.id).toBe('login-submit')
  })

  it('shows the MDI icon when idle', async () => {
    await renderAction({ icon: 'refresh' })
    expect(screen.getByTestId('primary-action-icon-container')).toBeTruthy()
  })

  it('disabled does not fire', async () => {
    const onPress = await renderAction({ disabled: true })
    fireEvent.press(screen.getByText('Tentar novamente'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('haptic only on impact actions', async () => {
    await renderAction()
    fireEvent.press(screen.getByText('Tentar novamente'))
    expect(mockSelection).not.toHaveBeenCalled()
  })

  it('impact fires a selection haptic and ignores its failure', async () => {
    mockSelection.mockRejectedValueOnce(new Error('no haptics'))
    const onPress = await renderAction({ impact: true })
    fireEvent.press(screen.getByText('Tentar novamente'))
    expect(mockSelection).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('press scales to 0.97 and back', async () => {
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderAction()
    fireEvent(screen.getByTestId('primary-action'), 'pressIn')
    fireEvent(screen.getByTestId('primary-action'), 'pressOut')
    expect(withTiming.mock.calls.map(([value]) => value)).toEqual([motion.pressScale, 1])
  })

  it.each([{ loading: true }, { disabled: true }])('%p does not scale on press', async (props) => {
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderAction(props)
    fireEvent(screen.getByTestId('primary-action'), 'pressIn')
    expect(withTiming).not.toHaveBeenCalled()
  })

  it('reduced motion: pressing does not scale', async () => {
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true)
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderAction()
    fireEvent(screen.getByTestId('primary-action'), 'pressIn')
    fireEvent(screen.getByTestId('primary-action'), 'pressOut')
    expect(withTiming).not.toHaveBeenCalled()
  })
})
