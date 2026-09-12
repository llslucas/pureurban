import type { components } from '@/types/api'
import { apiClient } from './api-client'

export type LocationIngestRequest = components['schemas']['LocationIngestRequestDto']
export type LocationIngestResponse = components['schemas']['LocationIngestResponseDto']
export type LastKnownLocation = components['schemas']['LastKnownLocationDto']
export type ActiveTrackingTrip = components['schemas']['ActiveTrackingTripDto']

export const trackingService = {
  // Sem X-Idempotency-Key (divergência consciente dos POSTs do boarding):
  // posição é last-write-wins, descartável e sem fila offline.
  ingestLocation: (body: LocationIngestRequest) =>
    apiClient.post<LocationIngestResponse>('/api/v1/tracking/location', body),

  // Estado inicial da tela de acompanhamento: o resync do aluno após queda de
  // rede e o que fica visível quando o sinal GPS cai (contrato 5.0).
  getLastKnownLocation: (tripId: string) =>
    apiClient.get<LastKnownLocation>(`/api/v1/tracking/trips/${tripId}/location`),

  // Descoberta da viagem (5.2): a viagem ativa de qualquer perna na rota do
  // aluno — null quando não há (o próprio tipo gerado já carrega o | null).
  getActiveTrackingTrip: () =>
    apiClient.get<ActiveTrackingTrip | null>('/api/v1/tracking/trips/active'),
}
