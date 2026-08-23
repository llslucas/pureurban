import { router } from 'expo-router'
import React, { useMemo } from 'react'
import { ScrollView, RefreshControl, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Card, Divider, Snackbar, Text } from 'react-native-paper'
import { useQuery } from '@tanstack/react-query'

import { StudentQrCode } from '@/components/student-qr-code'
import { qrSessionStorage } from '@/lib/storage'
import { routesService } from '@/services/routes.service'
import { useAuthStore } from '@/stores/auth.store'
import { buildQrPayload, encodeQrPayload } from '@/utils/qr-payload'

export default function QrCodeScreen() {
  const { user, logout } = useAuthStore()
  const sessionId = qrSessionStorage.getSessionId()

  const qrValue = useMemo(() => {
    if (!user || !sessionId) return null
    return encodeQrPayload(buildQrPayload(user.id, sessionId))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só studentId e sessionId formam o payload
  }, [user?.id, sessionId])

  const [snackbarVisible, setSnackbarVisible] = React.useState(false)

  const {
    data: routes,
    status,
    isError,
    isRefetching,
    refetch,
    errorUpdatedAt,
  } = useQuery({
    queryKey: ['routes', 'mine'],
    queryFn: routesService.getMyRoutes,
    staleTime: 30_000,
    retry: 2,
  })

  // Reabre o snackbar a cada nova falha (errorUpdatedAt muda por tentativa).
  // A visibilidade final ainda passa por `showErrorState`: com rota vinda do
  // cache a tela renderiza o dado normalmente e um aviso de erro por cima seria
  // a tela se contradizendo.
  React.useEffect(() => {
    if (isError) setSnackbarVisible(true)
  }, [isError, errorUpdatedAt])

  // Sessão corrompida: sessionId ausente com (ou sem) user presente. Com a
  // hidratação da Task 2, isAuthenticated já cai e o _layout.tsx redireciona
  // antes desta tela montar — mas um app instalado por cima de build antigo
  // pode chegar aqui mesmo assim. Nunca renderizar QR vazio/placeholder: um QR
  // que decodifica para lixo vira INVALID_QR_CODE no ônibus.
  if (!qrValue || !user || user.role !== 'STUDENT') {
    return (
      <View style={styles.centered}>
        <Text variant="titleMedium" style={styles.corruptedTitle}>
          Sua sessão precisa ser renovada
        </Text>
        <Text variant="bodyMedium" style={styles.corruptedHint}>
          Não foi possível carregar seus dados. Entre novamente para ver seu QR code.
        </Text>
        <Button
          mode="contained"
          style={styles.corruptedButton}
          onPress={() => {
            logout()
            router.replace('/(auth)/login')
          }}
        >
          Entrar novamente
        </Button>
      </View>
    )
  }

  // A resposta é normalizada antes de qualquer decisão: um payload que não seja
  // array (proxy devolvendo HTML, contrato mudando) faria `routes.length` virar
  // undefined, escapar dos dois estados abaixo e estourar em `routes[0].name` —
  // derrubando a tela inteira, QR junto.
  const routeList = Array.isArray(routes) ? routes.filter((r) => Boolean(r?.name)) : []
  const hasRoutes = routeList.length > 0

  const showErrorState = isError && !hasRoutes
  // `status === 'pending'` cobre também a query pausada (offline): `isLoading`
  // fica false nesse caso e a tela afirmaria "Nenhuma rota vinculada" sem nunca
  // ter buscado nada.
  const showLoadingState = status === 'pending'
  const showEmptyState = status === 'success' && !hasRoutes

  return (
    <View style={styles.wrapper}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      >
        <Text variant="headlineSmall" style={styles.name}>
          {user.name}
        </Text>
        <Text variant="bodyMedium" style={styles.hint}>
          Mostre este código ao motorista
        </Text>

        <Card style={styles.qrCard} mode="elevated">
          <Card.Content style={styles.qrCardContent}>
            <StudentQrCode value={qrValue} />
          </Card.Content>
        </Card>

        <Divider style={styles.divider} />

        <Text variant="titleSmall" style={styles.routeLabel}>
          Rota
        </Text>

        {showLoadingState ? (
          <View style={styles.routeStatus}>
            <ActivityIndicator size="small" />
            <Text variant="bodyMedium">Carregando rota...</Text>
          </View>
        ) : showErrorState ? (
          <View style={styles.routeStatus}>
            <Text variant="bodyMedium">Não foi possível carregar sua rota.</Text>
          </View>
        ) : showEmptyState ? (
          <View style={styles.routeStatus}>
            <Text variant="bodyMedium">Nenhuma rota vinculada</Text>
          </View>
        ) : (
          <View style={styles.routeStatus}>
            <Text variant="bodyLarge" style={styles.routeName}>
              🚌 {routeList[0].name}
            </Text>
            {routeList.length > 1 ? (
              <Text variant="bodySmall" style={styles.moreRoutes}>
                +{routeList.length - 1} rotas
              </Text>
            ) : null}
            {isError ? (
              <Text variant="bodySmall" style={styles.moreRoutes}>
                Rota possivelmente desatualizada
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Snackbar
        visible={snackbarVisible && showErrorState}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{ label: 'Tentar novamente', onPress: () => refetch() }}
      >
        Não foi possível carregar sua rota. Verifique sua conexão.
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 24,
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 24,
  },
  corruptedTitle: {
    textAlign: 'center',
  },
  corruptedHint: {
    textAlign: 'center',
    opacity: 0.7,
  },
  corruptedButton: {
    marginTop: 12,
  },
  name: {
    textAlign: 'center',
  },
  hint: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 20,
  },
  qrCard: {
    borderRadius: 16,
  },
  qrCardContent: {
    alignItems: 'center',
    padding: 16,
  },
  divider: {
    alignSelf: 'stretch',
    marginVertical: 24,
  },
  routeLabel: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  routeStatus: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  routeName: {
    fontWeight: '600',
  },
  moreRoutes: {
    opacity: 0.6,
  },
})
