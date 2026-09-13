import Database from 'better-sqlite3'

import { runMigrations } from '@/lib/database-migrations'
import { sqliteQueueStorage } from '@/lib/offline-queue-storage'
import { describeQueueStorage, BATTERY_NOW } from '@/utils/describe-queue-storage'
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
  const DRIVER_A = 'driver-a-1111'
  const DRIVER_B = 'driver-b-2222'
  const COMPANY = 'company-3333'

  const rawRow = (overrides: Partial<Record<string, string | number | null>> = {}) => ({
    id: 'row-1',
    operation: 'check_in',
    payload: JSON.stringify({ studentId: 's-1', tripId: 't-1' }),
    status: 'pending',
    created_at: '2026-09-01T07:05:00.000Z',
    attempts: 0,
    last_error: null,
    user_id: DRIVER_A,
    company_id: COMPANY,
    updated_at: '2026-09-01T07:05:00.000Z',
    ...overrides,
  })

  const insertRawRow = (row: Record<string, string | number | null>) => {
    // Acesso cru DE PROPÓSITO: a linha não precisa ser um QueuedCheckIn válido.
    mockCurrentDb.runAsync(
      `INSERT INTO offline_queue (id, operation, payload, status, created_at, attempts, last_error, user_id, company_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.operation,
        row.payload,
        row.status,
        row.created_at,
        row.attempts,
        row.last_error,
        row.user_id,
        row.company_id,
        row.updated_at,
      ],
    )
  }

  const rawRowById = (id: string) =>
    mockCurrentDb.getFirstAsync<{
      attempts: number
      status: string
      last_error: string | null
      user_id: string | null
      updated_at: string | null
    }>('SELECT attempts, status, last_error, user_id, updated_at FROM offline_queue WHERE id = ?', [
      id,
    ])

  const rawRowCount = () =>
    mockCurrentDb.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM offline_queue')

  // Mesmo relógio congelado da bateria: os itens semeiam createdAt fixo e o
  // dreno compara com a janela de 24h usando o relógio do processo (AC4).
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(BATTERY_NOW))
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  beforeEach(makeStorageWithRealDb)

  it('payload ilegível: marcado failed e NÃO trava o FIFO — o head-of-line do adapter (AC11)', async () => {
    // Linha corrompida na CABEÇA da fila (created_at mais velho): se ficar
    // pending, trava a fila inteira e prende o banner na tela.
    await insertRawRow(rawRow({ id: 'corrompido', payload: '{not json' }))
    await insertRawRow(
      rawRow({ id: 'valido', created_at: '2026-09-01T07:06:00.000Z' }),
    )

    const items = await sqliteQueueStorage.listPending(DRIVER_A)

    expect(items.map((i) => i.id)).toEqual(['valido'])
    expect(await sqliteQueueStorage.count('failed', DRIVER_A)).toBe(1)
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

    expect((await sqliteQueueStorage.listPending(DRIVER_A)).map((i) => i.id)).toEqual([
      'check-in-1',
    ])
    expect(await sqliteQueueStorage.count('pending', DRIVER_A)).toBe(1)
  })

  it('linhas SEM dono (órfãs da migração v1, user_id NULL) são invisíveis para qualquer usuário (D4/AC2)', async () => {
    await insertRawRow(rawRow({ id: 'orfao', user_id: null, company_id: null }))
    await insertRawRow(rawRow({ id: 'de-a', user_id: DRIVER_B }))

    expect((await sqliteQueueStorage.listPending(DRIVER_A)).map((i) => i.id)).toEqual([])
    expect((await sqliteQueueStorage.listPending(DRIVER_B)).map((i) => i.id)).toEqual(['de-a'])
    expect(await sqliteQueueStorage.count('pending', DRIVER_A)).toBe(0)
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
      userId: DRIVER_A,
      companyId: COMPANY,
    })

    const step = await drainNext(
      sqliteQueueStorage,
      () => Promise.reject(new ApiClientError('DUPLICATE_CHECK_IN', 'duplicado', 409)),
      DRIVER_A,
    )

    expect(step.kind).toBe('settled')
    const stored = await rawRowById('key-1')
    expect(stored).toMatchObject({ status: 'sent', attempts: 0 })
  })

  it('markSent/markFailed/bumpAttempt estampam updated_at — o relógio da purga (D6)', async () => {
    await sqliteQueueStorage.insert({
      id: 'key-1',
      operation: 'check_in',
      payload: { studentId: 's-1', tripId: 't-1' },
      status: 'pending',
      createdAt: '2026-09-01T07:05:00.000Z',
      attempts: 0,
      lastError: null,
      userId: DRIVER_A,
      companyId: COMPANY,
    })

    await sqliteQueueStorage.markSent('key-1')

    const stored = await rawRowById('key-1')
    expect(stored?.updated_at).not.toBeNull()
    // ISO 8601 parseável e recente (o boot desta suíte não congela o relógio).
    expect(Number.isNaN(Date.parse(stored!.updated_at!))).toBe(false)
    expect(Date.now() - Date.parse(stored!.updated_at!)).toBeLessThan(60_000)
  })

  it('purgeSentBefore remove por updated_at; purgeUser leva os órfãos NULL junto (D5/D6)', async () => {
    await insertRawRow(rawRow({ id: 'sent-antigo', status: 'sent', updated_at: '2026-08-01T00:00:00.000Z' }))
    await insertRawRow(rawRow({ id: 'sent-novo', status: 'sent' }))
    await insertRawRow(rawRow({ id: 'orfao-pending', user_id: null, company_id: null }))
    await insertRawRow(rawRow({ id: 'de-b', user_id: DRIVER_B }))

    await sqliteQueueStorage.purgeSentBefore(new Date(Date.parse(BATTERY_NOW) - 7 * 24 * 3600_000).toISOString())
    expect(await rawRowById('sent-antigo')).toBeNull()
    expect(await rawRowById('sent-novo')).not.toBeNull()

    await sqliteQueueStorage.purgeUser(DRIVER_A)
    // O órfão não é de ninguém: a purga de QUALQUER usuário o leva embora.
    expect(await rawRowById('orfao-pending')).toBeNull()
    expect(await rawRowById('de-b')).not.toBeNull()
    const remaining = await rawRowCount()
    expect(remaining?.total).toBe(1)
  })

  it('deleteFailed remove failed do usuário por SQL', async () => {
    await insertRawRow(rawRow({ id: 'f-a', status: 'failed', last_error: 'EXPIRED: x' }))
    await insertRawRow(rawRow({ id: 'f-b', status: 'failed', user_id: DRIVER_B, last_error: 'x' }))

    await sqliteQueueStorage.deleteFailed(DRIVER_A)

    expect(await rawRowById('f-a')).toBeNull()
    expect(await rawRowById('f-b')).not.toBeNull()
  })
})

describe('migração v1 → v2 da offline_queue (wrap-5, D4/AC1)', () => {
  const DRIVER = 'driver-migrado'
  const COMPANY = 'company-migrada'

  function makeDb(): NodeSQLiteDatabase {
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

  /** Cria EXATAMENTE o schema da 3.4b (v1) — sem user_version estampada. */
  async function createV1Schema(db: NodeSQLiteDatabase): Promise<void> {
    await db.execAsync(`
      CREATE TABLE offline_queue (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX idx_offline_queue_pending ON offline_queue(status, created_at);
    `)
  }

  beforeEach(() => {
    mockCurrentDb = makeDb()
  })

  it('instalação v1 migra sem perder itens pendentes (AC1)', async () => {
    const db = mockCurrentDb
    await createV1Schema(db)
    await db.runAsync(
      `INSERT INTO offline_queue (id, operation, payload, status, created_at, attempts, last_error)
       VALUES ('v1-item', 'check_in', '{"studentId":"s-1","tripId":"t-1"}', 'pending', '2026-09-01T07:05:00.000Z', 0, NULL)`,
    )

    await runMigrations(db as unknown as Parameters<typeof runMigrations>[0])

    const stored = await db.getFirstAsync<{ status: string; user_id: string | null }>(
      'SELECT status, user_id FROM offline_queue WHERE id = ?',
      ['v1-item'],
    )
    // A linha SOBREVIVE (nada foi apagado); sem dono conhecido, ela fica
    // invisível — o dono da v1 é irrecuperável, e atribuí-la à sessão atual
    // seria exatamente o dreno cruzado que o D4 existe para impedir.
    expect(stored).toMatchObject({ status: 'pending' })
    expect(stored?.user_id).toBeNull()

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(2)
  })

  it('instalação v1 migrada é idempotente: rodar de novo não quebra nem duplica coluna', async () => {
    const db = mockCurrentDb
    await createV1Schema(db)
    const run = db as unknown as Parameters<typeof runMigrations>[0]

    await runMigrations(run)
    await runMigrations(run)

    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(offline_queue)')
    const names = columns.map((c) => c.name)
    expect(names.filter((n) => n === 'user_id')).toHaveLength(1)
    const total = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) AS total FROM offline_queue',
    )
    expect(total).toMatchObject({ total: 0 })
  })

  it('crash no meio da migração (ALTER concluído, backfill não): reabrir completa o backfill', async () => {
    // Estado exato de um app morto entre o ALTER de updated_at e o UPDATE de
    // backfill: coluna existe, linhas com NULL. Sem o backfill fora do guard,
    // essas linhas nunca casariam na purga de `sent` (D6).
    const db = mockCurrentDb
    await createV1Schema(db)
    await db.runAsync(
      `INSERT INTO offline_queue (id, operation, payload, status, created_at, attempts, last_error)
       VALUES ('crash-1', 'check_in', '{"studentId":"s-1","tripId":"t-1"}', 'sent', '2026-08-01T07:05:00.000Z', 0, NULL)`,
    )
    await db.execAsync('ALTER TABLE offline_queue ADD COLUMN updated_at TEXT')

    await runMigrations(db as unknown as Parameters<typeof runMigrations>[0])

    const stored = await db.getFirstAsync<{ updated_at: string | null }>(
      'SELECT updated_at FROM offline_queue WHERE id = ?',
      ['crash-1'],
    )
    expect(stored?.updated_at).toBe('2026-08-01T07:05:00.000Z')
  })

  it('instalação NOVA nasce na v2: tabela completa, versionada e operável', async () => {
    const db = mockCurrentDb
    await runMigrations(db as unknown as Parameters<typeof runMigrations>[0])

    await sqliteQueueStorage.insert({
      id: 'novo-1',
      operation: 'check_in',
      payload: { studentId: 's-1', tripId: 't-1' },
      status: 'pending',
      createdAt: '2026-09-01T07:05:00.000Z',
      attempts: 0,
      lastError: null,
      userId: DRIVER,
      companyId: COMPANY,
    })
    expect((await sqliteQueueStorage.listPending(DRIVER)).map((i) => i.id)).toEqual(['novo-1'])

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    expect(version?.user_version).toBe(2)
  })

  it('banco na v2 não roda migração de novo (guarda de user_version)', async () => {
    const db = mockCurrentDb
    const run = db as unknown as Parameters<typeof runMigrations>[0]
    await runMigrations(run)
    await db.execAsync('PRAGMA user_version = 2')

    // Nem a guarda nem o sqlite_master falham: early-return antes de qualquer DDL.
    await expect(runMigrations(run)).resolves.toBeUndefined()
  })
})
