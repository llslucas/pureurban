import React from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps'

import type { BusMapProps } from '@/components/track-bus/bus-map.types'
import { haversineDistanceMeters, type GeoPoint } from '@/lib/geo'
import { isGoogleMapsConfigured } from '@/lib/maps-config'
import { type AppTheme, useAppTheme, useThemedStyles } from '@/lib/theme'
import { radius } from '@/lib/tokens'

export type { BusMapProps } from '@/components/track-bus/bus-map.types'

const MAP_HEIGHT = 220
const STALE_MARKER_OPACITY = 0.4
const SINGLE_POINT_DELTA = 0.01
const FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 }
// Below this the two points are one spot: fitting their near-zero bounds would
// zoom the map all the way in.
const SAME_SPOT_METERS = 50

// The screen hands its BusPosition (with accuracy/timestamp) straight in; the
// native commands get only the coordinate.
const toLatLng = ({ latitude, longitude }: GeoPoint): GeoPoint => ({ latitude, longitude })

const regionAround = (point: GeoPoint): Region => ({
  ...toLatLng(point),
  latitudeDelta: SINGLE_POINT_DELTA,
  longitudeDelta: SINGLE_POINT_DELTA,
})

const frame = (map: MapView, bus: GeoPoint, student: GeoPoint | null) => {
  if (student && haversineDistanceMeters(bus, student) >= SAME_SPOT_METERS) {
    map.fitToCoordinates([toLatLng(bus), toLatLng(student)], {
      edgePadding: FIT_PADDING,
      animated: true,
    })
  } else {
    map.animateToRegion(regionAround(bus))
  }
}

const isInside = (point: GeoPoint, region: Region): boolean =>
  Math.abs(point.latitude - region.latitude) <= region.latitudeDelta / 2 &&
  Math.abs(point.longitude - region.longitude) <= region.longitudeDelta / 2

export function BusMap(props: BusMapProps) {
  // Checked before any MapView exists: the Google provider without a key
  // crashes the native app instead of rendering an empty map.
  if (!isGoogleMapsConfigured()) return null
  return <ConfiguredBusMap {...props} />
}

function ConfiguredBusMap({ bus, student, stale, testID = 'bus-map' }: BusMapProps) {
  const { custom } = useAppTheme()
  const styles = useThemedStyles(createStyles)
  const mapRef = React.useRef<MapView>(null)
  // Seeded with the initial region: until the first onRegionChangeComplete the
  // recenter check would otherwise have nothing to compare against.
  const regionRef = React.useRef<Region>(regionAround(bus))
  const [ready, setReady] = React.useState(false)
  const framedFor = React.useRef<'bus' | 'both' | null>(null)

  // Frames on map ready and when the student's fix first shows up (or goes
  // away) — never on every bus update, which would fight the user's panning.
  React.useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const target = student ? 'both' : 'bus'
    if (framedFor.current === target) return
    framedFor.current = target
    frame(map, bus, student)
  }, [ready, bus, student])

  // The camera stays put while the bus is on screen; only leaving the visible
  // region reframes it (both points when the student is known, so recentering
  // never drops the student off screen).
  React.useEffect(() => {
    const map = mapRef.current
    const region = regionRef.current
    if (!ready || !map || isInside(bus, region)) return
    frame(map, bus, student)
  }, [bus, student, ready])

  const label =
    'Mapa com a posição do ônibus' +
    (student ? ' e a sua' : '') +
    (stale ? ', sem sinal GPS no momento' : '')

  return (
    <View style={styles.container} accessible accessibilityLabel={label} testID={testID}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={regionAround(bus)}
        onMapReady={() => setReady(true)}
        onRegionChangeComplete={(region) => {
          regionRef.current = region
        }}
        toolbarEnabled={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Marker
          coordinate={toLatLng(bus)}
          title="Ônibus"
          pinColor={custom.palette.brand}
          opacity={stale ? STALE_MARKER_OPACITY : 1}
          testID={`${testID}-bus-marker`}
        />
        {student ? (
          <Marker
            coordinate={toLatLng(student)}
            title="Você"
            pinColor={custom.palette.info}
            testID={`${testID}-student-marker`}
          />
        ) : null}
      </MapView>
    </View>
  )
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      height: MAP_HEIGHT,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: theme.custom.palette.surfaceSoft,
    },
  })
