import React from 'react'
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Location from 'expo-location'

import TrackBusScreen from '@/app/(student)/track-bus'
import { ApiClientError } from '@/services/api-error'
import { trackingService, type ActiveTrackingTrip } from '@/services/tracking.service'
import {
  connectTrackingEvents,
  type TrackingStreamHandlers,
} from '@/services/tracking-stream.service'

// Lives at src/ root, not src/app/: Expo Router turns every file under src/app/
// into a navigable route, so a test file there pollutes typedRoutes/_sitemap
// (same reason as student-home.test.tsx).
//
// The stream service and the REST service are mocked — the reconnect/backoff
// rules have their own unit suite (tracking-stream.service.test.ts). This file
// locks the SCREEN matrix of spec-5-2: discovery states, last-known as seed,
// the 15s "Sem sinal GPS" degradation and its "há N min" counter (fake timers),
// the 409 empty state, the staleness banner and the student permission card
// (story 6.10 redesign).

const TRIP: ActiveTrackingTrip = {
  tripId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  type: 'OUTBOUND',
}

// Same point for bus and student: distance ~0 → "Chegando" (deterministic,
// without depending on haversine decimals).
const BUS_POINT = { latitude: -20.755549, longitude: -42.881728 }
const STUDENT_SAME_POINT = { latitude: -20.755549, longitude: -42.881728 }

const locationEvent = (
  overrides: Partial<{ latitude: number; longitude: number; timestamp: string }> = {},
) => ({
  tripId: TRIP.tripId,
  latitude: BUS_POINT.latitude,
  longitude: BUS_POINT.longitude,
  accuracy: 12.5,
  timestamp: '2026-09-12T12:00:00.150Z',
  ...overrides,
})

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}))

jest.mock('@/services/tracking.service', () => ({
  trackingService: {
    getActiveTrackingTrip: jest.fn(),
    getLastKnownLocation: jest.fn(),
  },
}))

// Connection handlers registry: tests fire events on them directly — the real
// service (backoff/409/refresh) has its own suite.
let mockStreamHandlers: TrackingStreamHandlers | null = null
const mockClose = jest.fn()

jest.mock('@/services/tracking-stream.service', () => ({
  connectTrackingEvents: jest.fn((_tripId: string, handlers: unknown) => {
    mockStreamHandlers = handlers as TrackingStreamHandlers
    return { close: mockClose }
  }),
}))

const mockTracking = jest.mocked(trackingService)
const mockLocation = jest.mocked(Location)
const mockConnect = jest.mocked(connectTrackingEvents)

const NO_LOCATION = new ApiClientError(
  'NO_LOCATION_AVAILABLE',
  'Nenhuma posição armazenada para esta viagem',
  404,
)

let queryClient: QueryClient

function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TrackBusScreen />
    </QueryClientProvider>,
  )
}

const grantedDevicePosition = () => {
  mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    expires: 'never',
    status: Location.PermissionStatus.GRANTED,
  })
  mockLocation.watchPositionAsync.mockImplementation(
    async (_options, callback) => {
      callback({
        coords: {
          latitude: STUDENT_SAME_POINT.latitude,
          longitude: STUDENT_SAME_POINT.longitude,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
        mocked: true,
      })
      return { remove: jest.fn() }
    },
  )
}

const dispatchLocation = (
  overrides?: Partial<{ latitude: number; longitude: number; timestamp: string }>,
) => {
  act(() => {
    mockStreamHandlers!.onLocationUpdated(locationEvent(overrides))
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStreamHandlers = null
  jest.useFakeTimers({ now: new Date('2026-09-12T12:00:00.000Z') })
  mockTracking.getActiveTrackingTrip.mockResolvedValue(TRIP)
  mockTracking.getLastKnownLocation.mockRejectedValue(NO_LOCATION)
  grantedDevicePosition()
})

afterEach(() => {
  jest.useRealTimers()
  queryClient.clear()
})

describe('TrackBusScreen — descoberta da viagem (spec-5-2)', () => {
  it('descoberta falha: "Não foi possível carregar sua viagem" e "Tentar novamente" consulta de novo', async () => {
    mockTracking.getActiveTrackingTrip.mockRejectedValue(new Error('offline'))

    renderScreen()

    // The query retries twice with the default backoff (1s, 2s) under fake timers.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        jest.advanceTimersByTime(5_000)
      })
    }
    expect(await screen.findByText('Não foi possível carregar sua viagem')).toBeTruthy()
    const callsAtError = mockTracking.getActiveTrackingTrip.mock.calls.length

    fireEvent.press(screen.getByText('Tentar novamente'))

    await waitFor(() =>
      expect(mockTracking.getActiveTrackingTrip.mock.calls.length).toBeGreaterThan(callsAtError),
    )
  })

  it('sem viagem ativa: "Nenhuma viagem ativa no momento" e nenhum stream aberto', async () => {
    mockTracking.getActiveTrackingTrip.mockResolvedValue(null)

    renderScreen()

    expect(await screen.findByText('Nenhuma viagem ativa no momento')).toBeTruthy()
    // The screen explains it re-engages by itself — no refresh needed.
    expect(
      screen.getByText(/atualiza sozinha quando o motorista iniciar a viagem/),
    ).toBeTruthy()
    expect(mockConnect).not.toHaveBeenCalled()

    // Discovery polls while null: 10s without a trip → new request.
    const callsAtEmpty = mockTracking.getActiveTrackingTrip.mock.calls.length
    act(() => jest.advanceTimersByTime(10_000))
    await waitFor(() =>
      expect(
        mockTracking.getActiveTrackingTrip.mock.calls.length,
      ).toBeGreaterThan(callsAtEmpty),
    )

    // The trip starts: non-null data arrives on the next tick and polling STOPS.
    mockTracking.getActiveTrackingTrip.mockResolvedValue(TRIP)
    act(() => jest.advanceTimersByTime(10_000))
    await waitFor(() =>
      expect(screen.queryByText('Nenhuma viagem ativa no momento')).toBeNull(),
    )
    const callsWithTrip = mockTracking.getActiveTrackingTrip.mock.calls.length
    act(() => jest.advanceTimersByTime(30_000))
    expect(mockTracking.getActiveTrackingTrip.mock.calls.length).toBe(
      callsWithTrip,
    )
  })

  it('viagem ativa com 404 NO_LOCATION_AVAILABLE: estado "aguardando a primeira posição", não erro', async () => {
    renderScreen()

    expect(
      await screen.findByText('Aguardando a primeira posição'),
    ).toBeTruthy()
    expect(screen.queryByText(/Sem sinal GPS/)).toBeNull()
  })

  it('viagem ativa com last-known: posição, distância e ETA em texto', async () => {
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: BUS_POINT.latitude,
      longitude: BUS_POINT.longitude,
      accuracy: 12.5,
      capturedAt: '2026-09-12T11:59:55.000Z',
    })

    renderScreen()

    expect(await screen.findByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
    // Student on the bus point: 0 m → "Chegando" (under 100 m).
    expect(await screen.findByText('0 m de você')).toBeTruthy()
    expect(screen.getByTestId('bus-eta-value').props.children).toBe('Chegando')
    expect(screen.getByText('Ao vivo')).toBeTruthy()
    // Coordinates live only in the caption's accessibility label, never as text.
    expect(screen.getByText(/^Última posição às \d{2}:\d{2} · precisão ~13 m$/)).toBeTruthy()
    expect(screen.queryByText(/-20\.75555/)).toBeNull()
    expect(screen.queryByTestId('track-bus-stale-banner')).toBeNull()
  })

  it('tela semeada por last-known SEM nenhum evento: 15s viram "Sem sinal GPS" com o ponto mantido', async () => {
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: BUS_POINT.latitude,
      longitude: BUS_POINT.longitude,
      accuracy: 12.5,
      capturedAt: '2026-09-12T11:59:55.000Z',
    })

    renderScreen()

    // The seed arms the SAME 15s timer: with no event at all, the point stops
    // being presented as fresh.
    expect(await screen.findByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.getByText('Ao vivo')).toBeTruthy()

    act(() => jest.advanceTimersByTime(15_000))

    expect(screen.getByText('Sem sinal GPS')).toBeTruthy()
    expect(screen.getByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
  })

  it('last-known com capturedAt de 9 casas fracionárias (wrap-3/R11): semeia e o relógio renderiza hora válida', async () => {
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: BUS_POINT.latitude,
      longitude: BUS_POINT.longitude,
      accuracy: 12.5,
      capturedAt: '2026-09-12T11:59:55.123456789Z',
    })

    renderScreen()

    // The device echo with unbounded precision must cross the screen: it seeds
    // the point and renders a clock — never "--:--".
    expect(await screen.findByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.getByText(/Última posição às \d{2}:\d{2}/)).toBeTruthy()
    expect(screen.queryByText(/Última posição às --:--/)).toBeNull()
  })
})

describe('TrackBusScreen — sinal GPS e stream (spec-5-2)', () => {
  it('location.updated atualiza a posição e liga o stream', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    dispatchLocation({ timestamp: '2026-09-12T12:00:05.000Z' })

    expect(await screen.findByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
    // Device local clock — fixed format, value depends on the environment TZ.
    expect(screen.getByText(/Última posição às \d{2}:\d{2}/)).toBeTruthy()
  })

  it('15s sem location.updated: "Sem sinal GPS" com o último ponto mantido; o retorno do evento limpa', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    dispatchLocation()

    expect(await screen.findByLabelText(/-20\.75555/)).toBeTruthy()
    expect(screen.getByText('Ao vivo')).toBeTruthy()

    // 14s: still inside the 15s window — no degraded indicator.
    act(() => jest.advanceTimersByTime(14_000))
    expect(screen.queryByText('Sem sinal GPS')).toBeNull()

    // An event resets the timer: 14s more and still not degraded.
    dispatchLocation({ timestamp: '2026-09-12T12:00:20.000Z' })
    act(() => jest.advanceTimersByTime(14_000))
    expect(screen.queryByText('Sem sinal GPS')).toBeNull()

    // A full 15s without events: the indicator shows and the last point STAYS.
    act(() => jest.advanceTimersByTime(1_000))
    expect(screen.getByText('Sem sinal GPS')).toBeTruthy()
    expect(screen.getByLabelText(/-20\.75555/)).toBeTruthy()

    // The returning event clears the indicator (a ping doesn't — it never
    // reaches the screen: locked in the service test, no 'ping' listener).
    dispatchLocation({ timestamp: '2026-09-12T12:00:40.000Z' })
    expect(screen.queryByText('Sem sinal GPS')).toBeNull()
    expect(screen.getByText('Ao vivo')).toBeTruthy()
  })

  it('"há N min" counts from the last position ARRIVAL and keeps ticking while degraded', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    // capturedAt far in the past: the counter must ignore it.
    dispatchLocation({ timestamp: '2026-09-12T11:00:00.000Z' })

    act(() => jest.advanceTimersByTime(15_000))
    expect(screen.getByText('Sem sinal GPS')).toBeTruthy()

    act(() => jest.advanceTimersByTime(60_000))
    expect(screen.getByText('Sem sinal GPS há 1 min')).toBeTruthy()
    expect(screen.getByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // The label clock ticks every 10s, so it may lag the real minute by up to a tick.
    act(() => jest.advanceTimersByTime(50_000))
    expect(screen.getByText('Sem sinal GPS há 2 min')).toBeTruthy()

    dispatchLocation({ timestamp: '2026-09-12T12:02:00.000Z' })
    expect(screen.getByText('Ao vivo')).toBeTruthy()
    expect(screen.queryByText(/Sem sinal GPS/)).toBeNull()
  })

  it('no stream outage: the staleness banner is not rendered at all', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    dispatchLocation()

    expect(await screen.findByTestId('bus-eta-card')).toBeTruthy()
    expect(screen.queryByTestId('track-bus-stale-banner')).toBeNull()
    expect(screen.queryByText(/Dados podem estar desatualizados/)).toBeNull()
  })

  it('stream fechado com 409 (onTripEnded): "Nenhuma viagem ativa no momento" e a descoberta volta a consultar', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    const callsAfterDiscovery = mockTracking.getActiveTrackingTrip.mock.calls.length

    act(() => mockStreamHandlers!.onTripEnded?.())

    expect(await screen.findByText('Nenhuma viagem ativa no momento')).toBeTruthy()
    // Re-engages by itself: the invalidation redoes discovery (polling resumes).
    await waitFor(() =>
      expect(
        mockTracking.getActiveTrackingTrip.mock.calls.length,
      ).toBeGreaterThan(callsAfterDiscovery),
    )
  })

  it('onUnrecoverable (3 refreshes falhos): banner de dado velho com ação de atualizar', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    act(() => mockStreamHandlers!.onUnrecoverable?.())

    expect(
      await screen.findByText(/Dados podem estar desatualizados/),
    ).toBeTruthy()
  })

  it('banner de dado velho: "Atualizar" refaz a descoberta e REABRE o stream morto', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    act(() => mockStreamHandlers!.onUnrecoverable?.())
    expect(
      await screen.findByText(/Dados podem estar desatualizados/),
    ).toBeTruthy()

    // The tripId didn't change — only the stream epoch re-runs the connection effect.
    const connectionsBefore = mockConnect.mock.calls.length
    fireEvent.press(screen.getByText('Atualizar'))

    await waitFor(() =>
      expect(mockConnect.mock.calls.length).toBeGreaterThan(connectionsBefore),
    )
  })

  it('fecha a conexão do stream ao desmontar a tela', async () => {
    const { unmount } = renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    expect(mockClose).not.toHaveBeenCalled()
    unmount()
    expect(mockClose).toHaveBeenCalled()
  })
})

describe('TrackBusScreen — posição do device do aluno (OQ-1)', () => {
  it('permissão negada: a tela segue útil, sem distância, com o caminho para habilitar', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      expires: 'never',
      status: Location.PermissionStatus.DENIED,
    })

    renderScreen()

    await screen.findByText('Aguardando a primeira posição')
    dispatchLocation()

    expect(await screen.findByText(/Ative a localização do app/)).toBeTruthy()
    expect(screen.getByTestId('location-permission-card')).toBeTruthy()
    // The bus position stays visible — only the distance depends on the device.
    expect(screen.getByLabelText(/-20\.75555/)).toBeTruthy()
    expect(screen.getByTestId('bus-eta-value').props.children).toBe('—')
    expect(screen.queryByTestId('bus-eta-distance')).toBeNull()
    expect(screen.queryByText(/Capturando sua localização/)).toBeNull()
  })

  it('"Permitir acesso à localização" asks again and the distance shows up once granted', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      expires: 'never',
      status: Location.PermissionStatus.DENIED,
    })

    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    dispatchLocation()

    fireEvent.press(await screen.findByText('Permitir acesso à localização'))

    expect(await screen.findByText('0 m de você')).toBeTruthy()
    expect(mockLocation.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('location-permission-card')).toBeNull()
  })

  it('permanently denied (canAskAgain false): the card offers "Abrir configurações"', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      expires: 'never',
      status: Location.PermissionStatus.DENIED,
    })

    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    dispatchLocation()

    expect(await screen.findByText('Abrir configurações')).toBeTruthy()
    expect(screen.queryByText('Permitir acesso à localização')).toBeNull()
  })

  it('a failing permission request still offers to ask again', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockRejectedValue(new Error('boom'))

    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    dispatchLocation()

    expect(await screen.findByText('Permitir acesso à localização')).toBeTruthy()
  })
})

describe('TrackBusScreen — resync do last-known e relógio (AI1/R5, wrap-1)', () => {
  it('stream morto com evento perdido: "Atualizar" reconcilia o last-known pelo REST (AC1)', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    // Last event received before the stream died.
    dispatchLocation({
      latitude: BUS_POINT.latitude,
      longitude: BUS_POINT.longitude,
      timestamp: '2026-09-12T12:00:05.000Z',
    })
    expect(await screen.findByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // What was published while the stream was dead only exists in REST — a
    // newer point, at a different coordinate.
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: -20.761,
      longitude: -42.889,
      accuracy: 9,
      capturedAt: '2026-09-12T12:00:30.000Z',
    })

    act(() => mockStreamHandlers!.onUnrecoverable?.())
    fireEvent.press(await screen.findByText('Atualizar'))

    // The REST call happened and the fetched point beat the displayed one.
    await waitFor(() =>
      expect(mockTracking.getLastKnownLocation).toHaveBeenCalled(),
    )
    expect(await screen.findByLabelText(/-20\.76100, -42\.88900/)).toBeTruthy()
  })

  it('resync com capturedAt mais velho que o evento exibido NÃO regredir a posição (AC2/R13)', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    dispatchLocation({ timestamp: '2026-09-12T12:00:05.000Z' })
    expect(await screen.findByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // REST response arriving AFTER the event, with an older capturedAt: the
    // monotonic guard drops it — the displayed position must not regress.
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: -10.0,
      longitude: -10.0,
      accuracy: 1,
      capturedAt: '2026-09-12T11:59:55.000Z',
    })

    act(() => mockStreamHandlers!.onUnrecoverable?.())
    fireEvent.press(await screen.findByText('Atualizar'))

    await waitFor(() =>
      expect(mockTracking.getLastKnownLocation).toHaveBeenCalled(),
    )
    expect(screen.getByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.queryByLabelText(/-10\.00000/)).toBeNull()
  })

  it('onOpen do stream refaz o last-known — resync contratado na reconexão', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    const callsBefore = mockTracking.getLastKnownLocation.mock.calls.length
    act(() => mockStreamHandlers!.onOpen?.())

    await waitFor(() =>
      expect(
        mockTracking.getLastKnownLocation.mock.calls.length,
      ).toBeGreaterThan(callsBefore),
    )
  })

  it('capturedAt calendaricamente inválido: "--:--", nunca "NaN:NaN" (AC7/R5)', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    // The contract schema only validates the ISO format — absurd
    // month/day/hour values get through and become Invalid Date on screen.
    dispatchLocation({ timestamp: '2026-13-45T25:99:99Z' })

    expect(await screen.findByText(/Última posição às --:--/)).toBeTruthy()
    expect(screen.queryByText(/NaN/)).toBeNull()
  })

  it('ponto REST já aplicado NÃO é reavaliado a cada evento do stream (anti-flap, R3-review)', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    // Resync applies the REST point (12:00:30).
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: -20.761,
      longitude: -42.889,
      accuracy: 9,
      capturedAt: '2026-09-12T12:00:30.000Z',
    })
    act(() => mockStreamHandlers!.onUnrecoverable?.())
    fireEvent.press(await screen.findByText('Atualizar'))
    expect(await screen.findByLabelText(/-20\.76100, -42\.88900/)).toBeTruthy()

    // Stream event with a timestamp "older" than the device capturedAt
    // (different clocks): the LIVE point is applied directly...
    dispatchLocation({ timestamp: '2026-09-12T12:00:20.000Z' })
    expect(await screen.findByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // ...and the consumed REST point doesn't come back: evaluated only once.
    act(() => jest.advanceTimersByTime(20_000))
    expect(screen.getByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.queryByLabelText(/-20\.76100/)).toBeNull()
  })

  it('resync com capturedAt inválido não desloca o ponto vivo do stream', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    dispatchLocation({ timestamp: '2026-09-12T12:00:05.000Z' })
    expect(await screen.findByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // An invalid capturedAt isn't comparable: it can't displace any point.
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: -10.0,
      longitude: -10.0,
      accuracy: 1,
      capturedAt: '2026-13-45T25:99:99Z',
    })
    act(() => mockStreamHandlers!.onUnrecoverable?.())
    fireEvent.press(await screen.findByText('Atualizar'))

    await waitFor(() =>
      expect(mockTracking.getLastKnownLocation).toHaveBeenCalled(),
    )
    expect(screen.getByLabelText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.queryByLabelText(/-10\.00000/)).toBeNull()
  })
})
