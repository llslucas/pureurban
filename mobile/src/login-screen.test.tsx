import { act, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import React from 'react'
import { Keyboard, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import LoginScreen from '@/app/(auth)/login'
import { BANNER_TONES } from '@/components/ui/banner'
import { renderUi } from '@/components/ui/test-utils'
import { setDiscardNotice } from '@/lib/offline-discard-notice'
import { tokenStorage } from '@/lib/storage'
import { motion } from '@/lib/tokens'
import { authService } from '@/services/auth.service'

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

const mockStoreLogin = jest.fn()
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ login: mockStoreLogin }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  setDiscardNotice(Promise.resolve(null))
})

describe('LoginScreen — aviso de descarte da fila no logout (D5/AC7)', () => {
  it('não exibe aviso nenhum quando o logout não descartou nada', async () => {
    setDiscardNotice(Promise.resolve(null))
    await renderUi(<LoginScreen />)
    expect(screen.queryByText(/descartado/)).toBeNull()
    expect(screen.queryByTestId('login-discard-notice')).toBeNull()
  })

  it('avisa no singular quando 1 embarque foi descartado', async () => {
    setDiscardNotice(Promise.resolve({ count: 1 }))
    await renderUi(<LoginScreen />)

    expect(
      await screen.findByText('1 embarque não sincronizado foi descartado ao sair da conta.'),
    ).toBeTruthy()
  })

  it('avisa no plural quando N embarques foram descartados', async () => {
    setDiscardNotice(Promise.resolve({ count: 3 }))
    await renderUi(<LoginScreen />)

    expect(
      await screen.findByText('3 embarques não sincronizados foram descartados ao sair da conta.'),
    ).toBeTruthy()
  })
})

describe('LoginScreen — apresentação (story 6.4)', () => {
  it('mostra a marca no hero: wordmark e tagline', async () => {
    await renderUi(<LoginScreen />)
    expect(screen.getByText('PureUrban')).toBeTruthy()
    expect(screen.getByText('Embarque sem carteirinha')).toBeTruthy()
  })

  it('o aviso de descarte usa o Banner warning', async () => {
    setDiscardNotice(Promise.resolve({ count: 2 }))
    await renderUi(<LoginScreen />)
    const banner = await screen.findByTestId('login-discard-notice')
    expect(StyleSheet.flatten(banner.props.style).backgroundColor).toBe(
      BANNER_TONES.warning.background,
    )
  })

  it('campo vazio mostra o Banner de erro e não chama o authService', async () => {
    await renderUi(<LoginScreen />)
    fireEvent.press(screen.getByText('Entrar'))

    expect(await screen.findByText('Preencha email e senha para continuar.')).toBeTruthy()
    expect(screen.getByTestId('login-error')).toBeTruthy()
    expect(authService.login).not.toHaveBeenCalled()
  })

  it('o olho alterna o rótulo acessível entre mostrar e ocultar a senha', async () => {
    await renderUi(<LoginScreen />)
    fireEvent.press(screen.getByLabelText('Mostrar senha'))
    expect(screen.getByLabelText('Ocultar senha')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Ocultar senha'))
    expect(screen.getByLabelText('Mostrar senha')).toBeTruthy()
  })
})

describe('LoginScreen — erros do login no Banner', () => {
  async function fill(email = 'Motorista@PureUrban.com', password = 'segredo') {
    await renderUi(<LoginScreen />)
    fireEvent.changeText(screen.UNSAFE_getByProps({ id: 'login-email' }), email)
    fireEvent.changeText(screen.UNSAFE_getByProps({ id: 'login-password' }), password)
  }

  // Awaiting inside act lets handleLogin's `finally` settle before asserting.
  async function submit(email?: string, password?: string) {
    await fill(email, password)
    await act(async () => {
      fireEvent.press(screen.getByText('Entrar'))
    })
  }

  function loginResult(role: string) {
    return {
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', role },
    } as unknown as Awaited<ReturnType<typeof authService.login>>
  }

  it('mostra a mensagem do servidor quando o login falha', async () => {
    jest.mocked(authService.login).mockRejectedValue(new Error('Credenciais inválidas.'))
    await submit()

    expect(await screen.findByText('Credenciais inválidas.')).toBeTruthy()
    expect(screen.getByTestId('login-error')).toBeTruthy()
    expect(authService.login).toHaveBeenCalledWith('motorista@pureurban.com', 'segredo')
  })

  it('usa a mensagem genérica quando a falha não é um Error', async () => {
    jest.mocked(authService.login).mockRejectedValue('boom')
    await submit()

    expect(await screen.findByText('Erro ao fazer login. Tente novamente.')).toBeTruthy()
  })

  it('perfil sem destino limpa os tokens e avisa no Banner', async () => {
    jest.mocked(authService.login).mockResolvedValue(loginResult('GUEST'))
    await submit()

    expect(await screen.findByText('Perfil de usuário não suportado neste aplicativo.')).toBeTruthy()
    expect(tokenStorage.clearTokens).toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('motorista autenticado grava os tokens, loga no store e vai para a viagem', async () => {
    const result = loginResult('DRIVER')
    jest.mocked(authService.login).mockResolvedValue(result)
    await submit()

    expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('a')
    expect(tokenStorage.setRefreshToken).toHaveBeenCalledWith('r')
    expect(mockStoreLogin).toHaveBeenCalledWith(result.user)
    expect(router.replace).toHaveBeenCalledWith('/(driver)/trip')
  })

  it('engole o segundo toque em Entrar enquanto o login está pendente', async () => {
    jest.mocked(authService.login).mockReturnValue(new Promise(() => {}))
    await fill()
    await act(async () => {
      fireEvent.press(screen.getByText('Entrar'))
    })
    await act(async () => {
      fireEvent.press(screen.getByText('Entrar'))
    })

    expect(authService.login).toHaveBeenCalledTimes(1)
  })
})

describe('LoginScreen — hero encolhe com o teclado', () => {
  type Listener = () => void
  const [SHOW, HIDE] =
    Platform.OS === 'ios' ? ['keyboardWillShow', 'keyboardWillHide'] : ['keyboardDidShow', 'keyboardDidHide']
  const listeners: Record<string, Listener[]> = {}

  beforeEach(() => {
    for (const key of Object.keys(listeners)) delete listeners[key]
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: Listener) => {
      ;(listeners[event] ??= []).push(listener)
      return { remove: jest.fn() }
    }) as unknown as typeof Keyboard.addListener)
  })

  afterEach(() => {
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(false)
    jest.restoreAllMocks()
  })

  const emit = (event: string) => act(() => listeners[event]?.forEach((listener) => listener()))

  // The Reanimated mock doesn't re-evaluate animated styles, so pin the target
  // the hero animates to: 1 = compact, 0 = full.
  it('encolhe o hero ao abrir o teclado e restaura ao fechar', async () => {
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderUi(<LoginScreen />)

    withTiming.mockClear()
    emit(SHOW)
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: motion.standard })

    emit(HIDE)
    expect(withTiming).toHaveBeenLastCalledWith(0, { duration: motion.standard })
  })

  it('com reduzir movimento, encolhe na duração curta', async () => {
    jest.mocked(Reanimated.useReducedMotion).mockReturnValue(true)
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderUi(<LoginScreen />)

    withTiming.mockClear()
    emit(SHOW)
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: motion.reduced })
  })
})
