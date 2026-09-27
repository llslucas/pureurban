import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { PermissionCard } from '@/components/ui/permission-card'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { lightElevation as elevation, radius } from '@/lib/tokens'

const hidden = { includeHiddenElements: true }

function buttonColor(testID: string): unknown {
  let node = screen.getByTestId(testID).parent
  let color: unknown
  while (node && color === undefined) {
    color = StyleSheet.flatten(node.props.style)?.backgroundColor
    node = node.parent
  }
  return color
}

describe('PermissionCard', () => {
  it('level-1 card with a 40dp decorative icon, a header title, the text and the action', async () => {
    const onPress = jest.fn()
    await renderUi(
      <PermissionCard
        icon="camera"
        title="Permissão da câmera"
        description="O PureUrban precisa da câmera."
        actionLabel="Permitir acesso à câmera"
        onPress={onPress}
        testID="card"
      />,
    )
    expect(StyleSheet.flatten(screen.getByTestId('card').props.style)).toMatchObject({
      ...elevation.level1,
      borderRadius: radius.lg,
    })
    const icon = screen
      .getByTestId('card')
      .findAll((node: TestNode) => typeof node.props.name === 'string')[0]
    expect(icon.props).toMatchObject({ name: 'camera', size: 40 })
    expect(screen.getByTestId('card-icon', hidden)).toBeTruthy()
    expect(screen.queryByTestId('card-icon')).toBeNull()
    expect(screen.getByRole('header', { name: 'Permissão da câmera' })).toBeTruthy()
    expect(screen.getByText('O PureUrban precisa da câmera.')).toBeTruthy()
    fireEvent.press(screen.getByTestId('card-action'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('primary by default; secondary on request', async () => {
    const view = await renderUi(
      <PermissionCard icon="camera" title="t" description="d" actionLabel="a" onPress={jest.fn()} actionTestID="act" />,
    )
    expect(buttonColor('act')).toBe(lightPalette.primary)
    view.unmount()
    await renderUi(
      <PermissionCard
        icon="camera"
        title="t"
        description="d"
        actionLabel="a"
        onPress={jest.fn()}
        variant="secondary"
        actionTestID="act"
      />,
    )
    expect(buttonColor('act')).toBe(lightPalette.canvas)
  })

  it('shows the note in error red only when there is one', async () => {
    const view = await renderUi(
      <PermissionCard icon="camera" title="t" description="d" actionLabel="a" onPress={jest.fn()} note={null} />,
    )
    expect(screen.getAllByText(/./).map((n) => n.props.children)).toEqual(['t', 'd', 'a'])
    view.unmount()
    await renderUi(
      <PermissionCard icon="camera" title="t" description="d" actionLabel="a" onPress={jest.fn()} note="Falhou" />,
    )
    expect(StyleSheet.flatten(screen.getByText('Falhou').props.style).color).toBe(lightPalette.error)
  })
})
