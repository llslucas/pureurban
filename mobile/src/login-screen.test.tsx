import { render, screen } from '@testing-library/react-native'
import React from 'react'

import LoginScreen from '@/app/(auth)/login'
import { setDiscardNotice } from '@/lib/offline-discard-notice'

// Metade de UI do AC7 (D5): o aviso de "N embarques não sincronizados
// descartados" aparece no login — a única superfície que toda saída de sessão
// atravessa (o logout do motorista hoje é programático: 401 do api-client e
// guardas de role; não há botão "Sair" no grupo do motorista). O lado produtor
// (purga + publicação do aviso) é pinado em offline-queue-lifecycle.test.ts.

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}))

// O login só lê tokens/gravadores do MMKV — nenhuma função é exercitada aqui.
jest.mock('@/lib/storage', () => ({
  tokenStorage: {
    getAccessToken: () => undefined,
    setAccessToken: jest.fn(),
    setRefreshToken: jest.fn(),
    clearTokens: jest.fn(),
  },
}))

jest.mock('@/services/auth.service', () => ({
  authService: { login: jest.fn() },
}))

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ login: jest.fn() }),
}))

describe('LoginScreen — aviso de descarte da fila no logout (D5/AC7)', () => {
  it('não exibe aviso nenhum quando o logout não descartou nada', () => {
    setDiscardNotice(Promise.resolve(null))
    render(<LoginScreen />)
    expect(screen.queryByText(/descartado/)).toBeNull()
  })

  it('avisa no singular quando 1 embarque foi descartado', async () => {
    setDiscardNotice(Promise.resolve({ count: 1 }))
    render(<LoginScreen />)

    expect(
      await screen.findByText('1 embarque não sincronizado foi descartado ao sair da conta.'),
    ).toBeTruthy()
  })

  it('avisa no plural quando N embarques foram descartados', async () => {
    setDiscardNotice(Promise.resolve({ count: 3 }))
    render(<LoginScreen />)

    expect(
      await screen.findByText('3 embarques não sincronizados foram descartados ao sair da conta.'),
    ).toBeTruthy()
  })
})
