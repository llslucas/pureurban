import { queryOptions } from '@tanstack/react-query'

// ApiClientError vem do módulo puro (api-error), não do api-client: este arrasta
// expo-router/MMKV, que não carregam sob jest-expo — a classe é a mesma (o
// api-client só a reexporta), então `instanceof` no retry continua correto.
import { ApiClientError } from '@/services/api-error'
import { tripService } from '@/services/trip.service'

// Fonte única das query keys e opções das queries de viagem (AI5 da retro 3).
// Keys duplicadas por literal fazem as telas divergirem (finding de review da
// 3.2b) e parâmetros de retry divergentes na MESMA entrada de cache queimam
// escadas de backoff diferentes para o mesmo erro (DS8).

export const activeTripKey = ['activeTrip'] as const

export function tripStudentsKey(tripId: string | undefined) {
  return ['trip', tripId, 'students'] as const
}

/** `GET /trips/active` — devolve a viagem ACTIVE ou `null`. */
export function activeTripOptions() {
  return queryOptions({
    queryKey: activeTripKey,
    queryFn: () => tripService.getActiveTrip(),
    staleTime: 10_000,
    retry: 2,
  })
}

/**
 * Roster de uma viagem (`GET /trips/:id/students`) — observada pela lista de
 * alunos e, via `select`, pela contagem na tela de viagem.
 */
export function tripStudentsOptions(tripId: string | undefined) {
  return queryOptions({
    queryKey: tripStudentsKey(tripId),
    // Sem `enabled`, a queryFn roda com `tripId` undefined e o path vira
    // /api/v1/trips/undefined/students → 404.
    enabled: Boolean(tripId),
    queryFn: () => tripService.getTripStudents(tripId!),
    staleTime: 15_000,
    // Não retenta erro de negócio 4xx (403 DRIVER_NOT_ASSIGNED, 404
    // TRIP_NOT_FOUND): a resposta é determinística — a escada de backoff
    // inteira antes da tela reagir seria ~3s de spinner à toa.
    retry: (count, error) =>
      count < 2 && !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
  })
}
