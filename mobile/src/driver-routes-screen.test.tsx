import React from 'react'
import { StyleSheet } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider as PaperProvider, Snackbar } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import DriverRoutesScreen from '@/app/(driver)/routes'
import { TEST_INSETS, type TestNode } from '@/components/ui/test-utils'
import { lightTheme } from '@/lib/theme'
import { routesService, type AssignedRoute } from '@/services/routes.service'

// Lives at src/ root, not src/app/: every file under src/app/ becomes a route
// (same reason as trip-screen.test.tsx).

jest.mock('@/services/routes.service', () => ({
  routesService: { getMyRoutes: jest.fn() },
}))

const mockRoutes = jest.mocked(routesService)

const SNACKBAR_TEXT = 'Não foi possível carregar as rotas. Verifique sua conexão.'

const ROUTE_A: AssignedRoute = {
  id: 'route-a',
  name: 'Linha Centro - Universidade',
  description: 'Rota matutina entre o centro e o campus universitário',
  originCity: 'Centro',
  destinationCity: 'Campus Universitário',
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-10T08:00:00.000Z',
}

const ROUTE_B: AssignedRoute = {
  ...ROUTE_A,
  id: 'route-b',
  name: 'Linha Bairro Norte - Universidade',
  description: null,
  originCity: 'Bairro Norte',
}

let queryClient: QueryClient

function renderScreen() {
  queryClient = new QueryClient({
    // The screen pins `retry: 2`; only the delay between attempts is zeroed.
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  })
  return render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: TEST_INSETS }}
    >
      <PaperProvider theme={lightTheme}>
        <QueryClientProvider client={queryClient}>
          <DriverRoutesScreen />
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  queryClient?.clear()
})

describe('DriverRoutesScreen (story 6.13)', () => {
  it('with routes: count legend and one RouteCard per route; description only when not null', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A, ROUTE_B])

    renderScreen()

    expect(await screen.findByText('2 rotas atribuídas')).toBeTruthy()
    expect(screen.getByTestId('route-card-route-a')).toBeTruthy()
    expect(screen.getByTestId('route-card-route-b')).toBeTruthy()
    expect(screen.getByTestId('route-card-route-a-description')).toBeTruthy()
    expect(screen.queryByTestId('route-card-route-b-description')).toBeNull()
    expect(screen.queryByTestId('routes-empty')).toBeNull()
    expect(screen.queryByTestId('routes-error')).toBeNull()
  })

  it('one route: singular legend', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen()

    expect(await screen.findByText('1 rota atribuída')).toBeTruthy()
  })

  it('cards: no emoji before the name, no italic, no uppercase labels', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen()

    const name = await screen.findByText('Linha Centro - Universidade')
    expect(name.props.children).toBe('Linha Centro - Universidade')
    expect(screen.queryByText(/🚌|⚠️|🗺️/)).toBeNull()
    for (const label of ['Origem', 'Destino', 'Descrição']) {
      expect(screen.queryByText(label)).toBeNull()
    }
    for (const text of [ROUTE_A.name, 'Centro', 'Campus Universitário', ROUTE_A.description!]) {
      const style = StyleSheet.flatten(screen.getByText(text).props.style)
      expect(style.fontStyle).toBeUndefined()
      expect(style.textTransform).toBeUndefined()
    }
    // No duplicated in-screen title under the "Minhas rotas" header.
    expect(screen.queryByText('Minhas Rotas')).toBeNull()
  })

  it('loading: StateView "Carregando rotas...", never the empty state', async () => {
    mockRoutes.getMyRoutes.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(await screen.findByText('Carregando rotas...')).toBeTruthy()
    expect(screen.getByTestId('routes-loading')).toBeTruthy()
    expect(screen.queryByTestId('routes-empty')).toBeNull()
  })

  it('offline (paused query): still loading, never "Você ainda não tem rota."', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])
    onlineManager.setOnline(false)
    try {
      renderScreen()

      expect(await screen.findByTestId('routes-loading')).toBeTruthy()
      expect(screen.queryByText('Você ainda não tem rota.')).toBeNull()
      expect(mockRoutes.getMyRoutes).not.toHaveBeenCalled()
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it.each([
    ['empty list', []],
    ['non-array payload', '<html>proxy</html>'],
  ])('%s: empty StateView with map-marker-off and the administration hint', async (_, payload) => {
    mockRoutes.getMyRoutes.mockResolvedValue(payload as never)

    renderScreen()

    expect(await screen.findByText('Você ainda não tem rota.')).toBeTruthy()
    expect(screen.getByText('Fale com a administração.')).toBeTruthy()
    const icon = screen
      .getByTestId('routes-empty-icon', { includeHiddenElements: true })
      .findAll((node: TestNode) => typeof node.props.name === 'string')[0]
    expect(icon?.props.name).toBe('map-marker-off')
    expect(screen.queryByTestId('routes-empty-action')).toBeNull()
  })

  it('error without cache: error StateView + Snackbar; "Tentar novamente" calls getMyRoutes again', async () => {
    mockRoutes.getMyRoutes.mockRejectedValue(new Error('network'))

    renderScreen()

    expect(await screen.findByText('Não foi possível carregar suas rotas')).toBeTruthy()
    const icon = screen
      .getByTestId('routes-error-icon', { includeHiddenElements: true })
      .findAll((node: TestNode) => typeof node.props.name === 'string')[0]
    expect(icon?.props.name).toBe('cloud-alert')
    expect(await screen.findByText(SNACKBAR_TEXT)).toBeTruthy()
    expect(screen.queryByText('Você ainda não tem rota.')).toBeNull()
    // 1 attempt + 2 retries.
    expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(3)

    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])
    fireEvent.press(screen.getByTestId('routes-error-action'))

    expect(await screen.findByText('1 rota atribuída')).toBeTruthy()
    expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(4)
  })

  it('error without cache: the Snackbar reopens on a new failure after being dismissed', async () => {
    mockRoutes.getMyRoutes.mockRejectedValue(new Error('network'))

    renderScreen()

    // Reads the `visible` prop, not the text: Paper keeps the text mounted
    // through its hide animation, whose timing is load-dependent.
    const snackbarVisible = () => screen.UNSAFE_getByType(Snackbar).props.visible as boolean
    await waitFor(() => expect(snackbarVisible()).toBe(true))
    fireEvent.press(screen.getByText('Fechar'))
    expect(snackbarVisible()).toBe(false)

    fireEvent.press(screen.getByTestId('routes-error-action'))

    await waitFor(() => expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(6))
    await waitFor(() => expect(snackbarVisible()).toBe(true))
  })

  it('error with cache: cards stay visible and the Snackbar shows', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen()
    expect(await screen.findByText('Linha Centro - Universidade')).toBeTruthy()

    mockRoutes.getMyRoutes.mockRejectedValue(new Error('network'))
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['routes', 'mine'] })
    })

    expect(await screen.findByText(SNACKBAR_TEXT)).toBeTruthy()
    expect(screen.getByText('Linha Centro - Universidade')).toBeTruthy()
    expect(screen.queryByTestId('routes-error')).toBeNull()
  })

  it('pull-to-refresh on the Screen refetches the routes', async () => {
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen()
    expect(await screen.findByText('1 rota atribuída')).toBeTruthy()
    expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(1)

    const { refreshControl } = screen.getByTestId('driver-routes-scroll').props
    await act(async () => {
      refreshControl.props.onRefresh()
    })

    await waitFor(() => expect(mockRoutes.getMyRoutes).toHaveBeenCalledTimes(2))
  })
})
