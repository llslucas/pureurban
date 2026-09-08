import type { components } from '@/types/api'
import { apiClient } from './api-client'

// Tipos gerados a partir de `api/openapi.json` — nunca escritos à mão
// (architecture.md §8, regra 11). Os dois são DTOs de classe na API, então
// geram shape correto (ao contrário dos bodies de Effect Schema, que colapsam
// em `Record<string, never>` — ver deferred-work.md, defer da 3.0).
export type CheckInRequest = components['schemas']['CheckInRequestDto']
export type CheckInResponse = components['schemas']['CheckInResponseDto']
export type NotReturningRequest = components['schemas']['NotReturningRequestDto']
export type NotReturningResponse = components['schemas']['NotReturningResponseDto']
export type CancelAbsenceRequest = components['schemas']['CancelAbsenceRequestDto']
export type CancelAbsenceResponse = components['schemas']['CancelAbsenceResponseDto']

export const boardingService = {
  // A chave de idempotência é RECEBIDA, não gerada aqui. Ela pertence à
  // tentativa de check-in, não à chamada HTTP: a Story 3.4b vai reenviar um item
  // da fila offline com a key original gravada em `offline_queue.id`
  // (Architecture §5, Tier 2). Gerá-la aqui faria cada retry virar uma operação
  // nova aos olhos do servidor — exatamente o que a idempotência existe para
  // evitar.
  checkIn: (input: CheckInRequest, idempotencyKey: string) =>
    apiClient.post<CheckInResponse>('/api/v1/boarding/check-in', input, {
      'X-Idempotency-Key': idempotencyKey,
    }),

  // Mesma regra da key: recebida do chamador (a tela gera uma por tentativa,
  // com expo-crypto). O studentId quem monta é a API, a partir do JWT — o body
  // só precisa do tripId da viagem de retorno ativa.
  notifyNotReturning: (tripId: string, idempotencyKey: string) =>
    apiClient.post<NotReturningResponse>(
      '/api/v1/boarding/not-returning',
      { tripId } satisfies NotReturningRequest,
      { 'X-Idempotency-Key': idempotencyKey },
    ),

  // Mesmo padrão do notifyNotReturning: key por tentativa gerada na tela,
  // studentId quem monta é a API. Diferencial do cancelamento: o próprio
  // endpoint É o replay — a mesma key reenviada devolve o cancelamento
  // original (200) em vez de 404, então a key viva durante o envio importa.
  cancelAbsence: (tripId: string, idempotencyKey: string) =>
    apiClient.post<CancelAbsenceResponse>(
      '/api/v1/boarding/cancel-absence',
      { tripId } satisfies CancelAbsenceRequest,
      { 'X-Idempotency-Key': idempotencyKey },
    ),
}
