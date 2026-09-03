import type { components } from '@/types/api'
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

// Tipos gerados a partir do contrato (architecture.md §8, regra 11). Os três são
// DTOs de classe na API, então geram shape correto (ao contrário dos bodies de
// Effect Schema — ver o defer da 3.0).
export type TripStudents = components['schemas']['TripStudentsResponseDto']
export type TripStudentItem = components['schemas']['TripStudentItemDto']
export type BoardingStatus = TripStudentItem['status']

export const tripService = {
  getActiveTrip: () => apiClient.get<Trip | null>('/api/v1/trips/active'),

  startTrip: (routeId: string, type: TripType, relatedTripId?: string) =>
    apiClient.post<Trip>('/api/v1/trips', { routeId, type, ...(relatedTripId ? { relatedTripId } : {}) }),

  endTrip: (tripId: string) => apiClient.patch<Trip>(`/api/v1/trips/${tripId}/end`),

  getTripStudents: (tripId: string) =>
    apiClient.get<TripStudents>(`/api/v1/trips/${tripId}/students`),
}
