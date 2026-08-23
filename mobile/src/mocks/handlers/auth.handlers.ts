import { http, HttpResponse } from 'msw'
import type { components } from '@/types/api'
import type { AuthTokens, AuthUser } from '@/services/auth.service'
import { setMockSessionEmail } from './routes.handlers'

type ErrorResponse = components['schemas']['ErrorResponseDto']

// Credenciais mockadas — documentadas em `.env.example`. O studentId da aluna
// é fixo (roster de `boarding.handlers.ts`) para o QR gerado aqui ser aceito
// pelo check-in mockado nas stories 3.3b/3.6.
const MOCK_USERS: Record<string, AuthUser> = {
  'aluno@pureurban.com': {
    id: '660e8400-e29b-41d4-a716-446655440010',
    name: 'Ana Souza',
    email: 'aluno@pureurban.com',
    role: 'STUDENT',
  },
  // Sentinelas de estado da tela de QR — ver `routes.handlers.ts`.
  'aluno-sem-rota@pureurban.com': {
    id: '660e8400-e29b-41d4-a716-446655440011',
    name: 'Bruno Lima',
    email: 'aluno-sem-rota@pureurban.com',
    role: 'STUDENT',
  },
  'aluno-erro@pureurban.com': {
    id: '660e8400-e29b-41d4-a716-446655440012',
    name: 'Carla Dias',
    email: 'aluno-erro@pureurban.com',
    role: 'STUDENT',
  },
  'aluno-multirota@pureurban.com': {
    id: '660e8400-e29b-41d4-a716-446655440013',
    name: 'Diego Alves',
    email: 'aluno-multirota@pureurban.com',
    role: 'STUDENT',
  },
  'aluno-sessao-expirada@pureurban.com': {
    id: '660e8400-e29b-41d4-a716-446655440014',
    name: 'Elisa Moraes',
    email: 'aluno-sessao-expirada@pureurban.com',
    role: 'STUDENT',
  },
  'motorista@pureurban.com': {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Carlos Ferreira',
    email: 'motorista@pureurban.com',
    role: 'DRIVER',
  },
}

// Refresh tokens rotacionam de verdade: `attemptTokenRefresh` grava os dois
// tokens de volta esperando rotação, e um mock que devolve sempre o mesmo valor
// torna o ramo `refreshed === false` inatingível — justamente o ramo que encerra
// a sessão. `REFRESH_FAILURE_EMAIL` existe para exercitá-lo sob demanda.
const REFRESH_FAILURE_EMAIL = 'aluno-sessao-expirada@pureurban.com'
const issuedRefreshTokens = new Map<string, string>()

function mintTokensFor(user: AuthUser): AuthTokens {
  const nonce = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`
  const refreshToken = `mock-refresh-token.${user.id}.${nonce}`
  issuedRefreshTokens.set(refreshToken, user.email)
  return {
    accessToken: `mock-access-token.${user.id}.${nonce}`,
    refreshToken,
    user,
  }
}

function errorResponse(status: number, code: string, message: string) {
  const body: ErrorResponse = { error: { code, message } }
  return HttpResponse.json(body, { status })
}

// Lookup com Object.hasOwn: `MOCK_USERS[email]` num objeto literal herda
// Object.prototype, então `constructor`/`toString`/`__proto__` devolviam um
// valor truthy, escapavam do 401 e seguiam o login com um "usuário" que não é
// um AuthUser.
function findMockUser(email: string | undefined): AuthUser | undefined {
  if (!email) return undefined
  return Object.hasOwn(MOCK_USERS, email) ? MOCK_USERS[email] : undefined
}

export const authHandlers = [
  http.post('*/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { email?: string } | null
    const email = body?.email?.toLowerCase()
    const user = findMockUser(email)

    if (!user) {
      setMockSessionEmail(null)
      return errorResponse(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas')
    }

    setMockSessionEmail(user.email)

    return HttpResponse.json(
      { data: mintTokensFor(user), meta: { timestamp: new Date().toISOString() } },
      { status: 200 },
    )
  }),

  http.post('*/api/v1/auth/refresh', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { refreshToken?: string } | null
    const presented = body?.refreshToken
    const email = presented ? issuedRefreshTokens.get(presented) : undefined
    const match = findMockUser(email)

    if (!presented || !match || match.email === REFRESH_FAILURE_EMAIL) {
      if (presented) issuedRefreshTokens.delete(presented)
      return errorResponse(401, 'INVALID_REFRESH_TOKEN', 'Refresh token inválido')
    }

    // Rotação: o token apresentado deixa de valer assim que um novo é emitido.
    issuedRefreshTokens.delete(presented)

    return HttpResponse.json(
      { data: mintTokensFor(match), meta: { timestamp: new Date().toISOString() } },
      { status: 200 },
    )
  }),
]
