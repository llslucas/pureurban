import type { SQLiteDatabase } from 'expo-sqlite'

// Versionamento pela PRAGMA user_version (o mecanismo mínimo do spec do wrap-5):
// instalações novas já nascem na v2; instalações da 3.4b (v1, user_version 0)
// migram por ALTER TABLE preservando as linhas (AC1). A v1 não estampava
// user_version, então v0 com tabela existe e v0 sem tabela é instalação nova.

const SCHEMA_VERSION = 2

async function getUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  return row?.user_version ?? 0
}

async function getColumnNames(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>('PRAGMA table_info(offline_queue)')
  return new Set(rows.map((row) => row.name))
}

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  if ((await getUserVersion(db)) >= SCHEMA_VERSION) return

  const table = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'offline_queue'`,
  )

  if (!table) {
    await db.execAsync(`
      CREATE TABLE offline_queue (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        user_id TEXT,
        company_id TEXT,
        updated_at TEXT
      );

      -- Cobre o único SELECT quente da fila: os pendentes em ordem de created_at
      -- (FIFO estrito, architecture.md §5). Sem ele o dreno faz table scan a cada
      -- passo, e o teto da fila é 500 itens.
      CREATE INDEX idx_offline_queue_pending
        ON offline_queue(status, created_at);
    `)
  } else {
    // Coluna a coluna porque uma instalação pode ter morrido no meio desta
    // migração (ALTER concluído, user_version ainda 0) — ADD COLUMN duplicada
    // é erro em SQLite.
    const columns = await getColumnNames(db)
    if (!columns.has('user_id')) {
      await db.execAsync(`ALTER TABLE offline_queue ADD COLUMN user_id TEXT`)
    }
    if (!columns.has('company_id')) {
      await db.execAsync(`ALTER TABLE offline_queue ADD COLUMN company_id TEXT`)
    }
    if (!columns.has('updated_at')) {
      await db.execAsync(`ALTER TABLE offline_queue ADD COLUMN updated_at TEXT`)
    }
    // Fora do guard da coluna de propósito: um crash entre o ALTER e este
    // UPDATE re-entraria com a coluna presente e o backfill pendente — linhas
    // v1 com updated_at NULL nunca casariam na purga de `sent` (D6), que
    // compara updated_at com o corte. WHERE IS NULL torna o reprocesso inócuo.
    await db.execAsync(
      `UPDATE offline_queue SET updated_at = created_at WHERE updated_at IS NULL`,
    )
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_offline_queue_pending
        ON offline_queue(status, created_at);
    `)
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`)
}
