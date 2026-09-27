import * as Location from 'expo-location'
import React from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { BusEtaCard, type BusEtaFreshness } from '@/components/track-bus/bus-eta-card'
import { BusMap } from '@/components/track-bus/bus-map'
import { LocationPermissionCard } from '@/components/trip/location-permission-card'
import { Banner } from '@/components/ui/banner'
import { Screen } from '@/components/ui/screen'
import { BusEtaCardSkeleton } from '@/components/ui/screen-skeletons'
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
import { spacing } from '@/lib/tokens'
import {
  connectTrackingEvents,
  type LocationUpdatedEvent,
} from '@/services/tracking-stream.service'

// Degraded is about the GPS SIGNAL, not the socket: a ping proves the
// connection, not a position — only location.updated resets this timer (data
// honesty).
const GPS_SIGNAL_TIMEOUT_MS = 15_000

// Only drives the "há N min" label, so it ticks only while degraded.
const STALE_CLOCK_TICK_MS = 10_000

const STUDENT_PERMISSION_DESCRIPTION =
  'Ative a localização do app para ver em quanto tempo o ônibus chega até você. ' +
  'Ela só é usada nesta tela.'

interface BusPosition {
  latitude: number
  longitude: number
  accuracy?: number
  // Device capturedAt (last-known) or publish timestamp (event).
  at: string
}

const toBusPosition = (event: LocationUpdatedEvent): BusPosition => ({
  latitude: event.latitude,
  longitude: event.longitude,
  accuracy: event.accuracy,
  at: event.timestamp,
})

// Monotonic resync guard (AI1/R13): the REST point only beats the displayed one
// if it is STRICTLY newer — the response may arrive after an SSE event and be
// older than it. An invalid capturedAt (the contract only echoes the device)
// never displaces a point, but it seeds the first one: a position is worth more
// than a clock.
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
  // The contract schema validates only the format, not the calendar — a
  // capturedAt like "2026-13-45T25:99:99Z" lands here as an Invalid Date (R5).
  if (Number.isNaN(date.getTime())) return '--:--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function TrackBusScreen() {
  const queryClient = useQueryClient()

  // Trip discovery (GET /tracking/trips/active): any leg on the student's
  // route — while null, the query repeats every ~10s and the screen re-engages
  // by itself when the driver starts the trip.
  const { data: activeTrip, status: tripStatus, refetch: refetchTrip } = useQuery(
    activeTrackingTripOptions(),
  )
  const tripId = activeTrip?.tripId ?? null

  // Initial state: last known point. 404 NO_LOCATION_AVAILABLE becomes null in
  // the query — "waiting for the first position", not an error. The
  // destructuring is NOT style: reading `.data`/`.dataUpdatedAt` during render
  // is what makes them tracked properties in react-query — read only in the
  // effect below, the resync refetch updated the cache without re-rendering.
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
  const [devicePermission, setDevicePermission] = React.useState<{ canAskAgain: boolean } | null>(
    null,
  )
  // When a position last ARRIVED (not its capturedAt): "há N min" counts from here.
  const [lastSignalAt, setLastSignalAt] = React.useState<number | null>(null)
  const [now, setNow] = React.useState(() => Date.now())

  // ---- GPS signal timer (15s without location.updated) ----
  const signalTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearSignalTimer = React.useCallback(() => {
    if (signalTimerRef.current !== null) {
      clearTimeout(signalTimerRef.current)
      signalTimerRef.current = null
    }
  }, [])
  const markSignal = React.useCallback(() => {
    setGpsStale(false)
    setLastSignalAt(Date.now())
    clearSignalTimer()
    signalTimerRef.current = setTimeout(() => {
      signalTimerRef.current = null
      setGpsStale(true)
    }, GPS_SIGNAL_TIMEOUT_MS)
  }, [clearSignalTimer])

  // New trip (or none): reset the previous cycle's state, timer included — the
  // signal indicator is per trip.
  React.useEffect(() => {
    setBus(null)
    setTripEnded(false)
    setStreamStale(false)
    setGpsStale(false)
    setLastSignalAt(null)
    clearSignalTimer()
  }, [tripId, clearSignalTimer])

  React.useEffect(() => {
    return () => clearSignalTimer()
  }, [clearSignalTimer])

  React.useEffect(() => {
    if (!gpsStale) return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), STALE_CLOCK_TICK_MS)
    return () => clearInterval(interval)
  }, [gpsStale])

  // ---- Bus position ----

  // The last-known seeds AND reconciles: every arrival from the endpoint
  // (mount, stream reopen, "Atualizar" banner) goes through the monotonic
  // guard — this is the resync the 5.0 contract promises for post-outage
  // recovery, without regressing to a point older than the last event.
  //
  // Each RESPONSE is evaluated ONCE (dataUpdatedAt changes per fetch): without
  // that the cached point would be re-evaluated on every stream update and,
  // with the driver's clock ahead (capturedAt echoes the device; the event
  // timestamp is SERVER time), it would undo the fresh point back and forth.
  // Comparing capturedAt across sources has this clock-domain limit — server
  // stamping of the last-known stays in deferred-work (wrap-1 entry); wrap-3
  // settled the contract side (staleness declared by data ARRIVAL, never by
  // capturedAt age).
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
    // Applying a point is a position arrival: the SAME 15s degraded timer runs
    // from here, even if no stream event ever arrives.
    markSignal()
  }, [lastKnownPoint, lastKnownUpdatedAt, bus, markSignal])

  // ---- SSE channel (one client per trip; closes on the trip-ended 409) ----
  // Stream epoch: the "Atualizar" banner must reopen a dead connection, but
  // the tripId doesn't change in that case — the epoch is the dependency that
  // re-runs the effect (cleanup closes the old one, the body opens a new one).
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
        // Contracted resync on reconnect (AI1): whatever was published while
        // the stream was down only exists in REST — the monotonic guard
        // decides whether the fetched point beats the displayed one.
        void queryClient.invalidateQueries({
          queryKey: lastKnownLocationKey(tripId),
        })
      },
      onTripEnded: () => {
        setTripEnded(true)
        setGpsStale(false)
        clearSignalTimer()
        // Invalidating puts discovery back on polling: when the driver starts
        // the next trip, tripId changes and the screen redoes everything.
        void queryClient.invalidateQueries({ queryKey: activeTrackingTripKey })
      },
      onUnrecoverable: () => setStreamStale(true),
    })
    return () => connection.close()
  }, [tripId, tripEnded, streamEpoch, markSignal, clearSignalTimer, queryClient])

  // ---- Student device position (expo-location, foreground) ----
  // Bumped by the permission card: re-requests and re-subscribes.
  const [locationEpoch, bumpLocationEpoch] = React.useReducer(
    (epoch: number) => epoch + 1,
    0,
  )
  React.useEffect(() => {
    let subscription: Location.LocationSubscription | null = null
    let cancelled = false

    Location.requestForegroundPermissionsAsync()
      .then(({ granted, canAskAgain }) => {
        if (cancelled) return undefined
        setDevicePermission({ canAskAgain })
        if (!granted) {
          setDeviceLocationDenied(true)
          return undefined
        }
        setDeviceLocationDenied(false)
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
        if (cancelled) return
        setDeviceLocationDenied(true)
        setDevicePermission({ canAskAgain: true })
      })

    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [locationEpoch])

  // Coming back from the system settings doesn't re-run the request by itself:
  // without this the card and the "—" would stay until the screen remounts.
  // Only the getter here: re-requesting on every foreground reopened the OS
  // dialog after a denial. Asking again is the permission card's job.
  React.useEffect(() => {
    if (!deviceLocationDenied) return
    let cancelled = false
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      Location.getForegroundPermissionsAsync()
        .then(({ granted, canAskAgain }) => {
          if (cancelled) return
          if (granted) bumpLocationEpoch()
          else setDevicePermission({ canAskAgain })
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [deviceLocationDenied])

  // ---- Render ----

  if (tripStatus === 'pending') {
    return (
      <Screen>
        <BusEtaCardSkeleton label="Carregando sua viagem..." />
      </Screen>
    )
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

  const staleBanner = streamStale ? (
    <Banner
      tone="warning"
      message="Dados podem estar desatualizados — sem atualização em tempo real"
      action={{
        label: 'Atualizar',
        // A new epoch reopens the dead stream (the effect depends on it); the
        // refetch reconciles discovery and last-known through REST — the
        // last-known effect's monotonic guard decides whether the fetched
        // point is newer than the displayed one.
        onPress: () => {
          bumpStreamEpoch()
          void refetchTrip()
          void queryClient.invalidateQueries({
            queryKey: lastKnownLocationKey(tripId),
          })
        },
      }}
      testID="track-bus-stale-banner"
    />
  ) : null

  if (!bus) {
    return (
      <Screen testID="track-bus-screen">
        <View style={styles.waiting}>
          {staleBanner}
          <StateView
            kind="empty"
            icon="bus-clock"
            title="Aguardando a primeira posição"
            detail={
              lastKnownError
                ? 'Não foi possível carregar a última posição — o ônibus aparece aqui assim que o motorista começar a transmitir.'
                : 'O ônibus aparece aqui assim que o motorista começar a transmitir.'
            }
          />
        </View>
      </Screen>
    )
  }

  const distance = studentPoint ? haversineDistanceMeters(studentPoint, bus) : null

  const freshness: BusEtaFreshness = gpsStale
    ? {
        kind: 'stale',
        minutes: lastSignalAt === null ? 0 : Math.max(0, (now - lastSignalAt) / 60_000),
      }
    : { kind: 'live' }

  const clock = formatClock(bus.at)
  const accuracy = bus.accuracy ? Math.round(bus.accuracy) : null
  const coords = `${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}`
  const caption = `Última posição às ${clock}${accuracy !== null ? ` · precisão ~${accuracy} m` : ''}`
  const captionAccessibilityLabel =
    `Última posição às ${clock}, em ${coords}` +
    (accuracy !== null ? `, precisão de cerca de ${accuracy} metros` : '')

  return (
    <Screen variant="scroll" testID="track-bus-screen">
      <View style={styles.stack}>
        {staleBanner}
        <BusMap bus={bus} student={studentPoint} stale={gpsStale} />
        <BusEtaCard
          eta={distance !== null ? formatEta(distance) : null}
          distance={distance !== null ? `${formatDistance(distance)} de você` : null}
          pendingLine={
            deviceLocationDenied
              ? undefined
              : 'Capturando sua localização para calcular a distância...'
          }
          freshness={freshness}
          caption={caption}
          captionAccessibilityLabel={captionAccessibilityLabel}
        />
        {deviceLocationDenied && distance === null ? (
          <LocationPermissionCard
            permission={devicePermission ?? { canAskAgain: true }}
            requestPermission={() => {
              bumpLocationEpoch()
              return Promise.resolve()
            }}
            description={STUDENT_PERMISSION_DESCRIPTION}
          />
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.sectionGap,
  },
  waiting: {
    flex: 1,
    gap: spacing.sectionGap,
  },
})
