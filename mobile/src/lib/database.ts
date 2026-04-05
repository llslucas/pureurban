import * as SQLite from 'expo-sqlite'

import { runMigrations } from './database-migrations'

// initPromise garante que apenas uma abertura + migração ocorre,
// mesmo que getDatabase() seja chamado concorrentemente antes de resolver.
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!initPromise) {
    initPromise = SQLite.openDatabaseAsync('pureurban.db').then(async (database) => {
      await runMigrations(database)
      return database
    })
  }
  return initPromise
}

export async function initializeDatabase(): Promise<void> {
  await getDatabase()
}
