import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { router } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import StudentHomeScreen from '@/app/(student)/home'
import { TEST_INSETS, type TestNode } from '@/components/ui/test-utils'
import { lightTheme } from '@/lib/theme'
import { ApiClientError } from '@/services/api-error'
import {
  boardingService,
  type CancelAbsenceResponse,
  type NotReturningResponse,
  type StudentBoardingStatusResponse,
} from '@/services/boarding.service'
import { tripService, type Trip } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'

// Lives at src/ root, not src/app/: Expo Router turns every file under src/app/
// into a navigable route, so a test file there pollutes typedRoutes/_sitemap and
// throws on the module-scope jest.mock (same reason as trip-screen.test.tsx).
//
// PaperProvider hosts the ConfirmDialog's Portal; SafeAreaProvider feeds the
// Screen and the StickyActionBar's inset (same setup as trip-screen.test.tsx).

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
}))

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}))

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'generated-key-1'),
}))

jest.mock('@/services/trip.service', () => ({
  tripService: { getActiveTrip: jest.fn() },
}))

jest.mock('@/services/boarding.service', () => ({
  boardingService: {
    notifyNotReturning: jest.fn(),
    cancelAbsence: jest.fn(),
    getPendingReminder: jest.fn(),
    getMyStatus: jest.fn(),
  },
}))

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: jest.fn(),
}))

const mockTrip = jest.mocked(tripService)
const mockBoarding = jest.mocked(boardingService)
const mockAuthStore = jest.mocked(useAuthStore)

const RETURN_TRIP: Trip = {
  id: 'trip-return-1',
  companyId: 'company-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  type: 'RETURN',
  status: 'ACTIVE',
  startedAt: '2026-09-07T18:00:00.000Z',
  endedAt: null,
  relatedTripId: 'trip-outbound-1',
}

const ABSENCE: NotReturningResponse = {
  id: 'absence-1',
  studentId: 'student-1',
  tripId: RETURN_TRIP.id,
  status: 'NOT_RETURNING',
  notifiedAt: '2026-09-07T18:10:00.000Z',
  // 90s à frente de AGORA (não de notifiedAt, que é só o eco fixo do registro):
  // janela aberta o bastante para o countdown de 1:xx aparecer e não zerar
  // durante o teste. É o valor do servidor — a tela nunca recalcula.
  cancellableUntil: new Date(Date.now() + 90 * 1000).toISOString(),
}

const CANCELLATION: CancelAbsenceResponse = {
  studentId: 'student-1',
  tripId: RETURN_TRIP.id,
  status: 'NOT_CHECKED_IN',
  cancelledAt: new Date().toISOString(),
}

// Shapes of GET /api/v1/boarding/status — the server's view of the student.
const STATUS_PENDING: StudentBoardingStatusResponse = {
  tripId: RETURN_TRIP.id,
  status: 'NOT_CHECKED_IN',
  absence: null,
}

const STATUS_ABSENT: StudentBoardingStatusResponse = {
  tripId: RETURN_TRIP.id,
  status: 'NOT_RETURNING',
  absence: {
    id: ABSENCE.id,
    notifiedAt: ABSENCE.notifiedAt,
    cancellableUntil: ABSENCE.cancellableUntil,
  },
}

const STATUS_CHECKED_IN: StudentBoardingStatusResponse = {
  tripId: RETURN_TRIP.id,
  status: 'CHECKED_IN',
  absence: null,
}

const statusKey = ['studentBoardingStatus', RETURN_TRIP.id]

// Shape of GET /api/v1/boarding/reminder (spec 4.4): null = no reminder.
const REMINDER = {
  tripId: RETURN_TRIP.id,
  remindedAt: '2026-09-07T18:15:00.000Z',
}

function mockUser() {
  const state = {
    user: {
      id: 'student-1',
      email: 'ana@escola.com',
      name: 'Ana',
      role: 'STUDENT',
    },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }
  // A tela chama `useAuthStore()` sem selector; suportar também o acesso com
  // selector (padrão zustand) para o mock sobreviver a refactors.
  mockAuthStore.mockImplementation(((selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state) as never)
}

let queryClient: QueryClient

function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: {
      // The screen pins `retry: 2` on the query (same choice as the driver
      // screens), so the test can only zero the delay between attempts.
      // `gcTime: Infinity` keeps React Query from scheduling a garbage-
      // collection timer that outlives the test (would make jest hang without
      // --forceExit); `clear()` in afterEach drops the cache.
      queries: { retryDelay: 0, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  })
  return render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: TEST_INSETS }}
    >
      <PaperProvider theme={lightTheme}>
        <QueryClientProvider client={queryClient}>
          <StudentHomeScreen />
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser()
  // Same default as the 4.1/4.3 tests: no pending reminder — the banner stays
  // out of their path. The 4.4 tests override it when needed.
  mockBoarding.getPendingReminder.mockResolvedValue(null)
  mockBoarding.getMyStatus.mockResolvedValue(STATUS_PENDING)
})

afterEach(() => {
  queryClient.clear()
})

// O botão nasce desabilitado enquanto a viagem não resolve — `findByText`
// pega o texto no primeiro frame. Esperar habilitar é pré-condição do toque.
async function openDialog() {
  const button = await screen.findByText('Não vou voltar')
  await waitFor(() => expect(button).not.toBeDisabled())
  fireEvent.press(button)
  return screen.findByTestId('home-not-returning-dialog-confirm')
}

describe('StudentHomeScreen — aviso "Não vou voltar" (spec-4-1)', () => {
  it('sem viagem de retorno ativa: botão desabilitado com dica', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    const button = await screen.findByText('Não vou voltar')
    expect(button).toBeDisabled()
    expect(
      await screen.findByText(
        'Sem viagem de retorno ativa. O aviso fica disponível quando ela começar.',
      ),
    ).toBeTruthy()
    // Nunca chamou o endpoint sem viagem para avisar.
    expect(mockBoarding.notifyNotReturning).not.toHaveBeenCalled()
  })

  it('fluxo em 2 toques: 1º abre o dialog, 2º (Avisar motorista) chama a API com tripId e key UUID', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    const button = await screen.findByText('Não vou voltar')
    await waitFor(() => expect(button).not.toBeDisabled())

    // Toque 1: só abre o dialog — nenhuma chamada ainda.
    fireEvent.press(button)
    expect(mockBoarding.notifyNotReturning).not.toHaveBeenCalled()

    // Toque 2: confirma.
    fireEvent.press(await screen.findByTestId('home-not-returning-dialog-confirm'))

    await waitFor(() =>
      expect(mockBoarding.notifyNotReturning).toHaveBeenCalledWith(
        RETURN_TRIP.id,
        'generated-key-1',
      ),
    )
  })

  it('sucesso: mostra "Motorista avisado" com countdown do cancellableUntil e grava o cache', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(
      screen.getByText('Você não vai voltar nesta viagem.'),
    ).toBeTruthy()
    // Factual m:ss window fed by the server's cancellableUntil, with the 4.3
    // "Desfazer" inside it.
    expect(screen.getByText(/Desfazer em 1:\d{2}/)).toBeTruthy()
    expect(screen.getByTestId('home-undo-absence')).toBeTruthy()
    // Registro da ausência não esconde o embarque: o QR continua na tela.
    expect(screen.getByTestId('home-qr-shortcut')).toBeTruthy()
    expect(screen.queryByText('Não vou voltar')).toBeNull()

    // The known outcome is written straight into the status query.
    await waitFor(() =>
      expect(queryClient.getQueryData(statusKey)).toEqual(STATUS_ABSENT),
    )
  })

  it('janela expirada: ausência apresentada como consolidada, sem countdown e sem botão Desfazer', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue({
      ...ABSENCE,
      cancellableUntil: new Date(Date.now() - 60 * 1000).toISOString(),
    })

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(screen.queryByTestId('countdown-pill')).toBeNull()
    // Consolidated = the card stays, but the way back (Desfazer) goes with the window.
    expect(screen.queryByTestId('home-undo-absence')).toBeNull()
    expect(mockBoarding.cancelAbsence).not.toHaveBeenCalled()
  })

  it('ALREADY_NOT_RETURNING: vira estado registrado com a janela do servidor, não erro', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    // Local state behind the server: the refetch after the 409 brings the
    // absence that already exists.
    mockBoarding.getMyStatus
      .mockResolvedValueOnce(STATUS_PENDING)
      .mockResolvedValue(STATUS_ABSENT)
    mockBoarding.notifyNotReturning.mockRejectedValue(
      new ApiClientError(
        'ALREADY_NOT_RETURNING',
        'Ausência já registrada nesta viagem',
        409,
      ),
    )

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(screen.getByTestId('countdown-pill')).toBeTruthy()
    expect(mockBoarding.getMyStatus).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByText('Não foi possível registrar a ausência. Tente novamente.'),
    ).toBeNull()
  })

  it('ALREADY_NOT_RETURNING with a failing refetch: the card still shows, consolidated', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus
      .mockResolvedValueOnce(STATUS_PENDING)
      .mockRejectedValue(new Error('Network down'))
    mockBoarding.notifyNotReturning.mockRejectedValue(
      new ApiClientError('ALREADY_NOT_RETURNING', 'já registrada', 409),
    )

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    await waitFor(() =>
      expect(queryClient.getQueryState(statusKey)?.status).toBe('error'),
    )
    expect(screen.getByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(screen.queryByTestId('countdown-pill')).toBeNull()
    expect(queryClient.getQueryData(statusKey)).toEqual({
      tripId: RETURN_TRIP.id,
      status: 'NOT_RETURNING',
      absence: null,
    })
  })

  it('ALREADY_CHECKED_IN orienta falar com o motorista', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockRejectedValue(
      new ApiClientError(
        'ALREADY_CHECKED_IN',
        'Aluno já embarcou nesta viagem — falar com o motorista',
        409,
      ),
    )

    renderScreen()

    fireEvent.press(await openDialog())

    expect(
      await screen.findByText('Você já embarcou nesta viagem. Fale com o motorista.'),
    ).toBeTruthy()
    // Não vira estado registrado: a ausência não existe no servidor.
    expect(screen.queryByTestId('trip-status-card-title-registered')).toBeNull()
    expect(mockBoarding.notifyNotReturning).toHaveBeenCalledTimes(1)
  })

  it('STUDENT_NOT_ON_TRIP mostra a mensagem tipada e o botão volta', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockRejectedValue(
      new ApiClientError('STUDENT_NOT_ON_TRIP', 'Aluno não pertence à rota', 403),
    )

    renderScreen()

    fireEvent.press(await openDialog())

    expect(
      await screen.findByText('Você não pertence à rota desta viagem.'),
    ).toBeTruthy()
    // Erro devolve à tela inicial (estado idle), pronta para nova tentativa.
    expect(await screen.findByText('Não vou voltar')).toBeTruthy()
  })

  it('erro de rede (sem ApiClientError): mensagem genérica, sem quebrar a tela', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockRejectedValue(new Error('Network down'))

    renderScreen()

    fireEvent.press(await openDialog())

    expect(
      await screen.findByText('Não foi possível registrar a ausência. Tente novamente.'),
    ).toBeTruthy()
    expect(screen.getByText('Não vou voltar')).toBeTruthy()
  })

  it('reinstalação sem cache com ausência ativa no servidor: abre no estado registrado com countdown, sem POST', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus.mockResolvedValue(STATUS_ABSENT)

    renderScreen()

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(screen.getByTestId('countdown-pill')).toBeTruthy()
    // O cancelamento volta a ficar disponível também na reidratação.
    expect(screen.getByTestId('home-undo-absence')).toBeTruthy()
    expect(mockBoarding.notifyNotReturning).not.toHaveBeenCalled()
  })
})

describe('StudentHomeScreen — cancelamento de ausência (spec-4-3)', () => {
  it('cancelar em 1 toque: card some, "Não vou voltar" volta e o cache sob a key da viagem é limpo', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)
    mockBoarding.cancelAbsence.mockResolvedValue(CANCELLATION)

    renderScreen()

    // Fluxo completo da AC: registrar → cancelar, ≤ 2 toques por operação.
    fireEvent.press(await openDialog())
    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()

    fireEvent.press(screen.getByTestId('home-undo-absence'))

    // O ramo normal É o estado confirmado: o aviso volta a ficar disponível.
    expect(await screen.findByText('Não vou voltar')).toBeTruthy()
    expect(screen.queryByTestId('trip-status-card-title-registered')).toBeNull()
    expect(mockBoarding.cancelAbsence).toHaveBeenCalledWith(
      RETURN_TRIP.id,
      'generated-key-1',
    )
    await waitFor(() =>
      expect(queryClient.getQueryData(statusKey)).toEqual(STATUS_PENDING),
    )
  })

  it('corrida com a expiração (409 CANCELLATION_PERIOD_EXPIRED): card consolida, mensagem orienta avisar o motorista, tela não trava', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    // After the 409 the screen refetches: the server keeps the absence, with
    // the window already closed.
    const expired: StudentBoardingStatusResponse = {
      ...STATUS_ABSENT,
      absence: {
        ...STATUS_ABSENT.absence!,
        cancellableUntil: new Date(Date.now() - 1000).toISOString(),
      },
    }
    mockBoarding.getMyStatus
      .mockResolvedValueOnce(STATUS_PENDING)
      .mockResolvedValue(expired)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)
    mockBoarding.cancelAbsence.mockRejectedValue(
      new ApiClientError(
        'CANCELLATION_PERIOD_EXPIRED',
        'Janela de cancelamento já expirou',
        409,
      ),
    )

    renderScreen()

    fireEvent.press(await openDialog())
    await screen.findByTestId('trip-status-card-title-registered')

    fireEvent.press(screen.getByTestId('home-undo-absence'))

    expect(
      await screen.findByText(
        'O tempo para cancelar pelo app passou. Avise o motorista pessoalmente.',
      ),
    ).toBeTruthy()
    // Consolidated: the card stays, without countdown and without a new Desfazer.
    await waitFor(() =>
      expect(queryClient.getQueryData(statusKey)).toEqual(expired),
    )
    expect(screen.getByTestId('trip-status-card-title-registered')).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByTestId('countdown-pill')).toBeNull(),
    )
    expect(screen.queryByTestId('home-undo-absence')).toBeNull()
  })

  it('404 ABSENCE_NOT_FOUND (estado local velho): mensagem clara e volta ao ramo normal', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)
    mockBoarding.cancelAbsence.mockRejectedValue(
      new ApiClientError(
        'ABSENCE_NOT_FOUND',
        'Nenhuma ausência ativa para cancelar',
        404,
      ),
    )

    renderScreen()

    fireEvent.press(await openDialog())
    await screen.findByTestId('trip-status-card-title-registered')

    fireEvent.press(screen.getByTestId('home-undo-absence'))

    expect(
      await screen.findByText('Não há registro de ausência para cancelar.'),
    ).toBeTruthy()
    expect(await screen.findByText('Não vou voltar')).toBeTruthy()
    // The server's answer (no absence) replaces the stale local state.
    await waitFor(() =>
      expect(queryClient.getQueryData(statusKey)).toEqual(STATUS_PENDING),
    )
    expect(mockBoarding.getMyStatus).toHaveBeenCalledTimes(2)
  })
})

describe('StudentHomeScreen — lembrete de check-in pendente (spec-4-4)', () => {
  it('banner appears when the GET returns a pending reminder — those not on the stream see it when opening the app', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getPendingReminder.mockResolvedValue(REMINDER)

    renderScreen()

    expect(
      await screen.findByText(/ainda não confirmou o retorno/),
    ).toBeTruthy()
    // O fluxo normal da 4.1 continua disponível ao lado do banner.
    expect(screen.getByTestId('home-qr-shortcut')).toBeTruthy()
  })

  it('GET null (sem lembrete): nenhum banner', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)

    renderScreen()

    expect(await screen.findByText('Não vou voltar')).toBeTruthy()
    expect(screen.queryByText(/ainda não confirmou o retorno/)).toBeNull()
  })

  it('GET fails: banner absent and the screen keeps working — the reminder is an accessory', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getPendingReminder.mockRejectedValue(new Error('Network down'))

    renderScreen()

    expect(await screen.findByText('Não vou voltar')).toBeTruthy()
    expect(screen.queryByText(/ainda não confirmou o retorno/)).toBeNull()
  })

  it('without an active trip the GET is not even called (enabled: Boolean(tripId))', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    expect(await screen.findByText('Não vou voltar')).toBeTruthy()
    expect(mockBoarding.getPendingReminder).not.toHaveBeenCalled()
  })

  it('with the banner up there is a single "Não vou voltar" (the footer) and it answers in 2 taps', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getPendingReminder.mockResolvedValue(REMINDER)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    expect(await screen.findByText('E a volta?')).toBeTruthy()
    expect(screen.getAllByText('Não vou voltar')).toHaveLength(1)

    // Tap 1 — footer action.
    const footerButton = screen.getByText('Não vou voltar')
    await waitFor(() => expect(footerButton).not.toBeDisabled())
    fireEvent.press(footerButton)
    expect(mockBoarding.notifyNotReturning).not.toHaveBeenCalled()

    // Tap 2 — the SAME 4.1 dialog confirms.
    fireEvent.press(await screen.findByTestId('home-not-returning-dialog-confirm'))

    await waitFor(() =>
      expect(mockBoarding.notifyNotReturning).toHaveBeenCalledWith(
        RETURN_TRIP.id,
        'generated-key-1',
      ),
    )
    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
  })

  it('after success the banner disappears: reminder invalidated and the GET refetch already returns null', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getPendingReminder
      .mockResolvedValueOnce(REMINDER)
      .mockResolvedValue(null)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    // Same precondition as the previous test: banner mounted before the tap.
    expect(await screen.findByText(/ainda não confirmou o retorno/)).toBeTruthy()

    fireEvent.press(await openDialog())

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByText(/ainda não confirmou o retorno/)).toBeNull(),
    )
    // The reminder was invalidated — the refetch replaced the stale value.
    await waitFor(() =>
      expect(
        queryClient.getQueryData(['studentReminder', RETURN_TRIP.id]),
      ).toBeNull(),
    )
  })

  it('cancelling the absence also invalidates the reminder: the pending banner comes back without a remount', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    // Server-side sequence: reminder answered (GET null while the absence is
    // active), then the cancellation reopens the pending state — the next GET
    // answers the reminder again.
    mockBoarding.getPendingReminder
      .mockResolvedValueOnce(null)
      .mockResolvedValue(REMINDER)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)
    mockBoarding.cancelAbsence.mockResolvedValue(CANCELLATION)

    renderScreen()

    // Register (2 taps) — the absence card replaces the normal branch.
    fireEvent.press(await openDialog())
    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()

    // Cancel (1 tap) — the reminder pending state is restored server-side.
    fireEvent.press(screen.getByTestId('home-undo-absence'))

    // Without the invalidation in cancelMutation the stale null would stay
    // until the next poll; with it the query refetches and the banner returns.
    expect(
      await screen.findByText(/ainda não confirmou o retorno/),
    ).toBeTruthy()
    expect(
      queryClient.getQueryData(['studentReminder', RETURN_TRIP.id]),
    ).toMatchObject({ tripId: RETURN_TRIP.id })
  })
})

describe('StudentHomeScreen — estado do servidor com a home aberta (fix student-home-trip-refresh)', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('polling descobre a viagem de retorno sem remount: "Não vou voltar" habilita', async () => {
    jest.useFakeTimers()
    mockTrip.getActiveTrip
      .mockResolvedValueOnce(null)
      .mockResolvedValue(RETURN_TRIP)

    renderScreen()

    const button = await screen.findByText('Não vou voltar')
    expect(
      await screen.findByText(
        'Sem viagem de retorno ativa. O aviso fica disponível quando ela começar.',
      ),
    ).toBeTruthy()
    expect(button).toBeDisabled()

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000)
    })

    await waitFor(() =>
      expect(screen.getByText('Não vou voltar')).not.toBeDisabled(),
    )
    expect(mockTrip.getActiveTrip).toHaveBeenCalledTimes(2)
  })

  it('motorista faz o check-in do aluno ausente: card de ausência some e "Embarque confirmado" aparece', async () => {
    jest.useFakeTimers()
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus
      .mockResolvedValueOnce(STATUS_ABSENT)
      .mockResolvedValue(STATUS_CHECKED_IN)

    renderScreen()

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000)
    })

    expect(await screen.findByText('Embarque confirmado')).toBeTruthy()
    expect(screen.queryByTestId('trip-status-card-title-registered')).toBeNull()
    expect(screen.queryByText('Não vou voltar')).toBeNull()
    expect(screen.queryByTestId('home-undo-absence')).toBeNull()
    // The QR stays reachable.
    expect(screen.getByTestId('home-qr-shortcut')).toBeTruthy()
  })

  it('CHECKED_IN ao abrir: "Embarque confirmado" sem ações e sem banner de lembrete', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus.mockResolvedValue(STATUS_CHECKED_IN)
    mockBoarding.getPendingReminder.mockResolvedValue(REMINDER)

    renderScreen()

    expect(await screen.findByText('Embarque confirmado')).toBeTruthy()
    await waitFor(() =>
      expect(mockBoarding.getPendingReminder).toHaveBeenCalled(),
    )
    expect(screen.queryByText('Não vou voltar')).toBeNull()
    expect(screen.queryByText(/ainda não confirmou o retorno/)).toBeNull()
  })

  it('ALREADY_CHECKED_IN no POST: refaz o status e converge para "Embarque confirmado"', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus
      .mockResolvedValueOnce(STATUS_PENDING)
      .mockResolvedValue(STATUS_CHECKED_IN)
    mockBoarding.notifyNotReturning.mockRejectedValue(
      new ApiClientError('ALREADY_CHECKED_IN', 'já embarcou', 409),
    )

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByText('Embarque confirmado')).toBeTruthy()
  })

  it('closes the open dialog when a poll flips the status to CHECKED_IN', async () => {
    jest.useFakeTimers()
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus
      .mockResolvedValueOnce(STATUS_PENDING)
      .mockResolvedValue(STATUS_CHECKED_IN)

    renderScreen()

    await openDialog()
    expect(screen.getByText('Não vou voltar?')).toBeTruthy()

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000)
    })

    expect(await screen.findByText('Embarque confirmado')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Não vou voltar?')).toBeNull())
    expect(screen.queryByTestId('home-not-returning-dialog-confirm')).toBeNull()
    expect(mockBoarding.notifyNotReturning).not.toHaveBeenCalled()
  })

  it('erro no GET de status mantém o último estado conhecido', async () => {
    jest.useFakeTimers()
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus
      .mockResolvedValueOnce(STATUS_ABSENT)
      .mockRejectedValue(new Error('Network down'))

    renderScreen()

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000)
    })

    // The failed cycle (with its retries) ends in error, but the data stays.
    await waitFor(() =>
      expect(queryClient.getQueryState(statusKey)?.status).toBe('error'),
    )
    expect(queryClient.getQueryData(statusKey)).toEqual(STATUS_ABSENT)
    expect(screen.getByTestId('trip-status-card-title-registered')).toBeTruthy()
  })

  it('notify: a status GET in flight during the POST does not overwrite the outcome', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    const held = deferred<StudentBoardingStatusResponse>()
    mockBoarding.getMyStatus.mockReturnValueOnce(held.promise)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    fireEvent.press(await openDialog())
    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()

    // The GET that started before the POST lands with the pre-POST state.
    await act(async () => {
      held.resolve(STATUS_PENDING)
      await held.promise
    })

    expect(queryClient.getQueryData(statusKey)).toEqual(STATUS_ABSENT)
    expect(screen.getByTestId('trip-status-card-title-registered')).toBeTruthy()
  })

  it('cancel: a status GET in flight during the POST does not overwrite the outcome', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus.mockResolvedValue(STATUS_ABSENT)
    mockBoarding.cancelAbsence.mockResolvedValue(CANCELLATION)

    renderScreen()

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()

    // A poll starts and stays open while the student cancels.
    const held = deferred<StudentBoardingStatusResponse>()
    mockBoarding.getMyStatus.mockReturnValueOnce(held.promise)
    void queryClient.refetchQueries({ queryKey: statusKey })
    await waitFor(() => expect(mockBoarding.getMyStatus).toHaveBeenCalledTimes(2))

    fireEvent.press(screen.getByTestId('home-undo-absence'))
    expect(await screen.findByText('Não vou voltar')).toBeTruthy()

    await act(async () => {
      held.resolve(STATUS_ABSENT)
      await held.promise
    })

    expect(queryClient.getQueryData(statusKey)).toEqual(STATUS_PENDING)
    expect(screen.queryByTestId('trip-status-card-title-registered')).toBeNull()
  })

  it('ignores a status that belongs to another trip', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus.mockResolvedValue({
      ...STATUS_CHECKED_IN,
      tripId: 'trip-return-2',
    })

    renderScreen()

    await waitFor(() =>
      expect(queryClient.getQueryState(statusKey)?.status).toBe('success'),
    )
    expect(screen.queryByText('Embarque confirmado')).toBeNull()
    expect(screen.queryByTestId('trip-status-card-title-registered')).toBeNull()
    await waitFor(() =>
      expect(screen.getByText('Não vou voltar')).not.toBeDisabled(),
    )
  })

  it('polling brings the reminder banner without a remount', async () => {
    jest.useFakeTimers()
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getPendingReminder
      .mockResolvedValueOnce(null)
      .mockResolvedValue(REMINDER)

    renderScreen()

    await waitFor(() =>
      expect(mockBoarding.getPendingReminder).toHaveBeenCalledTimes(1),
    )
    expect(screen.queryByText(/ainda não confirmou o retorno/)).toBeNull()

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000)
    })

    expect(await screen.findByText(/ainda não confirmou o retorno/)).toBeTruthy()
  })
})

describe('StudentHomeScreen — painel do dia (story 6.8)', () => {
  const hidden = { includeHiddenElements: true }
  const HH_MM = /^\d{2}:\d{2}$/

  function chipIcon(): string | undefined {
    return screen
      .getByTestId('trip-status-card-chip', hidden)
      .findAll((node: TestNode) => typeof node.props.name === 'string')[0]?.props.name
  }

  const originalOS = Platform.OS

  afterEach(() => {
    Platform.OS = originalOS
  })

  it('shortcuts sit side by side and navigate (not push) to the QR and the bus tracking', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    const qr = await screen.findByRole('button', { name: 'Meu QR' })
    const track = screen.getByRole('button', { name: 'Onde está o ônibus' })
    expect(screen.getByTestId('home-qr-shortcut')).toBe(qr)
    expect(screen.getByTestId('home-track-shortcut')).toBe(track)

    fireEvent.press(qr)
    expect(router.navigate).toHaveBeenCalledWith('/(student)/qr-code')
    fireEvent.press(track)
    expect(router.navigate).toHaveBeenCalledWith('/(student)/track-bus')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('greets by name', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    expect(await screen.findByText('Olá, Ana')).toBeTruthy()
  })

  it('no trip: card without chip, footer disabled', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)

    renderScreen()

    expect(
      await screen.findByText('Sem viagem de retorno ativa. O aviso fica disponível quando ela começar.'),
    ).toBeTruthy()
    expect(screen.queryByTestId('trip-status-card-chip')).toBeNull()
    expect(screen.getByTestId('home-not-returning')).toBeDisabled()
  })

  it('waiting: "Aguardando" chip with clock-outline, trip in progress and its start time', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)

    renderScreen()

    expect(await screen.findByText('Aguardando')).toBeTruthy()
    expect(chipIcon()).toBe('clock-outline')
    expect(screen.getByText('Viagem de volta em andamento')).toBeTruthy()
    const started = screen.getByText(/^Iniciada às /)
    expect(String(started.props.children).replace('Iniciada às ', '')).toMatch(HH_MM)
    await waitFor(() => expect(screen.getByTestId('home-not-returning')).not.toBeDisabled())
  })

  it('checked in: "Embarcou" chip, no footer and no reminder', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus.mockResolvedValue(STATUS_CHECKED_IN)

    renderScreen()

    expect(await screen.findByText('Embarque confirmado')).toBeTruthy()
    expect(screen.getByText('Embarcou')).toBeTruthy()
    expect(chipIcon()).toBe('check-circle')
    const started = screen.getByText(/^Iniciada às /)
    expect(String(started.props.children).replace('Iniciada às ', '')).toMatch(HH_MM)
    expect(screen.queryByTestId('home-not-returning')).toBeNull()
    expect(screen.queryByTestId('sticky-action-bar')).toBeNull()
  })

  it('registered in the window: "Não vai voltar" chip, notified time, pill and Desfazer, no footer', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus.mockResolvedValue(STATUS_ABSENT)

    renderScreen()

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(screen.getByText('Não vai voltar')).toBeTruthy()
    expect(chipIcon()).toBe('account-cancel')
    const notified = screen.getByText(/^Avisado às /)
    expect(String(notified.props.children).replace('Avisado às ', '')).toMatch(HH_MM)
    expect(screen.getByTestId('countdown-pill')).toBeTruthy()
    expect(screen.getByTestId('home-undo-absence')).toBeTruthy()
    expect(screen.queryByTestId('sticky-action-bar')).toBeNull()
  })

  it('consolidated with absence: null — no notified time, no pill, no Desfazer', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus.mockResolvedValue({ ...STATUS_ABSENT, absence: null })

    renderScreen()

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(screen.queryByText(/Avisado às/)).toBeNull()
    expect(screen.queryByTestId('countdown-pill')).toBeNull()
    expect(screen.queryByTestId('home-undo-absence')).toBeNull()
  })

  it('reminder: warning Banner titled "E a volta?" without its own action', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getPendingReminder.mockResolvedValue(REMINDER)

    renderScreen()

    expect(await screen.findByText('E a volta?')).toBeTruthy()
    expect(
      screen.getByText('Você ainda não confirmou o retorno. Se não vai voltar, avise o motorista.'),
    ).toBeTruthy()
    expect(screen.queryByTestId('home-reminder-action')).toBeNull()
  })

  it('undo brings the footer back', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.getMyStatus.mockResolvedValue(STATUS_ABSENT)
    mockBoarding.cancelAbsence.mockResolvedValue(CANCELLATION)

    renderScreen()

    fireEvent.press(await screen.findByTestId('home-undo-absence'))

    expect(await screen.findByTestId('home-not-returning')).toBeTruthy()
    expect(mockBoarding.cancelAbsence).toHaveBeenCalledTimes(1)
  })

  it('the footer is an impact action: selection haptic on native', async () => {
    Platform.OS = 'android'
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)

    renderScreen()

    const footer = await screen.findByTestId('home-not-returning')
    await waitFor(() => expect(footer).not.toBeDisabled())
    fireEvent.press(footer)

    expect(Haptics.selectionAsync).toHaveBeenCalled()
  })

  it('notify success plays the success haptic on native', async () => {
    Platform.OS = 'android'
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success)
  })

  it('no success haptic on web', async () => {
    Platform.OS = 'web'
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByTestId('trip-status-card-title-registered')).toBeTruthy()
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
