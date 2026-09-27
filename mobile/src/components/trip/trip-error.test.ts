import { TRIP_NETWORK_ERROR_MESSAGE, TRIP_SERVER_ERROR_MESSAGE, tripActionErrorMessage } from '@/components/trip/trip-error'
import { ApiClientError } from '@/services/api-error'

describe('tripActionErrorMessage', () => {
  it('fetch transport failure (raw English TypeError) becomes the pt-BR network copy', () => {
    expect(tripActionErrorMessage(new TypeError('Network request failed'), 'start')).toEqual({
      title: 'Não foi possível iniciar a viagem',
      message: TRIP_NETWORK_ERROR_MESSAGE,
    })
  })

  it('client timeout (status 0) is a network failure too', () => {
    const timeout = new ApiClientError('REQUEST_TIMEOUT', 'A requisição excedeu o tempo limite', 0)
    expect(tripActionErrorMessage(timeout, 'end')).toEqual({
      title: 'Não foi possível encerrar a viagem',
      message: TRIP_NETWORK_ERROR_MESSAGE,
    })
  })

  it('a server answer keeps its own pt-BR message', () => {
    const forbidden = new ApiClientError('DRIVER_NOT_ASSIGNED', 'Motorista não vinculado a esta rota', 403)
    expect(tripActionErrorMessage(forbidden, 'start').message).toBe('Motorista não vinculado a esta rota')
  })

  it('anything that is not an Error still gets the network copy', () => {
    expect(tripActionErrorMessage('boom', 'end').message).toBe(TRIP_NETWORK_ERROR_MESSAGE)
  })

  it.each([
    ['500 from the API filter', new ApiClientError('INTERNAL_ERROR', 'An unexpected error occurred', 500)],
    ['any 5xx', new ApiClientError('BAD_GATEWAY', 'Bad Gateway', 502)],
    ['Nest HttpException', new ApiClientError('HTTP_ERROR', 'Forbidden resource', 403)],
    ['throttler', new ApiClientError('HTTP_ERROR', 'ThrottlerException: Too Many Requests', 429)],
    ['client fallback for a non-JSON body', new ApiClientError('INVALID_RESPONSE', 'Resposta inesperada do servidor', 400)],
    ['client fallback without a code', new ApiClientError('UNKNOWN_ERROR', 'An error occurred', 400)],
  ])('%s gets the pt-BR generic server copy', (_, error) => {
    expect(tripActionErrorMessage(error, 'start').message).toBe(TRIP_SERVER_ERROR_MESSAGE)
  })
})
