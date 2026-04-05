import { createMMKV } from 'react-native-mmkv'

export const storage = createMMKV()


const TOKEN_KEYS = {
  access: 'auth.accessToken',
  refresh: 'auth.refreshToken',
} as const

export const tokenStorage = {
  getAccessToken: (): string | undefined => storage.getString(TOKEN_KEYS.access),
  setAccessToken: (token: string): void => storage.set(TOKEN_KEYS.access, token),
  getRefreshToken: (): string | undefined => storage.getString(TOKEN_KEYS.refresh),
  setRefreshToken: (token: string): void => storage.set(TOKEN_KEYS.refresh, token),
  clearTokens: (): void => {
    storage.remove(TOKEN_KEYS.access)
    storage.remove(TOKEN_KEYS.refresh)
  },

}
