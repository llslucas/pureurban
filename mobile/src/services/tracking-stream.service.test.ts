import {
  connectTrackingEvents,
  SSE_REPOLL_INTERVAL_MS,
  type TrackingStreamHandlers,
} from '@/services/tracking-stream.service'

// Unit coverage for the tracking SSE client (spec-5-2): backoff ladder, 409 as
// the definitive close with onTripEnded, 401 → single-flight refresh, and the
// location.updated forwarding with pings ignored. react-native-sse is replaced
// by a fake class that records instances and lets tests dispatch events at
// them (same technique as boarding-events.service.test.ts).
//
// The jest.mock factory must be plain JS: babel-plugin-jest-hoist runs before
// TS types are stripped, so any type name used inside it trips the out-of-scope
// variable check. Types live in the outer scope and are satisfied by casts.

interface MockSource {
  url: string
  options: { headers?: Record<string, string> }
  closed: boolean
  listeners: Map<string, ((event?: unknown) => void)[]>
  dispatch: (type: string, event?: unknown) => void
}

jest.mock('react-native-sse', () => {
  const instances: unknown[] = []

  class MockEventSource {
    url: string
    options: Record<string, unknown>
    closed: boolean
    listeners: Map<string, ((event?: unknown) => void)[]>

    constructor(url: string, options?: Record<string, unknown>) {
      this.url = url
      this.options = options ?? {}
      this.closed = false
      this.listeners = new Map()
      instances.push(this)
    }

    addEventListener(
      type: string,
      listener: (event?: unknown) => void,
    ): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }

    removeEventListener(
      type: string,
      listener: (event?: unknown) => void,
    ): void {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter((l) => l !== listener),
      )
    }

    removeAllEventListeners(type?: string): void {
      if (type === undefined) this.listeners.clear()
      else this.listeners.delete(type)
    }

    close(): void {
      this.closed = true
    }

    dispatch(type: string, event?: unknown): void {
      for (const listener of [...(this.listeners.get(type) ?? [])]) {
        listener(event ?? { type })
      }
    }
  }

  // Registro de instâncias para as assertions (acessado via requireMock).
  ;(MockEventSource as unknown as { __instances: unknown[] }).__instances =
    instances

  return { __esModule: true, default: MockEventSource }
})

jest.mock('@/lib/storage', () => ({
  tokenStorage: { getAccessToken: jest.fn() },
}))

jest.mock('@/services/api-client', () => ({
  refreshAccessToken: jest.fn(),
}))

const sseModule = jest.requireMock('react-native-sse') as {
  default: (abstract new () => unknown) & { __instances: MockSource[] }
}
const { tokenStorage } = jest.requireMock('@/lib/storage') as {
  tokenStorage: { getAccessToken: jest.Mock }
}
const { refreshAccessToken } = jest.requireMock('@/services/api-client') as {
  refreshAccessToken: jest.Mock
}

const instances = (): MockSource[] => sseModule.default.__instances
const lastInstance = (): MockSource => {
  const list = instances()
  if (list.length === 0) throw new Error('no EventSource was constructed')
  return list[list.length - 1]
}

const TRIP_ID = '9e7c5d42-1b3a-4f6e-8c2d-5a1b0c9d8e7f'

const LOCATION_EVENT = {
  tripId: TRIP_ID,
  latitude: -20.755549,
  longitude: -42.881728,
  accuracy: 12.5,
  timestamp: '2026-09-12T12:00:00.150Z',
}

const makeHandlers = (): TrackingStreamHandlers => ({
  onLocationUpdated: jest.fn(),
  onOpen: jest.fn(),
  onTripEnded: jest.fn(),
  onUnrecoverable: jest.fn(),
})

const errorEvent = (xhrStatus: number) => ({
  type: 'error',
  xhrStatus,
  xhrState: 4,
  message: 'boom',
})

// handleError is async (401 awaits refreshAccessToken) — the reopen happens a
// few microtasks after dispatch.
const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

beforeEach(() => {
  // O registry da factory vive pelo arquivo inteiro — sem reset, as
  // instâncias de um teste vazam para o próximo e os índices mentem.
  jest.resetAllMocks()
  instances().length = 0
  jest.useFakeTimers()
  tokenStorage.getAccessToken.mockReturnValue('token-1')
})

afterEach(() => {
  jest.useRealTimers()
})

describe('TrackingEventsClient — conexão e reconexão (spec-5-2)', () => {
  it('opens the stream for the trip with the Bearer token read from storage', () => {
    connectTrackingEvents(TRIP_ID, makeHandlers())

    expect(instances()).toHaveLength(1)
    expect(lastInstance().url).toContain(
      `/api/v1/tracking/trips/${TRIP_ID}/stream`,
    )
    expect(lastInstance().options.headers?.Authorization).toBe('Bearer token-1')
  })

  it('no token in storage: the connection still opens, without an Authorization header', () => {
    tokenStorage.getAccessToken.mockReturnValue(undefined)

    connectTrackingEvents(TRIP_ID, makeHandlers())

    expect(lastInstance().options.headers).toEqual({})
  })

  it('declares pollingInterval explicitly — the re-poll after graceful close is not hostage to the lib default (AC8/R6)', () => {
    connectTrackingEvents(TRIP_ID, makeHandlers())

    expect(lastInstance().options.pollingInterval).toBe(
      SSE_REPOLL_INTERVAL_MS,
    )
    expect(SSE_REPOLL_INTERVAL_MS).toBe(5_000)
  })

  it('location.updated forwards the parsed payload; ping and corrupt data are ignored', () => {
    const handlers = makeHandlers()
    connectTrackingEvents(TRIP_ID, handlers)
    const source = lastInstance()

    source.dispatch('location.updated', {
      type: 'location.updated',
      data: JSON.stringify(LOCATION_EVENT),
    })
    expect(handlers.onLocationUpdated).toHaveBeenCalledWith(LOCATION_EVENT)

    // Heartbeat de transporte: sem listener — ping NÃO é sinal de GPS e não
    // chega à tela de forma alguma.
    expect(() => source.dispatch('ping')).not.toThrow()
    expect(handlers.onLocationUpdated).toHaveBeenCalledTimes(1)

    // Payload corrompido não derruba o cliente.
    source.dispatch('location.updated', {
      type: 'location.updated',
      data: '{not json',
    })
    expect(handlers.onLocationUpdated).toHaveBeenCalledTimes(1)
  })

  it('pin determinístico do ping: NENHUM listener registrado e nenhum handler disparado (R17/AC4)', () => {
    // O dispatch do teste anterior prova o caminho de hoje; o R17 pede o pin
    // ESTRUTURAL: sem listener para 'ping' não existe caminho nenhum do
    // heartbeat até o estado da tela — inclusive o timer de 15s do indicador
    // "Sem sinal GPS", que só o onLocationUpdated alimenta. O e2e que tentava
    // provar isso era probabilístico (ping depende do timing da lib).
    const handlers = makeHandlers()
    connectTrackingEvents(TRIP_ID, handlers)
    const source = lastInstance()

    expect(source.listeners.has('ping')).toBe(false)
    expect([...source.listeners.keys()].sort()).toEqual([
      'error',
      'location.updated',
      'open',
    ])

    source.dispatch('ping')
    expect(handlers.onLocationUpdated).not.toHaveBeenCalled()
    expect(handlers.onOpen).not.toHaveBeenCalled()
    expect(handlers.onTripEnded).not.toHaveBeenCalled()
    expect(handlers.onUnrecoverable).not.toHaveBeenCalled()
  })

  it("an 'open' fires onOpen and resets the backoff ladder", async () => {
    refreshAccessToken.mockResolvedValue(false)
    const handlers = makeHandlers()
    connectTrackingEvents(TRIP_ID, handlers)

    lastInstance().dispatch('error', errorEvent(0))
    await flush()
    jest.advanceTimersByTime(1_000)
    lastInstance().dispatch('open')
    expect(handlers.onOpen).toHaveBeenCalledTimes(1)

    // Escada zerada pelo open: o próximo erro espera 1s de novo.
    lastInstance().dispatch('error', errorEvent(0))
    await flush()
    jest.advanceTimersByTime(999)
    expect(instances()).toHaveLength(2)
    jest.advanceTimersByTime(1)
    expect(instances()).toHaveLength(3)
  })

  it('error 409 closes definitively, fires onTripEnded and never reconnects', async () => {
    const handlers = makeHandlers()
    const connection = connectTrackingEvents(TRIP_ID, handlers)
    const first = lastInstance()

    first.dispatch('error', errorEvent(409))
    await flush()

    expect(first.closed).toBe(true)
    expect(handlers.onTripEnded).toHaveBeenCalledTimes(1)

    // Nenhum timer de reconexão: avanço de 1 min não constrói nova conexão.
    jest.advanceTimersByTime(60_000)
    expect(instances()).toHaveLength(1)

    // Erros tardios na instância morta não reabrem nada nem reavisam.
    first.dispatch('error', errorEvent(0))
    await flush()
    expect(instances()).toHaveLength(1)
    expect(handlers.onTripEnded).toHaveBeenCalledTimes(1)

    // close() duplo é inofensivo.
    expect(() => connection.close()).not.toThrow()
  })

  it('error 401 with successful refresh reopens with a FRESH token read from storage', async () => {
    tokenStorage.getAccessToken
      .mockReturnValueOnce('token-1')
      .mockReturnValue('token-2')
    refreshAccessToken.mockResolvedValue(true)

    connectTrackingEvents(TRIP_ID, makeHandlers())
    const first = lastInstance()

    first.dispatch('error', errorEvent(401))
    await flush()

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    // Reaberto na hora (sem esperar backoff), lendo o token novo do storage.
    expect(instances()).toHaveLength(2)
    expect(lastInstance().options.headers?.Authorization).toBe('Bearer token-2')
    expect(first.closed).toBe(true)
  })

  it('backoff ladder: 1s, 2s, 4s, 8s, 16s, capped at 30s', async () => {
    refreshAccessToken.mockResolvedValue(false)
    connectTrackingEvents(TRIP_ID, makeHandlers())

    // Cada erro agenda a próxima tentativa; a partir do 6º o cap de 30s vale
    // para sempre (2^6 s = 64s → 30s).
    const ladder = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]
    for (let index = 0; index < ladder.length; index += 1) {
      const source = lastInstance()
      source.dispatch('error', errorEvent(0))
      await flush()

      // 1ms antes do vencimento: ainda não reabriu.
      jest.advanceTimersByTime(ladder[index] - 1)
      expect(instances()).toHaveLength(index + 1)
      jest.advanceTimersByTime(1)
      expect(instances()).toHaveLength(index + 2)
    }
  })

  it('three consecutive 401s with failed refresh close the stream and fire onUnrecoverable', async () => {
    refreshAccessToken.mockResolvedValue(false)
    const handlers = makeHandlers()
    connectTrackingEvents(TRIP_ID, handlers)

    // Falha 1 → backoff de 1s; falha 2 → backoff de 2s; falha 3 → fim.
    for (const backoff of [1_000, 2_000]) {
      lastInstance().dispatch('error', errorEvent(401))
      await flush()
      expect(handlers.onUnrecoverable).not.toHaveBeenCalled()
      jest.advanceTimersByTime(backoff)
      expect(instances().length).toBeGreaterThanOrEqual(2)
    }

    lastInstance().dispatch('error', errorEvent(401))
    await flush()

    expect(handlers.onUnrecoverable).toHaveBeenCalledTimes(1)
    expect(handlers.onTripEnded).not.toHaveBeenCalled()
    expect(lastInstance().closed).toBe(true)
    // Encerrado de verdade: tempo grande o bastante para qualquer backoff não
    // cria conexão.
    jest.advanceTimersByTime(120_000)
    expect(instances()).toHaveLength(3)
  })
})
