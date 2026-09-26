import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'
import { PaperProvider } from 'react-native-paper'

import { lightTheme, useAppTheme } from '@/lib/theme'
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
