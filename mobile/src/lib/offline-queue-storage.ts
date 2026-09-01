import { getDatabase } from './database'
import type { QueuedCheckIn, QueueStatus, QueueStorage } from '@/utils/offline-queue'

// ÚNICO arquivo do app com SQL da `offline_queue`. Toda a lógica (FIFO, backoff,
// teto, tentativas) vive em `@/utils/offline-queue`, que é puro e testável; aqui
// só há tradução linha <-> objeto. A separação existe porque `initPromise` em
// `database.ts` é module-level e irreiniciável, e `jest-expo` não tem SQLite
// nem OPFS — este arquivo é verificado no browser, não em teste.

interface QueueRow {
  id: string
  operation: string
  payload: string
  status: string
  created_at: string
  attempts: number
  last_error: string | null
}

function toQueuedCheckIn(row: QueueRow): QueuedCheckIn | null {
  let payload: unknown
  try {
    payload = JSON.parse(row.payload)
  } catch {
    return null
  }
  const { studentId, tripId } = (payload ?? {}) as Record<string, unknown>
  if (typeof studentId !== 'string' || typeof tripId !== 'string') return null

  return {
    id: row.id,
    operation: 'check_in',
    payload: { studentId, tripId },
    status: row.status as QueueStatus,
    createdAt: row.created_at,
    attempts: row.attempts,
    lastError: row.last_error,
  }
}

export const sqliteQueueStorage: QueueStorage = {
  async insert(item: QueuedCheckIn): Promise<void> {
    const db = await getDatabase()
    await db.runAsync(
      `INSERT INTO offline_queue (id, operation, payload, status, created_at, attempts, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.operation,
        JSON.stringify(item.payload),
        item.status,
        item.createdAt,
        item.attempts,
        item.lastError,
      ],
    )
  },

  async listPending(): Promise<QueuedCheckIn[]> {
    const db = await getDatabase()
    // `operation = 'check_in'` porque o schema da architecture prevê outras
    // operações no Tier 2; drenar uma delas com o sender do check-in mandaria o
    // payload errado para o endpoint errado.
    const rows = await db.getAllAsync<QueueRow>(
      `SELECT id, operation, payload, status, created_at, attempts, last_error
         FROM offline_queue
        WHERE status = 'pending' AND operation = 'check_in'
        ORDER BY created_at ASC`,
    )

    const items: QueuedCheckIn[] = []
    for (const row of rows) {
      const item = toQueuedCheckIn(row)
      if (item) {
        items.push(item)
        continue
      }
      // Payload ilegível não tem como ser reenviado. Deixá-lo `pending` o
      // manteria na cabeça do FIFO para sempre, travando a fila inteira e
      // prendendo o banner na tela — marcar `failed` o torna visível e libera
      // a ordem.
      console.warn(`[offline-queue] payload ilegível no item ${row.id}; marcado como failed`)
      await sqliteQueueStorage.markFailed(row.id, 'Payload ilegível na fila local')
    }
    return items
  },

  async markSent(id: string): Promise<void> {
    const db = await getDatabase()
    await db.runAsync(`UPDATE offline_queue SET status = 'sent' WHERE id = ?`, [id])
  },

  async markFailed(id: string, error: string): Promise<void> {
    const db = await getDatabase()
    await db.runAsync(`UPDATE offline_queue SET status = 'failed', last_error = ? WHERE id = ?`, [
      error,
      id,
    ])
  },

  async bumpAttempt(id: string, error: string): Promise<void> {
    const db = await getDatabase()
    await db.runAsync(
      `UPDATE offline_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
      [error, id],
    )
  },

  async count(status: QueueStatus): Promise<number> {
    const db = await getDatabase()
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM offline_queue WHERE status = ? AND operation = 'check_in'`,
      [status],
    )
    return row?.total ?? 0
  },
}
