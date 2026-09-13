import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useOfflineSync } from '@/hooks/use-offline-sync'
import { boardingService } from '@/services/boarding.service'
import type { QueuedCheckIn, QueueStatus, QueueStorage } from '@/utils/offline-queue'

// O dreno em produção vive aqui (layout do grupo do motorista). Este spec
// prende o wiring do hook contra um storage fake: contagens sobem para o
// banner e, no desfecho de CADA item, o sender de produção
// (`buildCheckInSender`) é quem posta.
//
// O caso da invalidação é um PIN DE BASELINE (DS1 da retro 3, AI6): HOJE o
// dreno bem-sucedido NÃO invalida roster/`activeTrip` — a lista do motorista
// envelhece até remount/staleTime. O gap é conhecido e roteado (AI3d,
// spec-wrap-5); quando o fix pousar, este teste muda COM ele — é o delta
// consciente que o wrap-5 executa.

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

const mockCheckIn = jest.mocked(boardingService.checkIn)

const TRIP_ID = '770e8400-e29b-41d4-a716-446655440100'
const ANA = '660e8400-e29b-41d4-a716-446655440010'

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
    listPending: () =>
      Promise.resolve(
        [...rows.values()]
          .filter((item) => item.status === 'pending')
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
    count: (status: QueueStatus) =>
      Promise.resolve([...rows.values()].filter((item) => item.status === status).length),
  }
}

const pendingItem = (overrides: Partial<QueuedCheckIn> & { id: string }): QueuedCheckIn => ({
  operation: 'check_in',
  payload: { studentId: ANA, tripId: TRIP_ID },
  status: 'pending',
  createdAt: '2026-09-01T07:05:00.000Z',
  attempts: 0,
  lastError: null,
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

describe('useOfflineSync — dreno no boot (AI6, retro 3)', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
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

  it('PIN de baseline DS1: dreno bem-sucedido NÃO invalida roster/activeTrip (o fix é do wrap-5/AI3d)', async () => {
    mockCheckIn.mockResolvedValue(RECORD)
    const storage = createFakeStorage([pendingItem({ id: 'item-1' })])

    const { result, invalidateSpy } = renderSync(storage)
    await act(async () => {
      await flush()
    })

    // O dreno completou (contagens em 0), mas nenhuma query de roster ou
    // descoberta é invalidada: a lista do motorista segue com o estado de
    // antes do embarque sincronizado até remount/staleTime/refetch. Este é o
    // gap DS1 documentado — se este teste passar a falhar sem mudança aqui,
    // alguém implementou (ou quebrou) a invalidação sem passar pelo wrap-5.
    expect(mockCheckIn).toHaveBeenCalledTimes(1)
    expect(result.current.pendingCount).toBe(0)
    expect(result.current.failedCount).toBe(0)
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
