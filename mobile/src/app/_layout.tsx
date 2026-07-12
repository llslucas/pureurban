import { router } from 'expo-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import React, { useEffect, useState } from 'react'
import { useColorScheme, View } from 'react-native'
import { PaperProvider, Text } from 'react-native-paper'

import { AnimatedSplashOverlay } from '@/components/animated-icon'
import AppTabs from '@/components/app-tabs'
import { initializeDatabase } from '@/lib/database'
import { mmkvPersister } from '@/lib/mmkv-persister'
import { queryClient } from '@/lib/query-client'
import { darkTheme, lightTheme } from '@/lib/theme'
import { enableMocking, MOCKS_ENABLED } from '@/mocks'
import { useAuthStore } from '@/stores/auth.store'

export default function TabLayout() {
  const colorScheme = useColorScheme()
  // Loading gate: AppTabs não monta antes do banco estar pronto
  const [isDbReady, setIsDbReady] = useState(false)
  // Loading gate: mocks DEVEM estar prontos antes do AppTabs montar, senão a
  // primeira query escapa do interceptor MSW. Com a flag desligada não há nada
  // para esperar — o portão já nasce aberto e nada aqui afeta produção.
  const [isMockReady, setIsMockReady] = useState(!MOCKS_ENABLED)
  const [mockError, setMockError] = useState<string | null>(null)
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    // Inicializa banco SQLite e cria tabela offline_queue na inicialização do app.
    // Errors são logados mas não travam o app — modo degradado preferível a crash.
    initializeDatabase()
      .catch(console.error)
      .finally(() => {
        setIsDbReady(true)
      })
  }, [])

  useEffect(() => {
    if (!MOCKS_ENABLED) return

    // Falha aqui NÃO abre o portão: seguir em frente mandaria o app para a API
    // real enquanto o dev acredita estar em mocks — o modo de falha mais caro
    // possível, porque só aparece como dado errado, nunca como erro.
    enableMocking()
      .then(() => setIsMockReady(true))
      .catch((error: unknown) => {
        console.error('[mocks] falha ao inicializar o MSW:', error)
        setMockError(error instanceof Error ? error.message : String(error))
      })
  }, [])

  // Redirecionar para login se não autenticado após DB e mocks estarem prontos
  useEffect(() => {
    if (!isDbReady || !isMockReady) return
    if (!isAuthenticated) {
      router.replace('/(auth)/login')
    }
  }, [isDbReady, isMockReady, isAuthenticated])

  // Abaixo de todos os hooks: um early return acima deles quebra as Rules of
  // Hooks no render em que mockError deixa de ser null.
  if (mockError) {
    return (
      <PaperProvider theme={colorScheme === 'dark' ? darkTheme : lightTheme}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 8 }}>
          <Text variant="titleMedium">Falha ao inicializar os mocks (MSW)</Text>
          <Text variant="bodySmall">{mockError}</Text>
          <Text variant="bodySmall">
            O app foi parado de propósito: com EXPO_PUBLIC_USE_MOCKS=1, seguir sem
            MSW faria as requisições irem para a API real sem aviso. Desligue a flag
            para rodar contra o backend.
          </Text>
        </View>
      </PaperProvider>
    )
  }

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
        {isDbReady && isMockReady && isAuthenticated && <AppTabs />}
      </PaperProvider>
    </PersistQueryClientProvider>
  )
}

