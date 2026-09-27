import { ApiClientError } from '@/services/api-error'

export type TripAction = 'start' | 'end'

export interface TripActionErrorCopy {
  title: string
  message: string
}

export const TRIP_NETWORK_ERROR_MESSAGE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.'

const TITLES: Record<TripAction, string> = {
  start: 'Não foi possível iniciar a viagem',
  end: 'Não foi possível encerrar a viagem',
}

// Anything that is not an ApiClientError never reached the server (the fetch
// TypeError carries the raw English "Network request failed"), and status 0 is
// the client-side timeout. Server errors already carry a pt-BR message.
export function tripActionErrorMessage(error: unknown, action: TripAction): TripActionErrorCopy {
  const isTransport = !(error instanceof ApiClientError) || error.status === 0
  return {
    title: TITLES[action],
    message: isTransport ? TRIP_NETWORK_ERROR_MESSAGE : error.message,
  }
}
