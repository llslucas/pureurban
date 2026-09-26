import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider as PaperProvider } from 'react-native-paper'
import { router } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import QrCodeScreen from '@/app/(student)/qr-code'
import { TEST_INSETS } from '@/components/ui/test-utils'
import { qrSessionStorage } from '@/lib/storage'
import { lightTheme } from '@/lib/theme'
import { routesService, type AssignedRoute } from '@/services/routes.service'
import { useAuthStore } from '@/stores/auth.store'
import { buildQrPayload, encodeQrPayload } from '@/utils/qr-payload'

// Lives at src/ root, not src/app/: every file under src/app/ becomes a route
// (same reason as student-home.test.tsx).

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
}))

jest.mock('@/services/routes.service', () => ({
  routesService: { getMyRoutes: jest.fn() },
}))

jest.mock('@/lib/storage', () => ({
  qrSessionStorage: { getSessionId: jest.fn() },
}))

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: jest.fn(),
}))

// Exposes the encoded value the real component would draw.
jest.mock('react-native-qrcode-svg', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native')
  return function MockQrCode(props: { value: string }) {
    return <View testID="mock-qr" {...props} />
  }
})

const mockRoutes = jest.mocked(routesService)
const mockSession = jest.mocked(qrSessionStorage)
const mockAuthStore = jest.mocked(useAuthStore)
const mockRouter = jest.mocked(router)

const STUDENT_ID = '4f1c2a9e-1111-4a2b-9c3d-0123456789ab'
const SESSION_ID = '9a8b7c6d-2222-4e5f-8a9b-abcdef012345'
const hidden = { includeHiddenElements: true }

function route(name: string, id = name): AssignedRoute {
  return {
    id,
    name,
    description: null,
    originCity: 'Centro',
    destinationCity: 'Campus',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

const calls: string[] = []

function mockUser(role: 'STUDENT' | 'DRIVER' = 'STUDENT', present = true) {
  const state = {
    user: present ? { id: STUDENT_ID, email: 'ana@escola.com', name: 'Ana Souza', role } : null,
    isAuthenticated: present,
    login: jest.fn(),
    logout: jest.fn(() => calls.push('logout')),
  }
  mockAuthStore.mockImplementation(((selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state) as never)
  return state
}

let queryClient: QueryClient

function renderScreen() {
  queryClient = new QueryClient({
    // The screen pins `retry: 2`; only the delay between attempts is zeroed.
    // `gcTime: Infinity` avoids a GC timer outliving the test.
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  })
  return render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: TEST_INSETS }}
    >
      <PaperProvider theme={lightTheme}>
        <QueryClientProvider client={queryClient}>
          <QrCodeScreen />
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  calls.length = 0
  mockRouter.replace.mockImplementation(() => {
    calls.push('replace')
  })
  mockSession.getSessionId.mockReturnValue(SESSION_ID)
  mockUser()
})

afterEach(() => {
  queryClient?.clear()
})

describe('QrCodeScreen — pass (story 6.9)', () => {
  it('renders one pass with the name, the route and the footer; QR value is the student payload', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([route('Linha Centro – Universidade')])

    renderScreen()

    expect(await screen.findByText('Linha Centro – Universidade')).toBeTruthy()
    expect(screen.getAllByTestId('qr-pass')).toHaveLength(1)
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.getByText('Mostre ao motorista')).toBeTruthy()
    expect(screen.getByTestId('mock-qr', hidden).props.value).toBe(
      encodeQrPayload(buildQrPayload(STUDENT_ID, SESSION_ID)),
    )
    expect(screen.queryByText(/🚌/)).toBeNull()
    expect(screen.queryByText('Rota')).toBeNull()
    expect(screen.queryByTestId('qr-route-more')).toBeNull()
    expect(screen.queryByTestId('qr-route-stale')).toBeNull()
  })

  it('several routes: first one plus "+N rotas"', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([route('Linha A'), route('Linha B'), route('Linha C')])

    renderScreen()

    expect(await screen.findByText('Linha A')).toBeTruthy()
    expect(screen.getByText('+2 rotas')).toBeTruthy()
  })

  it('loading: spinner line while the query is pending', async () => {
    mockRoutes.getMyRoutes.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(await screen.findByText('Carregando rota...')).toBeTruthy()
    expect(screen.getByTestId('qr-route-loading-spinner', hidden)).toBeTruthy()
    // The QR never waits for the route.
    expect(screen.getByTestId('mock-qr', hidden)).toBeTruthy()
  })

  it('offline (paused query): still "Carregando rota...", never "Nenhuma rota vinculada"', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([route('Linha Centro')])
    onlineManager.setOnline(false)
    try {
      renderScreen()

      expect(await screen.findByText('Carregando rota...')).toBeTruthy()
      expect(screen.queryByText('Nenhuma rota vinculada')).toBeNull()
      expect(mockRoutes.getMyRoutes).not.toHaveBeenCalled()
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('empty list: "Nenhuma rota vinculada"', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([])

    renderScreen()

    expect(await screen.findByText('Nenhuma rota vinculada')).toBeTruthy()
    expect(screen.getByTestId('mock-qr', hidden)).toBeTruthy()
  })

  it('non-array payload counts as no route', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue('<html>proxy</html>' as never)

    renderScreen()

    expect(await screen.findByText('Nenhuma rota vinculada')).toBeTruthy()
  })

  it('nameless routes are filtered out', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([{ ...route(''), name: '' }] as AssignedRoute[])

    renderScreen()

    expect(await screen.findByText('Nenhuma rota vinculada')).toBeTruthy()
  })

  it('mixed named and nameless routes: nameless ones are dropped from the count', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([
      route('Linha A'),
      { ...route('', 'nameless'), name: '' },
      route('Linha B'),
    ] as AssignedRoute[])

    renderScreen()

    expect(await screen.findByText('Linha A')).toBeTruthy()
    expect(screen.getByText('+1 rotas')).toBeTruthy()
  })

  it('pull-to-refresh on the Screen refetches the routes', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([route('Linha Centro')])

    renderScreen()
    expect(await screen.findByText('Linha Centro')).toBeTruthy()
    expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(1)

    const { refreshControl } = screen.getByTestId('student-qr-scroll').props
    await act(async () => {
      refreshControl.props.onRefresh()
    })

    await waitFor(() => expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(2))
  })

  it('error without cache: error line and Snackbar; "Tentar novamente" refetches', async () => {
    mockRoutes.getMyRoutes.mockRejectedValue(new Error('network'))

    renderScreen()

    expect(await screen.findByText('Não foi possível carregar sua rota.')).toBeTruthy()
    expect(
      await screen.findByText('Não foi possível carregar sua rota. Verifique sua conexão.'),
    ).toBeTruthy()
    // 1 attempt + 2 retries.
    expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(3)

    mockRoutes.getMyRoutes.mockResolvedValue([route('Linha Centro')])
    fireEvent.press(screen.getByText('Tentar novamente'))

    expect(await screen.findByText('Linha Centro')).toBeTruthy()
    expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(4)
  })

  it('error with cached route: route plus "desatualizada", no Snackbar', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([route('Linha Centro')])

    renderScreen()
    expect(await screen.findByText('Linha Centro')).toBeTruthy()

    mockRoutes.getMyRoutes.mockRejectedValue(new Error('network'))
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['routes', 'mine'] })
    })

    expect(await screen.findByText('Rota possivelmente desatualizada')).toBeTruthy()
    expect(screen.getByText('Linha Centro')).toBeTruthy()
    expect(screen.queryByText('Não foi possível carregar sua rota. Verifique sua conexão.')).toBeNull()
    expect(screen.queryByText('Tentar novamente')).toBeNull()
  })
})

describe('QrCodeScreen — invalid session', () => {
  it.each([
    ['no sessionId', () => mockSession.getSessionId.mockReturnValue(undefined)],
    ['no user', () => mockUser('STUDENT', false)],
    ['DRIVER role', () => mockUser('DRIVER')],
  ])('%s: blocked state, no QR, logout before replace', async (_label, arrange) => {
    arrange()
    mockRoutes.getMyRoutes.mockResolvedValue([route('Linha Centro')])

    renderScreen()

    expect(await screen.findByTestId('qr-session-blocked')).toBeTruthy()
    expect(screen.getByText('Sua sessão precisa ser renovada')).toBeTruthy()
    expect(
      screen.getByText('Não foi possível carregar seus dados. Entre novamente para ver seu QR code.'),
    ).toBeTruthy()
    expect(screen.queryByTestId('mock-qr', hidden)).toBeNull()
    expect(screen.queryByTestId('qr-pass')).toBeNull()

    fireEvent.press(screen.getByText('Entrar novamente'))

    await waitFor(() => expect(calls).toEqual(['logout', 'replace']))
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login')
  })
})
