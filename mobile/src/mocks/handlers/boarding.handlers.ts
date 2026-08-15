import { http, HttpResponse } from 'msw'
import type { components, operations } from '@/types/api'

type CheckInRequest = components['schemas']['CheckInRequestDto']
type TripStudentItem = components['schemas']['TripStudentItemDto']
type ErrorResponse = components['schemas']['ErrorResponseDto']

// Tipados a partir de `operations`, não de objetos literais: o envelope { data, meta }
// é schema inline no contrato, então só a operação carrega o shape HTTP real. Este
// typecheck É o teste de conformidade dos mocks (Testing Requirements da Story 3.0).
type CheckInSuccess =
  operations['BoardingController_checkIn']['responses'][201]['content']['application/json']
type TripStudentsSuccess =
  operations['TripController_getStudents']['responses'][200]['content']['application/json']

// IDs de viagem conhecidos pelo mock. Qualquer outro id → 404 TRIP_NOT_FOUND.
export const MOCK_ACTIVE_TRIP_ID = '770e8400-e29b-41d4-a716-446655440100'
export const MOCK_INACTIVE_TRIP_ID = '770e8400-e29b-41d4-a716-446655440101'
// Viagem ativa de OUTRO motorista: o mock não tem noção de autenticação, então
// este sentinela é o único jeito de a trilha mobile exercitar DRIVER_NOT_ASSIGNED.
export const MOCK_OTHER_DRIVER_TRIP_ID = '770e8400-e29b-41d4-a716-446655440102'

// Espelha MAX_KEY_LENGTH do @IdempotencyKey() da API.
const MAX_IDEMPOTENCY_KEY_LENGTH = 200

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Roster por viagem. Estado compartilhado entre os dois handlers: um check-in na
// tela de scan reflete na lista de GET /trips/:id/students (AC da 3.5b).
// Reset aceitável no reload do app; `resetBoardingMocks()` para testes.
const initialRoster = (): TripStudentItem[] => [
  { studentId: '660e8400-e29b-41d4-a716-446655440010', name: 'Ana Souza', status: 'NOT_CHECKED_IN', checkedInAt: null },
  { studentId: '660e8400-e29b-41d4-a716-446655440011', name: 'Bruno Lima', status: 'NOT_CHECKED_IN', checkedInAt: null },
  { studentId: '660e8400-e29b-41d4-a716-446655440012', name: 'Carla Dias', status: 'NOT_CHECKED_IN', checkedInAt: null },
  // Aluno que avisou que não volta (Épico 4). Só o backend produz este status, mas
  // ele entra no mock AGORA porque a 3.5b precisa renderizar os 3 estados.
  { studentId: '660e8400-e29b-41d4-a716-446655440013', name: 'Diego Alves', status: 'NOT_RETURNING', checkedInAt: null },
]

let rosters = new Map<string, TripStudentItem[]>()
let idempotentSuccesses = new Map<string, CheckInSuccess>()

export function resetBoardingMocks(): void {
  rosters = new Map([
    [MOCK_ACTIVE_TRIP_ID, initialRoster()],
    [MOCK_INACTIVE_TRIP_ID, initialRoster()],
    // Existe como viagem para que o 403 venha da checagem de motorista, e não
    // de um 409 TRIP_NOT_ACTIVE por roster ausente.
    [MOCK_OTHER_DRIVER_TRIP_ID, initialRoster()],
  ])
  idempotentSuccesses = new Map()
}

resetBoardingMocks()

// Hermes pode não expor crypto.randomUUID — gerador local evita dependência
// extra só para IDs de mock.
function mockUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function errorResponse(status: number, code: string, message: string) {
  const body: ErrorResponse = { error: { code, message } }
  return HttpResponse.json(body, { status })
}

export const boardingHandlers = [
  http.post('*/api/v1/boarding/check-in', async ({ request }) => {
    // O contrato declara X-Idempotency-Key required: true. Aceitar sem a key
    // faria o mock aceitar o que a API real (3.3a) deve rejeitar, e a 3.4b
    // seria desenvolvida contra um comportamento que não existe.
    const idempotencyKey = request.headers.get('X-Idempotency-Key')?.trim()
    if (!idempotencyKey) {
      return errorResponse(
        400,
        'MISSING_IDEMPOTENCY_KEY',
        'Header X-Idempotency-Key é obrigatório',
      )
    }

    if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return errorResponse(
        400,
        'INVALID_IDEMPOTENCY_KEY',
        `Header X-Idempotency-Key excede ${MAX_IDEMPOTENCY_KEY_LENGTH} caracteres`,
      )
    }

    // A validação de shape vem ANTES do replay: sem um body válido não há
    // studentId/tripId para comparar com o que foi armazenado, e devolver o
    // registro anterior às cegas reportaria embarque de outro aluno como
    // sucesso. É a ordem que a API implementa (o pipe do @Body roda antes do
    // service) — o mock seguia a ordem inversa e divergia do contrato real.
    const body = (await request.json().catch(() => null)) as CheckInRequest | null
    if (
      !body ||
      typeof body.studentId !== 'string' ||
      typeof body.tripId !== 'string' ||
      !UUID_RE.test(body.studentId) ||
      !UUID_RE.test(body.tripId)
    ) {
      return errorResponse(
        400,
        'INVALID_QR_CODE',
        'studentId ou tripId ausente ou malformado',
      )
    }

    if (body.occurredAt !== undefined) {
      const parsed = Date.parse(body.occurredAt)
      const age = Date.now() - parsed
      // Espelha a janela do use case: 5min de tolerância de relógio, 24h de idade.
      if (Number.isNaN(parsed) || age < -5 * 60 * 1000 || age > 24 * 60 * 60 * 1000) {
        return errorResponse(
          400,
          'INVALID_QR_CODE',
          'occurredAt ausente da janela aceita',
        )
      }
    }

    // Só SUCESSOS são replayados. Cachear erros pinaria um TRIP_NOT_ACTIVE
    // transitório naquela key para sempre — e a fila offline reenvia com a MESMA
    // key, então o item nunca conseguiria sair da fila.
    const cached = idempotentSuccesses.get(idempotencyKey)
    if (cached) {
      // Mesma key para um par [aluno, viagem] diferente é reuso indevido, não
      // replay. Devolver o registro armazenado marcaria como embarcado um aluno
      // que nunca embarcou.
      if (
        cached.data.studentId !== body.studentId ||
        cached.data.tripId !== body.tripId
      ) {
        return errorResponse(
          409,
          'IDEMPOTENCY_KEY_CONFLICT',
          'X-Idempotency-Key já usada para um aluno ou viagem diferente do enviado',
        )
      }
      return HttpResponse.json(cached, { status: 201 })
    }

    if (body.tripId === MOCK_OTHER_DRIVER_TRIP_ID) {
      return errorResponse(
        403,
        'DRIVER_NOT_ASSIGNED',
        'Motorista não é o responsável por esta viagem',
      )
    }

    if (body.tripId === MOCK_INACTIVE_TRIP_ID) {
      return errorResponse(409, 'TRIP_NOT_ACTIVE', 'A viagem não está ativa')
    }

    const roster = rosters.get(body.tripId)
    if (!roster) {
      return errorResponse(409, 'TRIP_NOT_ACTIVE', 'A viagem não está ativa')
    }

    // Aluno fora do roster da viagem — o erro é derivado do estado, não de um
    // UUID sentinela. Antes, um studentId desconhecido retornava 201 e sumia da
    // lista, quebrando o invariante que o estado compartilhado existe para garantir.
    const student = roster.find((s) => s.studentId === body.studentId)
    if (!student) {
      return errorResponse(
        403,
        'STUDENT_NOT_ALLOWED',
        'Aluno não autorizado para esta viagem',
      )
    }

    // Duplicata real: mesmo aluno, key DIFERENTE (mesma key teria sido replayada
    // acima). É a definição do contrato — e agora é alcançável pelo estado.
    if (student.status === 'CHECKED_IN') {
      return errorResponse(
        409,
        'DUPLICATE_CHECK_IN',
        'Check-in duplicado para este aluno',
      )
    }

    const now = new Date().toISOString()
    // occurredAt (fila offline) vence o horário de processamento quando presente.
    const checkedInAt = body.occurredAt ?? now
    student.status = 'CHECKED_IN'
    student.checkedInAt = checkedInAt

    const success: CheckInSuccess = {
      data: {
        id: mockUuid(),
        studentId: body.studentId,
        tripId: body.tripId,
        checkedInAt,
        status: 'CHECKED_IN',
      },
      meta: { timestamp: now },
    }
    idempotentSuccesses.set(idempotencyKey, success)

    return HttpResponse.json(success, { status: 201 })
  }),

  http.get('*/api/v1/trips/:id/students', ({ params }) => {
    const tripId = params.id as string
    const roster = rosters.get(tripId)

    // Antes o :id era ignorado: toda viagem devolvia o mesmo roster e o
    // 404 TRIP_NOT_FOUND declarado no contrato era inalcançável.
    if (!roster) {
      return errorResponse(404, 'TRIP_NOT_FOUND', 'Viagem não encontrada')
    }

    const success: TripStudentsSuccess = {
      data: {
        students: roster,
        summary: {
          boarded: roster.filter((s) => s.status === 'CHECKED_IN').length,
          total: roster.length,
        },
      },
      meta: { timestamp: new Date().toISOString() },
    }

    return HttpResponse.json(success, { status: 200 })
  }),
]
