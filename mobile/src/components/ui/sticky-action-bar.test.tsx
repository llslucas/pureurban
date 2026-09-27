import { act, screen } from '@testing-library/react-native'
import React from 'react'
import { Keyboard, Platform, StyleSheet } from 'react-native'

import { PrimaryAction } from '@/components/ui/primary-action'
import { StickyActionBar } from '@/components/ui/sticky-action-bar'
import { renderUi, TEST_INSETS } from '@/components/ui/test-utils'
import { lightElevation as elevation, spacing } from '@/lib/tokens'

type Listener = () => void
const [SHOW, HIDE] =
  Platform.OS === 'ios' ? ['keyboardWillShow', 'keyboardWillHide'] : ['keyboardDidShow', 'keyboardDidHide']
const listeners: Record<string, Listener[]> = {}

beforeEach(() => {
  for (const key of Object.keys(listeners)) delete listeners[key]
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: Listener) => {
    ;(listeners[event] ??= []).push(listener)
    return { remove: jest.fn() }
  }) as unknown as typeof Keyboard.addListener)
})

afterEach(() => jest.restoreAllMocks())

function emit(event: string) {
  act(() => listeners[event]?.forEach((listener) => listener()))
}

async function renderBar() {
  await renderUi(
    <StickyActionBar>
      <PrimaryAction variant="secondary" label="Ver lista" onPress={jest.fn()} testID="secondary" />
      <PrimaryAction label="Escanear" onPress={jest.fn()} testID="primary" />
    </StickyActionBar>,
  )
}

describe('StickyActionBar', () => {
  it('stacks the actions on a level-2 canvas strip padded by the bottom inset', async () => {
    await renderBar()
    expect(screen.getByText('Ver lista')).toBeTruthy()
    expect(screen.getByText('Escanear')).toBeTruthy()
    const style = StyleSheet.flatten(screen.getByTestId('sticky-action-bar').props.style)
    expect(style).toMatchObject({
      backgroundColor: elevation.level2.backgroundColor,
      shadowOpacity: elevation.level2.shadowOpacity,
      paddingTop: spacing[4],
      paddingBottom: spacing[4] + TEST_INSETS.bottom,
    })
  })

  it('hides while the keyboard is open and comes back when it closes', async () => {
    await renderBar()
    emit(SHOW)
    expect(screen.queryByTestId('sticky-action-bar')).toBeNull()
    emit(HIDE)
    expect(screen.getByTestId('sticky-action-bar')).toBeTruthy()
  })
})
