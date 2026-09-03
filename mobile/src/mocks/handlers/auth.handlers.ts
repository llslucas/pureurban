import { http, HttpResponse } from 'msw'
import type { components } from '@/types/api'
import type { AuthTokens, AuthUser } from '@/services/auth.service'
import { setMockSessionEmail } from './session'
import { resetTripMocks } from './trip.handlers'
import { resetBoardingMocks } from './boarding.handlers'

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
  // Sentinelas de estado da tela de scan — ver `trip.handlers.ts`. Cada um
  // torna alcançável um ramo que, com um único motorista mock, seria código
  // morto em desenvolvimento: a tela sem viagem, a viagem de outro motorista
  // (403 DRIVER_NOT_ASSIGNED) e a viagem já encerrada (409 TRIP_NOT_ACTIVE).
  'motorista-sem-viagem@pureurban.com': {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Fernanda Rocha',
    email: 'motorista-sem-viagem@pureurban.com',
    role: 'DRIVER',
  },
  'motorista-outra-viagem@pureurban.com': {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Gustavo Pinto',
    email: 'motorista-outra-viagem@pureurban.com',
    role: 'DRIVER',
  },
  'motorista-viagem-encerrada@pureurban.com': {
    id: '550e8400-e29b-41d4-a716-446655440004',
    name: 'Helena Braga',
    email: 'motorista-viagem-encerrada@pureurban.com',
    role: 'DRIVER',
  },
  // Sentinelas da Story 3.5b (lista de alunos) — ver `trip.handlers.ts` e
  // `boarding.handlers.ts`. Cada um tem viagem ATIVA, mas com um roster que
  // exercita um estado da tela: sem alunos (estado 8), 60 alunos (NFR4) e falha
  // de servidor com a lista em cache (estados 6 e 7).
  'motorista-turma-vazia@pureurban.com': {
    id: '550e8400-e29b-41d4-a716-446655440005',
    name: 'Igor Nunes',
    email: 'motorista-turma-vazia@pureurban.com',
    role: 'DRIVER',
  },
  'motorista-turma-grande@pureurban.com': {
    id: '550e8400-e29b-41d4-a716-446655440006',
    name: 'Julia Campos',
    email: 'motorista-turma-grande@pureurban.com',
    role: 'DRIVER',
  },
  'motorista-lista-erro@pureurban.com': {
    id: '550e8400-e29b-41d4-a716-446655440007',
    name: 'Kleber Assis',
    email: 'motorista-lista-erro@pureurban.com',
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
    // Sem isto o `currentTrip` do mock de viagem sobrevive à troca de conta e
    // mascara as sentinelas de motorista: bastava um "Iniciar Viagem" para que
    // todo login seguinte recebesse a viagem padrão, tornando os estados 12 e 13
    // da Tabela de Verdade inalcançáveis pelo resto da sessão do app.
    // (`trip.handlers` não importa daqui, então não há ciclo.)
    resetTripMocks()
    // Idem para o roster de embarque: sem isto, escanear com um motorista,
    // deslogar e logar de novo abria a lista com alunos `CHECKED_IN` de uma
    // viagem que, para o app, nunca aconteceu (Bloqueador 4 da Story 3.5b).
    // `boarding.handlers` só importa de `@/types/api`, então não fecha ciclo.
    resetBoardingMocks()

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
