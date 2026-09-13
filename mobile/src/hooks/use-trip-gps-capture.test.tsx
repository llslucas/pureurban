import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Location from 'expo-location'

import { useTripGpsCapture } from '@/hooks/use-trip-gps-capture'
import { ApiClientError } from '@/services/api-error'
import { trackingService } from '@/services/tracking.service'
import { GPS_CAPTURE_INTERVAL_MS } from '@/utils/gps-capture'

// O controlador puro tem suíte própria (utils/gps-capture.test.ts). Este spec
// prende a ADAPTAÇÃO ao app (AI3): 409/403 determinísticos são classificados
// como fatal — a captura para e a descoberta ['activeTrip'] é invalidada, para
// a tela voltar ao estado "sem viagem" — e falha transitória de rede mantém a
// cadência da 5.1. Toda falha loga aviso (transmissão morta em silêncio era o
// achado R3).

const TRIP_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

// Shape de LocationObject (o hook lê `coords` e `timestamp`), não de GpsPosition.
const LOCATION_OBJECT = {
  coords: {
    latitude: -20.755549,
    longitude: -42.881728,
    accuracy: 12.5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.parse('2026-09-12T12:00:00.000Z'),
  mocked: true,
}

jest.mock('expo-location', () => ({
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}))

// O hook puxa `trip-queries` → `trip.service` → `api-client` → MMKV (Nitro não
// carrega sob jest-expo). A classe de erro já vem do módulo puro `api-error`;
// aqui só o storage precisa ser fingido para a cadeia carregar.
jest.mock('@/lib/storage', () => {
  const noop = () => undefined
  return {
    storage: { getString: () => undefined, set: noop, remove: noop },
    tokenStorage: {
      getAccessToken: () => undefined,
      setAccessToken: noop,
      getRefreshToken: () => undefined,
      setRefreshToken: noop,
      clearTokens: noop,
    },
    userStorage: { getUser: () => null, setUser: noop, clearUser: noop },
    qrSessionStorage: {
      getSessionId: () => undefined,
      setSessionId: noop,
      clearSessionId: noop,
    },
  }
})

jest.mock('@/services/tracking.service', () => ({
  trackingService: { ingestLocation: jest.fn() },
}))

const mockLocation = jest.mocked(Location)
const mockIngest = jest.mocked(trackingService.ingestLocation)

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function renderCapture(initial: { tripId: string | null; granted: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  let args = initial
  const view = renderHook(
    () => useTripGpsCapture(args.tripId, args.granted),
    { wrapper },
  )
  return {
    ...view,
    invalidateSpy,
    rerenderWith: (next: Partial<typeof args>) => {
      args = { ...args, ...next }
      view.rerender()
    },
  }
}

describe('useTripGpsCapture — classificação de falha de envio (AI3)', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockLocation.getCurrentPositionAsync.mockResolvedValue(
      LOCATION_OBJECT as never,
    )
  })

  afterEach(() => {
    warnSpy.mockRestore()
    jest.useRealTimers()
  })

  it('409 TRIP_NOT_ACTIVE: para a captura após o primeiro 409 e invalida a descoberta (AC5)', async () => {
    mockIngest.mockRejectedValue(
      new ApiClientError('TRIP_NOT_ACTIVE', 'A viagem não está ativa', 409),
    )
    const { invalidateSpy } = renderCapture({ tripId: TRIP_ID, granted: true })

    await act(async () => {
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['activeTrip'],
    })

    // Sem viagem ativa no servidor, os ticks seguintes NÃO postam mais: o
    // dispositivo que não viu o encerramento para de transmitir sozinho.
    await act(async () => {
      jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS * 3)
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[gps-capture]'),
      expect.any(ApiClientError),
    )
  })

  it('403 determinístico: mesmo desfecho fatal do 409', async () => {
    mockIngest.mockRejectedValue(
      new ApiClientError('DRIVER_NOT_ASSIGNED', 'Sem vínculo', 403),
    )
    const { invalidateSpy } = renderCapture({ tripId: TRIP_ID, granted: true })

    await act(async () => {
      await flush()
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['activeTrip'] })

    await act(async () => {
      jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS * 2)
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(1)
  })

  it('falha de rede isolada NÃO interrompe a cadência e não invalida nada (AC6)', async () => {
    mockIngest.mockRejectedValue(new TypeError('Network request failed'))
    const { invalidateSpy } = renderCapture({ tripId: TRIP_ID, granted: true })

    await act(async () => {
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS)
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(2)

    await act(async () => {
      jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS)
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(3)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('gate reativo: tripId null (viagem encerrada no cache) não gera POST nenhum (NFR10)', async () => {
    mockIngest.mockResolvedValue({ tripId: TRIP_ID, receivedAt: '2026-09-12T12:00:00.000Z' })
    const view = renderCapture({ tripId: null, granted: true })

    await act(async () => {
      jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS * 3)
      await flush()
    })
    expect(mockIngest).not.toHaveBeenCalled()

    // Viagem ativa no cache: a captura começa.
    view.rerenderWith({ tripId: TRIP_ID })
    await act(async () => {
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(1)
  })

  it('gate de permissão: denied ⇒ 0 POSTs; conceder depois arma a cadência normal (NFR10/R15)', async () => {
    // O cego do R15: toda instância de browser/Playwright nasce COM permissão,
    // então remover `&& permissionGranted` do gate passava por toda suíte e2e.
    // Este caso exercita o corpo do hook nos DOIS lados da borda — a mutação
    // agora quebra aqui.
    mockIngest.mockResolvedValue({ tripId: TRIP_ID, receivedAt: '2026-09-12T12:00:00.000Z' })
    const view = renderCapture({ tripId: TRIP_ID, granted: false })

    // Viagem ativa + permissão negada: nem o primeiro envio imediato parte.
    await act(async () => {
      await flush()
    })
    expect(mockIngest).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS * 3)
      await flush()
    })
    expect(mockIngest).not.toHaveBeenCalled()

    // Permissão concedida com a viagem ainda ativa: o primeiro POST parte na
    // hora e a cadência segue (mais um tick ⇒ mais um POST).
    view.rerenderWith({ granted: true })
    await act(async () => {
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS)
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(2)

    // Direção revogada: negada de novo NO MEIO da viagem PARA a captura sozinha
    // (o else do gate — sem isto a captura continuaria postando com permissão
    // negada até a viagem acabar).
    view.rerenderWith({ granted: false })
    await act(async () => {
      jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS * 3)
      await flush()
    })
    expect(mockIngest).toHaveBeenCalledTimes(2)
  })
})
