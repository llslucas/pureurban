import { act, render, screen } from '@testing-library/react-native'
import React, { type ReactElement } from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { lightTheme } from '@/lib/theme'

export const TEST_INSETS = { top: 0, right: 0, bottom: 24, left: 0 }

// MDI glyphs load their font asynchronously and set state afterwards; flushing
// once keeps that update inside act() instead of leaking a warning per test.
export async function renderUi(element: ReactElement) {
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: TEST_INSETS }}
    >
      <PaperProvider theme={lightTheme}>{element}</PaperProvider>
    </SafeAreaProvider>,
  )
  await act(async () => {})
  return utils
}

type Rgb = [number, number, number]

function parse(color: string): { rgb: Rgb; alpha: number } {
  const value = color.trim().toLowerCase()
  if (value.startsWith('#')) {
    const raw = value.slice(1)
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
    return {
      rgb: [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)],
      alpha: 1,
    }
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/)
  if (!match) throw new Error(`unparseable color in test: ${color}`)
  const [r, g, b, a = 1] = match[1].split(',').map((p) => parseFloat(p.trim()))
  return { rgb: [r, g, b], alpha: a }
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

// Translucent tints (withAlpha) are composited over the opaque backdrop first.
export function contrastRatio(foreground: string, background: string, backdrop: string): number {
  const bg = parse(background)
  const under = parse(backdrop).rgb
  const composed = bg.rgb.map((c, i) => c * bg.alpha + under[i] * (1 - bg.alpha)) as Rgb
  const [hi, lo] = [luminance(parse(foreground).rgb), luminance(composed)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

export type TestNode = ReturnType<typeof screen.getByTestId>
