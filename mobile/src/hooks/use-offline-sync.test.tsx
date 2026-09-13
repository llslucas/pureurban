import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useOfflineSync } from '@/hooks/use-offline-sync'
import { boardingService } from '@/services/boarding.service'
import { ApiClientError } from '@/services/api-error'
import type { QueuedCheckIn, QueueStatus, QueueStorage } from '@/utils/offline-queue'

// O dreno em produção vive aqui (layout do grupo do motorista). Este spec
// prende o wiring do hook contra um storage fake: contagens sobem para o
// banner, no desfecho de CADA item o sender de produção (`buildCheckInSender`)
// é quem posta, o dreno bem-sucedido invalida roster/`activeTrip` (D7/AC9 —
// antigo pin de baseline DS1 da retro 3, revertido pelo wrap-5) e o ciclo do
// banner vermelho termina na ação "Dispensar" (D1/AC6).
//
// O relógio é congelado: os itens são semeados com data fixa e o dreno compara
// `createdAt` com a janela de 24h usando o relógio do processo (AC4).

jest.mock('@/lib/connectivity', () => ({
  startConnectivityListeners: jest.fn(() => () => undefined),
}))

// O default param do hook importa o módulo do SQLite nativo — fingido para a
// cadeia carregar (o storage sob teste é sempre passado explícito).
jest.mock('@/lib/offline-queue-storage', () => ({
  sqliteQueueStorage: {},
}))

jest.mock('@/services/boarding.service', () => ({
  boardingService: { checkIn: jest.fn() },
}))

// As keys de query vêm de `@/lib/trip-queries`, que arrasta o api-client (e o
// MMKV nativo). O mock devolve as MESMAS keys — o que este spec afirma é que o
// hook invalida essas chaves, não como elas são construídas.
jest.mock('@/lib/trip-queries', () => ({
  activeTripKey: ['activeTrip'] as const,
  tripStudentsKey: (tripId: string | undefined) => ['trip', tripId, 'students'] as const,
}))

// O hook lê SÓ `user` do store, via selector. Um objeto `user` vivo enquanto
// `mockAuthUserId` é não-nulo; `null` simula sessão encerrada (D4).
let mockAuthUserId: string | null = 'driver-a-1111'

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockAuthUserId ? { id: mockAuthUserId } : null }),
}))

const mockCheckIn = jest.mocked(boardingService.checkIn)

const TRIP_ID = '770e8400-e29b-41d4-a716-446655440100'
const ANA = '660e8400-e29b-41d4-a716-446655440010'
const DRIVER_A = 'driver-a-1111'
const COMPANY = 'company-3333'

const RECORD = {
  id: 'c1',
  studentId: ANA,
  tripId: TRIP_ID,
  checkedInAt: '2026-09-01T07:05:01.000Z',
  status: 'CHECKED_IN' as const,
}

/** Fake mínimo do `QueueStorage` — a bateria completa é da suíte da fila. */
function createFakeStorage(
  seed: QueuedCheckIn[] = [],
): QueueStorage & { rows: Map<string, QueuedCheckIn> } {
  const rows = new Map<string, QueuedCheckIn>()
  for (const item of seed) rows.set(item.id, { ...item })
  return {
    rows,
    insert: (item: QueuedCheckIn) => {
      rows.set(item.id, { ...item })
      return Promise.resolve()
    },
    listPending: (userId: string) =>
      Promise.resolve(
        [...rows.values()]
          .filter((item) => item.status === 'pending' && item.userId === userId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((item) => ({ ...item })),
      ),
    markSent: (id: string) => {
      const row = rows.get(id)
      if (row) row.status = 'sent'
      return Promise.resolve()
    },
    markFailed: (id: string, error: string) => {
      const row = rows.get(id)
      if (row) {
        row.status = 'failed'
        row.lastError = error
      }
      return Promise.resolve()
    },
    bumpAttempt: (id: string, error: string) => {
      const row = rows.get(id)
      if (row) {
        row.attempts += 1
        row.lastError = error
      }
      return Promise.resolve()
    },
    count: (status: QueueStatus, userId: string) =>
      Promise.resolve(
        [...rows.values()].filter((item) => item.status === status && item.userId === userId)
          .length,
      ),
    purgeSentBefore: jest.fn(() => Promise.resolve()),
    purgeUser: jest.fn((userId: string) => {
      for (const [id, item] of rows) {
        if (item.userId === userId) rows.delete(id)
      }
      return Promise.resolve()
    }),
    deleteFailed: jest.fn((userId: string) => {
      for (const [id, item] of rows) {
        if (item.status === 'failed' && item.userId === userId) rows.delete(id)
      }
      return Promise.resolve()
    }),
  }
}

const pendingItem = (overrides: Partial<QueuedCheckIn> & { id: string }): QueuedCheckIn => ({
  operation: 'check_in',
  payload: { studentId: ANA, tripId: TRIP_ID },
  status: 'pending',
  createdAt: '2026-09-01T07:05:00.000Z',
  attempts: 0,
  lastError: null,
  userId: DRIVER_A,
  companyId: COMPANY,
  ...overrides,
})

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function renderSync(storage: QueueStorage) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useOfflineSync(storage), { wrapper })
  return { ...view, invalidateSpy }
}

beforeAll(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-09-01T08:00:00.000Z'))
})

afterAll(() => {
  jest.useRealTimers()
})

describe('useOfflineSync — dreno no boot (AI6, retro 3)', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUserId = DRIVER_A
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('drena o que sobreviveu ao fechamento do app e atualiza as contagens do banner', async () => {
    mockCheckIn.mockResolvedValue(RECORD)
    const storage = createFakeStorage([
      pendingItem({ id: 'item-1' }),
      pendingItem({ id: 'item-2', createdAt: '2026-09-01T07:06:00.000Z' }),
    ])

    const { result } = renderSync(storage)
    await act(async () => {
      await flush()
    })

    // NFR11: os dois itens pendentes do boot saem com a chave = id gravado.
    expect(mockCheckIn).toHaveBeenCalledTimes(2)
    expect(mockCheckIn.mock.calls.map(([, key]) => key)).toEqual(['item-1', 'item-2'])
    expect(result.current.pendingCount).toBe(0)
    expect(result.current.failedCount).toBe(0)
  })

  it('D7/AC9 (era o pin DS1): dreno bem-sucedido invalida o roster da viagem e a activeTrip', async () => {
    mockCheckIn.mockResolvedValue(RECORD)
    const storage = createFakeStorage([pendingItem({ id: 'item-1' })])

    const { result, invalidateSpy } = renderSync(storage)
    await act(async () => {
      await flush()
    })

    // O embarque só passa a existir para o servidor no dreno: é AGORA que o
    // roster fica velho. A lista do motorista reflete o embarque sem remount.
    expect(mockCheckIn).toHaveBeenCalledTimes(1)
    expect(result.current.pendingCount).toBe(0)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['trip', TRIP_ID, 'students'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['activeTrip'] })
  })

  it('dreno sem entrega NÃO invalida nada: só sent/settled envelhecem o roster', async () => {
    mockCheckIn.mockRejectedValue(new TypeError('Network request failed'))
    const storage = createFakeStorage([pendingItem({ id: 'item-1' })])

    const { invalidateSpy } = renderSync(storage)
    await act(async () => {
      await flush()
    })

    // Falha de transporte não mudou nada no servidor — invalidar seria refetch
    // à toa contra a rede que acabou de cair.
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('D4: sem usuário logado o hook nem consulta a fila', async () => {
    mockAuthUserId = null
    mockCheckIn.mockResolvedValue(RECORD)
    const storage = createFakeStorage([pendingItem({ id: 'item-1' })])

    const { result } = renderSync(storage)
    await act(async () => {
      await flush()
    })

    expect(mockCheckIn).not.toHaveBeenCalled()
    expect(result.current.pendingCount).toBe(0)
    expect(result.current.failedCount).toBe(0)
  })

  it('D6/AC8: a purga de `sent` no boot NÃO é do hook — vive no ciclo de vida global (root layout), que drena qualquer sessão', async () => {
    const storage = createFakeStorage([pendingItem({ id: 'item-1' })])

    renderSync(storage)
    await act(async () => {
      await flush()
    })

    expect(storage.purgeSentBefore).not.toHaveBeenCalled()
  })

  it('D1/AC6 — ciclo completo: falha pinta o banner, "Dispensar" zera a contagem', async () => {
    // 400 determinístico = falha definitiva (D2): o item sai da fila como
    // `failed` e o vermelho não vai embora sozinho.
    mockCheckIn.mockRejectedValue(new ApiClientError('INVALID_QR_CODE', 'fora da janela', 400))
    const storage = createFakeStorage([pendingItem({ id: 'item-1' })])

    const { result } = renderSync(storage)
    await act(async () => {
      await flush()
    })

    expect(result.current.pendingCount).toBe(0)
    expect(result.current.failedCount).toBe(1)

    await act(async () => {
      result.current.dismissFailed()
      await flush()
    })

    expect(storage.deleteFailed).toHaveBeenCalledWith(DRIVER_A)
    expect(result.current.failedCount).toBe(0)
    expect(result.current.pendingCount).toBe(0)
  })
})
