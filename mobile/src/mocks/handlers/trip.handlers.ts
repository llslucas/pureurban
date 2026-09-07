import { http, HttpResponse } from 'msw'
import type { components } from '@/types/api'
import type { Trip } from '@/services/trip.service'
import {
  MOCK_ACTIVE_TRIP_ID,
  MOCK_EMPTY_ROSTER_TRIP_ID,
  MOCK_FLAKY_ROSTER_TRIP_ID,
  MOCK_INACTIVE_TRIP_ID,
  MOCK_LARGE_ROSTER_TRIP_ID,
  MOCK_OTHER_DRIVER_TRIP_ID,
  MOCK_ROSTER_ERROR_TRIP_ID,
} from './boarding.handlers'
import { getMockSessionEmail } from './session'

type ErrorResponse = components['schemas']['ErrorResponseDto']

// O contrato declara `/api/v1/trips/active` com `200: { description: "Viagem
// ativa ou null" }` e NENHUM schema de resposta — o endpoint é da Story 3.1
// (full-stack legada), anterior ao regime OpenAPI-first. Então o shape vem da
// interface `Trip` do serviço, exatamente como `routes.handlers.ts` faz com
// `AssignedRoute`, e pelo mesmo motivo. O envelope de erro continua tipado pelo
// contrato.
const MOCK_DRIVER_ID = '550e8400-e29b-41d4-a716-446655440001'
const MOCK_COMPANY_ID = '990e8400-e29b-41d4-a716-446655440300'
// Mesma rota que `/routes/mine` devolve para o motorista — a tela de viagem
// exibe `activeTrip.routeId` e um id órfão apareceria como lixo na UI.
const MOCK_ROUTE_ID = '880e8400-e29b-41d4-a716-446655440200'

// Sentinelas de motorista. Sem elas, os estados 4, 12 e 13 da Tabela de Verdade
// da tela de scan são inalcançáveis em mocks — que é o único ambiente onde a
// trilha mobile do Épico 3 roda até a Story 3.6.
const NO_TRIP_EMAIL = 'motorista-sem-viagem@pureurban.com'
const OTHER_DRIVER_EMAIL = 'motorista-outra-viagem@pureurban.com'
const ENDED_TRIP_EMAIL = 'motorista-viagem-encerrada@pureurban.com'
// Sentinelas da Story 3.5b: viagem ATIVA (a tela precisa passar dos estados 2-4
// para exercitar 5-11), mas com um roster que dispara um estado específico da
// lista — ver `boarding.handlers.ts`.
const EMPTY_ROSTER_EMAIL = 'motorista-turma-vazia@pureurban.com'
const LARGE_ROSTER_EMAIL = 'motorista-turma-grande@pureurban.com'
const ROSTER_ERROR_EMAIL = 'motorista-lista-erro@pureurban.com'
// Estado 7 da lista (erro COM cache): o roster carrega uma vez e falha nas
// leituras seguintes — ver `MOCK_FLAKY_ROSTER_TRIP_ID` em `boarding.handlers.ts`.
const FLAKY_ROSTER_EMAIL = 'motorista-lista-instavel@pureurban.com'

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: MOCK_ACTIVE_TRIP_ID,
    companyId: MOCK_COMPANY_ID,
    routeId: MOCK_ROUTE_ID,
    driverId: MOCK_DRIVER_ID,
    type: 'OUTBOUND',
    status: 'ACTIVE',
    startedAt: new Date().toISOString(),
    endedAt: null,
    relatedTripId: null,
    ...overrides,
  }
}

// Estado em memória: o POST /trips e o PATCH /trips/:id/end da tela de viagem
// precisam se enxergar. Reset aceitável no reload do app; `resetTripMocks()`
// para testes — mesmo padrão de `boarding.handlers.ts`.
let currentTrip: Trip | null = null

export function resetTripMocks(): void {
  currentTrip = null
}

resetTripMocks()

function errorResponse(status: number, code: string, message: string) {
  const body: ErrorResponse = { error: { code, message } }
  return HttpResponse.json(body, { status })
}

function envelope<T>(data: T, status = 200) {
  return HttpResponse.json(
    { data, meta: { timestamp: new Date().toISOString() } },
    { status },
  )
}

export const tripHandlers = [
  http.get('*/api/v1/trips/active', () => {
    const email = getMockSessionEmail()

    // Uma viagem já iniciada nesta sessão vence a sentinela: senão o motorista
    // que toca "Iniciar Viagem" veria a tela voltar ao estado anterior. Precisa
    // vir ANTES de NO_TRIP_EMAIL — com a ordem invertida, o
    // `motorista-sem-viagem@` iniciava uma viagem, via o card via `setQueryData`
    // e o perdia no primeiro refetch. O login chama `resetTripMocks()`, então as
    // sentinelas continuam alcançáveis a cada troca de conta. Filtra por
    // `ACTIVE` porque `PATCH /trips/:id/end` deixa a viagem encerrada em
    // `currentTrip`: servir uma viagem COMPLETED daqui seria um shape que a API
    // real não produz — `findActiveByDriver` faz
    // `findFirst({ where: { …, status: 'ACTIVE' } })`.
    if (currentTrip?.status === 'ACTIVE') {
      return envelope<Trip | null>(currentTrip)
    }

    if (email === NO_TRIP_EMAIL) {
      // `null` e não 404: o contrato descreve a resposta como "Viagem ativa ou
      // null", e `tripService.getActiveTrip` tipa o retorno como `Trip | null`.
      return envelope<Trip | null>(null)
    }

    if (email === OTHER_DRIVER_EMAIL) {
      // Viagem existe e está ativa, mas o check-in responde 403
      // DRIVER_NOT_ASSIGNED para este id (ver `boarding.handlers.ts`).
      return envelope<Trip | null>(makeTrip({ id: MOCK_OTHER_DRIVER_TRIP_ID }))
    }

    if (email === ENDED_TRIP_EMAIL) {
      // Status ACTIVE de propósito: a tela precisa deixar escanear para que o
      // servidor responda 409 TRIP_NOT_ACTIVE. Uma viagem COMPLETED aqui cairia
      // no estado 4 ("sem viagem ativa") e o estado 12 nunca seria exercitado.
      return envelope<Trip | null>(makeTrip({ id: MOCK_INACTIVE_TRIP_ID }))
    }

    if (email === EMPTY_ROSTER_EMAIL) {
      return envelope<Trip | null>(makeTrip({ id: MOCK_EMPTY_ROSTER_TRIP_ID }))
    }

    if (email === LARGE_ROSTER_EMAIL) {
      return envelope<Trip | null>(makeTrip({ id: MOCK_LARGE_ROSTER_TRIP_ID }))
    }

    if (email === ROSTER_ERROR_EMAIL) {
      return envelope<Trip | null>(makeTrip({ id: MOCK_ROSTER_ERROR_TRIP_ID }))
    }

    if (email === FLAKY_ROSTER_EMAIL) {
      return envelope<Trip | null>(makeTrip({ id: MOCK_FLAKY_ROSTER_TRIP_ID }))
    }

    return envelope<Trip | null>(makeTrip())
  }),

  http.post('*/api/v1/trips', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      routeId?: string
      type?: Trip['type']
      relatedTripId?: string
    } | null

    if (!body?.routeId) {
      return errorResponse(400, 'INVALID_INPUT', 'routeId é obrigatório')
    }

    if (currentTrip?.status === 'ACTIVE') {
      return errorResponse(409, 'TRIP_ALREADY_ACTIVE', 'Já existe uma viagem ativa para esta rota')
    }

    // `routeId` is echoed back without revalidating its format: this mock has no
    // route registry, and `routes.handlers.ts` only ever serves valid ids, so
    // echoing mirrors the real API, which returns the trip once
    // `isDriverAssignedToRoute` passes.
    currentTrip = makeTrip({
      routeId: body.routeId,
      type: body.type ?? 'OUTBOUND',
      relatedTripId: body.relatedTripId ?? null,
    })

    return envelope(currentTrip, 201)
  }),

  http.patch('*/api/v1/trips/:id/end', ({ params }) => {
    const tripId = params.id as string

    if (!currentTrip || currentTrip.id !== tripId) {
      return errorResponse(404, 'TRIP_NOT_FOUND', `Viagem com id ${tripId} não encontrada`)
    }

    currentTrip = {
      ...currentTrip,
      status: 'COMPLETED',
      endedAt: new Date().toISOString(),
    }

    return envelope(currentTrip)
  }),
]
