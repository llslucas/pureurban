import React from 'react'
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { Text, Card, ActivityIndicator, Snackbar, Divider, Button } from 'react-native-paper'
import { useQuery } from '@tanstack/react-query'
import { routesService, type AssignedRoute } from '@/services/routes.service'
import { lightPalette } from '@/lib/palette'

function RouteCard({ route }: { route: AssignedRoute }) {
  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <Text style={styles.routeName} numberOfLines={2}>
          🚌 {route.name}
        </Text>
        <Divider style={styles.divider} />
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>Origem</Text>
          <Text style={styles.routeValue}>{route.originCity}</Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>Destino</Text>
          <Text style={styles.routeValue}>{route.destinationCity}</Text>
        </View>
        {route.description ? (
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>Descrição</Text>
            <Text style={[styles.routeValue, styles.description]} numberOfLines={3}>
              {route.description}
            </Text>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  )
}

export default function DriverRoutesScreen() {
  const [snackbarVisible, setSnackbarVisible] = React.useState(false)

  const {
    data: routes,
    isLoading,
    isError,
    isFetching,
    refetch,
    errorUpdatedAt,
  } = useQuery<AssignedRoute[]>({
    queryKey: ['routes', 'mine'],
    queryFn: routesService.getMyRoutes,
    staleTime: 30_000,
    retry: 2,
  })

  // Reabre o snackbar a cada nova falha (não apenas na primeira) — usuário que
  // dismiss em rede instável continua sendo notificado de falhas subsequentes.
  React.useEffect(() => {
    if (isError) setSnackbarVisible(true)
  }, [isError, errorUpdatedAt])

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={lightPalette.text} />
        <Text style={styles.loadingText}>Carregando rotas...</Text>
      </View>
    )
  }

  // Branch explícito de erro: evita que o usuário interprete "sem rotas" quando na
  // verdade houve falha de rede. Sempre mostra ação de retry.
  const showErrorState = isError && (!routes || routes.length === 0)
  const showEmptyState = !isError && (!routes || routes.length === 0)

  return (
    <View style={styles.wrapper}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
        }
      >
        <Text style={styles.title}>Minhas Rotas</Text>
        <Text style={styles.subtitle}>
          {routes && routes.length > 0
            ? `${routes.length} rota${routes.length > 1 ? 's' : ''} atribuída${routes.length > 1 ? 's' : ''}`
            : showErrorState
              ? 'Não foi possível carregar as rotas'
              : 'Nenhuma rota atribuída ainda'}
        </Text>

        {routes && routes.length > 0 ? (
          routes.map((route) => <RouteCard key={route.id} route={route} />)
        ) : showErrorState ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⚠️</Text>
            <Text style={styles.emptyText}>
              Não conseguimos carregar suas rotas.
            </Text>
            <Text style={styles.emptyHint}>
              Verifique sua conexão e tente novamente.
            </Text>
            <Button
              mode="contained"
              onPress={() => refetch()}
              style={styles.retryButton}
              loading={isFetching}
            >
              Tentar novamente
            </Button>
          </View>
        ) : showEmptyState ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyText}>
              Você ainda não foi atribuído a nenhuma rota.
            </Text>
            <Text style={styles.emptyHint}>
              Entre em contato com o administrador para ser vinculado a uma rota.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* NFR18: Snackbar para erros de rede */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{ label: 'Fechar', onPress: () => setSnackbarVisible(false) }}
      >
        Não foi possível carregar as rotas. Verifique sua conexão.
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: lightPalette.surfaceSoft,
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: lightPalette.surfaceSoft,
  },
  loadingText: {
    marginTop: 8,
    color: lightPalette.textMuted,
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: lightPalette.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: lightPalette.textMuted,
    marginBottom: 24,
  },
  card: {
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    backgroundColor: lightPalette.surface,
  },
  routeName: {
    fontSize: 18,
    fontWeight: '700',
    color: lightPalette.text,
    marginBottom: 12,
    lineHeight: 24,
  },
  divider: {
    marginBottom: 12,
  },
  routeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  routeLabel: {
    fontSize: 13,
    color: lightPalette.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    minWidth: 64,
  },
  routeValue: {
    fontSize: 15,
    color: lightPalette.textBody,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  description: {
    color: lightPalette.textBody,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: lightPalette.textBody,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: lightPalette.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 24,
  },
})
