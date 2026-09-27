import { ApiClientError } from '@/services/api-error'

export type TripAction = 'start' | 'end'

export interface TripActionErrorCopy {
  title: string
  message: string
}

export const TRIP_NETWORK_ERROR_MESSAGE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
export const TRIP_SERVER_ERROR_MESSAGE = 'O servidor não conseguiu concluir a ação. Tente de novo em instantes.'

const TITLES: Record<TripAction, string> = {
  start: 'Não foi possível iniciar a viagem',
  end: 'Não foi possível encerrar a viagem',
}

// Codes whose message is framework/client fallback text in English (the API's
// 500 filter, Nest HttpExceptions, the client's own fallbacks), not app copy.
const GENERIC_CODES = new Set(['INTERNAL_ERROR', 'HTTP_ERROR', 'INVALID_RESPONSE', 'UNKNOWN_ERROR'])

// Anything that is not an ApiClientError never reached the server (the fetch
// TypeError carries the raw English "Network request failed"), and status 0 is
// the client-side timeout. Domain 4xx errors already carry a pt-BR message.
export function tripActionErrorMessage(error: unknown, action: TripAction): TripActionErrorCopy {
  const title = TITLES[action]
  if (!(error instanceof ApiClientError) || error.status === 0) {
    return { title, message: TRIP_NETWORK_ERROR_MESSAGE }
  }
  if (error.status >= 500 || GENERIC_CODES.has(error.code)) {
    return { title, message: TRIP_SERVER_ERROR_MESSAGE }
  }
  return { title, message: error.message }
}
