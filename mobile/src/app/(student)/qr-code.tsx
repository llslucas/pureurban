import { router } from 'expo-router'
import React, { useMemo } from 'react'
import { RefreshControl, StyleSheet, View } from 'react-native'
import { Snackbar } from 'react-native-paper'
import { useQuery } from '@tanstack/react-query'

import { QrPass, QrPassRouteLine } from '@/components/student-qr/qr-pass'
import { Screen } from '@/components/ui/screen'
import { StateView } from '@/components/ui/state-view'
import { qrSessionStorage } from '@/lib/storage'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { routesService } from '@/services/routes.service'
import { useAuthStore } from '@/stores/auth.store'
import { buildQrPayload, encodeQrPayload } from '@/utils/qr-payload'

export default function QrCodeScreen() {
  const styles = useThemedStyles(createStyles)
  const { layers } = useAppTheme().custom
  const { user, logout } = useAuthStore()
  const sessionId = qrSessionStorage.getSessionId()

  const qrValue = useMemo(() => {
    if (!user || !sessionId) return null
    return encodeQrPayload(buildQrPayload(user.id, sessionId))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only studentId and sessionId make up the payload
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

  // Reopens the snackbar on every new failure (errorUpdatedAt changes per
  // attempt). Visibility still goes through `showErrorState`: with a cached
  // route the screen shows the data, and an error toast on top would contradict it.
  React.useEffect(() => {
    if (isError) setSnackbarVisible(true)
  }, [isError, errorUpdatedAt])

  // Corrupted session: sessionId missing, with or without a user. Session
  // hydration already drops isAuthenticated and _layout.tsx redirects before
  // this screen mounts, but an app installed over an old build can still land
  // here. Never render an empty/placeholder QR: a QR that decodes to garbage
  // becomes INVALID_QR_CODE on the bus.
  if (!qrValue || !user || user.role !== 'STUDENT') {
    return (
      <StateView
        kind="blocked"
        title="Sua sessão precisa ser renovada"
        detail="Não foi possível carregar seus dados. Entre novamente para ver seu QR code."
        action={{
          label: 'Entrar novamente',
          onPress: () => {
            // logout() first: navigating alone would leave isAuthenticated true
            // and the login form sitting on a live session.
            logout()
            router.replace('/(auth)/login')
          },
        }}
        testID="qr-session-blocked"
      />
    )
  }

  // Normalized before any decision: a non-array payload (a proxy returning
  // HTML, a changed contract) would make `routes.length` undefined, slip past
  // both states below and crash on `routes[0].name`, taking the QR down with it.
  const routeList = Array.isArray(routes) ? routes.filter((r) => Boolean(r?.name)) : []
  const hasRoutes = routeList.length > 0

  const showErrorState = isError && !hasRoutes
  // `status === 'pending'` also covers the paused (offline) query: `isLoading`
  // is false then, and the screen would claim "Nenhuma rota vinculada" without
  // ever having fetched.
  const showLoadingState = status === 'pending'
  const showEmptyState = status === 'success' && !hasRoutes

  const routeLine = showLoadingState ? (
    <QrPassRouteLine loading text="Carregando rota..." testID="qr-route-loading" />
  ) : showErrorState ? (
    <QrPassRouteLine icon="cloud-alert" text="Não foi possível carregar sua rota." testID="qr-route-error" />
  ) : showEmptyState ? (
    <QrPassRouteLine icon="map-marker-off" text="Nenhuma rota vinculada" testID="qr-route-empty" />
  ) : (
    <>
      <QrPassRouteLine icon="map-marker-path" text={routeList[0].name} testID="qr-route-name" />
      {routeList.length > 1 ? (
        <QrPassRouteLine secondary text={`+${routeList.length - 1} rotas`} testID="qr-route-more" />
      ) : null}
      {isError ? (
        <QrPassRouteLine
          secondary
          icon="clock-alert-outline"
          text="Rota possivelmente desatualizada"
          testID="qr-route-stale"
        />
      ) : null}
    </>
  )

  return (
    <View style={styles.root}>
      <Screen
        variant="scroll"
        refreshControl={<RefreshControl {...layers.refresh} refreshing={isRefetching} onRefresh={() => refetch()} />}
        testID="student-qr"
      >
        <View style={styles.center}>
          <QrPass name={user.name} route={routeLine} qrValue={qrValue} />
        </View>
      </Screen>

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

const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.surfaceSoft,
    },
    center: {
      flexGrow: 1,
      justifyContent: 'center',
    },
  })
