import Constants from 'expo-constants'
import { Platform } from 'react-native'

// Android only: app.config.ts injects just the Android key, and the Google
// provider without one crashes the native app.
export function isGoogleMapsConfigured(): boolean {
  return Platform.OS === 'android' && Constants.expoConfig?.extra?.googleMapsConfigured === true
}
