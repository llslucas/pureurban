import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'
import { PaperProvider } from 'react-native-paper'

import { darkPalette, lightPalette } from '@/lib/palette'
import {
  type AppTheme,
  darkNavigationTheme,
  darkTheme,
  lightNavigationTheme,
  lightTheme,
  themeFor,
  useAppTheme,
  useThemedStyles,
} from '@/lib/theme'
import { typography } from '@/lib/tokens'

// No casts on purpose: this file fails `tsc` if AppTheme stops typing either field.
function Consumer() {
  const theme = useAppTheme()
  const gutter: number = theme.custom.spacing.gutter
  const display = theme.fonts.displaySmall
  return (
    <Text testID="consumer">
      {JSON.stringify({ gutter, display })}
    </Text>
  )
}

describe('useAppTheme', () => {
  it('exposes custom tokens and the Inter typescale under PaperProvider', () => {
    render(
      <PaperProvider theme={lightTheme}>
        <Consumer />
      </PaperProvider>,
    )
    const { gutter, display } = JSON.parse(
      String(screen.getByTestId('consumer').props.children),
    ) as { gutter: number; display: object }
    expect(gutter).toBe(16)
    expect(display).toMatchObject(typography.displayCount)
  })
})

describe('themeFor — OS scheme → Paper + navigation themes', () => {
  it.each([
    ['light', lightTheme, lightNavigationTheme],
    ['dark', darkTheme, darkNavigationTheme],
    [null, lightTheme, lightNavigationTheme],
    ['unspecified', lightTheme, lightNavigationTheme],
    [undefined, lightTheme, lightNavigationTheme],
  ] as const)('%s', (scheme, paper, navigation) => {
    expect(themeFor(scheme)).toEqual({ paper, navigation })
  })
})

describe('useAppTheme fallback', () => {
  it('outside a PaperProvider resolves to the app light theme (with custom)', () => {
    render(<Consumer />)
    const { gutter } = JSON.parse(String(screen.getByTestId('consumer').props.children)) as { gutter: number }
    expect(gutter).toBe(16)
  })
})

describe('useThemedStyles', () => {
  let calls = 0
  const factory = ({ custom: { palette } }: AppTheme) => {
    calls += 1
    return { color: palette.surface }
  }

  function Probe() {
    const styles = useThemedStyles(factory)
    return <Text testID="probe">{styles.color}</Text>
  }

  it('reuses the styles while the theme holds and rebuilds when it flips', () => {
    calls = 0
    const { rerender } = render(
      <PaperProvider theme={lightTheme}>
        <Probe />
      </PaperProvider>,
    )
    expect(screen.getByTestId('probe')).toHaveTextContent(lightPalette.surface)
    rerender(
      <PaperProvider theme={lightTheme}>
        <Probe />
      </PaperProvider>,
    )
    expect(calls).toBe(1)
    rerender(
      <PaperProvider theme={darkTheme}>
        <Probe />
      </PaperProvider>,
    )
    expect(screen.getByTestId('probe')).toHaveTextContent(darkPalette.surface)
    expect(calls).toBe(2)
  })
})
