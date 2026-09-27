import React from 'react'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ActivityIndicator, Provider as PaperProvider } from 'react-native-paper'

import StudentListScreen from '@/app/(driver)/student-list'
import {
  connectBoardingEvents,
  type BoardingEventHandlers,
} from '@/services/boarding-events.service'
import { tripService, type Trip, type TripStudents } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'
import { router } from 'expo-router'
import { ApiClientError } from '@/services/api-error'
import { tripStudentsKey } from '@/lib/trip-queries'

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

describe('StudentListScreen — carregando (story 6.11)', () => {
  it('viagem pendente: skeleton da lista com "Carregando viagem...", sem spinner', async () => {
    mockTrip.getActiveTrip.mockReturnValue(new Promise<Trip | null>(() => {}))
    renderScreen()
    await act(async () => {})
    expect(screen.getByLabelText('Carregando viagem...').props.testID).toBe('student-list-skeleton')
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
  })

  it('roster pendente sem cache: skeleton da lista com "Carregando alunos...", sem spinner', async () => {
    mockTrip.getTripStudents.mockReturnValue(new Promise<TripStudents>(() => {}))
    renderScreen()
    const loading = await screen.findByLabelText('Carregando alunos...')
    expect(loading.props.testID).toBe('student-list-skeleton')
    expect(screen.queryByText('Carregando alunos...')).toBeNull()
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
  })
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
    expect(await screen.findByLabelText('1 de 2 embarcados')).toBeTruthy()

    act(() => registeredHandlers().onNotReturning(NOT_RETURNING_EVENT))

    // Status do aluno virou o badge âmbar (STATUS_PRESENTATION de NOT_RETURNING).
    expect(await screen.findByText('Não vai voltar')).toBeTruthy()
    expect(screen.queryByText('Não embarcou')).toBeNull()
    // Contagem ajustada no próprio cache (o total do servidor exclui o ausente).
    expect(await screen.findByLabelText('1 de 1 embarcados')).toBeTruthy()
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
    expect(await screen.findByLabelText('1 de 2 embarcados')).toBeTruthy()

    const handlers = registeredHandlers()
    act(() => handlers.onNotReturning(NOT_RETURNING_EVENT))
    expect(await screen.findByLabelText('1 de 1 embarcados')).toBeTruthy()

    act(() => handlers.onAbsenceCancelled(ABSENCE_CANCELLED_EVENT))

    expect(await screen.findByText('Não embarcou')).toBeTruthy()
    expect(screen.queryByText('Não vai voltar')).toBeNull()
    expect(await screen.findByLabelText('1 de 2 embarcados')).toBeTruthy()
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
    expect(await screen.findByLabelText('2 de 2 embarcados')).toBeTruthy()
    expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(1)

    act(() => registeredHandlers().onNotReturning(NOT_RETURNING_EVENT))

    // Check-in prevalece (last-write-wins do épico): badge e contagem intactos,
    // sem toast — o refetch de reconciliação corrige o resto.
    expect(screen.getAllByText('Embarcou')).toHaveLength(2)
    expect(screen.getByLabelText('2 de 2 embarcados')).toBeTruthy()
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
    expect(await screen.findByLabelText('2 de 2 embarcados')).toBeTruthy()
    expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(1)

    act(() => registeredHandlers().onAbsenceCancelled(ABSENCE_CANCELLED_EVENT))

    // Check-in prevalece: badge e contagem intactos, mas a invalidação
    // dispara o refetch que reconcilia com o servidor.
    expect(screen.getAllByText('Embarcou')).toHaveLength(2)
    expect(screen.getByLabelText('2 de 2 embarcados')).toBeTruthy()
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
    expect(await screen.findByLabelText('1 de 2 embarcados')).toBeTruthy()

    const handlers = registeredHandlers()
    act(() => handlers.onNotReturning(NOT_RETURNING_EVENT))
    act(() => handlers.onNotReturning({ ...NOT_RETURNING_EVENT }))

    expect(await screen.findByLabelText('1 de 1 embarcados')).toBeTruthy()
    expect(screen.getAllByText('Não vai voltar')).toHaveLength(1)
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
    expect(await screen.findByLabelText('0 de 2 embarcados')).toBeTruthy()

    const handlers = registeredHandlers()
    act(() => handlers.onNotReturning(NOT_RETURNING_EVENT))
    expect(await screen.findByLabelText('0 de 1 embarcados')).toBeTruthy()
    expect(screen.getAllByText('Não vai voltar')).toHaveLength(1)
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
    expect(await screen.findByLabelText('0 de 0 embarcados')).toBeTruthy()
    expect(screen.getAllByText('Não vai voltar')).toHaveLength(2)
    expect(screen.getByText('Bruno não vai voltar no ônibus')).toBeTruthy()
  })

  it('studentId desconhecido (fora do cache): sem toast, só refetch de reconciliação', async () => {
    const soBruno = rosterWith(STUDENT_B)
    mockTrip.getTripStudents
      .mockResolvedValueOnce(soBruno)
      .mockResolvedValue(soBruno)

    renderScreen()
    expect(await screen.findByLabelText('1 de 1 embarcados')).toBeTruthy()
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
    expect(screen.queryByText('Não vai voltar')).toBeNull()
  })

  it('uma conexão por tripId, fechada ao desmontar a tela', async () => {
    const antes = rosterWith(STUDENT_A, STUDENT_B)
    mockTrip.getTripStudents.mockResolvedValue(antes)

    const { unmount } = renderScreen()
    expect(await screen.findByLabelText('1 de 2 embarcados')).toBeTruthy()

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
    expect(await screen.findByLabelText('1 de 2 embarcados')).toBeTruthy()
    expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(1)

    act(() => registeredHandlers().onOpen?.())

    await waitFor(() => expect(mockTrip.getTripStudents).toHaveBeenCalledTimes(2))
  })
})

describe('StudentListScreen — redesign da lista (story 6.7)', () => {
  it('fixed header: BoardingCounter + legend, updated by not_returning and absence_cancelled', async () => {
    const antes = rosterWith(STUDENT_A, STUDENT_B)
    const comAusencia = rosterWith({ ...STUDENT_A, status: 'NOT_RETURNING' }, STUDENT_B)
    mockTrip.getTripStudents
      .mockResolvedValueOnce(antes)
      .mockResolvedValueOnce(comAusencia)
      .mockResolvedValue(antes)

    renderScreen()
    expect(await screen.findByTestId('roster-counter')).toHaveProp('accessibilityLabel', '1 de 2 embarcados')
    expect(screen.getByTestId('roster-legend')).toHaveTextContent('1 embarcou · 0 não vão voltar · 1 aguardando')

    const handlers = registeredHandlers()
    act(() => handlers.onNotReturning(NOT_RETURNING_EVENT))
    await waitFor(() =>
      expect(screen.getByTestId('roster-legend')).toHaveTextContent('1 embarcou · 1 não vai voltar · 0 aguardando'),
    )
    expect(screen.getByTestId('roster-counter')).toHaveProp('accessibilityLabel', '1 de 1 embarcados')

    act(() => handlers.onAbsenceCancelled(ABSENCE_CANCELLED_EVENT))
    await waitFor(() =>
      expect(screen.getByTestId('roster-legend')).toHaveTextContent('1 embarcou · 0 não vão voltar · 1 aguardando'),
    )
    expect(screen.getByTestId('roster-counter')).toHaveProp('accessibilityLabel', '1 de 2 embarcados')
  })

  it('rows show initials and icon chips, never the old glyphs or the "X/Y embarcados" sentence', async () => {
    mockTrip.getTripStudents.mockResolvedValue(rosterWith(STUDENT_A, STUDENT_B))

    renderScreen()
    expect(await screen.findByText('Ana')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    expect(screen.getByText('Não embarcou')).toBeTruthy()
    expect(screen.getByText('Embarcou')).toBeTruthy()
    expect(screen.queryByText(/[✓!]|— /)).toBeNull()
    expect(screen.queryByText(/\d+\/\d+ embarcados/)).toBeNull()
  })

  it('stale banner: absent while live, shown once the stream dies, and "Atualizar" refetches the roster', async () => {
    mockTrip.getTripStudents.mockResolvedValue(rosterWith(STUDENT_A, STUDENT_B))

    renderScreen()
    expect(await screen.findByTestId('roster-counter')).toBeTruthy()
    expect(screen.queryByTestId('stale-banner')).toBeNull()

    act(() => registeredHandlers().onUnrecoverable?.())

    expect(await screen.findByTestId('stale-banner')).toBeTruthy()
    expect(
      screen.getByText('Dados podem estar desatualizados — sem atualização em tempo real'),
    ).toBeTruthy()
    const callsBefore = mockTrip.getTripStudents.mock.calls.length

    fireEvent.press(screen.getByText('Atualizar'))

    await waitFor(() =>
      expect(mockTrip.getTripStudents.mock.calls.length).toBeGreaterThan(callsBefore),
    )
  })

  it('stale banner: a failed refetch over cached data shows it (isError && data)', async () => {
    mockTrip.getTripStudents
      .mockResolvedValueOnce(rosterWith(STUDENT_A, STUDENT_B))
      .mockRejectedValue(new Error('500'))

    renderScreen()
    expect(await screen.findByTestId('roster-counter')).toBeTruthy()
    expect(screen.queryByTestId('stale-banner')).toBeNull()

    act(() => registeredHandlers().onOpen?.())

    expect(await screen.findByTestId('stale-banner')).toBeTruthy()
    // The cached list stays readable under the banner.
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getByLabelText('1 de 2 embarcados')).toBeTruthy()
  })

  it('empty roster: StateView in place of the list, header at 0 of 0', async () => {
    mockTrip.getTripStudents.mockResolvedValue(rosterWith())

    renderScreen()
    expect(await screen.findByTestId('roster-empty')).toBeTruthy()
    expect(screen.getByText('Nenhum aluno vinculado a esta rota')).toBeTruthy()
    expect(screen.getByTestId('roster-counter')).toHaveProp('accessibilityLabel', '0 de 0 embarcados')
  })

  it('a 60-student roster renders the header and the first row (NFR4)', async () => {
    const sixty = Array.from({ length: 60 }, (_, i) => ({
      studentId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: `Aluno ${String(i + 1).padStart(2, '0')}`,
      status: 'NOT_CHECKED_IN' as const,
      checkedInAt: null,
    }))
    mockTrip.getTripStudents.mockResolvedValue(rosterWith(...sixty))

    renderScreen()
    expect(await screen.findByLabelText('0 de 60 embarcados')).toBeTruthy()
    expect(screen.getByText('Aluno 01')).toBeTruthy()
    // FlatList windowing keeps the first render bounded.
    expect(screen.queryByText('Aluno 60')).toBeNull()
    expect(screen.getByTestId('roster-legend')).toHaveTextContent('0 embarcaram · 0 não vão voltar · 60 aguardando')
  })

  it('an SSE event gives a new object only to the affected student', async () => {
    const antes = rosterWith(STUDENT_A, STUDENT_B)
    mockTrip.getTripStudents.mockResolvedValue(antes)

    renderScreen()
    expect(await screen.findByLabelText('1 de 2 embarcados')).toBeTruthy()
    const key = tripStudentsKey(RETURN_TRIP.id)
    const before = queryClient.getQueryData<TripStudents>(key)!

    let after: TripStudents | undefined
    act(() => {
      registeredHandlers().onNotReturning(NOT_RETURNING_EVENT)
      // Read before the reconciling refetch replaces the whole roster.
      after = queryClient.getQueryData<TripStudents>(key)
    })

    expect(after).not.toBe(before)
    expect(after!.students[0]).not.toBe(before.students[0])
    expect(after!.students[0].status).toBe('NOT_RETURNING')
    expect(after!.students[1]).toBe(before.students[1])
  })
})

describe('StudentListScreen — estados de bloqueio e erro (StateView)', () => {
  it('roster rejeitado sem cache: "Não foi possível carregar a lista" e "Tentar novamente" busca de novo', async () => {
    mockTrip.getTripStudents.mockRejectedValue(new Error('500'))

    renderScreen()
    expect(await screen.findByText('Não foi possível carregar a lista')).toBeTruthy()
    const callsBefore = mockTrip.getTripStudents.mock.calls.length

    fireEvent.press(screen.getByText('Tentar novamente'))

    await waitFor(() =>
      expect(mockTrip.getTripStudents.mock.calls.length).toBeGreaterThan(callsBefore),
    )
  })

  it('403 DRIVER_NOT_ASSIGNED: "Viagem de outro motorista" e "Ir para Viagem" navega para a viagem', async () => {
    mockTrip.getTripStudents.mockRejectedValue(
      new ApiClientError('DRIVER_NOT_ASSIGNED', 'Motorista não atribuído', 403),
    )

    renderScreen()
    expect(await screen.findByText('Viagem de outro motorista')).toBeTruthy()

    fireEvent.press(screen.getByText('Ir para Viagem'))
    expect(jest.mocked(router).navigate).toHaveBeenCalledWith('/(driver)/trip')
  })
})
