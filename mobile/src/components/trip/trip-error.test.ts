import { TRIP_NETWORK_ERROR_MESSAGE, tripActionErrorMessage } from '@/components/trip/trip-error'
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
})
