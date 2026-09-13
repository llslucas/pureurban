import {
  buildCheckInSender,
  drainNext,
  drainQueue,
  enqueueCheckIn,
  MAX_ATTEMPTS,
  MAX_BACKOFF_MS,
  MAX_QUEUE_SIZE,
  type CheckInSender,
  type QueuedCheckIn,
  type QueueStorage,
} from './offline-queue'
import { ApiClientError } from '@/services/api-error'

// Bateria do contrato do `QueueStorage` (AI6 da retro 3). Extraída do spec da
// 3.4b para rodar contra QUALQUER implementação — o fake em memória de
// `offline-queue.test.ts` e o SQLite real de `offline-queue-storage.test.ts`
// (o SQL de produção, que antes não rodava em teste nenhum: remover o
// `status = 'pending'` do `WHERE` do `listPending` passava com tudo verde).
//
// Por isso as asserções são SEMPRE pela interface (`count`, `listPending`,
// desfechos do dreno) — nunca por estado interno do storage. O que a interface
// não expõe (por exemplo `last_error` de uma linha `failed`) fica sob
// responsabilidade do teste da implementação.

const TRIP_ID = '770e8400-e29b-41d4-a716-446655440100'
const ANA = '660e8400-e29b-41d4-a716-446655440010'
const BRUNO = '660e8400-e29b-41d4-a716-446655440011'
const CARLA = '660e8400-e29b-41d4-a716-446655440012'

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

/** Registro mínimo que o `isCheckInRecord` do sender aceita como 2xx. */
const RECORD = {
  id: 'c1',
  studentId: ANA,
  tripId: TRIP_ID,
  checkedInAt: '2026-09-01T07:05:01.000Z',
  status: 'CHECKED_IN',
}

/**
 * Roda a bateria inteira contra o storage devolvido por `makeStorage`. Cada
 * teste pede um storage NOVO: implementações com estado (SQLite) precisam de
 * tabela limpa por caso, exatamente como cada teste da 3.4b semeava o próprio
 * fake.
 */
export function describeQueueStorage(
  makeStorage: () => QueueStorage | Promise<QueueStorage>,
): void {
  describe('QueueStorage — contrato exercitado pela lógica da fila', () => {
    test('enqueueCheckIn grava o item com createdAt do ESCANEAMENTO e id = chave de idempotência', async () => {
      const storage = await makeStorage()
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

    test('com a fila cheia rejeita o NOVO e preserva os antigos', async () => {
      const storage = await makeStorage()
      for (let i = 0; i < MAX_QUEUE_SIZE; i += 1) {
        await storage.insert(
          pendingItem({
            id: `key-${i}`,
            createdAt: `2026-09-01T07:${String(i % 60).padStart(2, '0')}:00.000Z`,
          }),
        )
      }

      const result = await enqueueCheckIn(storage, {
        id: 'novo',
        studentId: BRUNO,
        tripId: TRIP_ID,
        scannedAt: '2026-09-01T08:00:00.000Z',
      })

      expect(result).toEqual({ kind: 'full' })
      expect((await storage.listPending()).map((i) => i.id)).not.toContain('novo')
      expect(await storage.count('pending')).toBe(MAX_QUEUE_SIZE)
    })

    test('listPending é FIFO estrito por createdAt e devolve cópias dos itens', async () => {
      const storage = await makeStorage()
      await storage.insert(pendingItem({ id: 'c', createdAt: '2026-09-01T07:07:00.000Z' }))
      await storage.insert(pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }))
      await storage.insert(pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }))

      const items = await storage.listPending()
      expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
      // Round-trip linha ↔ objeto preserva o payload do check-in.
      expect(items[0].payload).toEqual({ studentId: ANA, tripId: TRIP_ID })
    })

    test('listPending NÃO devolve linhas sent/failed — o WHERE de status é o contrato (AC11)', async () => {
      const storage = await makeStorage()
      await storage.insert(pendingItem({ id: 'pending-1' }))
      await storage.insert(pendingItem({ id: 'sent-1' }))
      await storage.insert(pendingItem({ id: 'failed-1' }))
      await storage.markSent('sent-1')
      await storage.markFailed('failed-1', 'INVALID_QR_CODE: msg')

      expect((await storage.listPending()).map((i) => i.id)).toEqual(['pending-1'])
      expect(await storage.count('pending')).toBe(1)
      expect(await storage.count('sent')).toBe(1)
      expect(await storage.count('failed')).toBe(1)
    })

    describe('drainNext — um item por vez', () => {
      test('fila vazia é idle', async () => {
        const storage = await makeStorage()
        expect(await drainNext(storage, () => Promise.resolve())).toEqual({
          kind: 'idle',
        })
      })

      test('envia com a chave e o occurredAt gravados e marca sent no 201', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'key-1' }))
        const seen: QueuedCheckIn[] = []
        const send: CheckInSender = (item) => {
          seen.push(item)
          return Promise.resolve({ ok: true })
        }

        expect(await drainNext(storage, send)).toEqual({ kind: 'sent', id: 'key-1' })
        expect(seen).toHaveLength(1)
        expect(seen[0].id).toBe('key-1')
        expect(seen[0].createdAt).toBe('2026-09-01T07:05:00.000Z')
        expect(await storage.count('pending')).toBe(0)
        expect(await storage.count('sent')).toBe(1)
      })

      test('replay da mesma chave já aceita volta 201 e encerra sem duplicar', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'key-1', attempts: 2 }))
        let calls = 0
        const send: CheckInSender = () => {
          calls += 1
          return Promise.resolve({ replayed: true })
        }

        await drainNext(storage, send)
        expect(calls).toBe(1)
        expect(await storage.count('sent')).toBe(1)
        // Segundo dreno não reenvia: o item saiu de `pending`.
        expect(await drainNext(storage, send)).toEqual({ kind: 'idle' })
        expect(calls).toBe(1)
      })

      test('item drenado depois de a viagem encerrar sai como sent, não failed', async () => {
        // O replay idempotente vem ANTES das regras de negócio no contrato da 3.3a.
        const storage = await makeStorage()
        await storage.insert(
          pendingItem({ id: 'key-1', createdAt: '2026-09-01T07:05:00.000Z' }),
        )
        const step = await drainNext(storage, () => Promise.resolve({ status: 201 }))
        expect(step.kind).toBe('sent')
        expect(await storage.count('sent')).toBe(1)
        expect(await storage.count('failed')).toBe(0)
      })

      test('409 DUPLICATE_CHECK_IN é terminal e não retenta', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'key-1' }))
        let calls = 0
        const send: CheckInSender = () => {
          calls += 1
          return Promise.reject(new ApiClientError('DUPLICATE_CHECK_IN', 'duplicado', 409))
        }

        const step = await drainNext(storage, send)
        expect(step.kind).toBe('settled')
        expect(await storage.count('sent')).toBe(1)
        expect(await storage.count('pending')).toBe(0)
        expect(await drainNext(storage, send)).toEqual({ kind: 'idle' })
        expect(calls).toBe(1)
      })

      test('item mais velho que 24h é rejeitado pelo servidor e vira failed VISÍVEL', async () => {
        const storage = await makeStorage()
        await storage.insert(
          pendingItem({ id: 'key-1', createdAt: '2026-08-31T07:05:00.000Z' }),
        )
        const step = await drainNext(storage, () =>
          Promise.reject(new ApiClientError('INVALID_QR_CODE', 'occurredAt fora da janela', 400)),
        )

        expect(step).toEqual({
          kind: 'failed',
          id: 'key-1',
          reason: 'INVALID_QR_CODE: occurredAt fora da janela',
        })
        expect(await storage.count('failed')).toBe(1)
        expect(await storage.count('sent')).toBe(0)
      })

      test('5xx conta tentativa e agenda o próximo degrau do backoff', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'key-1' }))
        const step = await drainNext(storage, () =>
          Promise.reject(new ApiClientError('INTERNAL_ERROR', 'boom', 500)),
        )

        expect(step).toMatchObject({ kind: 'retry', id: 'key-1', attempts: 1, delayMs: 1_000 })
        // Item segue pending COM a tentativa e o erro gravados — leitura de
        // "reinício do app": o que listPending devolve é o que sobrevive.
        const [row] = await storage.listPending()
        expect(row).toMatchObject({ id: 'key-1', attempts: 1 })
        expect(row.lastError).toBe('INTERNAL_ERROR: boom')
      })
    })

    describe('drainQueue', () => {
      test('drena 3 itens na ordem de createdAt, um por vez', async () => {
        const storage = await makeStorage()
        await storage.insert(
          pendingItem({
            id: 'c',
            payload: { studentId: CARLA, tripId: TRIP_ID },
            createdAt: '2026-09-01T07:07:00.000Z',
          }),
        )
        await storage.insert(
          pendingItem({
            id: 'a',
            payload: { studentId: ANA, tripId: TRIP_ID },
            createdAt: '2026-09-01T07:05:00.000Z',
          }),
        )
        await storage.insert(
          pendingItem({
            id: 'b',
            payload: { studentId: BRUNO, tripId: TRIP_ID },
            createdAt: '2026-09-01T07:06:00.000Z',
          }),
        )
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

      test('falha de transporte interrompe o lote e mantém a ordem', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }))
        await storage.insert(pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }))
        await storage.insert(pendingItem({ id: 'c', createdAt: '2026-09-01T07:07:00.000Z' }))
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
        // 'b' foi tentado, mas transporte não consome tentativa.
        expect((await storage.listPending()).map((i) => [i.id, i.attempts])).toEqual([
          ['b', 0],
          ['c', 0],
        ])
      })

      test('um item terminal não interrompe o lote', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }))
        await storage.insert(pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }))
        await storage.insert(pendingItem({ id: 'c', createdAt: '2026-09-01T07:07:00.000Z' }))
        const send: CheckInSender = (item) =>
          item.id === 'b'
            ? Promise.reject(new ApiClientError('INVALID_QR_CODE', 'fora da janela', 400))
            : Promise.resolve()

        const summary = await drainQueue(storage, send)
        expect(summary).toMatchObject({ sent: 2, failed: 1, nextDelayMs: null })
        expect(await storage.count('pending')).toBe(0)
      })

      test('esgota exatamente 5 tentativas contra um servidor 5xx e então marca failed', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'key-1' }))
        const send: CheckInSender = () =>
          Promise.reject(new ApiClientError('INTERNAL_ERROR', 'boom', 500))
        const delays: (number | null)[] = []

        for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) {
          const summary = await drainQueue(storage, send)
          delays.push(summary.nextDelayMs)
        }
        // Antes do 5º dreno o item ainda é pending com as 4 tentativas gastas
        // (a contagem ANTES de decidir o desfecho é o que grava attempts = 5).
        expect((await storage.listPending()).map((i) => i.attempts)).toEqual([4])

        const last = await drainQueue(storage, send)
        delays.push(last.nextDelayMs)
        expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, null])
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

      test('túnel longo: 20 falhas de transporte não consomem tentativa e param no teto de 30s', async () => {
        // Linha "Túnel longo" da matriz. O oposto do 5xx acima: aqui o servidor nem
        // foi alcançado, então marcar `failed` na 5a apagaria o embarque que a fila
        // existe para salvar.
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'key-1' }))
        const send: CheckInSender = () => Promise.reject(transportError())
        const delays: (number | null)[] = []
        let transportFailures = 0

        for (let i = 0; i < 20; i += 1) {
          const summary = await drainQueue(storage, send, { transportFailures })
          transportFailures = summary.transportFailures
          delays.push(summary.nextDelayMs)
        }

        const [row] = await storage.listPending()
        expect(row).toMatchObject({ id: 'key-1', attempts: 0 })
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

      test('uma resposta do servidor zera a contagem de falhas de transporte', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }))
        await storage.insert(pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }))
        const send: CheckInSender = (item) =>
          item.id === 'b' ? Promise.reject(transportError()) : Promise.resolve()

        // Entra carregando um túnel anterior: 'a' responde, o degrau recomeça do 1s.
        const summary = await drainQueue(storage, send, { transportFailures: 6 })
        expect(summary).toMatchObject({ sent: 1, transportFailures: 1, nextDelayMs: 1_000 })
      })

      test('sessão expirada aborta o lote em vez de apagar a fila inteira', async () => {
        const storage = await makeStorage()
        await storage.insert(pendingItem({ id: 'a', createdAt: '2026-09-01T07:05:00.000Z' }))
        await storage.insert(pendingItem({ id: 'b', createdAt: '2026-09-01T07:06:00.000Z' }))
        await storage.insert(pendingItem({ id: 'c', createdAt: '2026-09-01T07:07:00.000Z' }))
        let calls = 0
        const send: CheckInSender = () => {
          calls += 1
          return Promise.reject(new ApiClientError('UNAUTHORIZED', 'sessão expirada', 401))
        }

        const summary = await drainQueue(storage, send)

        // Um POST só: sem o abort, o laço marcaria os três como `failed` de uma vez.
        expect(calls).toBe(1)
        expect(summary).toMatchObject({ sent: 0, failed: 1, nextDelayMs: null })
        expect(await storage.count('failed')).toBe(1)
        // 'b' e 'c' sobrevivem e voltam a drenar depois do próximo login.
        expect((await storage.listPending()).map((i) => i.id)).toEqual(['b', 'c'])
      })

      test('reinício do app: pending e attempts sobrevivem e o dreno retoma sozinho', async () => {
        // Simula o crash gravando o estado exato que ficaria na tabela.
        const storage = await makeStorage()
        await storage.insert(
          pendingItem({
            id: 'a',
            createdAt: '2026-09-01T07:05:00.000Z',
            attempts: 2,
            lastError: 'Network request failed',
          }),
        )
        await storage.insert(
          pendingItem({
            id: 'b',
            createdAt: '2026-09-01T07:06:00.000Z',
            attempts: 2,
            lastError: 'Network request failed',
          }),
        )

        expect((await storage.listPending()).map((i) => i.attempts)).toEqual([2, 2])

        const summary = await drainQueue(storage, () => Promise.resolve())
        expect(summary.sent).toBe(2)
        expect(await storage.count('pending')).toBe(0)
      })

      test('cada aluno vai exatamente uma vez, com o occurredAt do escaneamento', async () => {
        const storage = await makeStorage()
        await storage.insert(
          pendingItem({
            id: 'a',
            payload: { studentId: ANA, tripId: TRIP_ID },
            createdAt: '2026-09-01T07:05:00.000Z',
          }),
        )
        await storage.insert(
          pendingItem({
            id: 'b',
            payload: { studentId: BRUNO, tripId: TRIP_ID },
            createdAt: '2026-09-01T07:06:00.000Z',
          }),
        )
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

    describe('retry do dreno — idempotência (AC9)', () => {
      test('5xx no meio do dreno: o reenvio carrega a MESMA X-Idempotency-Key gravada no id do item', async () => {
        // A garantia que a 3.4b dava por leitura de código: `offline_queue.id` É
        // a chave de idempotência, então um item retentável nunca vira operação
        // nova no servidor — o 2º POST é replay do 1º.
        const storage = await makeStorage()
        const SCAN = '2026-09-01T07:05:00.000Z'
        const enqueue = await enqueueCheckIn(storage, {
          id: 'key-retry-9',
          studentId: ANA,
          tripId: TRIP_ID,
          scannedAt: SCAN,
        })
        expect(enqueue.kind).toBe('queued')

        const calls: { input: { occurredAt?: string }; key: string }[] = []
        let failures = 0
        const send = buildCheckInSender({
          checkIn: (input, key) => {
            calls.push({ input, key })
            if (failures < 1) {
              failures += 1
              return Promise.reject(new ApiClientError('INTERNAL_ERROR', 'boom', 500))
            }
            return Promise.resolve(RECORD)
          },
        })

        // 1º dreno: 500 → retry (1 tentativa gasta, backoff de 1s); 2º: 201 replay.
        const first = await drainQueue(storage, send)
        expect(first.nextDelayMs).toBe(1_000)
        const second = await drainQueue(storage, send)
        expect(second).toMatchObject({ sent: 1, nextDelayMs: null })

        expect(calls.map((c) => c.key)).toEqual(['key-retry-9', 'key-retry-9'])
        expect(calls.map((c) => c.input.occurredAt)).toEqual([SCAN, SCAN])
        expect(await storage.count('pending')).toBe(0)
        expect(await storage.count('sent')).toBe(1)
      })
    })
  })
}
