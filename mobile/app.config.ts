import type { ConfigContext, ExpoConfig } from 'expo/config'

// Thin layer over app.json, which stays the source of the native identity (the
// EAS and palette guards read it raw). The key comes from the environment so it
// is never committed; without it the Google provider would crash the native
// app, so the screen reads `googleMapsConfigured` and skips the map.
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim()
  const configured = Boolean(apiKey)

  return {
    ...(config as ExpoConfig),
    plugins: [
      ...(config.plugins ?? []),
      ...(configured ? [['react-native-maps', { androidGoogleMapsApiKey: apiKey }] as [string, unknown]] : []),
    ],
    extra: { ...config.extra, googleMapsConfigured: configured },
  }
}
