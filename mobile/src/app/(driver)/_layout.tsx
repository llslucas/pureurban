import { Stack } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AccountMenu } from '@/components/account-menu'
import { OfflineBanner } from '@/components/offline-banner'
import { useOfflineSync } from '@/hooks/use-offline-sync'
import { appHeaderOptions } from '@/lib/app-header'

export default function DriverLayout() {
  // Montado no LAYOUT, não na tela de scan: o dreno precisa continuar enquanto o
  // motorista navega para Viagem ou Rotas, e o banner precisa aparecer nas três.
  const { pendingCount, failedCount, dismissFailed } = useOfflineSync()
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.container}>
      <Stack
        initialRouteName="trip"
        screenOptions={{
          ...appHeaderOptions,
          headerRight: () => <AccountMenu pendingCount={pendingCount} />,
        }}
      >
        <Stack.Screen name="trip" options={{ title: 'Viagem' }} />
        <Stack.Screen name="scan" options={{ title: 'Escanear QR Code' }} />
        <Stack.Screen name="student-list" options={{ title: 'Alunos da viagem' }} />
        <Stack.Screen name="routes" options={{ title: 'Minhas rotas' }} />
      </Stack>
      {/* Abaixo do <Stack> no fluxo: o banner encolhe a tela em vez de cobri-la.
          Como overlay superior ele taparia a barra de contagem da tela de scan;
          como overlay inferior, os botões do overlay de resultado. */}
      <OfflineBanner
        pendingCount={pendingCount}
        failedCount={failedCount}
        insetBottom={insets.bottom}
        onDismissFailed={dismissFailed}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
