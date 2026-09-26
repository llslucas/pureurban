import { fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import React from 'react'
import { StyleSheet } from 'react-native'

import { ScanHud } from '@/components/scan/scan-hud'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { spacing } from '@/lib/tokens'

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }))

// Paper puts `contentStyle` on a View above the label; walk up to it.
function contentMinHeight(label: string): number | undefined {
  let node: TestNode | null = screen.getByText(label).parent
  while (node) {
    const minHeight = StyleSheet.flatten(node.props.style)?.minHeight
    if (typeof minHeight === 'number') return minHeight
    node = node.parent
  }
  return undefined
}

beforeEach(() => jest.clearAllMocks())

describe('ScanHud', () => {
  it('shows the trip count as number, denominator and "embarcados" in separate texts', async () => {
    await renderUi(<ScanHud count={{ boarded: 12, total: 38 }} sessionCount={1} />)
    expect(screen.getByText('12/38')).toBeTruthy()
    expect(screen.getByText('/38')).toBeTruthy()
    expect(screen.getByText('embarcados')).toBeTruthy()
    // The trip and list screens own "12/38 embarcados" and "12 de 38 embarcados".
    expect(screen.queryByText('12/38 embarcados')).toBeNull()
    expect(screen.getByLabelText('12 embarcados de 38 na viagem')).toBeTruthy()
    expect(screen.queryByLabelText(/\d+ de \d+ embarcados/)).toBeNull()
  })

  it('shows "—" while the roster is unknown', async () => {
    await renderUi(<ScanHud count={undefined} sessionCount={0} />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByLabelText('Contagem de embarque indisponível')).toBeTruthy()
  })

  it.each([
    [0, '0 embarques nesta sessão'],
    [1, '1 embarque nesta sessão'],
    [3, '3 embarques nesta sessão'],
  ])('session line for %i', async (sessionCount, text) => {
    await renderUi(<ScanHud count={{ boarded: 0, total: 4 }} sessionCount={sessionCount} />)
    expect(screen.getByText(text)).toBeTruthy()
  })

  it('"Ver lista" is a 48dp button that navigates to the roster', async () => {
    await renderUi(<ScanHud count={{ boarded: 0, total: 4 }} sessionCount={0} />)
    expect(contentMinHeight('Ver lista')).toBe(spacing.touchMin)
    fireEvent.press(screen.getByRole('button', { name: 'Ver lista' }))
    expect(router.navigate).toHaveBeenCalledWith('/(driver)/student-list')
  })
})
