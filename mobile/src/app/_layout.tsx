import { Stack } from 'expo-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import React, { useEffect, useState } from 'react'
import { useColorScheme, View } from 'react-native'
import { ActivityIndicator, PaperProvider, Text } from 'react-native-paper'

import { initializeDatabase } from '@/lib/database'
import { mmkvPersister } from '@/lib/mmkv-persister'
import { queryClient } from '@/lib/query-client'
import { darkTheme, lightTheme } from '@/lib/theme'
import { enableMocking, MOCKS_ENABLED } from '@/mocks'
import { useAuthStore } from '@/stores/auth.store'
import { ROLE_ROUTES, ROLES } from '@/utils/role-routes'

export default function RootLayout() {
  const colorScheme = useColorScheme()
  // Loading gate: o navegador não monta antes do banco estar pronto.
  const [isDbReady, setIsDbReady] = useState(false)
  // Loading gate: mocks DEVEM estar prontos antes do navegador montar, senão a
  // primeira query escapa do interceptor MSW. Com a flag desligada não há nada
  // para esperar — o portão já nasce aberto e nada aqui afeta produção.
  const [isMockReady, setIsMockReady] = useState(!MOCKS_ENABLED)
  const [mockError, setMockError] = useState<string | null>(null)
  const { user, isAuthenticated } = useAuthStore()

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

  const isBooting = !isDbReady || !isMockReady

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: mmkvPersister,
        maxAge: 1000 * 60 * 60 * 24, // 24 horas — deve ser <= gcTime
      }}
    >
      <PaperProvider theme={colorScheme === 'dark' ? darkTheme : lightTheme}>
        {isBooting ? (
          // Nunca null enquanto os portões de boot não abrem: um layout raiz sem
          // saída de router é exatamente a tela em branco que esta tela evita.
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : (
          // headerShown: false no raiz — cada grupo monta o próprio <Stack> e
          // decide o próprio header; sem isso o app empilha dois. Vale para os
          // quatro grupos: (driver) e (student) dão títulos por tela, (admin) dá
          // um título, e (auth) desliga o header (ver o layout do grupo).
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            {/* Derivado de ROLE_ROUTES: um papel novo entra no mapa e ganha
                guard e destino de uma vez. Guards escritos à mão aqui podiam
                divergir do mapa, e a divergência não dá erro — dá loop entre
                este navegador e o `+not-found`. */}
            {ROLES.map((role) => (
              <Stack.Protected
                key={role}
                guard={isAuthenticated && user?.role === role}
              >
                <Stack.Screen name={ROLE_ROUTES[role].group} />
              </Stack.Protected>
            ))}
          </Stack>
        )}
      </PaperProvider>
    </PersistQueryClientProvider>
  )
}
