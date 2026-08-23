import { router } from 'expo-router'
import { tokenStorage } from '@/lib/storage'
import { useAuthStore } from '@/stores/auth.store'
import { API_BASE_URL } from '@/utils/constants'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

const REQUEST_TIMEOUT_MS = 30_000

// Mutex simples para evitar múltiplas chamadas simultâneas de refresh
let refreshPromise: Promise<boolean> | null = null

async function attemptTokenRefresh(): Promise<boolean> {
  // Se já há um refresh em andamento, aguardar o mesmo resultado
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    // Timeout de 15s para o fetch de refresh — evita deadlock se o servidor travar
    const refreshController = new AbortController()
    const refreshTimeoutId = setTimeout(() => refreshController.abort(), 15_000)
    try {
      const currentRefreshToken = tokenStorage.getRefreshToken()
      if (!currentRefreshToken) return false

      // Chamada direta ao endpoint sem usar o apiClient (evita recursão)
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
        signal: refreshController.signal,
      })

      if (!response.ok) return false

      const json = (await response.json()) as { data: { accessToken: string; refreshToken: string } }
      const { accessToken, refreshToken } = json.data

      tokenStorage.setAccessToken(accessToken)
      tokenStorage.setRefreshToken(refreshToken)
      return true
    } catch {
      return false
    } finally {
      clearTimeout(refreshTimeoutId)
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function parseResponseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  isRefreshRequest = false,
): Promise<T> {
  // Interceptor de autenticação — lê token do MMKV
  const token = tokenStorage.getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiClientError('REQUEST_TIMEOUT', 'A requisição excedeu o tempo limite', 0)
    }
    throw err
  }
  clearTimeout(timeoutId)

  // Parse seguro — body pode não ser JSON (ex: 502 com HTML do proxy)
  const json = await parseResponseJson(response)

  // Interceptor de refresh automático — tenta renovar tokens em 401
  // Exceção: endpoints de auth (login, register) não devem acionar o refresh,
  // pois um 401 nesses endpoints é uma resposta legítima de erro de credenciais.
  const isAuthEndpoint = path.includes('/auth/login') || path.includes('/auth/register')
  if (response.status === 401 && !isRefreshRequest && !isAuthEndpoint) {
    const refreshed = await attemptTokenRefresh()
    if (refreshed) {
      // Retry com novo token — passa true para evitar loop infinito de refresh
      return request<T>(method, path, body, true)
    }
    // Refresh falhou — encerrar a sessão por inteiro. Limpar só os tokens deixava
    // `auth.user` e `qr.sessionId` no MMKV e `isAuthenticated` true na store, então
    // a tela de QR continuava renderizando um código de sessão que o backend já
    // rejeitou. logout() é o único escritor que zera as três fontes de verdade.
    useAuthStore.getState().logout()
    router.replace('/(auth)/login')
    throw new ApiClientError('UNAUTHORIZED', 'Sessão expirada. Faça login novamente.', 401)
  }

  // Interceptor de erros — parseia formato { error: { code, message } }
  if (!response.ok) {
    const error = (json as { error?: ApiError }).error
    if (!error) {
      throw new ApiClientError('INVALID_RESPONSE', 'Resposta inesperada do servidor', response.status)
    }
    throw new ApiClientError(
      error.code ?? 'UNKNOWN_ERROR',
      error.message ?? 'An error occurred',
      response.status,
      error.details,
    )
  }

  // Backend retorna { data: ..., meta: ... } via ResponseWrapperInterceptor — extrair data
  return (json as { data: T }).data
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
