import * as Location from 'expo-location'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, Banner, Button, Card, Chip, Text } from 'react-native-paper'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  activeTrackingTripKey,
  activeTrackingTripOptions,
  lastKnownLocationOptions,
} from '@/lib/track-bus-queries'
import {
  formatDistance,
  formatEta,
  haversineDistanceMeters,
  type GeoPoint,
} from '@/lib/geo'
import {
  connectTrackingEvents,
  type LocationUpdatedEvent,
} from '@/services/tracking-stream.service'

// O degradado é sobre o SINAL GPS, não sobre o socket: ping prova conexão, não
// posição — só location.updated reseta este timer (honestidade do dado).
const GPS_SIGNAL_TIMEOUT_MS = 15_000

interface BusPosition {
  latitude: number
  longitude: number
  accuracy?: number
  // capturedAt do device (last-known) ou timestamp de publicação (evento).
  at: string
}

const toBusPosition = (event: LocationUpdatedEvent): BusPosition => ({
  latitude: event.latitude,
  longitude: event.longitude,
  accuracy: event.accuracy,
  at: event.timestamp,
})

const formatClock = (iso: string): string => {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export default function TrackBusScreen() {
  const queryClient = useQueryClient()

  // Descoberta da viagem (GET /tracking/trips/active): qualquer perna na rota
  // do aluno — enquanto null, a query repete a cada ~10s e a tela se reengaja
  // sozinha quando o motorista inicia a viagem.
  const { data: activeTrip, status: tripStatus, refetch: refetchTrip } = useQuery(
    activeTrackingTripOptions(),
  )
  const tripId = activeTrip?.tripId ?? null

  // Estado inicial: último ponto conhecido. 404 NO_LOCATION_AVAILABLE vira
  // null na query — "aguardando a primeira posição", não erro.
  const lastKnown = useQuery(lastKnownLocationOptions(tripId ?? undefined))

  const [bus, setBus] = React.useState<BusPosition | null>(null)
  const [gpsStale, setGpsStale] = React.useState(false)
  const [tripEnded, setTripEnded] = React.useState(false)
  const [streamStale, setStreamStale] = React.useState(false)
  const [studentPoint, setStudentPoint] = React.useState<GeoPoint | null>(null)
  const [deviceLocationDenied, setDeviceLocationDenied] = React.useState(false)

  // ---- Timer do sinal GPS (15s sem location.updated) ----
  const signalTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearSignalTimer = React.useCallback(() => {
    if (signalTimerRef.current !== null) {
      clearTimeout(signalTimerRef.current)
      signalTimerRef.current = null
    }
  }, [])
  const markSignal = React.useCallback(() => {
    setGpsStale(false)
    clearSignalTimer()
    signalTimerRef.current = setTimeout(() => {
      signalTimerRef.current = null
      setGpsStale(true)
    }, GPS_SIGNAL_TIMEOUT_MS)
  }, [clearSignalTimer])

  const seededFromLastKnownRef = React.useRef(false)

  // Viagem nova (ou nenhuma): zera o estado do ciclo anterior, inclusive o
  // timer — o indicador de sinal é por viagem.
  React.useEffect(() => {
    seededFromLastKnownRef.current = false
    setBus(null)
    setTripEnded(false)
    setStreamStale(false)
    setGpsStale(false)
    clearSignalTimer()
  }, [tripId, clearSignalTimer])

  React.useEffect(() => {
    return () => clearSignalTimer()
  }, [clearSignalTimer])

  // ---- Posição do ônibus ----

  // O last-known semeia a posição UMA vez: daí em diante o stream é a fonte —
  // um refetch do endpoint pode trazer ponto mais velho que um evento já
  // recebido (o cache expira em 60s; o evento, em ~5s).
  React.useEffect(() => {
    const point = lastKnown.data
    if (!point || seededFromLastKnownRef.current) return
    seededFromLastKnownRef.current = true
    setBus({
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy,
      at: point.capturedAt,
    })
    // Semear já é chegada de posição: o ponto last-known não é fresco para
    // sempre — o MESMO timer de 15s do degradado corre a partir daqui, mesmo
    // que nenhum evento do stream chegue.
    markSignal()
  }, [lastKnown.data, markSignal])

  // ---- Canal SSE (um cliente por viagem; fecha no 409 de fim de viagem) ----
  // Época do stream: o banner "Atualizar" precisa reabrir a conexão morta,
  // mas o tripId não muda nesse caso — a época é a dependência que reexecuta
  // o effect (cleanup fecha a antiga, o corpo abre uma nova).
  const [streamEpoch, bumpStreamEpoch] = React.useReducer(
    (epoch: number) => epoch + 1,
    0,
  )
  React.useEffect(() => {
    if (!tripId || tripEnded) return

    const connection = connectTrackingEvents(tripId, {
      onLocationUpdated: (event) => {
        setBus(toBusPosition(event))
        markSignal()
      },
      onOpen: () => setStreamStale(false),
      onTripEnded: () => {
        setTripEnded(true)
        setGpsStale(false)
        clearSignalTimer()
        // O invalidation retorna a descoberta ao polling: quando o motorista
        // iniciar a próxima viagem, tripId muda e a tela refaz tudo sozinha.
        void queryClient.invalidateQueries({ queryKey: activeTrackingTripKey })
      },
      onUnrecoverable: () => setStreamStale(true),
    })
    return () => connection.close()
  }, [tripId, tripEnded, streamEpoch, markSignal, clearSignalTimer, queryClient])

  // ---- Posição do device do aluno (expo-location, foreground) ----
  React.useEffect(() => {
    let subscription: Location.LocationSubscription | null = null
    let cancelled = false

    Location.requestForegroundPermissionsAsync()
      .then(({ granted }) => {
        if (cancelled) return undefined
        if (!granted) {
          setDeviceLocationDenied(true)
          return undefined
        }
        return Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced },
          (position) => {
            setDeviceLocationDenied(false)
            setStudentPoint({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            })
          },
        )
      })
      .then((sub) => {
        if (cancelled) {
          sub?.remove()
          return
        }
        subscription = sub ?? null
      })
      .catch(() => {
        if (!cancelled) setDeviceLocationDenied(true)
      })

    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [])

  // ---- Render ----

  if (tripStatus === 'pending') {
    return <Loading label="Carregando sua viagem..." />
  }

  if (tripStatus === 'error' && activeTrip === undefined) {
    return (
      <Centered
        title="Não foi possível carregar sua viagem"
        detail="Verifique sua conexão e tente novamente."
        actionLabel="Tentar novamente"
        onAction={() => void refetchTrip()}
      />
    )
  }

  if (!tripId || tripEnded) {
    return (
      <Centered
        title="Nenhuma viagem ativa no momento"
        detail="Esta tela atualiza sozinha quando o motorista iniciar a viagem."
      />
    )
  }

  const distance =
    bus && studentPoint
      ? haversineDistanceMeters(studentPoint, bus)
      : null

  return (
    <View style={styles.container}>
      <Banner
        visible={streamStale}
        actions={[
          {
            label: 'Atualizar',
            // Epoch nova reabre o stream morto (o effect depende dela); o
            // refetch reconcilia a descoberta e o last-known pelo caminho REST.
            onPress: () => {
              bumpStreamEpoch()
              void refetchTrip()
            },
          },
        ]}
      >
        Dados podem estar desatualizados — sem atualização em tempo real
      </Banner>

      {bus ? (
        <>
          <Card mode="elevated" style={styles.positionCard}>
            <Card.Content>
              <View style={styles.positionHeader}>
                <Text variant="titleMedium">Ônibus da sua rota</Text>
                {gpsStale ? (
                  <Chip icon="wifi-off" mode="outlined" compact>
                    Sem sinal GPS
                  </Chip>
                ) : (
                  <Chip icon="map-marker" mode="outlined" compact>
                    Em tempo real
                  </Chip>
                )}
              </View>
              <Text variant="bodyLarge" style={styles.coordinates}>
                {bus.latitude.toFixed(5)}, {bus.longitude.toFixed(5)}
              </Text>
              <Text variant="bodySmall" style={styles.hint}>
                Posição de {formatClock(bus.at)}
                {bus.accuracy ? ` · precisão ~${Math.round(bus.accuracy)} m` : ''}
              </Text>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={styles.distanceCard}>
            <Card.Content>
              {distance !== null ? (
                <>
                  <Text variant="headlineMedium" style={styles.distance}>
                    {formatDistance(distance)}
                  </Text>
                  <Text variant="bodyLarge" style={styles.eta}>
                    {formatEta(distance)} — tempo estimado até você
                  </Text>
                </>
              ) : (
                <Text variant="bodyMedium" style={styles.hint}>
                  {deviceLocationDenied
                    ? 'Ative a localização do app para ver a distância até o ônibus.'
                    : 'Capturando sua localização para calcular a distância...'}
                </Text>
              )}
            </Card.Content>
          </Card>
        </>
      ) : (
        <Card mode="outlined" style={styles.distanceCard}>
          <Card.Content>
            <Text variant="titleMedium">Aguardando a primeira posição</Text>
            <Text variant="bodyMedium" style={styles.hint}>
              {lastKnown.isError
                ? 'Não foi possível carregar a última posição — o ônibus aparece aqui assim que o motorista começar a transmitir.'
                : 'O ônibus aparece aqui assim que o motorista começar a transmitir.'}
            </Text>
          </Card.Content>
        </Card>
      )}
    </View>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
      <Text variant="bodyLarge" style={styles.centeredText}>
        {label}
      </Text>
    </View>
  )
}

function Centered({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string
  detail: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View style={styles.centered}>
      <Text variant="titleLarge" style={styles.centeredTitle}>
        {title}
      </Text>
      <Text variant="bodyLarge" style={styles.centeredText}>
        {detail}
      </Text>
      {actionLabel && onAction ? (
        <Button
          mode="contained"
          onPress={onAction}
          style={styles.action}
          contentStyle={styles.actionContent}
        >
          {actionLabel}
        </Button>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  centeredTitle: {
    textAlign: 'center',
  },
  centeredText: {
    textAlign: 'center',
    opacity: 0.7,
  },
  action: {
    marginTop: 8,
  },
  actionContent: {
    paddingVertical: 8,
  },
  positionCard: {
    borderRadius: 16,
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  coordinates: {
    marginTop: 12,
    fontVariant: ['tabular-nums'],
  },
  distanceCard: {
    borderRadius: 16,
  },
  distance: {
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  eta: {
    textAlign: 'center',
    opacity: 0.7,
    marginTop: 4,
  },
  hint: {
    opacity: 0.7,
    marginTop: 8,
  },
})
