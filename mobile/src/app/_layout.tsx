import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter'
import { ThemeProvider } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import React, { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ActivityIndicator, PaperProvider, Text } from 'react-native-paper'

import { setupAppFocus } from '@/lib/app-focus'
import { initializeDatabase } from '@/lib/database'
import { isFontGateOpen } from '@/lib/font-gate'
import { registerOfflineQueueLifecycle } from '@/lib/offline-queue-lifecycle'
import { mmkvPersister } from '@/lib/mmkv-persister'
import { queryClient } from '@/lib/query-client'
import { lightTheme, navigationTheme } from '@/lib/theme'
import { enableMocking, MOCKS_ENABLED } from '@/mocks'
import { useAuthStore } from '@/stores/auth.store'
import { ROLE_ROUTES, ROLES } from '@/utils/role-routes'

export default function RootLayout() {
  // Loading gate: o navegador não monta antes do banco estar pronto.
  const [isDbReady, setIsDbReady] = useState(false)
  // Loading gate: mocks DEVEM estar prontos antes do navegador montar, senão a
  // primeira query escapa do interceptor MSW. Com a flag desligada não há nada
  // para esperar — o portão já nasce aberto e nada aqui afeta produção.
  const [isMockReady, setIsMockReady] = useState(!MOCKS_ENABLED)
  const [mockError, setMockError] = useState<string | null>(null)
  const { user, isAuthenticated } = useAuthStore()
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  })

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
    // Purga da fila offline no logout (D5/AC7) — global de propósito: o logout
    // parte de qualquer tela e o storage por baixo espera o banco abrir sozinho.
    return registerOfflineQueueLifecycle()
  }, [])

  useEffect(() => setupAppFocus(), [])

  useEffect(() => {
    if (fontError) console.error('[fonts] failed to load Inter:', fontError)
  }, [fontError])

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
      <PaperProvider theme={lightTheme}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 24,
            gap: 8,
            backgroundColor: lightTheme.colors.background,
          }}
        >
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

  const isFontReady = isFontGateOpen(fontsLoaded, fontError)
  const isBooting = !isDbReady || !isMockReady || !isFontReady

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: mmkvPersister,
        maxAge: 1000 * 60 * 60 * 24, // 24 horas — deve ser <= gcTime
      }}
    >
      {/* Trava light (story 1.11b): sem ela o provider flipa com o esquema do
          SO e os widgets Paper entram em dark sobre telas light-locked — o
          render misto do defer da 1.11. Consumo reativo real (useTheme/
          darkPalette) é story futura. */}
      <PaperProvider theme={lightTheme}>
        {isBooting ? (
          // Nunca null enquanto os portões de boot não abrem: um layout raiz sem
          // saída de router é exatamente a tela em branco que esta tela evita.
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: lightTheme.colors.background,
            }}
          >
            <ActivityIndicator />
          </View>
        ) : (
          // headerShown: false no raiz — cada grupo monta o próprio <Stack> e
          // decide o próprio header; sem isso o app empilha dois. Vale para os
          // quatro grupos: (driver) e (student) dão títulos por tela, (admin) dá
          // um título, e (auth) desliga o header (ver o layout do grupo).
          <ThemeProvider value={navigationTheme}>
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
          </ThemeProvider>
        )}
      </PaperProvider>
    </PersistQueryClientProvider>
  )
}
