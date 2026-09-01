import { ApiClientError } from '@/services/api-error'
import {
  backoffDelayMs,
  buildCheckInSender,
  classifySendError,
  drainNext,
  drainQueue,
  enqueueCheckIn,
  isTransportFailure,
  MAX_ATTEMPTS,
  MAX_BACKOFF_MS,
  MAX_QUEUE_SIZE,
  type CheckInSender,
  type QueuedCheckIn,
  type QueueStatus,
  type QueueStorage,
} from '@/utils/offline-queue'

const TRIP_ID = '770e8400-e29b-41d4-a716-446655440100'
const ANA = '660e8400-e29b-41d4-a716-446655440010'
const BRUNO = '660e8400-e29b-41d4-a716-446655440011'
const CARLA = '660e8400-e29b-41d4-a716-446655440012'

/**
 * Fake em memória do `QueueStorage`. É o motivo de a lógica estar atrás da
 * interface: `jest-expo` não tem SQLite nem OPFS, e `initPromise` em
 * `database.ts` é module-level e irreiniciável. Aqui o `Map` preserva ordem de
 * inserção, então `listPending` ordena explicitamente por `createdAt` — do
 * contrário o teste de FIFO passaria por acidente.
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

/** Falha de transporte crua: o `fetch` rejeita, o `api-client` repassa sem envelopar. */
const transportError = () => new TypeError('Network request failed')

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
    expect(isTransportFailure(transportError())).toBe(true)
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

describe('enqueueCheckIn', () => {
  it('grava o item com createdAt do ESCANEAMENTO e id = chave de idempotência', async () => {
    const storage = createFakeStorage()
    const result = await enqueueCheckIn(storage, {
      id: 'key-1',
      studentId: ANA,
      tripId: TRIP_ID,
      scannedAt: '2026-09-01T07:05:00.000Z',
    })

    expect(result).toEqual({
      kind: 'queued',
      item: {
        id: 'key-1',
        operation: 'check_in',
        payload: { studentId: ANA, tripId: TRIP_ID },
        status: 'pending',
        createdAt: '2026-09-01T07:05:00.000Z',
        attempts: 0,
        lastError: null,
      },
    })
    expect(await storage.count('pending')).toBe(1)
  })

  it('com a fila cheia rejeita o NOVO e preserva os antigos', async () => {
    const seed = Array.from({ length: MAX_QUEUE_SIZE }, (_, i) =>
      pendingItem({ id: `key-${i}`, createdAt: `2026-09-01T07:${String(i % 60).padStart(2, '0')}:00.000Z` }),
    )
    const storage = createFakeStorage(seed)

    const result = await enqueueCheckIn(storage, {
      id: 'novo',
      studentId: BRUNO,
      tripId: TRIP_ID,
      scannedAt: '2026-09-01T08:00:00.000Z',
    })

    expect(result).toEqual({ kind: 'full' })
    expect(storage.rows.has('novo')).toBe(false)
    expect(await storage.count('pending')).toBe(MAX_QUEUE_SIZE)
  })
})

describe('classifySendError — o desfecho de cada POST do dreno', () => {
  it('transporte volta como offline — retenta SEM consumir tentativa', () => {
    expect(classifySendError(transportError()).kind).toBe('offline')
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

describe('drainNext — um item por vez', () => {
  it('fila vazia é idle', async () => {
    expect(await drainNext(createFakeStorage(), () => Promise.resolve())).toEqual({ kind: 'idle' })
  })

  it('envia com a chave e o occurredAt gravados e marca sent no 201', async () => {
    const storage = createFakeStorage([pendingItem({ id: 'key-1' })])
    const seen: QueuedCheckIn[] = []
    const send: CheckInSender = (item) => {
      seen.push(item)
      return Promise.resolve({ ok: true })
    }

    expect(await drainNext(storage, send)).toEqual({ kind: 'sent', id: 'key-1' })
    expect(seen).toHaveLength(1)
    expect(seen[0].id).toBe('key-1')
    expect(seen[0].createdAt).toBe('2026-09-01T07:05:00.000Z')
    expect(storage.rows.get('key-1')?.status).toBe('sent')
    expect(await storage.count('pending')).toBe(0)
  })

  it('replay da mesma chave já aceita volta 201 e encerra sem duplicar', async () => {
    const storage = createFakeStorage([pendingItem({ id: 'key-1', attempts: 2 })])
    let calls = 0
    const send: CheckInSender = () => {
      calls += 1
      return Promise.resolve({ replayed: true })
    }

    await drainNext(storage, send)
    expect(calls).toBe(1)
    expect(storage.rows.get('key-1')?.status).toBe('sent')
    // Segundo dreno não reenvia: o item saiu de `pending`.
    expect(await drainNext(storage, send)).toEqual({ kind: 'idle' })
    expect(calls).toBe(1)
  })

  it('item drenado depois de a viagem encerrar sai como sent, não failed', async () => {
    // O replay idempotente vem ANTES das regras de negócio no contrato da 3.3a.
    const storage = createFakeStorage([
      pendingItem({ id: 'key-1', createdAt: '2026-09-01T07:05:00.000Z' }),
    ])
    const step = await drainNext(storage, () => Promise.resolve({ status: 201 }))
    expect(step.kind).toBe('sent')
    expect(storage.rows.get('key-1')?.status).toBe('sent')
  })

  it('409 DUPLICATE_CHECK_IN é terminal e não retenta', async () => {
    const storage = createFakeStorage([pendingItem({ id: 'key-1' })])
    let calls = 0
    const send: CheckInSender = () => {
      calls += 1
      return Promise.reject(new ApiClientError('DUPLICATE_CHECK_IN', 'duplicado', 409))
    }

    const step = await drainNext(storage, send)
    expect(step.kind).toBe('settled')
    expect(storage.rows.get('key-1')?.status).toBe('sent')
    expect(storage.rows.get('key-1')?.attempts).toBe(0)
    expect(await drainNext(storage, send)).toEqual({ kind: 'idle' })
    expect(calls).toBe(1)
  })

  it('item mais velho que 24h é rejeitado pelo servidor e vira failed VISÍVEL', async () => {
    const storage = createFakeStorage([
      pendingItem({ id: 'key-1', createdAt: '2026-08-31T07:05:00.000Z' }),
    ])
    const step = await drainNext(storage, () =>
      Promise.reject(new ApiClientError('INVALID_QR_CODE', 'occurredAt fora da janela', 400)),
    )

    expect(step).toEqual({
      kind: 'failed',
      id: 'key-1',
      reason: 'INVALID_QR_CODE: occurredAt fora da janela',
    })
    expect(storage.rows.get('key-1')?.status).toBe('failed')
    expect(await storage.count('failed')).toBe(1)
    expect(await storage.count('sent')).toBe(0)
  })

  it('5xx conta tentativa e agenda o próximo degrau do backoff', async () => {
    const storage = createFakeStorage([pendingItem({ id: 'key-1' })])
    const step = await drainNext(storage, () =>
      Promise.reject(new ApiClientError('INTERNAL_ERROR', 'boom', 500)),
    )

    expect(step).toMatchObject({ kind: 'retry', id: 'key-1', attempts: 1, delayMs: 1_000 })
    expect(storage.rows.get('key-1')).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'INTERNAL_ERROR: boom',
    })
  })
})

describe('drainQueue', () => {
  it('drena 3 itens na ordem de createdAt, um por vez', async () => {
    const storage = createFakeStorage([
      pendingItem({ id: 'c', payload: { studentId: CARLA, tripId: TRIP_ID }, createdAt: '2026-09-01T07:07:00.000Z' }),
      pendingItem({ id: 'a', payload: { studentId: ANA, tripId: TRIP_ID }, createdAt: '2026-09-01T07:05:00.000Z' }),
      pendingItem({ id: 'b', payload: { studentId: BRUNO, tripId: TRIP_ID }, createdAt: '2026-09-01T07:06:00.000Z' }),
    ])
    const order: string[] = []
    let inFlight = 0
    const send: CheckInSender = async (item) => {
      expect(inFlight).toBe(0)
      inFlight += 1
      await Promise.resolve()
      order.push(item.id)
      inFlight -= 1
    }

    const summary = await drainQueue(storage, send)
    expect(order).toEqual(['a', 'b', 'c'])
    expect(summary.sent).toBe(3)
    expect(summary.nextDelayMs).toBeNull()
    expect(await storage.count('pending')).toBe(0)
  })

  it('falha de transporte interrompe o lote e mantém a ordem', async () => {
    const storage = createFakeStorage([
      pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }),
      pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }),
      pendingItem({ id: 'c', createdAt: '2026-09-01T07:07:00.000Z' }),
    ])
    const sent: string[] = []
    const send: CheckInSender = (item) => {
      if (item.id === 'b') return Promise.reject(transportError())
      sent.push(item.id)
      return Promise.resolve()
    }

    const summary = await drainQueue(storage, send)
    expect(sent).toEqual(['a'])
    expect(summary.nextDelayMs).toBe(1_000)
    // 'c' NÃO foi tentado e continua atrás de 'b' na fila.
    expect((await storage.listPending()).map((i) => i.id)).toEqual(['b', 'c'])
    expect(storage.rows.get('c')?.attempts).toBe(0)
    // 'b' foi tentado, mas transporte não consome tentativa.
    expect(storage.rows.get('b')?.attempts).toBe(0)
  })

  it('um item terminal não interrompe o lote', async () => {
    const storage = createFakeStorage([
      pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }),
      pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }),
      pendingItem({ id: 'c', createdAt: '2026-09-01T07:07:00.000Z' }),
    ])
    const send: CheckInSender = (item) =>
      item.id === 'b'
        ? Promise.reject(new ApiClientError('INVALID_QR_CODE', 'fora da janela', 400))
        : Promise.resolve()

    const summary = await drainQueue(storage, send)
    expect(summary).toMatchObject({ sent: 2, failed: 1, nextDelayMs: null })
    expect(await storage.count('pending')).toBe(0)
  })

  it('esgota exatamente 5 tentativas contra um servidor 5xx e então marca failed', async () => {
    const storage = createFakeStorage([pendingItem({ id: 'key-1' })])
    const send: CheckInSender = () =>
      Promise.reject(new ApiClientError('INTERNAL_ERROR', 'boom', 500))
    const delays: (number | null)[] = []

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const summary = await drainQueue(storage, send)
      delays.push(summary.nextDelayMs)
    }

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, null])
    expect(storage.rows.get('key-1')).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS })
    expect(await storage.count('pending')).toBe(0)
    expect(await storage.count('failed')).toBe(1)

    // Esgotado é esgotado: um dreno a mais não reenvia nada.
    let extra = 0
    await drainQueue(storage, () => {
      extra += 1
      return Promise.resolve()
    })
    expect(extra).toBe(0)
  })

  it('túnel longo: 20 falhas de transporte não consomem tentativa e param no teto de 30s', async () => {
    // Linha "Túnel longo" da matriz. O oposto do 5xx acima: aqui o servidor nem
    // foi alcançado, então marcar `failed` na 5a apagaria o embarque que a fila
    // existe para salvar.
    const storage = createFakeStorage([pendingItem({ id: 'key-1' })])
    const send: CheckInSender = () => Promise.reject(transportError())
    const delays: (number | null)[] = []
    let transportFailures = 0

    for (let i = 0; i < 20; i += 1) {
      const summary = await drainQueue(storage, send, { transportFailures })
      transportFailures = summary.transportFailures
      delays.push(summary.nextDelayMs)
    }

    expect(storage.rows.get('key-1')).toMatchObject({ status: 'pending', attempts: 0 })
    expect(await storage.count('failed')).toBe(0)
    expect(delays.slice(0, 4)).toEqual([1_000, 2_000, 4_000, 8_000])
    // Da 6a falha em diante o backoff satura e o item segue esperando a rede.
    expect(delays.slice(5)).toEqual(Array<number>(15).fill(MAX_BACKOFF_MS))

    // A rede volta: o mesmo item ainda é enviável, com a chave e o horário originais.
    const posts: string[] = []
    const summary = await drainQueue(storage, (item) => {
      posts.push(item.id)
      return Promise.resolve()
    })
    expect(posts).toEqual(['key-1'])
    expect(summary).toMatchObject({ sent: 1, transportFailures: 0, nextDelayMs: null })
  })

  it('uma resposta do servidor zera a contagem de falhas de transporte', async () => {
    const storage = createFakeStorage([
      pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }),
      pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }),
    ])
    const send: CheckInSender = (item) =>
      item.id === 'b' ? Promise.reject(transportError()) : Promise.resolve()

    // Entra carregando um túnel anterior: 'a' responde, o degrau recomeça do 1s.
    const summary = await drainQueue(storage, send, { transportFailures: 6 })
    expect(summary).toMatchObject({ sent: 1, transportFailures: 1, nextDelayMs: 1_000 })
  })

  it('sessão expirada aborta o lote em vez de apagar a fila inteira', async () => {
    const storage = createFakeStorage([
      pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }),
      pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }),
      pendingItem({ id: 'c', createdAt: '2026-09-01T07:07:00.000Z' }),
    ])
    let calls = 0
    const send: CheckInSender = () => {
      calls += 1
      return Promise.reject(new ApiClientError('UNAUTHORIZED', 'sessão expirada', 401))
    }

    const summary = await drainQueue(storage, send)

    // Um POST só: sem o abort, o laço marcaria os três como `failed` de uma vez.
    expect(calls).toBe(1)
    expect(summary).toMatchObject({ sent: 0, failed: 1, nextDelayMs: null })
    expect(storage.rows.get('a')?.status).toBe('failed')
    // 'b' e 'c' sobrevivem e voltam a drenar depois do próximo login.
    expect((await storage.listPending()).map((i) => i.id)).toEqual(['b', 'c'])
  })

  it('reinício do app: pending e attempts sobrevivem e o dreno retoma sozinho', async () => {
    // Simula o crash gravando o estado exato que ficaria na tabela.
    const persisted = [
      pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z', attempts: 2, lastError: 'Network request failed' }),
      pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z', attempts: 2, lastError: 'Network request failed' }),
    ]
    const afterRestart = createFakeStorage(persisted)

    expect((await afterRestart.listPending()).map((i) => i.attempts)).toEqual([2, 2])

    const summary = await drainQueue(afterRestart, () => Promise.resolve())
    expect(summary.sent).toBe(2)
    expect(await afterRestart.count('pending')).toBe(0)
  })

  it('cada aluno vai exatamente uma vez, com o occurredAt do escaneamento', async () => {
    const storage = createFakeStorage([
      pendingItem({ id: 'a', payload: { studentId: ANA, tripId: TRIP_ID }, createdAt: '2026-09-01T07:05:00.000Z' }),
      pendingItem({ id: 'b', payload: { studentId: BRUNO, tripId: TRIP_ID }, createdAt: '2026-09-01T07:06:00.000Z' }),
    ])
    const posts: { studentId: string; occurredAt: string; key: string }[] = []
    const send: CheckInSender = (item) => {
      posts.push({ studentId: item.payload.studentId, occurredAt: item.createdAt, key: item.id })
      return Promise.resolve()
    }

    await drainQueue(storage, send)
    // Um segundo dreno (rede oscilando) não pode reenviar nada.
    await drainQueue(storage, send)

    expect(posts).toEqual([
      { studentId: ANA, occurredAt: '2026-09-01T07:05:00.000Z', key: 'a' },
      { studentId: BRUNO, occurredAt: '2026-09-01T07:06:00.000Z', key: 'b' },
    ])
  })
})

describe('buildCheckInSender — o POST que o dreno realmente emite', () => {
  // Os testes acima usam um `send` inline, que só afirma o mapeamento que eles
  // mesmos escrevem. Este exercita o sender de PRODUÇÃO: é o único ponto onde a
  // NFR12 (occurredAt do escaneamento) e o replay idempotente são observáveis.
  function fakeApi() {
    const calls: { input: unknown; key: string }[] = []
    return {
      calls,
      checkIn: (input: { studentId: string; tripId: string; occurredAt?: string }, key: string) => {
        calls.push({ input, key })
        return Promise.resolve({ status: 201 })
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
})
