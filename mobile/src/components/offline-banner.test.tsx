import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { OfflineBanner } from '@/components/offline-banner'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { darkPalette, lightPalette } from '@/lib/palette'
import { darkTheme } from '@/lib/theme'
import { spacing } from '@/lib/tokens'

const hidden = { includeHiddenElements: true }

function iconIn(stripTestID: string): string | undefined {
  return screen
    .getByTestId(stripTestID)
    .findAll((node: TestNode) => typeof node.props.name === 'string')[0]?.props.name
}

// O banner é a AC da NFR13 e o único sinal visual da fila offline. Sem este
// teste, mudar o texto ou inverter a condição de visibilidade passa em silêncio.

describe('OfflineBanner', () => {
  it('com item pendente exibe o texto literal da NFR13', () => {
    render(<OfflineBanner pendingCount={1} failedCount={0} />)
    expect(screen.getByText(/Modo Offline — dados serão sincronizados/)).toBeTruthy()
  })

  it('mostra quantos embarques estão na fila, no singular e no plural', () => {
    const view = render(<OfflineBanner pendingCount={1} failedCount={0} />)
    expect(screen.getByText(/1 embarque na fila/)).toBeTruthy()

    view.rerender(<OfflineBanner pendingCount={3} failedCount={0} />)
    expect(screen.getByText(/3 embarques na fila/)).toBeTruthy()
  })

  it('some por inteiro quando não há nada pendente nem falhado', () => {
    render(<OfflineBanner pendingCount={0} failedCount={0} />)
    expect(screen.queryByText(/Modo Offline/)).toBeNull()
    expect(screen.queryByText(/Registre manualmente/)).toBeNull()
  })

  it('a falha definitiva aparece MESMO sem pendentes — é o único aviso restante', () => {
    render(<OfflineBanner pendingCount={0} failedCount={2} />)
    expect(screen.getByText(/2 embarques não puderam ser enviados\. Registre manualmente\./)).toBeTruthy()
  })

  it('com pendentes e falhas mostra as duas faixas, a falha primeiro', () => {
    render(<OfflineBanner pendingCount={2} failedCount={1} />)
    expect(screen.getByText(/1 embarque não pôde ser enviado/)).toBeTruthy()
    expect(screen.getByText(/Modo Offline/)).toBeTruthy()
  })

  it('é anunciado por leitor de tela em vez de aparecer em silêncio', () => {
    render(<OfflineBanner pendingCount={1} failedCount={0} />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('o botão "Dispensar" é focável isoladamente pelo leitor de tela (sem achatamento do container)', () => {
    render(<OfflineBanner pendingCount={0} failedCount={1} onDismissFailed={() => undefined} />)
    expect(screen.getByRole('button', { name: /dispensar/i })).toBeTruthy()
  })

  it('D1/AC6 — ciclo completo: falha → banner com "Dispensar" → toques → banner some', () => {
    const onDismissFailed = jest.fn()
    const view = render(
      <OfflineBanner pendingCount={0} failedCount={2} onDismissFailed={onDismissFailed} />,
    )
    expect(screen.getByText(/2 embarques não puderam ser enviados/)).toBeTruthy()

    fireEvent.press(screen.getByTestId('offline-banner-dismiss'))
    expect(onDismissFailed).toHaveBeenCalledTimes(1)

    // O hook responde à dispensa zerando `failedCount` — e o banner some sozinho.
    view.rerender(<OfflineBanner pendingCount={0} failedCount={0} onDismissFailed={onDismissFailed} />)
    expect(screen.queryByText(/Registre manualmente/)).toBeNull()
    expect(screen.queryByTestId('offline-banner-dismiss')).toBeNull()
  })

  it('sem a ação de dispensa o vermelho aparece sem botão (banner de só-leitura)', () => {
    render(<OfflineBanner pendingCount={0} failedCount={1} />)
    expect(screen.getByText(/1 embarque não pôde ser enviado/)).toBeTruthy()
    expect(screen.queryByTestId('offline-banner-dismiss')).toBeNull()
  })

  describe('restyle (story 6.11)', () => {
    it('pending strip: cloud-off-outline icon, hidden from assistive tech', () => {
      render(<OfflineBanner pendingCount={1} failedCount={0} />)
      expect(iconIn('offline-banner-pending')).toBe('cloud-off-outline')
      expect(screen.getByTestId('offline-banner-pending-icon', hidden)).toBeTruthy()
      expect(screen.queryByTestId('offline-banner-pending-icon')).toBeNull()
    })

    it('failure strip: alert-circle-outline icon, hidden from assistive tech', () => {
      render(<OfflineBanner pendingCount={0} failedCount={1} />)
      expect(iconIn('offline-banner-failed')).toBe('alert-circle-outline')
      expect(screen.getByTestId('offline-banner-failed-icon', hidden)).toBeTruthy()
      expect(screen.queryByTestId('offline-banner-failed-icon')).toBeNull()
    })

    it('"Dispensar" is a quiet action in onPrimary with a >= 48dp target', () => {
      render(<OfflineBanner pendingCount={0} failedCount={1} onDismissFailed={() => undefined} />)
      expect(StyleSheet.flatten(screen.getByText('Dispensar').props.style).color).toBe(lightPalette.onPrimary)
      let node = screen.getByTestId('offline-banner-dismiss-text').parent
      let minHeight: unknown
      while (node && minHeight === undefined) {
        minHeight = StyleSheet.flatten(node.props.style)?.minHeight
        node = node.parent
      }
      expect(minHeight).toBeGreaterThanOrEqual(spacing.touchMin)
    })

    it('keeps the live region on the container and never fades text with opacity', () => {
      render(<OfflineBanner pendingCount={1} failedCount={1} />)
      let node = screen.getByTestId('offline-banner-failed').parent
      while (node && node.props.accessibilityLiveRegion === undefined) node = node.parent
      expect(node?.props.accessibilityLiveRegion).toBe('polite')
      for (const text of screen.getAllByRole('alert')) {
        expect(StyleSheet.flatten(text.props.style).opacity).toBeUndefined()
      }
    })
  })
})

describe('OfflineBanner under darkTheme', () => {
  it('paints the strips and their text from the dark palette', async () => {
    await renderUi(<OfflineBanner pendingCount={1} failedCount={1} onDismissFailed={() => {}} />, darkTheme)
    expect(StyleSheet.flatten(screen.getByTestId('offline-banner-pending').props.style).backgroundColor).toBe(
      darkPalette.textBody,
    )
    expect(StyleSheet.flatten(screen.getByTestId('offline-banner-failed').props.style).backgroundColor).toBe(
      darkPalette.error,
    )
    expect(StyleSheet.flatten(screen.getByText(/Modo Offline/).props.style).color).toBe(darkPalette.onPrimary)
    expect(StyleSheet.flatten(screen.getByText('Dispensar').props.style).color).toBe(darkPalette.onPrimary)
  })
})
