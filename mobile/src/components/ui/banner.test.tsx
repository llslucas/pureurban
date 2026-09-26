import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'
import { useReducedMotion } from 'react-native-reanimated'

import { Banner, BANNER_TONES, type BannerTone } from '@/components/ui/banner'
import { contrastRatio, renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { motion, spacing, typography } from '@/lib/tokens'

const TONES = Object.keys(BANNER_TONES) as BannerTone[]
const hidden = { includeHiddenElements: true }

function bannerStyle() {
  return StyleSheet.flatten(screen.getByTestId('banner').props.style)
}

afterEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false)
  jest.restoreAllMocks()
})

describe('Banner', () => {
  it.each(TONES)('%s: icon, message and tone colors', async (tone) => {
    await renderUi(<Banner tone={tone} message="Pode estar desatualizado" />)
    const look = BANNER_TONES[tone]
    expect(bannerStyle().backgroundColor).toBe(look.background)
    expect(StyleSheet.flatten(screen.getByText('Pode estar desatualizado').props.style).color).toBe(look.textColor)
    const hiddenGlyphs = screen
      .getByTestId('banner', hidden)
      .findAll((node: TestNode) => node.props.name === look.icon && node.props.importantForAccessibility === 'no-hide-descendants')
    expect(hiddenGlyphs.length).toBeGreaterThan(0)
  })

  it('optional title: its own text node in label type, above the message', async () => {
    await renderUi(<Banner tone="warning" title="E a volta?" message="Você ainda não confirmou o retorno." />)
    const title = screen.getByText('E a volta?')
    const style = StyleSheet.flatten(title.props.style)
    expect(style.fontSize).toBe(typography.label.fontSize)
    expect(style.fontFamily).toBe(typography.label.fontFamily)
    expect(style.color).toBe(BANNER_TONES.warning.textColor)
    const texts = screen.getByTestId('banner').findAll((node: TestNode) => typeof node.props.children === 'string')
    const order = texts.map((node: TestNode) => node.props.children)
    expect(order.indexOf('E a volta?')).toBeLessThan(order.indexOf('Você ainda não confirmou o retorno.'))
  })

  it('without title only the message renders', async () => {
    await renderUi(<Banner tone="warning" message="m" />)
    expect(screen.queryByText('E a volta?')).toBeNull()
  })

  it('announces politely', async () => {
    await renderUi(<Banner tone="warning" message="m" />)
    expect(screen.getByTestId('banner').props.accessibilityLiveRegion).toBe('polite')
  })

  it('quiet action, at least 48dp, fires onPress', async () => {
    const onPress = jest.fn()
    await renderUi(<Banner tone="warning" message="m" action={{ label: 'Atualizar', onPress }} />)
    let node = screen.getByTestId('banner-action-text').parent
    let minHeight: unknown
    while (node && minHeight === undefined) {
      minHeight = StyleSheet.flatten(node.props.style)?.minHeight
      node = node.parent
    }
    expect(minHeight).toBe(spacing.touchMin)
    fireEvent.press(screen.getByText('Atualizar'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('error: the action label follows the on-color text', async () => {
    await renderUi(<Banner tone="error" message="m" action={{ label: 'Atualizar', onPress: jest.fn() }} />)
    expect(StyleSheet.flatten(screen.getByText('Atualizar').props.style).color).toBe(lightPalette.onPrimary)
  })

  it('without action there is no button', async () => {
    await renderUi(<Banner tone="info" message="m" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('enters with a 12dp slide', async () => {
    await renderUi(<Banner tone="warning" message="m" />)
    // The Reanimated mock evaluates the style once, at progress 0.
    expect(bannerStyle().transform).toEqual([{ translateY: -spacing[3] }])
  })

  it('animates in over motion.standard', async () => {
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderUi(<Banner tone="warning" message="m" />)
    expect(withTiming).toHaveBeenCalledWith(1, { duration: motion.standard })
  })

  it('reduced motion fades in over motion.reduced', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderUi(<Banner tone="warning" message="m" />)
    expect(withTiming).toHaveBeenCalledWith(1, { duration: motion.reduced })
  })

  it('reduced motion drops the slide', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    await renderUi(<Banner tone="warning" message="m" />)
    expect(bannerStyle().transform).toEqual([{ translateY: -0 }])
  })

  describe('contrast of text × background (composited over the canvas)', () => {
    it.each(TONES)('%s text ≥ 4.5:1', (tone) => {
      const { textColor, background } = BANNER_TONES[tone]
      expect(contrastRatio(textColor, background, lightPalette.canvas)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(TONES)('%s icon ≥ 3:1 (non-text, amber included — D3)', (tone) => {
      const { iconColor, background } = BANNER_TONES[tone]
      expect(contrastRatio(iconColor, background, lightPalette.canvas)).toBeGreaterThanOrEqual(3)
    })
  })
})
