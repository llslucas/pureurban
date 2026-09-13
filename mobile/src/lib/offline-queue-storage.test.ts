import Database from 'better-sqlite3'

import { runMigrations } from '@/lib/database-migrations'
import { sqliteQueueStorage } from '@/lib/offline-queue-storage'
import { describeQueueStorage } from '@/utils/describe-queue-storage'
import { drainNext } from '@/utils/offline-queue'
import { ApiClientError } from '@/services/api-error'

// A bateria do `QueueStorage` rodando contra SQLite REAL em Node (AI6 da retro
// 3): até aqui o SQL de produção de `offline-queue-storage.ts` só rodava no
// browser — remover o `status = 'pending'` do `WHERE` do `listPending` passava
// com a suíte inteira verde, porque o fake em memória implementa a própria
// regra. Aqui o SQL que roda é o MESMO do app: o `jest.mock` de
// `@/lib/database` troca apenas o driver expo-sqlite (nativo, indisponível em
// teste) por um handle better-sqlite3 :memory:, e o `sqliteQueueStorage` real
// executa por cima — migrações reais incluídas.
//
// `better-sqlite3` é devDependency SÓ de teste (decisão no spec do wrap-2): o
// `QueueStorage` é interface e o adapter de produção não toca neste pacote.

/**
 * A fatia do `SQLiteDatabase` do expo-sqlite que o storage e as migrações
 * usam, implementada sobre o better-sqlite3. Assinaturas async: o app recebe
 * promises do expo-sqlite; o better-sqlite3 é síncrono — o adapter só
 * embrulha.
 */
interface NodeSQLiteDatabase {
  execAsync(sql: string): Promise<void>
  runAsync(sql: string, params?: unknown[]): Promise<void>
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>
}

// Handles abertos pelo teste — fechados no afterAll: sem isso cada caso vaza
// um handle nativo (o describeQueueStorage não tem teardown próprio).
const openedDbs: Database.Database[] = []

function makeNodeSQLiteDatabase(): NodeSQLiteDatabase {
  const db = new Database(':memory:')
  openedDbs.push(db)
  return {
    async execAsync(sql: string) {
      db.exec(sql)
    },
    async runAsync(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...params)
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params) as T[]
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null
    },
  }
}

// A factory do jest.mock não pode referenciar variáveis de fora, exceto as que
// começam com "mock" — o handle corrente é trocado a cada teste no beforeEach.
let mockCurrentDb: NodeSQLiteDatabase

jest.mock('@/lib/database', () => ({
  getDatabase: () => Promise.resolve(mockCurrentDb),
}))

async function makeStorageWithRealDb(): Promise<void> {
  mockCurrentDb = makeNodeSQLiteDatabase()
  await runMigrations(mockCurrentDb as unknown as Parameters<typeof runMigrations>[0])
}

afterAll(() => {
  for (const db of openedDbs) db.close()
})

describeQueueStorage(async () => {
  await makeStorageWithRealDb()
  return sqliteQueueStorage
})

describe('sqliteQueueStorage — SQL de produção (específico da implementação)', () => {
  // A bateria acima assevera SOMENTE pela interface QueueStorage. Estes casos
  // leem o banco direto porque pinam regras que moram no SQL/mapeamento do
  // adapter — exatamente os buracos que motivaram o AC11.
  const rawRow = (overrides: Partial<Record<string, string | number>> = {}) => ({
    id: 'row-1',
    operation: 'check_in',
    payload: JSON.stringify({ studentId: 's-1', tripId: 't-1' }),
    status: 'pending',
    created_at: '2026-09-01T07:05:00.000Z',
    attempts: 0,
    last_error: null,
    ...overrides,
  })

  const insertRawRow = (row: Record<string, string | number | null>) => {
    // Acesso cru DE PROPÓSITO: a linha não precisa ser um QueuedCheckIn válido.
    mockCurrentDb.runAsync(
      `INSERT INTO offline_queue (id, operation, payload, status, created_at, attempts, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.operation, row.payload, row.status, row.created_at, row.attempts, row.last_error],
    )
  }

  const rawRowById = (id: string) =>
    mockCurrentDb.getFirstAsync<{ attempts: number; status: string; last_error: string | null }>(
      'SELECT attempts, status, last_error FROM offline_queue WHERE id = ?',
      [id],
    )

  beforeEach(makeStorageWithRealDb)

  it('payload ilegível: marcado failed e NÃO trava o FIFO — o head-of-line do adapter (AC11)', async () => {
    // Linha corrompida na CABEÇA da fila (created_at mais velho): se ficar
    // pending, trava a fila inteira e prende o banner na tela.
    await insertRawRow(rawRow({ id: 'corrompido', payload: '{not json' }))
    await insertRawRow(
      rawRow({ id: 'valido', created_at: '2026-09-01T07:06:00.000Z' }),
    )

    const items = await sqliteQueueStorage.listPending()

    expect(items.map((i) => i.id)).toEqual(['valido'])
    expect(await sqliteQueueStorage.count('failed')).toBe(1)
    const stored = await rawRowById('corrompido')
    expect(stored).toMatchObject({ status: 'failed' })
    expect(stored?.last_error).toContain('ilegível')
  })

  it("listPending e count ignoram linhas de OUTRA operação — o guard operation = 'check_in' do WHERE", async () => {
    // O schema da architecture prevê outras operações no Tier 2; drenar uma
    // delas com o sender do check-in mandaria o payload errado para o
    // endpoint errado. A QueuedCheckIn não expressa outra operation — a linha
    // só entra por SQL cru.
    await insertRawRow(rawRow({ id: 'outra-op', operation: 'future_op' }))
    await insertRawRow(rawRow({ id: 'check-in-1' }))

    expect((await sqliteQueueStorage.listPending()).map((i) => i.id)).toEqual(['check-in-1'])
    expect(await sqliteQueueStorage.count('pending')).toBe(1)
  })

  it('desfecho settled (4xx de negócio) NÃO grava tentativa — markSent não toca em attempts', async () => {
    // A bateria não consegue ler attempts de uma linha sent (sai de
    // listPending); por SQL dá. Era asserção do spec original da 3.4b que a
    // extração para a interface não podia carregar.
    await sqliteQueueStorage.insert({
      id: 'key-1',
      operation: 'check_in',
      payload: { studentId: 's-1', tripId: 't-1' },
      status: 'pending',
      createdAt: '2026-09-01T07:05:00.000Z',
      attempts: 0,
      lastError: null,
    })

    const step = await drainNext(sqliteQueueStorage, () =>
      Promise.reject(new ApiClientError('DUPLICATE_CHECK_IN', 'duplicado', 409)),
    )

    expect(step.kind).toBe('settled')
    const stored = await rawRowById('key-1')
    expect(stored).toMatchObject({ status: 'sent', attempts: 0 })
  })
})
