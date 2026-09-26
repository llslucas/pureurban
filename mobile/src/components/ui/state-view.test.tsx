import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { StateView } from '@/components/ui/state-view'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { spacing } from '@/lib/tokens'

function iconName(testID = 'state-view-icon'): string | undefined {
  const circle = screen.getByTestId(testID, { includeHiddenElements: true })
  return circle.findAll((node: TestNode) => typeof node.props.name === 'string')[0]?.props.name
}

describe('StateView', () => {
  it('loading: spinner and title, no icon and no action', async () => {
    await renderUi(<StateView kind="loading" title="Carregando alunos..." />)
    expect(screen.getByText('Carregando alunos...')).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByTestId('state-view-icon', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByTestId('state-view-action')).toBeNull()
  })

  it('loading ignores an action (nothing to act on yet)', async () => {
    await renderUi(<StateView kind="loading" title="Carregando..." action={{ label: 'X', onPress: jest.fn() }} />)
    expect(screen.queryByText('X')).toBeNull()
  })

  it.each([
    ['error', 'cloud-alert'],
    ['blocked', 'lock-outline'],
    ['empty', 'information-outline'],
  ] as const)('%s defaults to the %s icon in a circle', async (kind, icon) => {
    await renderUi(<StateView kind={kind} title="Título" />)
    expect(iconName()).toBe(icon)
    const circle = StyleSheet.flatten(screen.getByTestId('state-view-icon', { includeHiddenElements: true }).props.style)
    expect(circle).toMatchObject({ width: 88, height: 88, backgroundColor: lightPalette.surfaceStrong })
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('a custom icon overrides the default', async () => {
    await renderUi(<StateView kind="empty" title="Nenhuma viagem" icon="bus-clock" />)
    expect(iconName()).toBe('bus-clock')
  })

  it('the icon stays out of the accessibility tree', async () => {
    await renderUi(<StateView kind="error" title="Falhou" />)
    expect(screen.getByTestId('state-view-icon', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('error with action: title, detail and a 56dp PrimaryAction', async () => {
    const onPress = jest.fn()
    await renderUi(
      <StateView
        kind="error"
        title="Não foi possível carregar a lista"
        detail="Verifique sua conexão e tente novamente."
        action={{ label: 'Tentar novamente', onPress }}
      />,
    )
    expect(screen.getByText('Não foi possível carregar a lista')).toBeTruthy()
    expect(screen.getByText('Verifique sua conexão e tente novamente.')).toBeTruthy()
    let node = screen.getByTestId('state-view-action-text').parent
    let minHeight: unknown
    while (node && minHeight === undefined) {
      minHeight = StyleSheet.flatten(node.props.style)?.minHeight
      node = node.parent
    }
    expect(minHeight).toBe(spacing.actionHeight)
    fireEvent.press(screen.getByText('Tentar novamente'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('without action there is no button', async () => {
    await renderUi(
      <StateView
        kind="empty"
        title="Nenhuma viagem ativa no momento"
        detail="Esta tela atualiza sozinha quando o motorista iniciar a viagem."
      />,
    )
    expect(screen.queryByTestId('state-view-action')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('note shows in bold error red when it is a non-empty string', async () => {
    await renderUi(<StateView kind="blocked" title="Câmera bloqueada" note="Falhou ao abrir" />)
    const note = StyleSheet.flatten(screen.getByText('Falhou ao abrir').props.style)
    expect(note.color).toBe(lightPalette.error)
    expect(note.fontWeight).toBe('700')
  })

  it.each([null, undefined, ''])('note %p renders nothing', async (note) => {
    await renderUi(<StateView kind="blocked" title="Câmera bloqueada" detail="d" note={note} />)
    expect(screen.getAllByText(/./).map((n) => n.props.children)).toEqual(['Câmera bloqueada', 'd'])
  })

  it('sits on the surface-soft background', async () => {
    await renderUi(<StateView kind="blocked" title="Acesso restrito" />)
    expect(StyleSheet.flatten(screen.getByTestId('state-view').props.style).backgroundColor).toBe(
      lightPalette.surfaceSoft,
    )
  })
})
