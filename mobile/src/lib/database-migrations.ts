import type { SQLiteDatabase } from 'expo-sqlite'

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_error TEXT
    );

    -- Cobre o único SELECT quente da fila: os pendentes em ordem de created_at
    -- (FIFO estrito, architecture.md §5). Sem ele o dreno faz table scan a cada
    -- passo, e o teto da fila é 500 itens.
    CREATE INDEX IF NOT EXISTS idx_offline_queue_pending
      ON offline_queue(status, created_at);
  `)
}
