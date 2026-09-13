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
  user_id: string | null
  company_id: string | null
  updated_at: string | null
}

function nowIso(): string {
  return new Date().toISOString()
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
    userId: row.user_id ?? '',
    companyId: row.company_id ?? '',
  }
}

export const sqliteQueueStorage: QueueStorage = {
  async insert(item: QueuedCheckIn): Promise<void> {
    const db = await getDatabase()
    await db.runAsync(
      `INSERT INTO offline_queue (id, operation, payload, status, created_at, attempts, last_error, user_id, company_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.operation,
        JSON.stringify(item.payload),
        item.status,
        item.createdAt,
        item.attempts,
        item.lastError,
        item.userId,
        item.companyId,
        nowIso(),
      ],
    )
  },

  async listPending(userId: string): Promise<QueuedCheckIn[]> {
    const db = await getDatabase()
    // `operation = 'check_in'` porque o schema da architecture prevê outras
    // operações no Tier 2; drenar uma delas com o sender do check-in mandaria o
    // payload errado para o endpoint errado. `user_id = ?` é o D4: itens de
    // outro usuário (e órfãos sem dono da migração v1) nunca são drenados.
    const rows = await db.getAllAsync<QueueRow>(
      `SELECT id, operation, payload, status, created_at, attempts, last_error, user_id, company_id, updated_at
         FROM offline_queue
        WHERE status = 'pending' AND operation = 'check_in' AND user_id = ?
        ORDER BY created_at ASC`,
      [userId],
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
    // `updated_at` é o relógio da purga de `sent` (D6): sem ele não há "há
    // quanto tempo foi entregue".
    await db.runAsync(`UPDATE offline_queue SET status = 'sent', updated_at = ? WHERE id = ?`, [
      nowIso(),
      id,
    ])
  },

  async markFailed(id: string, error: string): Promise<void> {
    const db = await getDatabase()
    await db.runAsync(
      `UPDATE offline_queue SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`,
      [error, nowIso(), id],
    )
  },

  async bumpAttempt(id: string, error: string): Promise<void> {
    const db = await getDatabase()
    await db.runAsync(
      `UPDATE offline_queue SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`,
      [error, nowIso(), id],
    )
  },

  async count(status: QueueStatus, userId: string): Promise<number> {
    const db = await getDatabase()
    // Mesmo escopo do listPending: o banner nunca conta itens que o dreno do
    // usuário logado não pode tocar.
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM offline_queue WHERE status = ? AND operation = 'check_in' AND user_id = ?`,
      [status, userId],
    )
    return row?.total ?? 0
  },

  async purgeSentBefore(cutoffIso: string): Promise<void> {
    const db = await getDatabase()
    // Sem escopo de usuário de propósito: `sent` é histórico de entrega, não
    // estado — a linha de qualquer usuário já cumpriu o seu papel.
    await db.runAsync(`DELETE FROM offline_queue WHERE status = 'sent' AND updated_at < ?`, [
      cutoffIso,
    ])
  },

  async purgeUser(userId: string): Promise<void> {
    const db = await getDatabase()
    // `user_id IS NULL` leva junto as órfãs da migração v1: sem dono, nenhum
    // usuário consegue drená-las com segurança — é a mesma perda assumida no
    // aviso de logout.
    await db.runAsync(`DELETE FROM offline_queue WHERE user_id = ? OR user_id IS NULL`, [userId])
  },

  async deleteFailed(userId: string): Promise<void> {
    const db = await getDatabase()
    await db.runAsync(`DELETE FROM offline_queue WHERE status = 'failed' AND user_id = ?`, [
      userId,
    ])
  },
}
