import React, { useCallback, useEffect, useState } from 'react'
import { router } from 'expo-router'
import { AppState, View, StyleSheet, ScrollView, Alert } from 'react-native'
import { Button, Card, Text, ActivityIndicator } from 'react-native-paper'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForegroundPermissions } from 'expo-location'
import { LocationPermissionCard } from '@/components/trip/location-permission-card'
import { StartOutboundSection } from '@/components/trip/start-outbound-section'
import { TripStatusChip, TripTypeLabel } from '@/components/trip/trip-status'
import { tripService } from '@/services/trip.service'
import type { TripType } from '@/services/trip.service'
import { routesService, type AssignedRoute } from '@/services/routes.service'
import { useTripGpsCapture } from '@/hooks/use-trip-gps-capture'
import { lightPalette } from '@/lib/palette'
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
    onSuccess: (trip) => {
      queryClient.setQueryData(activeTripKey, trip)
    },
    onError: (error: Error) => {
      Alert.alert('Erro', error.message ?? 'Não foi possível iniciar a viagem')
    },
  })

  const endMutation = useMutation({
    mutationFn: (tripId: string) => tripService.endTrip(tripId),
    onSuccess: (completedTrip) => {
      queryClient.setQueryData(activeTripKey, completedTrip)
    },
    onError: (error: Error) => {
      Alert.alert('Erro', error.message ?? 'Não foi possível encerrar a viagem')
    },
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

  const handleEnd = useCallback(() => {
    if (activeTrip) {
      endMutation.mutate(activeTrip.id)
    }
  }, [endMutation, activeTrip])

  if (isLoadingTrip) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Carregando viagem...</Text>
      </View>
    )
  }

  // Com o `networkMode: 'always'` global, o cold start offline ERRA (não pausa):
  // sem dado em cache, bloqueia com retry em vez de oferecer "Iniciar Viagem"
  // que só pode falhar (bug DS7 da retro 3, que antes mascarava o `isLoading`).
  if (tripStatus === 'error' && activeTrip === undefined) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Não foi possível carregar a viagem</Text>
        <Text style={styles.loadingText}>Verifique sua conexão e tente novamente.</Text>
        <Button mode="contained" onPress={() => void refetchTrip()} style={styles.retryButton}>
          Tentar novamente
        </Button>
      </View>
    )
  }

  const isMutating = startMutation.isPending || endMutation.isPending

  // Estado 1: Sem viagem ativa ou viagem concluída (pode iniciar OUTBOUND)
  if (!activeTrip || activeTrip.status === 'COMPLETED') {
    const isReturn = activeTrip?.status === 'COMPLETED' && activeTrip.type === 'OUTBOUND'
    return (
      <ScrollView contentContainerStyle={styles.container} testID="trip-screen">
        {permissionCard}
        {activeTrip && activeTrip.status === 'COMPLETED' && (
          <Card style={styles.card}>
            <Card.Content>
              <TripTypeLabel type={activeTrip.type} />
              <TripStatusChip status={activeTrip.status} />
              <Text style={styles.infoText}>Rota: {activeTrip.routeId}</Text>
              {/* '—' enquanto indefinido: um zero durante o carregamento é
                  indistinguível de "ninguém embarcou". Mesma regra do card ativo. */}
              <Text style={styles.infoText}>
                Alunos: {studentsSummary ? `${studentsSummary.boarded}/${studentsSummary.total}` : '—'}
              </Text>
            </Card.Content>
          </Card>
        )}
        {isReturn ? (
          <Button
            mode="contained"
            onPress={handleStartReturn}
            loading={isMutating}
            disabled={isMutating}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            icon="replay"
          >
            Iniciar Retorno
          </Button>
        ) : (
          <StartOutboundSection
            routes={routes}
            isPending={isRoutesPending}
            isError={isRoutesError}
            isFetching={isFetchingRoutes}
            onRetry={() => {
              void refetchRoutes()
            }}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            resolvedRouteId={resolvedRouteId}
            isMutating={isMutating}
            onStart={handleStartOutbound}
          />
        )}
      </ScrollView>
    )
  }

  // Estado 2/4: Viagem ACTIVE (OUTBOUND ou RETURN)
  return (
    <ScrollView contentContainerStyle={styles.container} testID="trip-screen">
      {permissionCard}
      <Card style={styles.card}>
        <Card.Content>
          <TripTypeLabel type={activeTrip.type} />
          <TripStatusChip status={activeTrip.status} />
          <Text style={styles.infoText}>Rota: {activeTrip.routeId}</Text>
          {/* '—' enquanto `studentsSummary` é undefined: um zero inventado
              durante o carregamento é indistinguível de um zero verdadeiro. */}
          <Text style={styles.infoText}>
            Alunos: {studentsSummary ? `${studentsSummary.boarded}/${studentsSummary.total}` : '—'}
          </Text>
          <Text style={styles.infoText}>
            Início: {new Date(activeTrip.startedAt).toLocaleTimeString('pt-BR')}
          </Text>
        </Card.Content>
      </Card>
      {/* Contagem de toques da NFR19: o login leva o motorista direto a esta
          tela (0 toques) → 1 toque aqui → câmera aberta.
          `navigate`, não `push`: dois toques rápidos empilhavam duas telas, e
          cada uma abriria sua própria câmera. */}
      <Button
        mode="contained"
        onPress={() => router.navigate('/(driver)/scan')}
        disabled={isMutating}
        style={styles.primaryButton}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
        icon="qrcode-scan"
      >
        Escanear QR Code
      </Button>
      {/* `mode="outlined"` para não competir com a ação primária de escanear.
          `navigate`, não `push` (finding da 3.2b). */}
      <Button
        mode="outlined"
        onPress={() => router.navigate('/(driver)/student-list')}
        disabled={isMutating}
        style={styles.primaryButton}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
        icon="account-group"
      >
        Alunos da Viagem
      </Button>
      <Button
        mode="contained"
        onPress={handleEnd}
        loading={isMutating}
        disabled={isMutating}
        style={[styles.primaryButton, styles.endButton]}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
        icon="stop-circle"
        buttonColor={lightPalette.error}
      >
        Encerrar Viagem
      </Button>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
    backgroundColor: lightPalette.surfaceSoft,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
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
    marginBottom: 24,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 12,
    marginBottom: 24,
    elevation: 2,
    backgroundColor: lightPalette.surface,
  },
  infoText: {
    fontSize: 15,
    color: lightPalette.textBody,
    marginTop: 6,
  },
  // NFR18: botões grandes, mínimo 48dp, operação com uma mão
  primaryButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  endButton: {
    marginTop: 16,
  },
  buttonContent: {
    height: 56,
    paddingHorizontal: 8,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
})
