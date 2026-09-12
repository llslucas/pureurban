import type { components } from '@/types/api'
import { apiClient } from './api-client'

export type LocationIngestRequest = components['schemas']['LocationIngestRequestDto']
export type LocationIngestResponse = components['schemas']['LocationIngestResponseDto']

export const trackingService = {
  // Sem X-Idempotency-Key (divergência consciente dos POSTs do boarding):
  // posição é last-write-wins, descartável e sem fila offline.
  ingestLocation: (body: LocationIngestRequest) =>
    apiClient.post<LocationIngestResponse>('/api/v1/tracking/location', body),
}
