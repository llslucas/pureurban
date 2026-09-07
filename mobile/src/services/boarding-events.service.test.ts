import {
  connectBoardingEvents,
  type BoardingEventHandlers,
} from '@/services/boarding-events.service'

// Unit coverage for the SSE client reconnect logic (spec-4-2 I/O matrix, "Queda
// de rede" row) — the screen tests mock this whole service, so the backoff
// ladder, the 409 definitive close and the 401 → refresh → reopen path would
// otherwise be uncovered. react-native-sse is replaced by a fake class that
// records instances and lets tests dispatch events at them.
//
// The jest.mock factory must be plain JS: babel-plugin-jest-hoist runs before
// TS types are stripped, so any type name used inside it trips the out-of-scope
// variable check. Types live in the outer scope and are satisfied by casts.

interface MockSource {
  url: string
  options: { headers?: Record<string, string> }
  closed: boolean
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

const TRIP_ID = 'f5819ec5-6e0a-4b0a-9c1d-9c96f65a1d99'

const makeHandlers = (): BoardingEventHandlers => ({
  onNotReturning: jest.fn(),
  onAbsenceCancelled: jest.fn(),
  onOpen: jest.fn(),
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

describe('BoardingEventsClient — reconnect (spec-4-2, "Queda de rede")', () => {
  it('error 409 closes definitively: source closed, no reconnect timer, further errors ignored', async () => {
    const handlers = makeHandlers()
    const connection = connectBoardingEvents(TRIP_ID, handlers)
    const first = lastInstance()
    expect(first.closed).toBe(false)

    first.dispatch('error', errorEvent(409))
    await flush()

    expect(first.closed).toBe(true)

    // Nenhum timer de reconexão: avanço de 1 min não constrói nova conexão.
    jest.advanceTimersByTime(60_000)
    expect(instances()).toHaveLength(1)

    // Erros tardios na instância morta não reabrem nada.
    first.dispatch('error', errorEvent(0))
    await flush()
    expect(instances()).toHaveLength(1)

    // close() duplo é inofensivo.
    expect(() => connection.close()).not.toThrow()
  })

  it('error 401 with successful refresh reopens with a FRESH token read from storage', async () => {
    tokenStorage.getAccessToken.mockReturnValueOnce('token-1').mockReturnValue('token-2')
    refreshAccessToken.mockResolvedValue(true)

    connectBoardingEvents(TRIP_ID, makeHandlers())
    const first = lastInstance()
    expect(first.options.headers?.Authorization).toBe('Bearer token-1')
    expect(tokenStorage.getAccessToken).toHaveBeenCalledTimes(1)

    first.dispatch('error', errorEvent(401))
    await flush()

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    // Reaberto na hora (sem esperar backoff), lendo o token novo do storage.
    expect(instances()).toHaveLength(2)
    expect(lastInstance().options.headers?.Authorization).toBe('Bearer token-2')
    expect(tokenStorage.getAccessToken).toHaveBeenCalledTimes(2)
    expect(lastInstance().url).toContain('/api/v1/boarding/events')
    expect(first.closed).toBe(true)
  })

  it('error 401 with failed refresh falls back to the backoff timer', async () => {
    refreshAccessToken.mockResolvedValue(false)

    connectBoardingEvents(TRIP_ID, makeHandlers())
    const first = lastInstance()

    first.dispatch('error', errorEvent(401))
    await flush()

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(instances()).toHaveLength(1)

    jest.advanceTimersByTime(999)
    expect(instances()).toHaveLength(1)
    jest.advanceTimersByTime(1)
    expect(instances()).toHaveLength(2)
  })

  it('backoff ladder: 1s, 2s, 4s, 8s, 16s, capped at 30s', async () => {
    refreshAccessToken.mockResolvedValue(false)
    connectBoardingEvents(TRIP_ID, makeHandlers())

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

  it("an 'open' resets the ladder: next error backs off from 1s again", async () => {
    refreshAccessToken.mockResolvedValue(false)
    connectBoardingEvents(TRIP_ID, makeHandlers())

    const first = lastInstance()
    first.dispatch('error', errorEvent(0))
    await flush()
    jest.advanceTimersByTime(1_000)
    expect(instances()).toHaveLength(2)

    // Conexão estabelecida: attempts volta a zero.
    lastInstance().dispatch('open')
    lastInstance().dispatch('error', errorEvent(0))
    await flush()

    jest.advanceTimersByTime(999)
    expect(instances()).toHaveLength(2)
    jest.advanceTimersByTime(1)
    expect(instances()).toHaveLength(3)
  })

  it("'open' fires onOpen on the first connection and on every reconnection", async () => {
    refreshAccessToken.mockResolvedValue(true)
    const handlers = makeHandlers()
    connectBoardingEvents(TRIP_ID, handlers)

    // Primeira conexão.
    lastInstance().dispatch('open')
    expect(handlers.onOpen).toHaveBeenCalledTimes(1)

    // Reabertura pós-queda (401 → refresh → reopen): onOpen dispara de novo.
    lastInstance().dispatch('error', errorEvent(401))
    await flush()
    lastInstance().dispatch('open')
    expect(handlers.onOpen).toHaveBeenCalledTimes(2)
  })

  it('named events forward the parsed payload to the handlers; ping has no listener', () => {
    const handlers = makeHandlers()
    connectBoardingEvents(TRIP_ID, handlers)
    const source = lastInstance()

    source.dispatch('boarding.not_returning', {
      type: 'boarding.not_returning',
      data: JSON.stringify({
        tripId: TRIP_ID,
        studentId: 'student-1',
        notifiedAt: '2026-09-07T18:10:00.000Z',
      }),
    })
    expect(handlers.onNotReturning).toHaveBeenCalledWith({
      tripId: TRIP_ID,
      studentId: 'student-1',
      notifiedAt: '2026-09-07T18:10:00.000Z',
    })

    source.dispatch('boarding.absence_cancelled', {
      type: 'boarding.absence_cancelled',
      data: JSON.stringify({
        tripId: TRIP_ID,
        studentId: 'student-1',
        cancelledAt: '2026-09-07T18:11:00.000Z',
      }),
    })
    expect(handlers.onAbsenceCancelled).toHaveBeenCalledWith({
      tripId: TRIP_ID,
      studentId: 'student-1',
      cancelledAt: '2026-09-07T18:11:00.000Z',
    })

    // Heartbeat de transporte: sem listener registrado, ninguém é chamado.
    expect(() => source.dispatch('ping')).not.toThrow()
    expect(handlers.onNotReturning).toHaveBeenCalledTimes(1)

    // Payload corrompido não derruba o cliente.
    source.dispatch('boarding.not_returning', {
      type: 'boarding.not_returning',
      data: '{not json',
    })
    expect(handlers.onNotReturning).toHaveBeenCalledTimes(1)
  })

  it('no token in storage: the connection still opens, without an Authorization header', () => {
    tokenStorage.getAccessToken.mockReturnValue(undefined)

    connectBoardingEvents(TRIP_ID, makeHandlers())

    expect(instances()).toHaveLength(1)
    expect(lastInstance().options.headers).toEqual({})
  })
})
