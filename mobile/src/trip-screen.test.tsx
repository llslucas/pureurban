import React from 'react'
import { Alert, Linking, StyleSheet } from 'react-native'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ActivityIndicator, Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import TripScreen from '@/app/(driver)/trip'
import { tripService, type Trip } from '@/services/trip.service'
import { routesService, type AssignedRoute } from '@/services/routes.service'
import { useForegroundPermissions } from 'expo-location'
import type { LocationPermissionResponse } from 'expo-location'
import { useTripGpsCapture } from '@/hooks/use-trip-gps-capture'
import { TEST_INSETS } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { lightTheme } from '@/lib/theme'
import { activeTripKey } from '@/lib/trip-queries'

// Lives at src/ root, not src/app/: Expo Router turns every file under src/app/
// into a navigable route, so a test file there pollutes typedRoutes/_sitemap and
// throws on the module-scope jest.mock (same reason as
// src/lib/roster-stale-banner.test.ts:14-16).
//
// QueryClientProvider (retryDelay zeroed — the screens pin retry: 2 on the query
// itself) + SafeArea/Paper providers + jest mocks of trip.service/routes.service.
// Covers the spec-3-1 I/O matrix: the PLACEHOLDER_ROUTE_ID is gone and the real
// routeId from /routes/mine has to reach POST /trips.

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
}))

jest.mock('@/services/trip.service', () => ({
  tripService: {
    getActiveTrip: jest.fn(),
    startTrip: jest.fn(),
    endTrip: jest.fn(),
    getTripStudents: jest.fn(),
  },
}))

jest.mock('@/services/routes.service', () => ({
  routesService: { getMyRoutes: jest.fn() },
}))

// trip-queries also hosts the student status factory, which imports
// boarding.service → api-client → MMKV (native, absent under jest-expo).
jest.mock('@/services/boarding.service', () => ({
  boardingService: { getMyStatus: jest.fn() },
}))

// A captura de GPS (Story 5.1) é mockada inteira: o comportamento de cadência
// e gating vive nos testes de utils/gps-capture; aqui a tela só renderiza — e
// sem o mock a cadeia tracking.service → api-client → MMKV carregaria nativos
// que o jest-expo não tem.
jest.mock('@/hooks/use-trip-gps-capture', () => ({
  useTripGpsCapture: jest.fn(),
}))

// Mesmo tratamento do useCameraPermissions do scan (nunca exercitado sob
// jest-expo): o hook de permissão da expo carrega módulos nativos e derruba a
// árvore renderizada. Permissão concedida por padrão — o card não aparece.
jest.mock('expo-location', () => ({
  useForegroundPermissions: jest.fn(() => [
    { granted: true, canAskAgain: true },
    jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
    jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
  ]),
  Accuracy: { Balanced: 3 },
}))

const mockTrip = jest.mocked(tripService)
const mockRoutes = jest.mocked(routesService)
const mockCapture = jest.mocked(useTripGpsCapture)

const ROUTE_A: AssignedRoute = {
  id: '880e8400-e29b-41d4-a716-446655440200',
  name: 'Linha Centro - Universidade',
  description: null,
  originCity: 'Centro',
  destinationCity: 'Campus Universitário',
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-10T08:00:00.000Z',
}

const ROUTE_B: AssignedRoute = {
  ...ROUTE_A,
  id: '880e8400-e29b-41d4-a716-446655440201',
  name: 'Linha Bairro Norte - Universidade',
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-outbound-1',
    companyId: 'company-1',
    routeId: ROUTE_A.id,
    driverId: 'driver-1',
    type: 'OUTBOUND',
    status: 'ACTIVE',
    startedAt: '2026-09-06T09:00:00.000Z',
    endedAt: null,
    relatedTripId: null,
    ...overrides,
  }
}

let queryClient: QueryClient

function renderScreen(seed?: { routes?: AssignedRoute[] }) {
  queryClient = new QueryClient({
    defaultOptions: {
      // The screens pin `retry: 2` on the query (same choice as routes.tsx), so
      // the test can only zero the delay between attempts — otherwise the error
      // state takes ~3s of backoff to appear. `gcTime: Infinity` keeps React
      // Query from scheduling a garbage-collection timer that outlives the test
      // (would make jest hang without --forceExit); `clear()` in afterEach drops
      // the cache.
      queries: { retryDelay: 0, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  })
  // Stands in for the MMKV-persisted routes cache of a cold start.
  if (seed?.routes) queryClient.setQueryData(['routes', 'mine'], seed.routes)
  // PaperProvider hosts the ConfirmDialog's Portal; SafeAreaProvider feeds the
  // StickyActionBar's inset.
  return render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: TEST_INSETS }}
    >
      <PaperProvider theme={lightTheme}>
        <QueryClientProvider client={queryClient}>
          <TripScreen />
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>,
  )
}

async function confirmEnd() {
  fireEvent.press(await screen.findByText('Encerrar Viagem'))
  fireEvent.press(await screen.findByTestId('end-trip-dialog-confirm'))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockTrip.getTripStudents.mockResolvedValue({
    students: [],
    summary: { boarded: 0, total: 0 },
  })
})

afterEach(() => {
  // The per-render client is never torn down otherwise (jest prints "did not
  // exit"); clearing cancels its in-flight fetches and timers.
  queryClient.clear()
})

describe('TripScreen — route resolution (spec-3-1)', () => {
  it('shows the TripCard skeleton, not a spinner, while the trip loads (story 6.11)', async () => {
    mockTrip.getActiveTrip.mockReturnValue(new Promise<Trip | null>(() => {}))
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen()

    const loading = await screen.findByLabelText('Carregando viagem...')
    expect(loading.props.testID).toBe('trip-skeleton')
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
  })

  it('shows the routes loading state while /routes/mine has not answered', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)
    let resolveRoutes: (routes: AssignedRoute[]) => void = () => {}
    mockRoutes.getMyRoutes.mockReturnValue(
      new Promise<AssignedRoute[]>((resolve) => {
        resolveRoutes = resolve
      }),
    )

    renderScreen()

    const loading = await screen.findByLabelText('Carregando rotas...')
    expect(loading.props.testID).toBe('start-outbound-state')
    expect(screen.queryByText('Carregando rotas...')).toBeNull()
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
    // Gate do GPS (Story 5.1): sem viagem ativa, a captura fica desligada
    // mesmo com a permissão concedida.
    expect(mockCapture).toHaveBeenCalledWith(null, true)

    // Settle the promise so it does not dangle past the test.
    resolveRoutes([ROUTE_A])
    // The first render after the routes resolve is heavy; under parallel suite
    // load it overran waitFor's 1s default and made this test flaky.
    await waitFor(() => expect(screen.queryByLabelText('Carregando rotas...')).toBeNull(), {
      timeout: 3000,
    })
  })

  it('single route: auto-selects and POST /trips goes out with the real UUID', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])
    mockTrip.startTrip.mockResolvedValue(makeTrip())

    renderScreen()

    const startButton = await screen.findByText('Iniciar Viagem')
    await waitFor(() => expect(startButton).not.toBeDisabled())

    fireEvent.press(startButton)

    await waitFor(() =>
      expect(mockTrip.startTrip).toHaveBeenCalledWith(ROUTE_A.id, 'OUTBOUND', undefined),
    )
    // The screen now shows the active trip.
    expect(await screen.findByText('Escanear QR Code')).toBeTruthy()
  })

  it('multiple routes: selector is visible and "Iniciar" is locked until a choice', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A, ROUTE_B])
    mockTrip.startTrip.mockResolvedValue(makeTrip({ routeId: ROUTE_B.id }))

    renderScreen()

    const startButton = await screen.findByText('Iniciar Viagem')
    // Selector present with both routes.
    expect(screen.getByText('Linha Centro - Universidade')).toBeTruthy()
    expect(screen.getByText('Linha Bairro Norte - Universidade')).toBeTruthy()
    // No choice yet: disabled.
    expect(startButton).toBeDisabled()

    fireEvent.press(screen.getByText('Linha Bairro Norte - Universidade'))

    await waitFor(() => expect(startButton).not.toBeDisabled())
    fireEvent.press(startButton)

    await waitFor(() =>
      expect(mockTrip.startTrip).toHaveBeenCalledWith(ROUTE_B.id, 'OUTBOUND', undefined),
    )
  })

  it('no route: guidance to contact the administrator and no "Iniciar Viagem" at all', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)
    mockRoutes.getMyRoutes.mockResolvedValue([])

    renderScreen()

    expect(
      await screen.findByText('Peça ao administrador para vincular uma rota.'),
    ).toBeTruthy()
    expect(screen.queryByText('Iniciar Viagem')).toBeNull()
    expect(mockTrip.startTrip).not.toHaveBeenCalled()
  })

  it('routes error: message + "Tentar novamente", never the "no route" state', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)
    // 1 initial attempt + 2 retries (retry: 2) fail; the route only comes back
    // on the manual "Tentar novamente" press.
    mockRoutes.getMyRoutes
      .mockRejectedValueOnce(new Error('500'))
      .mockRejectedValueOnce(new Error('500'))
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValue([ROUTE_A])

    renderScreen()

    expect(
      await screen.findByText('Não foi possível carregar suas rotas.', {}, { timeout: 3000 }),
    ).toBeTruthy()
    // Does not confuse an error with an empty list.
    expect(
      screen.queryByText('Peça ao administrador para vincular uma rota.'),
    ).toBeNull()

    fireEvent.press(screen.getByText('Tentar novamente'))

    // After a successful retry the route resolves and the button becomes usable.
    const startButton = await screen.findByText('Iniciar Viagem')
    await waitFor(() => expect(startButton).not.toBeDisabled())
  })

  it('DRIVER_NOT_ASSIGNED: alert with the API message and the screen stays on the start state', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mockTrip.getActiveTrip.mockResolvedValue(null)
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])
    mockTrip.startTrip.mockRejectedValue(new Error('Motorista não vinculado a esta rota'))

    renderScreen()

    const startButton = await screen.findByText('Iniciar Viagem')
    await waitFor(() => expect(startButton).not.toBeDisabled())
    fireEvent.press(startButton)

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Erro', 'Motorista não vinculado a esta rota'),
    )
    expect(screen.getByText('Iniciar Viagem')).toBeTruthy()
    expect(screen.queryByText('Escanear QR Code')).toBeNull()
  })
})

describe('TripScreen — active trip (spec-3-1)', () => {
  it('reflects the active trip and does NOT call /routes/mine', async () => {
    const trip = makeTrip()
    mockTrip.getActiveTrip.mockResolvedValue(trip)
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen()

    expect(await screen.findByText('Escanear QR Code')).toBeTruthy()
    expect(screen.getByText('Encerrar Viagem')).toBeTruthy()
    expect(screen.getByText('Alunos da Viagem')).toBeTruthy()

    // Gate do GPS (Story 5.1): viagem ACTIVE + permissão concedida ⇒ captura
    // ligada com o id da viagem corrente.
    expect(mockCapture).toHaveBeenCalledWith(trip.id, true)

    // Wait an extra tick to make sure the routes query never fires.
    await waitFor(() => expect(mockTrip.getTripStudents).toHaveBeenCalled())
    expect(mockRoutes.getMyRoutes).not.toHaveBeenCalled()
  })

  it('ending the outbound trip opens "Iniciar Retorno" with the same route and relatedTripId', async () => {
    const outbound = makeTrip()
    mockTrip.getActiveTrip.mockResolvedValue(outbound)
    mockTrip.endTrip.mockResolvedValue({ ...outbound, status: 'COMPLETED', endedAt: '2026-09-06T10:00:00.000Z' })
    mockTrip.startTrip.mockResolvedValue(
      makeTrip({ id: 'trip-return-1', type: 'RETURN', relatedTripId: outbound.id }),
    )

    renderScreen()

    await confirmEnd()

    const returnButton = await screen.findByText('Iniciar Retorno')
    fireEvent.press(returnButton)

    await waitFor(() =>
      expect(mockTrip.startTrip).toHaveBeenCalledWith(outbound.routeId, 'RETURN', outbound.id),
    )
    // The dialog closed on success: the new active trip doesn't reopen it.
    expect(await screen.findByText('Encerrar Viagem')).toBeTruthy()
    expect(endDialogVisible()).toBe(false)
    // Never fetched routes anywhere in the flow.
    expect(mockRoutes.getMyRoutes).not.toHaveBeenCalled()
  })

  it('ending a RETURN trip drops back to the route selector, never the "ask admin" empty state', async () => {
    const returnTrip = makeTrip({ id: 'trip-return-1', type: 'RETURN', relatedTripId: 'trip-outbound-1' })
    mockTrip.getActiveTrip.mockResolvedValue(returnTrip)
    mockTrip.endTrip.mockResolvedValue({
      ...returnTrip,
      status: 'COMPLETED',
      endedAt: '2026-09-06T12:00:00.000Z',
    })
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen()

    await confirmEnd()

    // The COMPLETED RETURN cache entry re-enables the routes query; the screen
    // shows loading then the start section, but never the false "no routes" text.
    await waitFor(() => expect(mockRoutes.getMyRoutes).toHaveBeenCalled())
    expect(screen.queryByText('Peça ao administrador para vincular uma rota.')).toBeNull()

    const startButton = await screen.findByText('Iniciar Viagem')
    await waitFor(() => expect(startButton).not.toBeDisabled())

    // Gate do GPS (Story 5.1): viagem encerrada ⇒ captura desligada (última
    // chamada do hook, não qualquer chamada anterior da viagem ativa).
    expect(mockCapture).toHaveBeenLastCalledWith(null, true)
  })
})

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const EMOJI = /\p{Extended_Pictographic}/u

// Paper's Modal only unmounts once its fade-out animation completes, which the
// jest runtime doesn't reliably drive; the dialog's `visible` prop is the contract.
function endDialogVisible(): boolean {
  return screen
    .UNSAFE_queryAllByProps({ testID: 'end-trip-dialog' })
    .some((node) => node.props.visible === true)
}

type JsonNode = { children: (JsonNode | string)[] | null }

// Text nodes only: props such as testIDs legitimately carry route UUIDs.
function renderedText(): string {
  const texts: string[] = []
  const walk = (node: JsonNode | string | null) => {
    if (node === null) return
    if (typeof node === 'string') {
      texts.push(node)
      return
    }
    node.children?.forEach(walk)
  }
  const tree = screen.toJSON() as JsonNode | JsonNode[] | null
  ;(Array.isArray(tree) ? tree : [tree]).forEach(walk)
  return texts.join('\n')
}

function expectNoUuidOrEmoji() {
  const text = renderedText()
  expect(text).not.toMatch(UUID)
  expect(text).not.toMatch(EMOJI)
}

// Depth-first order of the given testIDs under `rootTestID`.
function orderOf(rootTestID: string, testIDs: string[]): string[] {
  return screen
    .getByTestId(rootTestID)
    .findAll((node: { props: { testID?: unknown } }) =>
      testIDs.includes(node.props.testID as string),
    )
    .map((node: { props: { testID?: unknown } }) => node.props.testID as string)
    .filter((id: string, index: number, all: string[]) => all.indexOf(id) === index)
}

describe('TripScreen — redesign (story 6.5)', () => {
  it('active trip: route name from the cached routes, never the UUID, and still no /routes/mine call', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen({ routes: [ROUTE_A] })

    expect(await screen.findByText('Linha Centro - Universidade')).toBeTruthy()
    expect(screen.getByText('Viagem de ida')).toBeTruthy()
    expect(screen.getByText('Em andamento')).toBeTruthy()
    await waitFor(() => expect(mockTrip.getTripStudents).toHaveBeenCalled())
    expect(mockRoutes.getMyRoutes).not.toHaveBeenCalled()
    expectNoUuidOrEmoji()
  })

  it('cold start without the route in cache: "Rota atribuída", no UUID, no emoji', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())

    renderScreen()

    expect(await screen.findByText('Rota atribuída')).toBeTruthy()
    expectNoUuidOrEmoji()
    expect(mockRoutes.getMyRoutes).not.toHaveBeenCalled()
  })

  it('shows "Iniciada às HH:MM" without seconds', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip({ startedAt: '2026-09-06T09:00:37.000Z' }))

    renderScreen()

    expect(await screen.findByText(/^Iniciada às \d{2}:\d{2}$/)).toBeTruthy()
  })

  it('shows the server boarding count in the counter', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())
    mockTrip.getTripStudents.mockResolvedValue({ students: [], summary: { boarded: 3, total: 4 } })

    renderScreen()

    expect(await screen.findByText('3/4')).toBeTruthy()
    expect(screen.queryByText('Nenhum aluno nesta rota')).toBeNull()
  })

  it('empty class: hides the counter', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())

    renderScreen()

    expect(await screen.findByText('Nenhum aluno nesta rota')).toBeTruthy()
    expect(screen.queryByTestId('boarding-counter')).toBeNull()
  })

  it('"Alunos da Viagem" is a button that navigates to the student list', async () => {
    const { router } = jest.requireMock<{ router: { navigate: jest.Mock } }>('expo-router')
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())

    renderScreen()

    fireEvent.press(await screen.findByRole('button', { name: 'Alunos da Viagem' }))
    expect(router.navigate).toHaveBeenCalledWith('/(driver)/student-list')
  })

  it('"Encerrar Viagem" asks first; "Voltar" closes without ending the trip', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())

    renderScreen()

    fireEvent.press(await screen.findByText('Encerrar Viagem'))
    await waitFor(() => expect(endDialogVisible()).toBe(true))
    fireEvent.press(screen.getByTestId('end-trip-dialog-cancel'))

    await waitFor(() => expect(endDialogVisible()).toBe(false))
    expect(mockTrip.endTrip).not.toHaveBeenCalled()
    expect(screen.getByText('Escanear QR Code')).toBeTruthy()
  })

  it('a trip swapped by a refetch while the dialog is open does not open it on the next trip', async () => {
    const first = makeTrip()
    mockTrip.getActiveTrip.mockResolvedValue(first)

    renderScreen()

    fireEvent.press(await screen.findByText('Encerrar Viagem'))
    await waitFor(() => expect(endDialogVisible()).toBe(true))

    act(() => {
      queryClient.setQueryData(activeTripKey, {
        ...first,
        status: 'COMPLETED',
        endedAt: '2026-09-06T10:00:00.000Z',
      })
    })
    expect(await screen.findByText('Iniciar Retorno')).toBeTruthy()

    act(() => {
      queryClient.setQueryData(
        activeTripKey,
        makeTrip({ id: 'trip-return-1', type: 'RETURN', relatedTripId: first.id }),
      )
    })
    expect(await screen.findByText('Encerrar Viagem')).toBeTruthy()
    expect(endDialogVisible()).toBe(false)
    expect(mockTrip.endTrip).not.toHaveBeenCalled()
  })

  it('end trip error: current Alert and the dialog closes', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())
    mockTrip.endTrip.mockRejectedValue(new Error('Falha ao encerrar'))

    renderScreen()

    await confirmEnd()

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Erro', 'Falha ao encerrar'))
    await waitFor(() => expect(endDialogVisible()).toBe(false))
    expect(screen.getByText('Encerrar Viagem')).toBeTruthy()
  })

  it('outbound completed: "Concluída" card with the final count and "Iniciar Retorno" in the bar', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(
      makeTrip({ status: 'COMPLETED', endedAt: '2026-09-06T10:00:00.000Z' }),
    )
    mockTrip.getTripStudents.mockResolvedValue({ students: [], summary: { boarded: 4, total: 4 } })

    renderScreen()

    expect(await screen.findByText('Iniciar Retorno')).toBeTruthy()
    expect(screen.getByText('Concluída')).toBeTruthy()
    expect(await screen.findByText('4/4')).toBeTruthy()
    expect(screen.queryByText(/Iniciada às/)).toBeNull()
    expectNoUuidOrEmoji()
  })

  it('no trip, single route: empty state names the route and "Iniciar Viagem" sits in the bar', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])

    renderScreen()

    expect(await screen.findByText('Nenhuma viagem em andamento')).toBeTruthy()
    expect(screen.getByText('Linha Centro - Universidade')).toBeTruthy()
    expect(screen.getByTestId('sticky-action-bar')).toBeTruthy()
    expect(screen.getByText('Iniciar Viagem')).toBeTruthy()
    expectNoUuidOrEmoji()
  })

  it('multiple routes: options are radios that report the selection', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A, ROUTE_B])

    renderScreen()

    const option = await screen.findByRole('radio', { name: ROUTE_B.name })
    expectNoUuidOrEmoji()
    expect(option).not.toBeChecked()
    fireEvent.press(option)
    await waitFor(() => expect(screen.getByRole('radio', { name: ROUTE_B.name })).toBeChecked())
    expect(screen.getByRole('radio', { name: ROUTE_A.name })).not.toBeChecked()
  })

  it('completed return: card + route selector, still no UUID or emoji', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(
      makeTrip({
        id: 'trip-return-1',
        type: 'RETURN',
        status: 'COMPLETED',
        relatedTripId: 'trip-outbound-1',
        endedAt: '2026-09-06T12:00:00.000Z',
      }),
    )
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A, ROUTE_B])

    renderScreen()

    expect(await screen.findByText('Escolha a rota da viagem')).toBeTruthy()
    expect(screen.getByText('Viagem de retorno')).toBeTruthy()
    expect(screen.getByText('Concluída')).toBeTruthy()
    expectNoUuidOrEmoji()
  })

  it('D-UX-7: "Encerrar Viagem" sits above "Escanear" in the bar, as a red secondary', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())

    renderScreen()

    await screen.findByText('Encerrar Viagem')
    expect(orderOf('sticky-action-bar', ['end-trip-action', 'scan-action'])).toEqual([
      'end-trip-action',
      'scan-action',
    ])
    const endLabel = StyleSheet.flatten(screen.getByTestId('end-trip-action-text').props.style)
    expect(endLabel.color).toBe(lightPalette.error)
    const endContainer = StyleSheet.flatten(
      screen.getByTestId('end-trip-action-container').props.style,
    )
    expect(endContainer.backgroundColor).toBe(lightPalette.canvas)
  })

  it('confirm in flight: a second tap does not end the trip twice', async () => {
    let resolveEnd: (trip: Trip) => void = () => {}
    const trip = makeTrip()
    mockTrip.getActiveTrip.mockResolvedValue(trip)
    mockTrip.endTrip.mockReturnValue(
      new Promise<Trip>((resolve) => {
        resolveEnd = resolve
      }),
    )

    renderScreen()

    await confirmEnd()
    await waitFor(() => expect(mockTrip.endTrip).toHaveBeenCalledTimes(1))
    // React Query publishes `isPending` on a later tick; the guard holds from
    // the render that shows the confirm button's spinner.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('end-trip-dialog-confirm')).getByRole('progressbar'),
      ).toBeTruthy(),
    )
    fireEvent.press(screen.getByTestId('end-trip-dialog-confirm'))
    // mutationFn runs on a later tick: flush before counting.
    await act(async () => {})
    expect(mockTrip.endTrip).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveEnd({ ...trip, status: 'COMPLETED', endedAt: '2026-09-06T10:00:00.000Z' })
    })
    expect(await screen.findByText('Iniciar Retorno')).toBeTruthy()
  })

  it('trip query error: error state with retry', async () => {
    mockTrip.getActiveTrip.mockRejectedValue(new Error('offline'))

    renderScreen()

    expect(await screen.findByText('Não foi possível carregar a viagem', {}, { timeout: 5000 })).toBeTruthy()
    mockTrip.getActiveTrip.mockResolvedValue(null)
    mockRoutes.getMyRoutes.mockResolvedValue([ROUTE_A])
    await act(async () => {
      fireEvent.press(screen.getByText('Tentar novamente'))
    })
    expect(await screen.findByText('Nenhuma viagem em andamento')).toBeTruthy()
  })
})

describe('TripScreen — permissão de localização (Story 5.1)', () => {
  // O screen só lê `granted` e `canAskAgain` da resposta real da expo.
  const permission = (granted: boolean, canAskAgain: boolean) =>
    ({ granted, canAskAgain }) as unknown as LocationPermissionResponse

  const request = () => Promise.resolve(permission(true, true))

  const mockPermissions = jest.mocked(useForegroundPermissions)

  const setPermission = (granted: boolean, canAskAgain: boolean) =>
    mockPermissions.mockReturnValue([
      permission(granted, canAskAgain),
      () => request(),
      () => request(),
    ])

  beforeEach(() => {
    // Default explícito: concedida (o clearAllMocks acima preserva
    // mockReturnValue de testes anteriores — cada teste fixa o seu estado).
    setPermission(true, true)
  })

  it('sem permissão e sem viagem: card de justificativa com botão "Permitir acesso" (visível antes da primeira viagem)', async () => {
    setPermission(false, true)
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    expect(await screen.findByText('Permissão de localização')).toBeTruthy()
    expect(screen.getByText('Permitir acesso à localização')).toBeTruthy()
    expect(screen.queryByText('Abrir configurações')).toBeNull()
  })

  it('sem permissão e viagem ativa: card segue visível junto à viagem em curso', async () => {
    setPermission(false, true)
    mockTrip.getActiveTrip.mockResolvedValue(makeTrip())

    renderScreen()

    expect(await screen.findByText('Permissão de localização')).toBeTruthy()
    expect(screen.getByText('Permitir acesso à localização')).toBeTruthy()
    expect(screen.getByText('Encerrar Viagem')).toBeTruthy()
    // Gate do GPS: viagem ativa mas permissão negada ⇒ captura desligada.
    expect(mockCapture).toHaveBeenLastCalledWith('trip-outbound-1', false)
  })

  it('permissão negada permanente: o card manda para as configurações', async () => {
    setPermission(false, false)
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    expect(await screen.findByText('Permissão de localização')).toBeTruthy()
    expect(screen.getByText('Abrir configurações')).toBeTruthy()
    expect(screen.queryByText('Permitir acesso à localização')).toBeNull()
  })

  it('"Permitir acesso" asks for the permission and shows an error when that fails', async () => {
    const requestPermission = jest.fn(() => Promise.reject(new Error('boom')))
    mockPermissions.mockReturnValue([permission(false, true), requestPermission, () => request()])
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    fireEvent.press(await screen.findByTestId('location-permission-action'))
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(
        'Não foi possível pedir a permissão. Libere a localização nas configurações do sistema.',
      ),
    ).toBeTruthy()
  })

  it('"Abrir configurações" opens the settings and shows an error when that fails', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('boom'))
    setPermission(false, false)
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    fireEvent.press(await screen.findByTestId('location-permission-action'))
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(
        'Não foi possível abrir as configurações. Abra manualmente e libere a localização para o PureUrban.',
      ),
    ).toBeTruthy()
    openSettings.mockRestore()
  })

  it('outbound completed without permission: the TripCard comes before the permission card', async () => {
    setPermission(false, true)
    mockTrip.getActiveTrip.mockResolvedValue(
      makeTrip({ status: 'COMPLETED', endedAt: '2026-09-06T10:00:00.000Z' }),
    )

    renderScreen()

    await screen.findByText('Iniciar Retorno')
    expect(orderOf('trip-screen', ['trip-card', 'location-permission-card'])).toEqual([
      'trip-card',
      'location-permission-card',
    ])
    expect(screen.getByText(/transmitir a posição do ônibus aos alunos/)).toBeTruthy()
  })

  it('permissão concedida: nenhum card', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    await screen.findByTestId('trip-screen')
    expect(screen.queryByText('Permissão de localização')).toBeNull()
  })
})
