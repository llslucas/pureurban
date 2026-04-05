import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

import { storage } from './storage'

export const mmkvPersister = createSyncStoragePersister({
  storage: {
    setItem: (key, value) => storage.set(key, value),
    getItem: (key) => {
      const value = storage.getString(key)
      return value === undefined ? null : value
    },
    removeItem: (key) => storage.remove(key),

  },
})
