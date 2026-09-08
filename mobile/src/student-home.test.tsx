import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider as PaperProvider } from 'react-native-paper'

import StudentHomeScreen from '@/app/(student)/home'
import { ApiClientError } from '@/services/api-error'
import {
  boardingService,
  type CancelAbsenceResponse,
  type NotReturningResponse,
} from '@/services/boarding.service'
import { tripService, type Trip } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'

// Lives at src/ root, not src/app/: Expo Router turns every file under src/app/
// into a navigable route, so a test file there pollutes typedRoutes/_sitemap and
// throws on the module-scope jest.mock (same reason as trip-screen.test.tsx).
//
// The screen renders a Paper Dialog (Portal), which REQUIRES a PortalHost —
// hence the PaperProvider here, unlike trip-screen.test.tsx (that screen has no
// Portal). Default MD3 theme, same choice as student-card.test.tsx.

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
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
    <PaperProvider>
      <QueryClientProvider client={queryClient}>
        <StudentHomeScreen />
      </QueryClientProvider>
    </PaperProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser()
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
  return screen.findByText('Confirmar')
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

  it('fluxo em 2 toques: 1º abre o dialog, 2º (Confirmar) chama a API com tripId e key UUID', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    const button = await screen.findByText('Não vou voltar')
    await waitFor(() => expect(button).not.toBeDisabled())

    // Toque 1: só abre o dialog — nenhuma chamada ainda.
    fireEvent.press(button)
    expect(mockBoarding.notifyNotReturning).not.toHaveBeenCalled()

    // Toque 2: confirma.
    fireEvent.press(await screen.findByText('Confirmar'))

    await waitFor(() =>
      expect(mockBoarding.notifyNotReturning).toHaveBeenCalledWith(
        RETURN_TRIP.id,
        'generated-key-1',
      ),
    )
  })

  it('sucesso: mostra "Ausência registrada" com countdown do cancellableUntil e grava o cache', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue(ABSENCE)

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByText('Ausência registrada')).toBeTruthy()
    expect(
      screen.getByText('O motorista já foi avisado de que você não vai voltar.'),
    ).toBeTruthy()
    // Janela factual no formato m:ss alimentada pelo cancellableUntil do
    // servidor, com o "Cancelar" da 4.3 dentro dela.
    expect(screen.getByText(/Janela de cancelamento 1:\d{2}/)).toBeTruthy()
    expect(screen.getByText('Cancelar')).toBeTruthy()
    // Registro da ausência não esconde o embarque: o QR continua na tela.
    expect(screen.getByText('Meu QR Code')).toBeTruthy()
    expect(screen.queryByText('Não vou voltar')).toBeNull()

    await waitFor(() =>
      expect(queryClient.getQueryData(['studentAbsence', RETURN_TRIP.id])).toEqual(
        { registered: true, absence: ABSENCE },
      ),
    )
  })

  it('janela expirada: ausência apresentada como consolidada, sem countdown e sem botão Cancelar', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockResolvedValue({
      ...ABSENCE,
      cancellableUntil: new Date(Date.now() - 60 * 1000).toISOString(),
    })

    renderScreen()

    fireEvent.press(await openDialog())

    expect(await screen.findByText('Ausência registrada')).toBeTruthy()
    expect(screen.queryByText(/Janela de cancelamento/)).toBeNull()
    // Consolidada = o card fica, mas o caminho de volta (Cancelar) some com a janela.
    expect(screen.queryByText('Cancelar')).toBeNull()
    expect(mockBoarding.cancelAbsence).not.toHaveBeenCalled()
  })

  it('ALREADY_NOT_RETURNING: vira estado registrado, não erro', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
    mockBoarding.notifyNotReturning.mockRejectedValue(
      new ApiClientError(
        'ALREADY_NOT_RETURNING',
        'Ausência já registrada nesta viagem',
        409,
      ),
    )

    renderScreen()

    fireEvent.press(await openDialog())

    // Estado "registrado" SEM countdown — o servidor não devolveu a janela.
    expect(await screen.findByText('Ausência registrada')).toBeTruthy()
    expect(screen.queryByText(/Janela de cancelamento/)).toBeNull()

    await waitFor(() =>
      expect(queryClient.getQueryData(['studentAbsence', RETURN_TRIP.id])).toEqual(
        { registered: true, absence: null },
      ),
    )
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
    expect(screen.queryByText('Ausência registrada')).toBeNull()
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

  it('ausência reidratada do cache (reload) abre no estado registrado com countdown', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)

    renderScreen()

    // Hidratação equivalente à reidratação do MMKV pela persistência.
    queryClient.setQueryData(['studentAbsence', RETURN_TRIP.id], {
      registered: true,
      absence: ABSENCE,
    })

    expect(await screen.findByText('Ausência registrada')).toBeTruthy()
    expect(screen.getByText(/Janela de cancelamento 1:\d{2}/)).toBeTruthy()
    // O cancelamento volta a ficar disponível também na reidratação.
    expect(screen.getByText('Cancelar')).toBeTruthy()
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
    expect(await screen.findByText('Ausência registrada')).toBeTruthy()

    fireEvent.press(screen.getByText('Cancelar'))

    // O ramo normal É o estado confirmado: o aviso volta a ficar disponível.
    expect(await screen.findByText('Não vou voltar')).toBeTruthy()
    expect(screen.queryByText('Ausência registrada')).toBeNull()
    expect(mockBoarding.cancelAbsence).toHaveBeenCalledWith(
      RETURN_TRIP.id,
      'generated-key-1',
    )
    // Cache limpo: após removeQueries a query remontada refaz o fetch e
    // consolida em null — o valor "sem ausência" desta key (v5 não grava
    // undefined via setQueryData; ver onSuccess no home.tsx).
    await waitFor(() =>
      expect(
        queryClient.getQueryData(['studentAbsence', RETURN_TRIP.id]),
      ).toBeNull(),
    )
  })

  it('corrida com a expiração (409 CANCELLATION_PERIOD_EXPIRED): card consolida, mensagem orienta avisar o motorista, tela não trava', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(RETURN_TRIP)
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
    await screen.findByText('Ausência registrada')

    fireEvent.press(screen.getByText('Cancelar'))

    expect(
      await screen.findByText(
        'O tempo para cancelar pelo app passou. Avise o motorista pessoalmente.',
      ),
    ).toBeTruthy()
    // Consolidado: o card permanece, mas sem countdown e sem novo Cancelar.
    expect(screen.getByText('Ausência registrada')).toBeTruthy()
    expect(screen.queryByText(/Janela de cancelamento/)).toBeNull()
    expect(screen.queryByText('Cancelar')).toBeNull()
    await waitFor(() =>
      expect(
        queryClient.getQueryData(['studentAbsence', RETURN_TRIP.id]),
      ).toEqual({ registered: true, absence: null }),
    )
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
    await screen.findByText('Ausência registrada')

    fireEvent.press(screen.getByText('Cancelar'))

    expect(
      await screen.findByText('Não há registro de ausência para cancelar.'),
    ).toBeTruthy()
    expect(await screen.findByText('Não vou voltar')).toBeTruthy()
    await waitFor(() =>
      expect(
        queryClient.getQueryData(['studentAbsence', RETURN_TRIP.id]),
      ).toBeNull(),
    )
  })
})
