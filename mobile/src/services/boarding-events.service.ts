import type { components } from '@/types/api'

import { API_BASE_URL } from '@/utils/constants'
import { connectSseStream, type SseConnection } from '@/services/sse-client'

// Tipos gerados a partir de `api/openapi.json` — nunca escritos à mão.
export type BoardingNotReturningEvent =
  components['schemas']['BoardingNotReturningEventDto']
export type BoardingAbsenceCancelledEvent =
  components['schemas']['BoardingAbsenceCancelledEventDto']
export type BoardingCheckinReminderEvent =
  components['schemas']['BoardingCheckinReminderEventDto']

// O contrato 4.0 não tem evento de fim de viagem no stream: o servidor encerra
// a conexão e a reconexão recebe 409 TRIP_NOT_ACTIVE — é isso que fecha
// definitivamente a conexão (comportamento do sse-client compartilhado).
export interface BoardingEventHandlers {
  onNotReturning: (event: BoardingNotReturningEvent) => void
  onAbsenceCancelled: (event: BoardingAbsenceCancelledEvent) => void
  // (Re)estabelecimento da conexão — inclusive a primeira: o consumidor
  // reconcilia o estado que pode ter mudado durante a queda de rede
  // (spec 4.2, linha "Queda de rede": roster reconciliado por refetch).
  onOpen?: () => void
  // Lembrete do canal (Story 4.4): a story 4.2 só faz forwarding — nenhum
  // consumidor no motorista ainda.
  onCheckinReminder?: (event: BoardingCheckinReminderEvent) => void
  // Fim do stream sem perspectiva de recuperação automática: três refreshes
  // falhados em sequência no caminho 401 (o token de acesso expirou e a
  // renovação não vira). O consumidor decide como expor o estado — a
  // student-list reusa o banner de dado velho. NÃO é invocado no 409, que é
  // fechamento contratado de fim de viagem.
  onUnrecoverable?: () => void
}

export type BoardingEventsConnection = SseConnection

const EVENTS_PATH = '/api/v1/boarding/events'

export function connectBoardingEvents(
  tripId: string,
  handlers: BoardingEventHandlers,
): BoardingEventsConnection {
  return connectSseStream<{
    'boarding.not_returning': BoardingNotReturningEvent
    'boarding.absence_cancelled': BoardingAbsenceCancelledEvent
    'boarding.checkin_reminder': BoardingCheckinReminderEvent
  }>({
    url: `${API_BASE_URL}${EVENTS_PATH}`,
    events: {
      'boarding.not_returning': (payload) => handlers.onNotReturning(payload),
      'boarding.absence_cancelled': (payload) =>
        handlers.onAbsenceCancelled(payload),
      'boarding.checkin_reminder': (payload) =>
        handlers.onCheckinReminder?.(payload),
    },
    onOpen: handlers.onOpen,
    onUnrecoverable: handlers.onUnrecoverable,
  })
}
