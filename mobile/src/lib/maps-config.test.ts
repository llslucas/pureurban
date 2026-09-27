import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { isGoogleMapsConfigured } from '@/lib/maps-config'

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }))

const setFlag = (value: unknown) => {
  ;(Constants as { expoConfig: { extra: Record<string, unknown> } }).expoConfig.extra = {
    googleMapsConfigured: value,
  }
}

describe('isGoogleMapsConfigured (story 7.1)', () => {
  const originalOS = Platform.OS

  afterEach(() => {
    Platform.OS = originalOS
  })

  it('Android with the flag app.config.ts sets: configured', () => {
    Platform.OS = 'android'
    setFlag(true)
    expect(isGoogleMapsConfigured()).toBe(true)
  })

  it('Android without the flag, or with a non-boolean one: not configured', () => {
    Platform.OS = 'android'
    setFlag(false)
    expect(isGoogleMapsConfigured()).toBe(false)
    setFlag('true')
    expect(isGoogleMapsConfigured()).toBe(false)
  })

  it('iOS never uses the Google provider, even with the flag (only an Android key exists)', () => {
    Platform.OS = 'ios'
    setFlag(true)
    expect(isGoogleMapsConfigured()).toBe(false)
  })
})
