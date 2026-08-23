import type { components } from '@/types/api'
import { apiClient } from './api-client'

// Tipos gerados a partir de `api/openapi.json` — nunca escritos à mão
// (architecture.md §8, regra 11). Os dois são DTOs de classe na API, então
// geram shape correto (ao contrário dos bodies de Effect Schema, que colapsam
// em `Record<string, never>` — ver deferred-work.md, defer da 3.0).
export type CheckInRequest = components['schemas']['CheckInRequestDto']
export type CheckInResponse = components['schemas']['CheckInResponseDto']

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
}
