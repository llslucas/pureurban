import type { components } from '@/types/api'

import { API_BASE_URL } from '@/utils/constants'
import { connectSseStream, type SseConnection } from '@/services/sse-client'

// Tipos gerados a partir de `api/openapi.json` — nunca escritos à mão.
export type LocationUpdatedEvent =
  components['schemas']['LocationUpdatedEventDto']

// O contrato 5.0 não tem evento de fim de viagem no stream: o servidor encerra
// a conexão, a reconexão recebe 409 TRIP_NOT_ACTIVE (fechamento contratado do
// sse-client) e a tela é avisada via onTripEnded.
export interface TrackingStreamHandlers {
  onLocationUpdated: (event: LocationUpdatedEvent) => void
  // (Re)estabelecimento da conexão — inclusive a primeira: o consumidor
  // reconcilia o estado que pode ter mudado durante a queda de rede.
  onOpen?: () => void
  // Stream fechado com 409 (viagem encerrada no servidor entre os eventos):
  // fechamento contratado, sem retry — a tela mostra "Nenhuma viagem ativa
  // no momento" e volta a consultar a descoberta.
  onTripEnded?: () => void
  // Fim do stream sem perspectiva de recuperação automática: três refreshes
  // falhados em sequência no caminho 401 (mesma regra do boarding, RV1).
  onUnrecoverable?: () => void
}

export type TrackingEventsConnection = SseConnection

// Pino do re-poll pós-close gracioso (R6/wrap-1) — vive no cliente único.
export { SSE_REPOLL_INTERVAL_MS } from '@/services/sse-client'

export function connectTrackingEvents(
  tripId: string,
  handlers: TrackingStreamHandlers,
): TrackingEventsConnection {
  return connectSseStream<{
    'location.updated': LocationUpdatedEvent
  }>({
    url: `${API_BASE_URL}/api/v1/tracking/trips/${tripId}/stream`,
    events: {
      'location.updated': (payload) => handlers.onLocationUpdated(payload),
    },
    onOpen: handlers.onOpen,
    onTripEnded: handlers.onTripEnded,
    onUnrecoverable: handlers.onUnrecoverable,
  })
}
