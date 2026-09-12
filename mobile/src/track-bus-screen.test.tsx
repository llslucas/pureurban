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
// the 15s "Sem sinal GPS" degradação (fake timers), the 409 empty state and
// the staleness banner.

const TRIP: ActiveTrackingTrip = {
  tripId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  type: 'OUTBOUND',
}

// Mesmo ponto para ônibus e aluno: distância ~0 → "Chegando" (determinístico
// sem depender de valores decimais de haversine).
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

// Registro dos handlers da conexão: os testes disparam eventos neles direto —
// o serviço real (backoff/409/refresh) tem suíte própria.
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
  it('sem viagem ativa: "Nenhuma viagem ativa no momento" e nenhum stream aberto', async () => {
    mockTracking.getActiveTrackingTrip.mockResolvedValue(null)

    renderScreen()

    expect(await screen.findByText('Nenhuma viagem ativa no momento')).toBeTruthy()
    // A tela explica que se reengaja sozinha — o aluno não precisa refresh.
    expect(
      screen.getByText(/atualiza sozinha quando o motorista iniciar a viagem/),
    ).toBeTruthy()
    expect(mockConnect).not.toHaveBeenCalled()

    // Descoberta em polling enquanto null: 10s sem viagem → nova consulta.
    const callsAtEmpty = mockTracking.getActiveTrackingTrip.mock.calls.length
    act(() => jest.advanceTimersByTime(10_000))
    await waitFor(() =>
      expect(
        mockTracking.getActiveTrackingTrip.mock.calls.length,
      ).toBeGreaterThan(callsAtEmpty),
    )

    // A viagem começa: data não-null chega no próximo tick e o polling PARA.
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

    expect(await screen.findByText(/-20\.75555, -42\.88173/)).toBeTruthy()
    // Aluno no mesmo ponto do ônibus: 0 m → "Chegando" (menos de 100 m).
    expect(await screen.findByText('0 m')).toBeTruthy()
    expect(screen.getByText(/Chegando/)).toBeTruthy()
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

    // A semente arma o MESMO timer de 15s: sem evento algum, o ponto deixa de
    // ser apresentado como fresco.
    expect(await screen.findByText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.getByText('Em tempo real')).toBeTruthy()

    act(() => jest.advanceTimersByTime(15_000))

    expect(screen.getByText('Sem sinal GPS')).toBeTruthy()
    expect(screen.getByText(/-20\.75555, -42\.88173/)).toBeTruthy()
  })
})

describe('TrackBusScreen — sinal GPS e stream (spec-5-2)', () => {
  it('location.updated atualiza a posição e liga o stream', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    dispatchLocation({ timestamp: '2026-09-12T12:00:05.000Z' })

    expect(await screen.findByText(/-20\.75555, -42\.88173/)).toBeTruthy()
    // Relógio local do device — formato fixo, valor depende do TZ do ambiente.
    expect(screen.getByText(/Posição de \d{2}:\d{2}:\d{2}/)).toBeTruthy()
  })

  it('15s sem location.updated: "Sem sinal GPS" com o último ponto mantido; o retorno do evento limpa', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    dispatchLocation()

    expect(await screen.findByText(/-20\.75555/)).toBeTruthy()
    expect(screen.getByText('Em tempo real')).toBeTruthy()

    // 14s: ainda dentro da janela de 15s — sem indicador de degradado.
    act(() => jest.advanceTimersByTime(14_000))
    expect(screen.queryByText('Sem sinal GPS')).toBeNull()

    // Evento reseta o timer: mais 14s e nada de degradado.
    dispatchLocation({ timestamp: '2026-09-12T12:00:20.000Z' })
    act(() => jest.advanceTimersByTime(14_000))
    expect(screen.queryByText('Sem sinal GPS')).toBeNull()

    // 15s completos sem evento: indicador aparece e o último ponto PERMANECE.
    act(() => jest.advanceTimersByTime(1_000))
    expect(screen.getByText('Sem sinal GPS')).toBeTruthy()
    expect(screen.getByText(/-20\.75555/)).toBeTruthy()

    // O evento de volta limpa o indicador (e não o ping — ping não chega à
    // tela: isso é travado no teste do serviço, sem listener para 'ping').
    dispatchLocation({ timestamp: '2026-09-12T12:00:40.000Z' })
    expect(screen.queryByText('Sem sinal GPS')).toBeNull()
    expect(screen.getByText('Em tempo real')).toBeTruthy()
  })

  it('stream fechado com 409 (onTripEnded): "Nenhuma viagem ativa no momento" e a descoberta volta a consultar', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')
    const callsAfterDiscovery = mockTracking.getActiveTrackingTrip.mock.calls.length

    act(() => mockStreamHandlers!.onTripEnded?.())

    expect(await screen.findByText('Nenhuma viagem ativa no momento')).toBeTruthy()
    // Reengajar sozinho: o invalidation refaz a descoberta (polling retoma).
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

    // O tripId não mudou — só a época do stream reexecuta o effect da conexão.
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
    // A posição do ônibus continua visível — só a distância depende do device.
    expect(screen.getByText(/-20\.75555/)).toBeTruthy()
  })
})

describe('TrackBusScreen — resync do last-known e relógio (AI1/R5, wrap-1)', () => {
  it('stream morto com evento perdido: "Atualizar" reconcilia o last-known pelo REST (AC1)', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    // Último evento recebido antes de o stream morrer.
    dispatchLocation({
      latitude: BUS_POINT.latitude,
      longitude: BUS_POINT.longitude,
      timestamp: '2026-09-12T12:00:05.000Z',
    })
    expect(await screen.findByText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // O que foi publicado durante a janela morta só existe no REST — ponto
    // mais novo, em coordenada diferente.
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: -20.761,
      longitude: -42.889,
      accuracy: 9,
      capturedAt: '2026-09-12T12:00:30.000Z',
    })

    act(() => mockStreamHandlers!.onUnrecoverable?.())
    fireEvent.press(await screen.findByText('Atualizar'))

    // A chamada REST aconteceu e o ponto trazido venceu o exibido.
    await waitFor(() =>
      expect(mockTracking.getLastKnownLocation).toHaveBeenCalled(),
    )
    expect(await screen.findByText(/-20\.76100, -42\.88900/)).toBeTruthy()
  })

  it('resync com capturedAt mais velho que o evento exibido NÃO regredir a posição (AC2/R13)', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    dispatchLocation({ timestamp: '2026-09-12T12:00:05.000Z' })
    expect(await screen.findByText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // Resposta REST chegando DEPOIS do evento, com capturedAt mais velho: a
    // guarda monotônica descarta — a posição exibida não pode regredir.
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
    expect(screen.getByText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.queryByText(/-10\.00000/)).toBeNull()
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

  it('capturedAt calendaricamente inválido: "--:--:--", nunca "NaN:NaN:NaN" (AC7/R5)', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    // O schema do contrato valida só o formato ISO — mês/dia/hora absurdos
    // atravessam e viram Invalid Date na tela.
    dispatchLocation({ timestamp: '2026-13-45T25:99:99Z' })

    expect(await screen.findByText(/Posição de --:--:--/)).toBeTruthy()
    expect(screen.queryByText(/NaN/)).toBeNull()
  })

  it('ponto REST já aplicado NÃO é reavaliado a cada evento do stream (anti-flap, R3-review)', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    // Resync aplica o ponto REST (12:00:30).
    mockTracking.getLastKnownLocation.mockResolvedValue({
      tripId: TRIP.tripId,
      latitude: -20.761,
      longitude: -42.889,
      accuracy: 9,
      capturedAt: '2026-09-12T12:00:30.000Z',
    })
    act(() => mockStreamHandlers!.onUnrecoverable?.())
    fireEvent.press(await screen.findByText('Atualizar'))
    expect(await screen.findByText(/-20\.76100, -42\.88900/)).toBeTruthy()

    // Evento do stream com timestamp "mais velho" que o capturedAt do device
    // (relógios diferentes): o ponto VIVO é aplicado direto...
    dispatchLocation({ timestamp: '2026-09-12T12:00:20.000Z' })
    expect(await screen.findByText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // ...e o ponto REST consumido não volta: a resposta foi avaliada uma vez.
    act(() => jest.advanceTimersByTime(20_000))
    expect(screen.getByText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.queryByText(/-20\.76100/)).toBeNull()
  })

  it('resync com capturedAt inválido não desloca o ponto vivo do stream', async () => {
    renderScreen()
    await screen.findByText('Aguardando a primeira posição')

    dispatchLocation({ timestamp: '2026-09-12T12:00:05.000Z' })
    expect(await screen.findByText(/-20\.75555, -42\.88173/)).toBeTruthy()

    // capturedAt inválido não é comparável: não pode deslocar ponto nenhum.
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
    expect(screen.getByText(/-20\.75555, -42\.88173/)).toBeTruthy()
    expect(screen.queryByText(/-10\.00000/)).toBeNull()
  })
})
