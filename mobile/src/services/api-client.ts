import { router } from 'expo-router'
import { reportSuccess, reportTransportFailure } from '@/lib/connectivity'
import { tokenStorage } from '@/lib/storage'
import { ApiClientError } from '@/services/api-error'
import { useAuthStore } from '@/stores/auth.store'
import { API_BASE_URL } from '@/utils/constants'

// Reexportado para não quebrar os consumidores que já importavam a classe daqui.
export { ApiClientError }

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
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
  extraHeaders?: Record<string, string>,
): Promise<T> {
  // Interceptor de autenticação — lê token do MMKV.
  // Os headers da chamada entram PRIMEIRO e os do cliente por cima: assim um
  // `extraHeaders` com 'Authorization' (erro de digitação, cópia de exemplo)
  // não consegue derrubar a autenticação e transformar a requisição num 401.
  const token = tokenStorage.getAccessToken()
  const headers: Record<string, string> = {
    ...extraHeaders,
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
    // Sinal de conectividade DERIVADO (Story 3.4b): chegar aqui significa que
    // nenhuma resposta voltou — rede caída, DNS, API fora do ar ou timeout. É o
    // único ponto do app que distingue "não falei com o servidor" de "o servidor
    // disse não", e a NFR14 trata os dois primeiros como offline.
    reportTransportFailure()
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiClientError('REQUEST_TIMEOUT', 'A requisição excedeu o tempo limite', 0)
    }
    throw err
  }
  clearTimeout(timeoutId)
  // Uma resposta chegou — inclusive 4xx/5xx. O transporte funcionou, então
  // estamos online; o desfecho de negócio é problema de quem chamou.
  reportSuccess()

  // Parse seguro — body pode não ser JSON (ex: 502 com HTML do proxy)
  const json = await parseResponseJson(response)

  // Interceptor de refresh automático — tenta renovar tokens em 401
  // Exceção: endpoints de auth (login, register) não devem acionar o refresh,
  // pois um 401 nesses endpoints é uma resposta legítima de erro de credenciais.
  const isAuthEndpoint = path.includes('/auth/login') || path.includes('/auth/register')
  if (response.status === 401 && !isRefreshRequest && !isAuthEndpoint) {
    const refreshed = await attemptTokenRefresh()
    if (refreshed) {
      // Retry com novo token — passa true para evitar loop infinito de refresh.
      // `extraHeaders` DEVE ser repassado: sem isso o retry pós-refresh perde o
      // 'X-Idempotency-Key', que o contrato declara obrigatório, e o check-in
      // volta 400 MISSING_IDEMPOTENCY_KEY. Só acontece quando o access token
      // expira no meio do embarque, ou seja, no ônibus e nunca em teste.
      return request<T>(method, path, body, true, extraHeaders)
    }
    // Refresh falhou — encerrar a sessão por inteiro. Limpar só os tokens deixava
    // `auth.user` e `qr.sessionId` no MMKV e `isAuthenticated` true na store, então
    // a tela de QR continuava renderizando um código de sessão que o backend já
    // rejeitou. logout() é o único escritor que zera as três fontes de verdade.
    useAuthStore.getState().logout()
    // O `replace` é redundante com os guards do layout raiz — o flip de
    // `isAuthenticated` sozinho já desmonta o grupo do papel e monta `(auth)`.
    // Mantido por ser inofensivo: verificado em browser (28/08/2026, refresh
    // falhando contra a API real) que a transição `/trip → /login` é direta,
    // sem passar pelo `+not-found` e sem frame em branco.
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
  // `headers` só existe nos verbos de escrita: 'X-Idempotency-Key' é uma
  // propriedade do endpoint de escrita (Architecture §5, Tier 2), e ampliar a
  // superfície onde ninguém consome seria código morto.
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>('POST', path, body, false, headers),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>('PATCH', path, body, false, headers),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
