import type { GeoPoint } from '@/lib/geo'

export interface BusMapProps {
  bus: GeoPoint
  student: GeoPoint | null
  /** GPS signal lost: the bus marker stays at its last point, dimmed. */
  stale: boolean
  testID?: string
}
