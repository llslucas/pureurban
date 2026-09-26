import { ApiClientError } from '@/services/api-error'

import {
  activeTripKey,
  activeTripOptions,
  studentBoardingStatusKey,
  studentBoardingStatusOptions,
  tripStudentsKey,
  tripStudentsOptions,
} from '@/lib/trip-queries'

// api-client é mockado porque arrasta expo-router/MMKV (Nitro), que não carregam
// sob jest-expo; a factory só precisa da classe pura de api-error para o retry.
jest.mock('@/services/api-client', () => ({
  ...jest.requireActual('@/services/api-error'),
  apiClient: {},
  refreshAccessToken: jest.fn(async () => false),
}))

describe('trip-queries — keys compartilhadas', () => {
  it('activeTripKey é a literal compartilhada pelas 4 telas', () => {
    expect(activeTripKey).toEqual(['activeTrip'])
  })

  it('tripStudentsKey segmenta por viagem e preserva undefined na key', () => {
    expect(tripStudentsKey('trip-1')).toEqual(['trip', 'trip-1', 'students'])
    expect(tripStudentsKey(undefined)).toEqual(['trip', undefined, 'students'])
  })
})

describe('tripStudentsOptions', () => {
  it('sem tripId, a query fica desabilitada (evita /trips/undefined/students)', () => {
    const options = tripStudentsOptions(undefined)
    expect(options.enabled).toBe(false)
  })

  it('com tripId, habilita e aponta para o endpoint da viagem', () => {
    const options = tripStudentsOptions('trip-1')
    expect(options.enabled).toBe(true)
    expect(options.queryKey).toEqual(['trip', 'trip-1', 'students'])
  })

  it('retry NÃO retenta erro de negócio 4xx (DS8)', () => {
    const { retry } = tripStudentsOptions('trip-1')
    if (typeof retry !== 'function') throw new Error('retry deveria ser função')

    const businessError = new ApiClientError('DRIVER_NOT_ASSIGNED', 'outro motorista', 403)
    expect(retry(0, businessError)).toBe(false)
    expect(retry(1, businessError)).toBe(false)

    const serverError = new ApiClientError('INVALID_RESPONSE', 'inesperado', 500)
    expect(retry(0, serverError)).toBe(true)
    expect(retry(2, serverError)).toBe(false)

    const transportError = new TypeError('Failed to fetch')
    expect(retry(0, transportError)).toBe(true)
    expect(retry(2, transportError)).toBe(false)
  })
})

describe('activeTripOptions', () => {
  it('usa a key compartilhada', () => {
    expect(activeTripOptions().queryKey).toEqual(['activeTrip'])
  })
})

describe('studentBoardingStatusOptions', () => {
  it('sem tripId, a query fica desabilitada', () => {
    const options = studentBoardingStatusOptions(null)
    expect(options.enabled).toBe(false)
    expect(options.queryKey).toEqual(['studentBoardingStatus', 'none'])
  })

  it('com tripId, habilita e segmenta a key pela viagem', () => {
    const options = studentBoardingStatusOptions('trip-1')
    expect(options.enabled).toBe(true)
    expect(options.queryKey).toEqual(studentBoardingStatusKey('trip-1'))
    expect(options.queryKey).toEqual(['studentBoardingStatus', 'trip-1'])
  })

  it('retry NÃO retenta 4xx', () => {
    const { retry } = studentBoardingStatusOptions('trip-1')
    if (typeof retry !== 'function') throw new Error('retry deveria ser função')

    expect(retry(0, new ApiClientError('FORBIDDEN', 'role', 403))).toBe(false)
    expect(retry(0, new ApiClientError('INVALID_RESPONSE', 'x', 500))).toBe(true)
    expect(retry(2, new TypeError('Failed to fetch'))).toBe(false)
  })
})
