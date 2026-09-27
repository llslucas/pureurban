import type { BusMapProps } from '@/components/track-bus/bus-map.types'

// No map on web: react-native-maps has no web target here, and the web build is
// what Playwright drives — the screen stays exactly as it was.
export function BusMap(_props: BusMapProps) {
  return null
}
