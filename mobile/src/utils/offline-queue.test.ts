import { ApiClientError } from '@/services/api-error'
import {
  backoffDelayMs,
  buildCheckInSender,
  classifySendError,
  drainQueue,
  isTransportFailure,
  MAX_BACKOFF_MS,
  type QueuedCheckIn,
  type QueueStatus,
  type QueueStorage,
} from '@/utils/offline-queue'
import { describeQueueStorage } from '@/utils/describe-queue-storage'

const TRIP_ID = '770e8400-e29b-41d4-a716-446655440100'
const ANA = '660e8400-e29b-41d4-a716-446655440010'
const BRUNO = '660e8400-e29b-41d4-a716-446655440011'

/**
 * Fake em memória do `QueueStorage`. É o motivo de a lógica estar atrás da
 * interface: `jest-expo` não tem SQLite nem OPFS, e `initPromise` em
 * `database.ts` é module-level e irreiniciável. Aqui o `Map` preserva ordem de
 * inserção, então `listPending` ordena explicitamente por `createdAt` — do
 * contrário o teste de FIFO passaria por acidente.
 *
 * A bateria completa do contrato do storage vive em `describe-queue-storage.ts`
 * e roda AQUI contra este fake e, com SQL real, em
 * `offline-queue-storage.test.ts` — este arquivo fica com o que é da LÓGICA
 * pura (backoff, classificação, sender).
 */
function createFakeStorage(seed: QueuedCheckIn[] = []) {
  const rows = new Map<string, QueuedCheckIn>()
  for (const item of seed) rows.set(item.id, { ...item })

  const storage: QueueStorage & { rows: Map<string, QueuedCheckIn> } = {
    rows,
    insert: (item) => {
      if (rows.has(item.id)) throw new Error(`PRIMARY KEY duplicada: ${item.id}`)
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
    markSent: (id) => {
      const row = rows.get(id)
      if (row) row.status = 'sent'
      return Promise.resolve()
    },
    markFailed: (id, error) => {
      const row = rows.get(id)
      if (row) {
        row.status = 'failed'
        row.lastError = error
      }
      return Promise.resolve()
    },
    bumpAttempt: (id, error) => {
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
  return storage
}

function pendingItem(overrides: Partial<QueuedCheckIn> & { id: string }): QueuedCheckIn {
  return {
    operation: 'check_in',
    payload: { studentId: ANA, tripId: TRIP_ID },
    status: 'pending',
    createdAt: '2026-09-01T07:05:00.000Z',
    attempts: 0,
    lastError: null,
    ...overrides,
  }
}

describeQueueStorage(() => createFakeStorage())

describe('backoffDelayMs', () => {
  it('sobe 1s, 2s, 4s, 8s e satura em 30s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoffDelayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, MAX_BACKOFF_MS, MAX_BACKOFF_MS,
    ])
  })

  it('nunca devolve menos que o primeiro degrau nem Infinity', () => {
    expect(backoffDelayMs(0)).toBe(1_000)
    expect(backoffDelayMs(-3)).toBe(1_000)
    expect(backoffDelayMs(1_000)).toBe(MAX_BACKOFF_MS)
  })
})

describe('isTransportFailure — o discriminante do enfileiramento', () => {
  it('enfileira o fetch cru e o timeout sintético', () => {
    expect(isTransportFailure(new TypeError('Network request failed'))).toBe(true)
    expect(isTransportFailure(new ApiClientError('REQUEST_TIMEOUT', 'timeout', 0))).toBe(true)
    expect(isTransportFailure('string solta')).toBe(true)
  })

  it('NUNCA enfileira uma resposta determinística do servidor', () => {
    const deterministic = [
      new ApiClientError('STUDENT_NOT_ALLOWED', 'não autorizado', 403),
      new ApiClientError('DUPLICATE_CHECK_IN', 'duplicado', 409),
      new ApiClientError('INVALID_QR_CODE', 'inválido', 400),
      new ApiClientError('INTERNAL_ERROR', 'boom', 500),
    ]
    for (const error of deterministic) {
      expect(isTransportFailure(error)).toBe(false)
    }
  })
})

describe('classifySendError — o desfecho de cada POST do dreno', () => {
  it('transporte volta como offline — retenta SEM consumir tentativa', () => {
    expect(classifySendError(new TypeError('Network request failed')).kind).toBe('offline')
    expect(classifySendError(new ApiClientError('REQUEST_TIMEOUT', 't', 0)).kind).toBe('offline')
  })

  it('5xx volta como retryable — retenta E consome tentativa', () => {
    expect(classifySendError(new ApiClientError('INTERNAL_ERROR', 'boom', 500)).kind).toBe(
      'retryable',
    )
    expect(classifySendError(new ApiClientError('BAD_GATEWAY', 'proxy', 502)).kind).toBe('retryable')
  })

  it('4xx de NEGÓCIO encerra o item como enviado', () => {
    // DUPLICATE_CHECK_IN quer dizer que o aluno embarcou: retentar só gastaria
    // as 5 tentativas para chegar ao mesmo 409.
    for (const [code, status] of [
      ['DUPLICATE_CHECK_IN', 409],
      ['STUDENT_NOT_ALLOWED', 403],
      ['TRIP_NOT_ACTIVE', 409],
      ['DRIVER_NOT_ASSIGNED', 403],
      ['TRIP_NOT_FOUND', 404],
    ] as const) {
      expect(classifySendError(new ApiClientError(code, 'msg', status)).kind).toBe('settled')
    }
  })

  it('4xx DESCONHECIDO fica visível — a lista de benignos é allowlist, não denylist', () => {
    // `MISSING_TENANT` e `FORBIDDEN` vêm dos guards e `HTTP_ERROR` do filtro de
    // exceção: nenhum deles é uma decisão de domínio sobre o embarque. Como
    // denylist, os três virariam `sent` e apagariam o check-in em silêncio.
    for (const [code, status] of [
      ['MISSING_TENANT', 403],
      ['FORBIDDEN', 403],
      ['HTTP_ERROR', 400],
      ['CODIGO_QUE_AINDA_NAO_EXISTE', 422],
    ] as const) {
      expect(classifySendError(new ApiClientError(code, 'msg', status)).kind).toBe('rejected')
    }
  })

  it('401 depois do refresh é fatal para o LOTE, não só para o item', () => {
    expect(classifySendError(new ApiClientError('UNAUTHORIZED', 'sessão expirada', 401)).kind).toBe(
      'unauthenticated',
    )
  })

  it('4xx de VALIDAÇÃO encerra como falha visível, nunca como enviado', () => {
    // O caso real: item que dormiu na fila até `occurredAt` sair da janela de 24h.
    for (const code of [
      'INVALID_QR_CODE',
      'MISSING_IDEMPOTENCY_KEY',
      'INVALID_IDEMPOTENCY_KEY',
      'IDEMPOTENCY_KEY_CONFLICT',
      'INVALID_RESPONSE',
    ]) {
      expect(classifySendError(new ApiClientError(code, 'msg', 400)).kind).toBe('rejected')
    }
  })
})

describe('buildCheckInSender — o POST que o dreno realmente emite', () => {
  // Os testes da bateria usam um `send` inline, que só afirma o mapeamento que
  // eles mesmos escrevem. Este exercita o sender de PRODUÇÃO: é o único ponto
  // onde a NFR12 (occurredAt do escaneamento), o replay idempotente e o guard
  // de registro 2xx são observáveis. O `api-client` DESENVOLVE o envelope
  // (`{ data, meta }` → `data`), então o fake resolve o registro puro — mesmo
  // shape que `boardingService.checkIn` entrega ao sender em produção.
  const RECORD = {
    id: 'c1',
    studentId: ANA,
    tripId: TRIP_ID,
    checkedInAt: '2026-09-01T07:05:01.000Z',
    status: 'CHECKED_IN',
  }
  function fakeApi(response: unknown = RECORD) {
    const calls: { input: unknown; key: string }[] = []
    return {
      calls,
      checkIn: (input: { studentId: string; tripId: string; occurredAt?: string }, key: string) => {
        calls.push({ input, key })
        return Promise.resolve(response)
      },
    }
  }

  it('manda occurredAt = createdAt do item e a chave = id do item', async () => {
    const api = fakeApi()
    const item = pendingItem({
      id: 'idem-key-1',
      payload: { studentId: ANA, tripId: TRIP_ID },
      createdAt: '2026-09-01T07:05:00.000Z',
    })

    await buildCheckInSender(api)(item)

    expect(api.calls).toEqual([
      {
        input: { studentId: ANA, tripId: TRIP_ID, occurredAt: '2026-09-01T07:05:00.000Z' },
        key: 'idem-key-1',
      },
    ])
  })

  it('reenviado pelo dreno, o item repete a MESMA chave e o MESMO occurredAt', async () => {
    const api = fakeApi()
    const item = pendingItem({ id: 'idem-key-1', createdAt: '2026-09-01T07:05:00.000Z' })
    const send = buildCheckInSender(api)

    await send(item)
    await send({ ...item, attempts: 3 })

    expect(api.calls.map((c) => c.key)).toEqual(['idem-key-1', 'idem-key-1'])
    expect(api.calls.map((c) => (c.input as { occurredAt: string }).occurredAt)).toEqual([
      '2026-09-01T07:05:00.000Z',
      '2026-09-01T07:05:00.000Z',
    ])
  })

  it('ligado ao dreno real, cada aluno sai uma vez com o horário do escaneamento', async () => {
    const api = fakeApi()
    const storage = createFakeStorage([
      pendingItem({ id: 'a', payload: { studentId: ANA, tripId: TRIP_ID }, createdAt: '2026-09-01T07:05:00.000Z' }),
      pendingItem({ id: 'b', payload: { studentId: BRUNO, tripId: TRIP_ID }, createdAt: '2026-09-01T07:06:00.000Z' }),
    ])

    await drainQueue(storage, buildCheckInSender(api))
    await drainQueue(storage, buildCheckInSender(api))

    expect(api.calls).toEqual([
      {
        input: { studentId: ANA, tripId: TRIP_ID, occurredAt: '2026-09-01T07:05:00.000Z' },
        key: 'a',
      },
      {
        input: { studentId: BRUNO, tripId: TRIP_ID, occurredAt: '2026-09-01T07:06:00.000Z' },
        key: 'b',
      },
    ])
  })

  it('2xx sem registro (corpo não-JSON vira undefined/{} no unwrap do api-client): NÃO marca sent — item segue pending como offline (AC11/DS5)', async () => {
    for (const captive of [undefined, {}]) {
      const api = fakeApi()
      // Sobrescreve DEPOIS do default: o `undefined` explícito não pode cair no
      // parâmetro default do fake — é exatamente o shape que queremos testar.
      api.checkIn = () => Promise.resolve(captive)
      const storage = createFakeStorage([
        pendingItem({ id: 'a', payload: { studentId: ANA, tripId: TRIP_ID } }),
      ])

      const summary = await drainQueue(storage, buildCheckInSender(api))

      // O passo é 'offline' (falha de transporte), NÃO 'sent': o servidor nunca
      // confirmou o embarque.
      expect(summary.steps).toEqual([
        { kind: 'offline', id: 'a', reason: expect.stringContaining('registro') },
      ])
      expect(summary.sent).toBe(0)
      const [row] = [...storage.rows.values()]
      expect(row.status).toBe('pending')
      expect(row.attempts).toBe(0)
    }
  })

  it('registro com campos incompletos (sem id/status): mesmo desfecho de transporte', async () => {
    const api = fakeApi({ studentId: ANA, tripId: TRIP_ID })
    const storage = createFakeStorage([
      pendingItem({ id: 'a', payload: { studentId: ANA, tripId: TRIP_ID } }),
    ])

    const summary = await drainQueue(storage, buildCheckInSender(api))

    expect(summary.sent).toBe(0)
    const [row] = [...storage.rows.values()]
    expect(row.status).toBe('pending')
  })
})
