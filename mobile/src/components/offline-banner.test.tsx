import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { OfflineBanner } from '@/components/offline-banner'

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
})
