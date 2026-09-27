import React from 'react'
import { RefreshControl, StyleSheet, View } from 'react-native'
import { Snackbar, Text } from 'react-native-paper'
import { useQuery } from '@tanstack/react-query'

import { RouteCard } from '@/components/routes/route-card'
import { Screen } from '@/components/ui/screen'
import { StateView } from '@/components/ui/state-view'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { spacing, typography } from '@/lib/tokens'
import { routesService, type AssignedRoute } from '@/services/routes.service'

function countLabel(count: number): string {
  return count === 1 ? '1 rota atribuída' : `${count} rotas atribuídas`
}

export default function DriverRoutesScreen() {
  const styles = useThemedStyles(createStyles)
  const { layers } = useAppTheme().custom
  const [snackbarVisible, setSnackbarVisible] = React.useState(false)

  const {
    data: routes,
    status,
    isError,
    isFetching,
    isRefetching,
    refetch,
    errorUpdatedAt,
  } = useQuery<AssignedRoute[]>({
    queryKey: ['routes', 'mine'],
    queryFn: routesService.getMyRoutes,
    staleTime: 30_000,
    retry: 2,
  })

  // Reopens the snackbar on every new failure, not just the first: a driver who
  // dismissed it on a flaky network still hears about the next one.
  React.useEffect(() => {
    if (isError) setSnackbarVisible(true)
  }, [isError, errorUpdatedAt])

  // A non-array payload (a proxy returning HTML, a changed contract) reads as
  // "no routes" instead of crashing on `.map`.
  const routeList = Array.isArray(routes) ? routes : []
  const hasRoutes = routeList.length > 0

  let content: React.ReactNode
  // `status === 'pending'` also covers the paused (offline) query, where
  // `isLoading` is false and the screen would otherwise claim there are no routes.
  if (status === 'pending') {
    content = <StateView kind="loading" title="Carregando rotas..." testID="routes-loading" />
  } else if (hasRoutes) {
    content = (
      <View style={styles.list}>
        <Text style={styles.legend} testID="routes-count">
          {countLabel(routeList.length)}
        </Text>
        {routeList.map((route) => (
          <RouteCard key={route.id} route={route} testID={`route-card-${route.id}`} />
        ))}
      </View>
    )
  } else if (isError) {
    // Kept apart from the empty state: a network failure must not read as
    // "you have no route".
    content = (
      <StateView
        kind="error"
        icon="cloud-alert"
        title="Não foi possível carregar suas rotas"
        detail="Verifique sua conexão e tente novamente."
        action={{ label: 'Tentar novamente', icon: 'refresh', onPress: () => void refetch(), loading: isFetching }}
        testID="routes-error"
      />
    )
  } else {
    content = (
      <StateView
        kind="empty"
        icon="map-marker-off"
        title="Você ainda não tem rota."
        detail="Fale com a administração."
        testID="routes-empty"
      />
    )
  }

  return (
    <View style={styles.root}>
      <Screen
        variant="scroll"
        refreshControl={<RefreshControl {...layers.refresh} refreshing={isRefetching} onRefresh={() => void refetch()} />}
        testID="driver-routes"
      >
        {content}
      </Screen>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{ label: 'Fechar', onPress: () => setSnackbarVisible(false) }}
        testID="routes-snackbar"
      >
        Não foi possível carregar as rotas. Verifique sua conexão.
      </Snackbar>
    </View>
  )
}

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.surfaceSoft,
    },
    list: {
      gap: spacing[3],
    },
    legend: {
      ...typography.bodyLg,
      color: palette.textMuted,
    },
  })
