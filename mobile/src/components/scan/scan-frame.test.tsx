import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { ScanFrame } from '@/components/scan/scan-frame'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette, withAlpha } from '@/lib/palette'
import { typography } from '@/lib/tokens'

function layoutWindow(height = 273) {
  const frame = screen.getByTestId('scan-frame', { includeHiddenElements: true })
  const window = frame.findAll((node: TestNode) => typeof node.props.onLayout === 'function')[0]
  fireEvent(window, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: height, height } } })
}

afterEach(() => {
  jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false)
  jest.restoreAllMocks()
})

describe('ScanFrame', () => {
  it('shows the hint below the window in white body-lg', async () => {
    await renderUi(<ScanFrame isPaused={false} />)
    const hint = screen.getByText('Aponte para o QR do aluno')
    const style = StyleSheet.flatten(hint.props.style)
    expect(style.fontSize).toBe(typography.bodyLg.fontSize)
    expect(style.color).toBe(lightPalette.onPrimary)
  })

  it('sweeps a 2dp translucent white line once the window is laid out', async () => {
    await renderUi(<ScanFrame isPaused={false} />)
    expect(screen.queryByTestId('scan-frame-line')).toBeNull()
    layoutWindow()
    const line = StyleSheet.flatten(screen.getByTestId('scan-frame-line').props.style)
    expect(line.height).toBe(2)
    expect(line.backgroundColor).toBe(withAlpha(lightPalette.onPrimary, 0.6))
  })

  it('drops the line while paused', async () => {
    await renderUi(<ScanFrame isPaused />)
    layoutWindow()
    expect(screen.queryByTestId('scan-frame-line')).toBeNull()
  })

  it('no line with reduced motion; the hint stays', async () => {
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true)
    await renderUi(<ScanFrame isPaused={false} />)
    layoutWindow()
    expect(screen.queryByTestId('scan-frame-line')).toBeNull()
    expect(screen.getByText('Aponte para o QR do aluno')).toBeTruthy()
  })

  it('never blocks touches on the camera', async () => {
    await renderUi(<ScanFrame isPaused={false} />)
    expect(screen.getByTestId('scan-frame', { includeHiddenElements: true }).props.pointerEvents).toBe('none')
  })
})
