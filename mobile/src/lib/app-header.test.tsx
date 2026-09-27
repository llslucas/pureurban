import { render, screen } from '@testing-library/react-native'
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { PaperProvider } from 'react-native-paper'

import type { TestNode } from '@/components/ui/test-utils'
import { useAppHeaderOptions } from '@/lib/app-header'
import { darkPalette, lightPalette } from '@/lib/palette'
import { darkTheme, lightTheme } from '@/lib/theme'

function Probe() {
  const options: NativeStackNavigationOptions = useAppHeaderOptions()
  const Background = options.headerBackground as () => React.ReactElement
  return (
    <View testID="header-probe" accessibilityLabel={String(options.headerTintColor)}>
      <Background />
    </View>
  )
}

describe('useAppHeaderOptions', () => {
  it.each([
    ['light', lightTheme, lightPalette],
    ['dark', darkTheme, darkPalette],
  ] as const)('%s: tint, background and divider follow the scheme palette', (_, theme, palette) => {
    render(
      <PaperProvider theme={theme}>
        <Probe />
      </PaperProvider>,
    )
    const probe = screen.getByTestId('header-probe')
    expect(probe.props.accessibilityLabel).toBe(palette.text)
    // HeaderBackground renders a bare View: find it as the probe's only host child.
    const [background] = probe.findAll((node: TestNode) => node.type === View && node !== probe).map((node: TestNode) =>
      StyleSheet.flatten(node.props.style),
    )
    expect(background).toMatchObject({
      backgroundColor: palette.canvas,
      borderBottomColor: palette.hairline,
      borderBottomWidth: 1,
    })
  })
})
