import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider as PaperProvider } from 'react-native-paper'

import StudentListScreen from '@/app/(driver)/student-list'
import {
  connectBoardingEvents,
  type BoardingEventHandlers,
} from '@/services/boarding-events.service'
import { tripService, type Trip, type TripStudents } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'

// Lives at src/ root, not src/app/: Expo Router turns every file under src/app/
// into a navigable route, so a test file there pollutes typedRoutes/_sitemap and
// throws on the module-scope jest.mock (same reason as trip-screen.test.tsx).
//
// PaperProvider required: the Snackbar (toast de ausência) renders a Portal.
// api-client is mocked away — it drags expo-router/MMKV (Nitro), which do not
// load under jest-expo; the screen only needs ApiClientError for its guards.
//
// The SSE stream is exercised via the mocked boarding-events.service: the test
// captures the handlers the screen registered and dispatches contract events
// through them (spec 4.2: EventSource via jest.mock do serviço de eventos).

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
}))

jest.mock('@/services/api-client', () => ({
  ...jest.requireActual('@/services/api-error'),
  refreshAccessToken: jest.fn(async () => false),
}))

jest.mock('@/services/trip.service', () => ({
  tripService: {
    getActiveTrip: jest.fn(),
    startTrip: jest.fn(),
    endTrip: jest.fn(),
    getTripStudents: jest.fn(),
  },
}))

jest.mock('@/services/boarding-events.service', () => ({
  connectBoardingEvents: jest.fn(() => ({ close: jest.fn() })),
}))

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: jest.fn(),
}))

const mockTrip = jest.mocked(tripService)
const mockConnect = jest.mocked(connectBoardingEvents)
const mockAuthStore = jest.mocked(useAuthStore)

const DRIVER_USER = {
  id: 'driver-1',
  email: 'joao@escola.com',
  name: 'João',
  role: 'DRIVER' as const,
}

const RETURN_TRIP: Trip = {
  id: 'trip-return-1',
  companyId: 'company-1',
  routeId: 'route-1',
  driverId: DRIVER_USER.id,
  type: 'RETURN',
  status: 'ACTIVE',
  startedAt: '2026-09-07T18:00:00.000Z',
  endedAt: null,
  relatedTripId: 'trip-outbound-1',
}

const STUDENT_A = {
  studentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ana',
  status: 'NOT_CHECKED_IN' as const,
  checkedInAt: null,
}

const STUDENT_B = {
  studentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Bruno',
  status: 'CHECKED_IN' as const,
  checkedInAt: '2026-09-07T18:05:00.000Z',
}

const NOT_RETURNING_EVENT = {
  tripId: RETURN_TRIP.id,
  studentId: STUDENT_A.studentId,
  notifiedAt: '2026-09-07T18:10:00.000Z',
}

const ABSENCE_CANCELLED_EVENT = {
  tripId: RETURN_TRIP.id,
  studentId: STUDENT_A.studentId,
  cancelledAt: '2026-09-07T18:11:00.000Z',
}

const rosterWith = (...students: Record<string, unknown>[]): TripStudents => ({
  students: students as TripStudents['students'],
  summary: {
    boarded: students.filter((s) => s.status === 'CHECKED_IN').length,
    // Regra do servidor: o total exclui alunos com ausência ativa.
    total: students.filter((s) => s.status !== 'NOT_RETURNING').length,
  },
})

function mockUser() {
  const state = {
    user: DRIVER_USER,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }
  mockAuthStore.mockImplementation(((selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state) as never)
}

let queryClient: QueryClient

function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: {
      // The screen pins retry/networkMode on the queries; zeroing the delay
      // keeps error states fast. `gcTime: Infinity` avoids a GC timer that
      // outlives the test (jest hang); `clear()` in afterEach drops the cache.
      queries: { retryDelay: 0, gcTime: Infinity, networkMode: 'always' },
      mutations: { retry: false, gcTime: 0 },
    },
  })
  return render(
    <PaperProvider>
      <QueryClientProvider client={queryClient}>
        <StudentListScreen />
      </QueryClientProvider>
    </PaperProvider>,
  )
}

function registeredHandlers(call = 0): BoardingEventHandlers {
  const handlers = mockConnect.mock.calls[call]?.[1]
  if (!handlers) throw new Error('connection was not registered')
  return handlers
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser()
  mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
})

afterEach(() => {
  queryClient.clear()
})

describe('StudentListScreen — recebimento em tempo real (spec-4-2)', () => {
  it('not_returning: badge "Não vai voltar", contagem 1/2 → 1/1 e toast com o nome', async () => {
    const antes = rosterWith(STUDENT_A, STUDENT_B)
    const depoisDaAusencia = rosterWith(
      { ...STUDENT_A, status: 'NOT_RETURNING' },
      STUDENT_B,
    )
    mockTrip.getTripStudents
      .mockResolvedValueOnce(antes)
      .mockResolvedValue(depoisDaAusencia)

    renderScreen()
    expect(await screen.findByText('1/2 embarcados')).toBeTruthy()

    act(() => registeredHandlers().onNotReturning(NOT_RETURNING_EVENT))

    // Status do aluno virou o badge âmbar (STATUS_PRESENTATION de NOT_RETURNING).
    expect(await screen.findByText('! Não vai voltar')).toBeTruthy()
    expect(screen.queryByText('— Não embarcou')).toBeNull()
    // Contagem ajustada no próprio cache (o total do servidor exclui o ausente).
    expect(await screen.findByText('1/1 embarcados')).toBeTruthy()
    // Toast não bloqueante, com o nome resolvido do roster (o evento só traz IDs).
    expect(screen.getByText('Ana não vai voltar no ônibus')).toBeTruthy()
  })

  it('absence_cancelled: status reverte para "Não embarcou" e a contagem volta', async () => {
    const antes = rosterWith(STUDENT_A, STUDENT_B)
    const comAusencia = rosterWith(
      { ...STUDENT_A, status: 'NOT_RETURNING' },
      STUDENT_B,
    )
    mockTrip.getTripStudents
      .mockResolvedValueOnce(antes)
      .mockResolvedValueOnce(comAusencia)
      .mockResolvedValue(antes)

    renderScreen()
    expect(await screen.findByText('1/2 embarcados')).toBeTruthy()

    const handlers = registeredHandlers()
    act(() => handlers.onNotReturning(NOT_RETURNING_EVENT))
    expect(await screen.findByText('1/1 embarcados')).toBeTruthy()

    act(() => handlers.onAbsenceCancelled(ABSENCE_CANCELLED_EVENT))

    expect(await screen.findByText('— Não embarcou')).toBeTruthy()
    expect(screen.queryByText('! Não vai voltar')).toBeNull()
    expect(await screen.findByText('1/2 embarcados')).toBeTruthy()
  })

  it('not_returning para aluno CHECKED_IN no cache: sem badge, sem toast, só refetch', async () => {
    const anaEmbarcada = {
      ...STUDENT_A,
      status: 'CHECKED_IN' as const,
      checkedInAt: '2026-09-07T18:09:00.000Z',
    }
    const ambosEmbarcados = rosterWith(anaEmbarcada, STUDENT_B)
    mockTrip.getTripStudents
      .mockResolvedValueOnce(ambosEmbarcados)
      .mockResolvedValue(ambosEmbarcados)

    renderScreen()
    expect(await screen.findByText('2/2 embarcados')).toBeTruthy()
    expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(1)

    act(() => registeredHandlers().onNotReturning(NOT_RETURNING_EVENT))

    // Check-in prevalece (last-write-wins do épico): badge e contagem intactos,
    // sem toast — o refetch de reconciliação corrige o resto.
    expect(screen.getAllByText('✓ Embarcou')).toHaveLength(2)
    expect(screen.getByText('2/2 embarcados')).toBeTruthy()
    expect(screen.queryByText(/não vai voltar no ônibus/)).toBeNull()
    await waitFor(() => expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(2))
  })

  it('absence_cancelled com aluno CHECKED_IN no cache: check-in prevalece e o refetch reconcilia', async () => {
    const anaEmbarcada = {
      ...STUDENT_A,
      status: 'CHECKED_IN' as const,
      checkedInAt: '2026-09-07T18:09:00.000Z',
    }
    const ambosEmbarcados = rosterWith(anaEmbarcada, STUDENT_B)
    mockTrip.getTripStudents
      .mockResolvedValueOnce(ambosEmbarcados)
      .mockResolvedValue(ambosEmbarcados)

    renderScreen()
    expect(await screen.findByText('2/2 embarcados')).toBeTruthy()
    expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(1)

    act(() => registeredHandlers().onAbsenceCancelled(ABSENCE_CANCELLED_EVENT))

    // Check-in prevalece: badge e contagem intactos, mas a invalidação
    // dispara o refetch que reconcilia com o servidor.
    expect(screen.getAllByText('✓ Embarcou')).toHaveLength(2)
    expect(screen.getByText('2/2 embarcados')).toBeTruthy()
    await waitFor(() => expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(2))
  })

  it('reconexão/replay: o mesmo evento duas vezes não duplica entrada nem decrementa duas vezes', async () => {
    const antes = rosterWith(STUDENT_A, STUDENT_B)
    const depoisDaAusencia = rosterWith(
      { ...STUDENT_A, status: 'NOT_RETURNING' },
      STUDENT_B,
    )
    mockTrip.getTripStudents
      .mockResolvedValueOnce(antes)
      .mockResolvedValue(depoisDaAusencia)

    renderScreen()
    expect(await screen.findByText('1/2 embarcados')).toBeTruthy()

    const handlers = registeredHandlers()
    act(() => handlers.onNotReturning(NOT_RETURNING_EVENT))
    act(() => handlers.onNotReturning({ ...NOT_RETURNING_EVENT }))

    expect(await screen.findByText('1/1 embarcados')).toBeTruthy()
    expect(screen.getAllByText('! Não vai voltar')).toHaveLength(1)
    // Ana continua na lista (o status muda; o aluno nunca é removido).
    expect(screen.getByText('Ana')).toBeTruthy()
  })

  it('2 alunos ausentes na MESMA viagem: contagem ajusta 2x e 2 badges (RV2 — pluralidade)', async () => {
    // Até aqui a pluralidade só era exercitada na API; o ajuste otimista da
    // tela num tick com 2 ausências nunca tinha 2 elegíveis ao mesmo tempo.
    const ANA_E_BRUNO_PENDENTES = rosterWith(
      STUDENT_A,
      { ...STUDENT_B, status: 'NOT_CHECKED_IN' as const, checkedInAt: null },
    )
    const SO_ANA_PENDENTE = rosterWith(
      { ...STUDENT_A, status: 'NOT_RETURNING' },
      { ...STUDENT_B, status: 'NOT_CHECKED_IN' as const, checkedInAt: null },
    )
    const NENHUM = rosterWith(
      { ...STUDENT_A, status: 'NOT_RETURNING' },
      { ...STUDENT_B, status: 'NOT_RETURNING' },
    )
    mockTrip.getTripStudents
      .mockResolvedValueOnce(ANA_E_BRUNO_PENDENTES)
      .mockResolvedValueOnce(SO_ANA_PENDENTE)
      .mockResolvedValue(NENHUM)

    renderScreen()
    expect(await screen.findByText('0/2 embarcados')).toBeTruthy()

    const handlers = registeredHandlers()
    act(() => handlers.onNotReturning(NOT_RETURNING_EVENT))
    expect(await screen.findByText('0/1 embarcados')).toBeTruthy()
    expect(screen.getAllByText('! Não vai voltar')).toHaveLength(1)
    // Snackbar único: o toast do 1º evento só é observável aqui — o 2º o substitui.
    expect(screen.getByText('Ana não vai voltar no ônibus')).toBeTruthy()

    // Segundo evento, ANTES do refetch do primeiro reconciliar: o cache
    // acumula os dois ajustes e a refetch final confirma 0/0.
    act(() =>
      handlers.onNotReturning({
        ...NOT_RETURNING_EVENT,
        studentId: STUDENT_B.studentId,
      }),
    )
    expect(await screen.findByText('0/0 embarcados')).toBeTruthy()
    expect(screen.getAllByText('! Não vai voltar')).toHaveLength(2)
    expect(screen.getByText('Bruno não vai voltar no ônibus')).toBeTruthy()
  })

  it('studentId desconhecido (fora do cache): sem toast, só refetch de reconciliação', async () => {
    const soBruno = rosterWith(STUDENT_B)
    mockTrip.getTripStudents
      .mockResolvedValueOnce(soBruno)
      .mockResolvedValue(soBruno)

    renderScreen()
    expect(await screen.findByText('1/1 embarcados')).toBeTruthy()
    expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(1)

    act(() =>
      registeredHandlers().onNotReturning({
        ...NOT_RETURNING_EVENT,
        studentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    )

    await waitFor(() => expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(2))
    // Nenhum card novo na lista e nenhum toast sem nome.
    expect(screen.queryByText(/não vai voltar no ônibus/)).toBeNull()
    expect(screen.queryByText('! Não vai voltar')).toBeNull()
  })

  it('uma conexão por tripId, fechada ao desmontar a tela', async () => {
    const antes = rosterWith(STUDENT_A, STUDENT_B)
    mockTrip.getTripStudents.mockResolvedValue(antes)

    const { unmount } = renderScreen()
    expect(await screen.findByText('1/2 embarcados')).toBeTruthy()

    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(mockConnect).toHaveBeenCalledWith(RETURN_TRIP.id, expect.any(Object))

    unmount()

    const connection = mockConnect.mock.results[0]?.value as { close: () => void }
    expect(connection.close).toHaveBeenCalled()
  })

  it('onOpen: (re)estabelecimento da conexão reconcilia o roster por refetch', async () => {
    // Ausências acontecidas durante a queda de rede só são percebidas na
    // reconexão — o evento 'open' deve disparar o refetch de reconciliação.
    const antes = rosterWith(STUDENT_A, STUDENT_B)
    mockTrip.getTripStudents.mockResolvedValue(antes)

    renderScreen()
    expect(await screen.findByText('1/2 embarcados')).toBeTruthy()
    expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(1)

    act(() => registeredHandlers().onOpen?.())

    await waitFor(() => expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(2))
  })
})
