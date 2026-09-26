import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { renderUi } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { spacing } from '@/lib/tokens'

async function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = jest.fn()
  const onDismiss = jest.fn()
  await renderUi(
    <ConfirmDialog
      visible
      title="Encerrar viagem?"
      message="Os alunos deixam de ser registrados."
      confirmLabel="Encerrar viagem"
      onConfirm={onConfirm}
      onDismiss={onDismiss}
      {...props}
    />,
  )
  return { onConfirm, onDismiss }
}

function minHeightOf(testID: string): unknown {
  let node = screen.getByTestId(`${testID}-text`).parent
  while (node) {
    const minHeight = StyleSheet.flatten(node.props.style)?.minHeight
    if (minHeight !== undefined) return minHeight
    node = node.parent
  }
  return undefined
}

describe('ConfirmDialog', () => {
  it('renders title, message and both actions ≥ 48dp', async () => {
    await renderDialog()
    expect(screen.getByText('Encerrar viagem?')).toBeTruthy()
    expect(screen.getByText('Os alunos deixam de ser registrados.')).toBeTruthy()
    expect(minHeightOf('confirm-dialog-cancel')).toBeGreaterThanOrEqual(spacing.touchMin)
    expect(minHeightOf('confirm-dialog-confirm')).toBeGreaterThanOrEqual(spacing.touchMin)
  })

  it('"Voltar" dismisses and the verb confirms', async () => {
    const { onConfirm, onDismiss } = await renderDialog()
    fireEvent.press(screen.getByText('Voltar'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByText('Encerrar viagem'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('confirm is primary by default and danger when destructive', async () => {
    await renderDialog()
    expect(StyleSheet.flatten(screen.getByTestId('confirm-dialog-confirm-container').props.style).backgroundColor).toBe(
      lightPalette.primary,
    )
  })

  it('destructive paints the confirm red', async () => {
    await renderDialog({ destructive: true })
    expect(StyleSheet.flatten(screen.getByTestId('confirm-dialog-confirm-container').props.style).backgroundColor).toBe(
      lightPalette.error,
    )
  })

  it('loading blocks both a second confirm and backing out', async () => {
    const { onConfirm, onDismiss } = await renderDialog({ loading: true })
    fireEvent.press(screen.getByText('Encerrar viagem'))
    fireEvent.press(screen.getByText('Voltar'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('renders nothing while hidden', async () => {
    await renderDialog({ visible: false })
    expect(screen.queryByText('Encerrar viagem?')).toBeNull()
  })
})
