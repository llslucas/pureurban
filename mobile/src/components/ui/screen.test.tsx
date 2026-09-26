import { screen } from '@testing-library/react-native'
import React from 'react'
import { RefreshControl, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'

import { Screen } from '@/components/ui/screen'
import { renderUi } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { spacing } from '@/lib/tokens'

describe('Screen', () => {
  it('fixed: surface-soft background, gutter and centered 560 column', async () => {
    await renderUi(
      <Screen>
        <Text>Conteúdo</Text>
      </Screen>,
    )
    expect(screen.getByText('Conteúdo')).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByTestId('screen').props.style).backgroundColor).toBe(
      lightPalette.surfaceSoft,
    )
    expect(StyleSheet.flatten(screen.getByTestId('screen-content').props.style)).toMatchObject({
      padding: spacing.gutter,
      maxWidth: spacing.contentMaxWidth,
      alignSelf: 'center',
    })
    expect(screen.queryByTestId('screen-scroll')).toBeNull()
  })

  it('never pads the top edge (the native header covers it)', async () => {
    await renderUi(
      <Screen>
        <Text>c</Text>
      </Screen>,
    )
    expect(screen.getByTestId('screen').props.edges).toMatchObject({ top: 'off', bottom: 'additive', left: 'additive', right: 'additive' })
  })

  it('with a footer, the bottom inset is left to the footer', async () => {
    await renderUi(
      <Screen footer={<Text>Rodapé</Text>}>
        <Text>c</Text>
      </Screen>,
    )
    expect(screen.getByText('Rodapé')).toBeTruthy()
    expect(screen.getByTestId('screen').props.edges).toMatchObject({ top: 'off', bottom: 'off' })
  })

  it('scroll: content in a ScrollView carrying the refresh control', async () => {
    const onRefresh = jest.fn()
    await renderUi(
      <Screen variant="scroll" refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}>
        <Text>Lista</Text>
      </Screen>,
    )
    const scroll = screen.getByTestId('screen-scroll')
    expect(scroll.props.refreshControl).toBeTruthy()
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
      padding: spacing.gutter,
      maxWidth: spacing.contentMaxWidth,
    })
    expect(screen.getByText('Lista')).toBeTruthy()
  })
})
