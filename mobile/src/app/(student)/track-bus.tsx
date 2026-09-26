import * as Location from 'expo-location'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Banner, Card, Chip, Text } from 'react-native-paper'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { StateView } from '@/components/ui/state-view'
import {
  activeTrackingTripKey,
  activeTrackingTripOptions,
  lastKnownLocationKey,
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

// Guarda monotônica do resync (AI1/R13): o ponto REST só vence o exibido se
// for ESTRITAMENTE mais novo — a resposta pode chegar depois de um evento SSE
// e mais velha que ele. capturedAt inválido (o contrato só ecoa o device) não
// desloca ponto nenhum, mas semeia o primeiro: posição vale mais que relógio.
const isStrictlyNewer = (incoming: string, current: string | null): boolean => {
  if (current === null) return true
  const incomingMs = Date.parse(incoming)
  if (Number.isNaN(incomingMs)) return false
  const currentMs = Date.parse(current)
  if (Number.isNaN(currentMs)) return true
  return incomingMs > currentMs
}

const formatClock = (iso: string): string => {
  const date = new Date(iso)
  // Schema do contrato valida só o formato, não o calendário — um capturedAt
  // tipo "2026-13-45T25:99:99Z" chega aqui como Invalid Date (R5).
  if (Number.isNaN(date.getTime())) return '--:--:--'
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
  // null na query — "aguardando a primeira posição", não erro. A desestruturação
  // NÃO é estilo: o acesso a `.data`/`.dataUpdatedAt` no render é o que os torna
  // propriedades rastreadas pelo react-query — lidos só no effect abaixo, o
  // refetch do resync atualizava o cache sem re-renderizar a tela.
  const {
    data: lastKnownPoint,
    dataUpdatedAt: lastKnownUpdatedAt,
    isError: lastKnownError,
  } = useQuery(lastKnownLocationOptions(tripId ?? undefined))

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

  // Viagem nova (ou nenhuma): zera o estado do ciclo anterior, inclusive o
  // timer — o indicador de sinal é por viagem.
  React.useEffect(() => {
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

  // O last-known semeia E reconcilia: cada chegada do endpoint (montagem,
  // reabertura do stream, banner "Atualizar") passa pela guarda monotônica —
  // é o resync que o contrato 5.0 promete para a recuperação pós-queda, sem
  // regredir a posição para um ponto mais velho que o último evento.
  //
  // Cada RESPOSTA é avaliada UMA vez (o dataUpdatedAt muda a cada fetch): sem
  // isso o ponto cacheado seria reavaliado a cada atualização do stream e,
  // com o relógio do motorista adiantado (capturedAt é eco do device; o
  // timestamp do evento é hora do SERVIDOR), desfaria o ponto fresco em um
  // vai-e-vem. A comparação de capturedAt entre fontes tem esse limite de
  // domínio de relógio — o carimbo do servidor no last-known segue registrado
  // no deferred-work (entry do wrap-1, "servidor carimbar o last-known"); o
  // wrap-3 resolveu o lado do contrato (staleness declarado pela CHEGADA do
  // dado, nunca pela idade do capturedAt).
  const appliedResyncRef = React.useRef(0)
  React.useEffect(() => {
    if (!lastKnownPoint) return
    if (lastKnownUpdatedAt === 0 || appliedResyncRef.current === lastKnownUpdatedAt) {
      return
    }
    appliedResyncRef.current = lastKnownUpdatedAt
    if (!isStrictlyNewer(lastKnownPoint.capturedAt, bus?.at ?? null)) return
    setBus({
      latitude: lastKnownPoint.latitude,
      longitude: lastKnownPoint.longitude,
      accuracy: lastKnownPoint.accuracy,
      at: lastKnownPoint.capturedAt,
    })
    // Aplicar ponto é chegada de posição: o MESMO timer de 15s do degradado
    // corre a partir daqui, mesmo que nenhum evento do stream chegue.
    markSignal()
  }, [lastKnownPoint, lastKnownUpdatedAt, bus, markSignal])

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
      onOpen: () => {
        setStreamStale(false)
        // Resync contratado na reconexão (AI1): o que foi publicado durante a
        // queda do stream só existe no REST — a guarda monotônica decide se o
        // ponto trazido vence o exibido.
        void queryClient.invalidateQueries({
          queryKey: lastKnownLocationKey(tripId),
        })
      },
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
    return <StateView kind="loading" title="Carregando sua viagem..." />
  }

  if (tripStatus === 'error' && activeTrip === undefined) {
    return (
      <StateView
        kind="error"
        title="Não foi possível carregar sua viagem"
        detail="Verifique sua conexão e tente novamente."
        action={{
          label: 'Tentar novamente',
          onPress: () => void refetchTrip(),
        }}
      />
    )
  }

  if (!tripId || tripEnded) {
    return (
      <StateView
        kind="empty"
        icon="bus-clock"
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
            // refetch reconcilia a descoberta e o last-known pelo caminho
            // REST — a guarda monotônica do effect do last-known decide se
            // o ponto trazido é mais novo que o exibido.
            onPress: () => {
              bumpStreamEpoch()
              void refetchTrip()
              void queryClient.invalidateQueries({
                queryKey: lastKnownLocationKey(tripId),
              })
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
              {lastKnownError
                ? 'Não foi possível carregar a última posição — o ônibus aparece aqui assim que o motorista começar a transmitir.'
                : 'O ônibus aparece aqui assim que o motorista começar a transmitir.'}
            </Text>
          </Card.Content>
        </Card>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
    padding: 16,
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
