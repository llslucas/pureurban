import React, { useCallback, useEffect, useState } from 'react'
import { router } from 'expo-router'
import { AppState, StyleSheet, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForegroundPermissions } from 'expo-location'
import { ActiveTripActions } from '@/components/trip/active-trip-actions'
import { LocationPermissionCard } from '@/components/trip/location-permission-card'
import { StartOutboundSection, startOutboundPhase } from '@/components/trip/start-outbound-section'
import { TripCard } from '@/components/trip/trip-card'
import { TripLinkRow } from '@/components/trip/trip-link-row'
import { type TripActionErrorCopy, tripActionErrorMessage } from '@/components/trip/trip-error'
import { Banner } from '@/components/ui/banner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PrimaryAction } from '@/components/ui/primary-action'
import { Screen } from '@/components/ui/screen'
import { TripCardSkeleton } from '@/components/ui/screen-skeletons'
import { StateView } from '@/components/ui/state-view'
import { StickyActionBar } from '@/components/ui/sticky-action-bar'
import { tripService } from '@/services/trip.service'
import type { TripType } from '@/services/trip.service'
import { routesService, type AssignedRoute } from '@/services/routes.service'
import { useTripGpsCapture } from '@/hooks/use-trip-gps-capture'
import { spacing } from '@/lib/tokens'
import { activeTripKey, activeTripOptions, tripStudentsOptions } from '@/lib/trip-queries'

function resolveRouteId(
  routes: AssignedRoute[] | undefined,
  selectedRouteId: string | null,
): string | null {
  if (routes && routes.length === 1) return routes[0].id
  if (selectedRouteId && routes?.some((route) => route.id === selectedRouteId)) {
    return selectedRouteId
  }
  return null
}

export default function TripScreen() {
  const queryClient = useQueryClient()
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  // Keyed by trip id: a refetch that swaps the trip must not carry the dialog
  // over to the next ACTIVE trip.
  const [confirmEndTripId, setConfirmEndTripId] = useState<string | null>(null)
  // On screen rather than Alert.alert, which is a no-op on web.
  const [actionError, setActionError] = useState<TripActionErrorCopy | null>(null)

  const {
    data: activeTrip,
    status: tripStatus,
    isLoading: isLoadingTrip,
    refetch: refetchTrip,
  } = useQuery(activeTripOptions())

  // Driver's routes (Epic 2), from the SAME query key as (driver)/routes.tsx.
  // Fetches only once the active trip has resolved: during a trip the routeId
  // comes from `activeTrip` and /routes/mine would be a dead call on the common
  // path (Design Notes, NFR19). Also fetches for a COMPLETED RETURN trip left in
  // the session cache after ending it, so the screen falls back to the route
  // selector instead of a false "no routes" state. Waiting on `isLoadingTrip`
  // avoids firing the fetch on the first frame, before /trips/active answers.
  const {
    data: routes,
    isPending: isRoutesPending,
    isError: isRoutesError,
    isFetching: isFetchingRoutes,
    refetch: refetchRoutes,
  } = useQuery<AssignedRoute[]>({
    queryKey: ['routes', 'mine'],
    queryFn: routesService.getMyRoutes,
    staleTime: 30_000,
    retry: 2,
    enabled:
      !isLoadingTrip &&
      (!activeTrip || (activeTrip.status === 'COMPLETED' && activeTrip.type === 'RETURN')),
  })

  // Single route auto-selected; a chosen route is kept only while it is still in
  // the current list (a refetch can drop it, and a stale id would send POST
  // /trips with an unassigned route -> 403). Derived in render, not via
  // `useEffect`, to save a render (Design Notes).
  const resolvedRouteId = resolveRouteId(routes, selectedRouteId)

  // Contagem real de embarque (FR25), lida da MESMA entrada de cache do roster
  // da tela de alunos (factory compartilhada) com `select`: uma key própria aqui
  // duplicaria o cache e as duas telas divergiriam (Bloqueador 1 da 3.5b, pela
  // outra ponta).
  const { data: studentsSummary } = useQuery({
    ...tripStudentsOptions(activeTrip?.id),
    select: (r) => r.summary,
  })

  // ---- GPS da viagem (Story 5.1): permissão + captura automática ----
  // Tudo AQUI, antes dos early returns: o gate da captura reage ao cache da
  // viagem via react-query (setQueryData das mutações), nunca a um toque.

  const [locationPermission, requestLocationPermission, refreshLocationPermission] =
    useForegroundPermissions()

  // `useForegroundPermissions` não reavalia sozinho no retorno ao primeiro
  // plano (mesmo finding do scan.tsx com a permissão da câmera): quem concede
  // a permissão nas configurações e volta continua vendo o card de bloqueio
  // sem este listener.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshLocationPermission()
    })
    return () => subscription.remove()
  }, [refreshLocationPermission])

  // Captura montada sempre (hooks antes dos early returns): o controlador só
  // roda com viagem ACTIVE no cache E permissão concedida — NFR10.
  useTripGpsCapture(
    activeTrip && activeTrip.status === 'ACTIVE' ? activeTrip.id : null,
    locationPermission?.granted ?? false,
  )

  const showLocationCard = locationPermission !== null && !locationPermission.granted

  // Um único bloco JSX para os dois ramos de render (estado inicial e viagem
  // ativa) — cópias verbatim entre branches driftam.
  const permissionCard =
    showLocationCard && locationPermission ? (
      <LocationPermissionCard
        permission={locationPermission}
        requestPermission={requestLocationPermission}
      />
    ) : null

  const startMutation = useMutation({
    mutationFn: ({
      routeId,
      type,
      relatedTripId,
    }: {
      routeId: string
      type: TripType
      relatedTripId?: string
    }) => tripService.startTrip(routeId, type, relatedTripId),
    onMutate: () => setActionError(null),
    onSuccess: (trip) => {
      queryClient.setQueryData(activeTripKey, trip)
    },
    onError: (error: Error) => setActionError(tripActionErrorMessage(error, 'start')),
  })

  const endMutation = useMutation({
    mutationFn: (tripId: string) => tripService.endTrip(tripId),
    onMutate: () => setActionError(null),
    onSuccess: (completedTrip) => {
      queryClient.setQueryData(activeTripKey, completedTrip)
    },
    onError: (error: Error) => setActionError(tripActionErrorMessage(error, 'end')),
  })

  const handleStartOutbound = useCallback(() => {
    if (!resolvedRouteId) return
    startMutation.mutate({ routeId: resolvedRouteId, type: 'OUTBOUND' })
  }, [startMutation, resolvedRouteId])

  const handleStartReturn = useCallback(() => {
    if (activeTrip) {
      startMutation.mutate({
        routeId: activeTrip.routeId,
        type: 'RETURN',
        relatedTripId: activeTrip.id,
      })
    }
  }, [startMutation, activeTrip])

  // The dialog closes on both outcomes: on error the banner takes over.
  const handleEnd = useCallback(() => {
    if (activeTrip) {
      endMutation.mutate(activeTrip.id, {
        onSuccess: () => setConfirmEndTripId(null),
        onError: () => setConfirmEndTripId(null),
      })
    }
  }, [endMutation, activeTrip])

  if (isLoadingTrip) {
    return (
      <Screen>
        <TripCardSkeleton label="Carregando viagem..." />
      </Screen>
    )
  }

  // Com o `networkMode: 'always'` global, o cold start offline ERRA (não pausa):
  // sem dado em cache, bloqueia com retry em vez de oferecer "Iniciar Viagem"
  // que só pode falhar (bug DS7 da retro 3, que antes mascarava o `isLoading`).
  if (tripStatus === 'error' && activeTrip === undefined) {
    return (
      <Screen>
        <StateView
          kind="error"
          title="Não foi possível carregar a viagem"
          detail="Verifique sua conexão e tente novamente."
          action={{ label: 'Tentar novamente', icon: 'refresh', onPress: () => void refetchTrip() }}
        />
      </Screen>
    )
  }

  const isMutating = startMutation.isPending || endMutation.isPending

  const errorBanner = actionError ? (
    <Banner tone="error" title={actionError.title} message={actionError.message} testID="trip-action-error" />
  ) : null

  // `routes` still holds the cached list while the query is disabled during a
  // trip, so the name shows up without calling /routes/mine. Never the UUID.
  const routeName =
    routes?.find((route) => route.id === activeTrip?.routeId)?.name ?? 'Rota atribuída'

  // Estado 1: Sem viagem ativa ou viagem concluída (pode iniciar OUTBOUND)
  if (!activeTrip || activeTrip.status === 'COMPLETED') {
    const isReturn = activeTrip?.status === 'COMPLETED' && activeTrip.type === 'OUTBOUND'
    const phase = startOutboundPhase({
      routes,
      isPending: isRoutesPending,
      isError: isRoutesError,
      isFetching: isFetchingRoutes,
    })

    let footer: React.ReactNode = null
    if (isReturn) {
      footer = (
        <StickyActionBar>
          <PrimaryAction
            icon="replay"
            label="Iniciar Retorno"
            onPress={handleStartReturn}
            loading={isMutating}
            impact
            testID="start-return-action"
          />
        </StickyActionBar>
      )
    } else if (phase === 'ready') {
      footer = (
        <StickyActionBar>
          <PrimaryAction
            icon="bus"
            label="Iniciar Viagem"
            onPress={handleStartOutbound}
            loading={isMutating}
            disabled={!resolvedRouteId}
            impact
            testID="start-trip-action"
          />
        </StickyActionBar>
      )
    }

    return (
      <Screen variant="scroll" footer={footer} testID="trip-screen">
        <View style={styles.stack}>
          {errorBanner}
          {activeTrip && activeTrip.status === 'COMPLETED' && (
            <TripCard
              type={activeTrip.type}
              status={activeTrip.status}
              routeName={routeName}
              summary={studentsSummary}
              startedAt={activeTrip.startedAt}
            />
          )}
          {permissionCard}
          {isReturn ? null : (
            <StartOutboundSection
              phase={phase}
              routes={routes}
              isFetching={isFetchingRoutes}
              onRetry={() => {
                void refetchRoutes()
              }}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              disabled={isMutating}
            />
          )}
        </View>
      </Screen>
    )
  }

  // Estado 2/4: Viagem ACTIVE (OUTBOUND ou RETURN)
  return (
    <Screen
      variant="scroll"
      testID="trip-screen"
      footer={
        <ActiveTripActions
          // NFR19 tap count: login lands the driver here (0 taps) → 1 tap →
          // camera open. `navigate`, not `push`: two quick taps stacked two
          // screens, each with its own camera.
          onScan={() => router.navigate('/(driver)/scan')}
          onEnd={() => setConfirmEndTripId(activeTrip.id)}
          disabled={isMutating}
        />
      }
    >
      <View style={styles.stack}>
        {errorBanner}
        <TripCard
          type={activeTrip.type}
          status={activeTrip.status}
          routeName={routeName}
          summary={studentsSummary}
          startedAt={activeTrip.startedAt}
        />
        {permissionCard}
        {/* `navigate`, not `push` (story 3.2b finding). */}
        <TripLinkRow
          icon="account-group"
          label="Alunos da Viagem"
          onPress={() => router.navigate('/(driver)/student-list')}
          disabled={isMutating}
          testID="trip-students-link"
        />
      </View>
      <ConfirmDialog
        visible={confirmEndTripId === activeTrip.id}
        title="Encerrar viagem?"
        message="A viagem é concluída, a posição do ônibus deixa de ser enviada aos alunos e novos embarques não entram nela. Não dá para desfazer."
        confirmLabel="Encerrar"
        destructive
        loading={endMutation.isPending}
        onConfirm={handleEnd}
        onDismiss={() => setConfirmEndTripId(null)}
        testID="end-trip-dialog"
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: {
    flexGrow: 1,
    gap: spacing.sectionGap,
  },
})
