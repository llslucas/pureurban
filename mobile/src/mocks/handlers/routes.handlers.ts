import { http, HttpResponse } from 'msw'
import type { components } from '@/types/api'
import type { AssignedRoute } from '@/services/routes.service'
import { getMockSessionEmail } from './session'

type ErrorResponse = components['schemas']['ErrorResponseDto']

// O contrato (openapi.json) não declara schema de resposta para /routes/mine
// (só descrições), então o shape vem da interface `AssignedRoute` do serviço em
// vez de `api.d.ts`. O envelope de erro continua tipado pelo contrato, como em
// `boarding.handlers.ts`.
const MOCK_ROUTE: AssignedRoute = {
  id: '880e8400-e29b-41d4-a716-446655440200',
  name: 'Linha Centro - Universidade',
  description: 'Rota matutina entre o centro e o campus universitário',
  originCity: 'Centro',
  destinationCity: 'Campus Universitário',
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-10T08:00:00.000Z',
}

const MOCK_SECOND_ROUTE: AssignedRoute = {
  id: '880e8400-e29b-41d4-a716-446655440201',
  name: 'Linha Bairro Norte - Universidade',
  description: 'Rota vespertina',
  originCity: 'Bairro Norte',
  destinationCity: 'Campus Universitário',
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-10T08:00:00.000Z',
}

// Sentinelas de sessão: o mock não tem noção de autenticação, então o único jeito
// de a trilha mobile exercitar os estados que a Tabela de Verdade exige é olhar
// para o e-mail com que o usuário logou. Sem isso, `showEmptyState` e
// `showErrorState` — os dois que a Task 7.5 manda não confundir — ficam
// inatingíveis em mocks, que é o único ambiente onde esta tela é desenvolvida.
// O endpoint real devolve `[]` legitimamente (get-my-routes.use-case.ts:22-31).
const EMPTY_ROSTER_EMAIL = 'aluno-sem-rota@pureurban.com'
const ERROR_TRIGGER_EMAIL = 'aluno-erro@pureurban.com'
const MULTI_ROUTE_EMAIL = 'aluno-multirota@pureurban.com'

function errorResponse(status: number, code: string, message: string) {
  const body: ErrorResponse = { error: { code, message } }
  return HttpResponse.json(body, { status })
}

export const routesHandlers = [
  http.get('*/api/v1/routes/mine', () => {
    if (getMockSessionEmail() === ERROR_TRIGGER_EMAIL) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Falha ao carregar rotas')
    }

    const data =
      getMockSessionEmail() === EMPTY_ROSTER_EMAIL
        ? []
        : getMockSessionEmail() === MULTI_ROUTE_EMAIL
          ? [MOCK_ROUTE, MOCK_SECOND_ROUTE]
          : [MOCK_ROUTE]

    return HttpResponse.json(
      { data, meta: { timestamp: new Date().toISOString() } },
      { status: 200 },
    )
  }),
]
