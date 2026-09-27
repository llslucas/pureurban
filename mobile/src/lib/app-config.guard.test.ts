import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ConfigContext, ExpoConfig } from 'expo/config'

import appConfig from '../../app.config'

// Locks the env → native key → JS flag chain of story 7.1: the flag that lets
// BusMap mount the Google provider must be true exactly when the plugin gets
// a key, or the native app crashes on a keyless build.

const MOBILE_ROOT = join(__dirname, '..', '..')
const baseConfig = (JSON.parse(readFileSync(join(MOBILE_ROOT, 'app.json'), 'utf8')) as { expo: ExpoConfig })
  .expo

const resolve = (key: string | undefined) => {
  const previous = process.env.GOOGLE_MAPS_ANDROID_API_KEY
  if (key === undefined) delete process.env.GOOGLE_MAPS_ANDROID_API_KEY
  else process.env.GOOGLE_MAPS_ANDROID_API_KEY = key
  try {
    return appConfig({ config: baseConfig } as ConfigContext)
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_MAPS_ANDROID_API_KEY
    else process.env.GOOGLE_MAPS_ANDROID_API_KEY = previous
  }
}

const mapsPlugin = (config: ExpoConfig) =>
  (config.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-maps')

describe('guarda — app.config.ts e a key do Google Maps (Story 7.1)', () => {
  it('with the key: maps plugin carries it and the flag is true', () => {
    const config = resolve('AIza-test-key')

    expect(mapsPlugin(config)).toEqual(['react-native-maps', { androidGoogleMapsApiKey: 'AIza-test-key' }])
    expect(config.extra?.googleMapsConfigured).toBe(true)
  })

  it.each([undefined, '', '   '])('without a usable key (%p): no maps plugin and the flag is false', (key) => {
    const config = resolve(key)

    expect(mapsPlugin(config)).toBeUndefined()
    expect(config.extra?.googleMapsConfigured).toBe(false)
  })

  it('keeps the app.json identity the other guards lock', () => {
    const config = resolve('AIza-test-key')

    expect(config.android?.package).toBe('com.pureurban.mobile')
    expect(config.extra?.eas?.projectId).toBe(baseConfig.extra?.eas?.projectId)
    expect(config.plugins).toEqual(expect.arrayContaining(baseConfig.plugins ?? []))
  })

  it('no key literal is committed in app.config.ts', () => {
    const source = readFileSync(join(MOBILE_ROOT, 'app.config.ts'), 'utf8')
    expect(source).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/)
  })
})
