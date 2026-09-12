import { queryOptions } from '@tanstack/react-query'

// ApiClientError vem do módulo puro (api-error), não do api-client: este arrasta
// expo-router/MMKV, que não carregam sob jest-expo — a classe é a mesma (o
// api-client só a reexporta), então `instanceof` no retry continua correto.
import { ApiClientError } from '@/services/api-error'
import { trackingService } from '@/services/tracking.service'

// Fonte única das query keys/opções do acompanhamento (mesma disciplina do
// trip-queries): keys duplicadas por literal fazem telas divergirem.

export const activeTrackingTripKey = ['activeTrackingTrip'] as const

export function lastKnownLocationKey(tripId: string | undefined) {
  return ['trackingLastKnown', tripId] as const
}

/**
 * `GET /tracking/trips/active` — a viagem ativa (qualquer perna) na rota do
 * aluno, ou null. Enquanto null, refetch a cada ~10s: é o que faz a tela se
 * reengajar sozinha quando o motorista inicia a viagem.
 */
export function activeTrackingTripOptions() {
  return queryOptions({
    queryKey: activeTrackingTripKey,
    queryFn: () => trackingService.getActiveTrackingTrip(),
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data ? false : 10_000),
    retry: 2,
  })
}

/**
 * `GET /tracking/trips/:id/location` — último ponto conhecido da viagem.
 * Estado inicial da tela e o resync contratado (contrato 5.0): é por aqui que
 * o aluno recupera o que foi publicado durante uma queda do stream — a tela o
 * refaz na reabertura da conexão e no banner "Atualizar". 404
 * NO_LOCATION_AVAILABLE não é erro: é o estado "aguardando a primeira posição"
 * (o cache está vazio ou o TTL expirou — nunca um ponto stale).
 */
export function lastKnownLocationOptions(tripId: string | undefined) {
  return queryOptions({
    queryKey: lastKnownLocationKey(tripId),
    // Sem tripId, a queryFn rodaria com path /trips/undefined/location → 404.
    enabled: Boolean(tripId),
    queryFn: async () => {
      try {
        return await trackingService.getLastKnownLocation(tripId!)
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.code === 'NO_LOCATION_AVAILABLE'
        ) {
          return null
        }
        throw error
      }
    },
    staleTime: 5_000,
    // Não retenta erro de negócio 4xx (403 STUDENT_NOT_ON_TRIP, 409
    // TRIP_NOT_ACTIVE): a resposta é determinística.
    retry: (count, error) =>
      count < 2 &&
      !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
  })
}
