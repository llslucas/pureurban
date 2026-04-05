import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import React, { useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import { PaperProvider } from 'react-native-paper'

import { AnimatedSplashOverlay } from '@/components/animated-icon'
import AppTabs from '@/components/app-tabs'
import { initializeDatabase } from '@/lib/database'
import { mmkvPersister } from '@/lib/mmkv-persister'
import { queryClient } from '@/lib/query-client'
import { darkTheme, lightTheme } from '@/lib/theme'

export default function TabLayout() {
  const colorScheme = useColorScheme()
  // Loading gate: AppTabs não monta antes do banco estar pronto
  const [isDbReady, setIsDbReady] = useState(false)

  useEffect(() => {
    // Inicializa banco SQLite e cria tabela offline_queue na inicialização do app.
    // Errors são logados mas não travam o app — modo degradado preferível a crash.
    initializeDatabase()
      .catch(console.error)
      .finally(() => {
        setIsDbReady(true)
      })
  }, [])

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: mmkvPersister,
        maxAge: 1000 * 60 * 60 * 24, // 24 horas — deve ser <= gcTime
      }}
    >
      <PaperProvider theme={colorScheme === 'dark' ? darkTheme : lightTheme}>
        <AnimatedSplashOverlay />
        {isDbReady && <AppTabs />}
      </PaperProvider>
    </PersistQueryClientProvider>
  )
}

