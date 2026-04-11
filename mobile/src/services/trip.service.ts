import { apiClient } from './api-client'

export type TripType = 'OUTBOUND' | 'RETURN'
export type TripStatus = 'ACTIVE' | 'COMPLETED'

export interface Trip {
  id: string
  companyId: string
  routeId: string
  driverId: string
  type: TripType
  status: TripStatus
  startedAt: string
  endedAt: string | null
  relatedTripId: string | null
}

export const tripService = {
  getActiveTrip: () => apiClient.get<Trip | null>('/api/v1/trips/active'),

  startTrip: (routeId: string, type: TripType, relatedTripId?: string) =>
    apiClient.post<Trip>('/api/v1/trips', { routeId, type, ...(relatedTripId ? { relatedTripId } : {}) }),

  endTrip: (tripId: string) => apiClient.patch<Trip>(`/api/v1/trips/${tripId}/end`),
}
