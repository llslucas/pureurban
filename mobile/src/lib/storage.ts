import { createMMKV } from 'react-native-mmkv'
import type { AuthUser } from '@/services/auth.service'

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

const USER_KEY = 'auth.user'

// `JSON.parse(raw) as AuthUser` seria um cast sem verificação: um registro bem
// formado mas errado ({}, uma escrita truncada, o AuthUser de um build antigo)
// passa pelo try/catch, é truthy, e só falha lá na frente — `buildQrPayload`
// recebe `id: undefined`, `JSON.stringify` descarta a chave em silêncio e o QR
// sai sem `studentId`. Validar aqui é o único ponto onde o dado ainda tem nome.
function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false
  const u = value as Record<string, unknown>
  return (
    typeof u.id === 'string' &&
    u.id.length > 0 &&
    typeof u.name === 'string' &&
    typeof u.email === 'string' &&
    (u.role === 'ADMIN' || u.role === 'DRIVER' || u.role === 'STUDENT')
  )
}

export const userStorage = {
  getUser: (): AuthUser | null => {
    const raw = storage.getString(USER_KEY)
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      return isAuthUser(parsed) ? parsed : null
    } catch {
      return null
    }
  },
  setUser: (user: AuthUser): void => storage.set(USER_KEY, JSON.stringify(user)),
  clearUser: (): void => {
    storage.remove(USER_KEY)
  },
}

const QR_SESSION_KEY = 'qr.sessionId'

export const qrSessionStorage = {
  getSessionId: (): string | undefined => storage.getString(QR_SESSION_KEY),
  setSessionId: (id: string): void => storage.set(QR_SESSION_KEY, id),
  clearSessionId: (): void => {
    storage.remove(QR_SESSION_KEY)
  },
}
