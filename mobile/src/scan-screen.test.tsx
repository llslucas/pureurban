import React from 'react'
import { Linking } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useCameraPermissions } from 'expo-camera'
import { ActivityIndicator } from 'react-native-paper'

import ScanScreen from '@/app/(driver)/scan'
import { ApiClientError } from '@/services/api-error'
import { boardingService } from '@/services/boarding.service'
import { tripService, type Trip, type TripStudents } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'

// Lives at src/ root, not src/app/ (Expo Router would bundle it as a route).
// The camera itself (QrScanner) is stubbed out — its native stack does not load
// under jest-expo — and the stub hands `onScan` to the tests to inject QR reads.

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react')
  return {
    router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  }
})

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}))

jest.mock('expo-camera', () => ({ useCameraPermissions: jest.fn() }))

let mockOnScan: ((raw: string) => void) | undefined

jest.mock('@/components/qr-scanner', () => ({
  QrScanner: ({ onScan }: { onScan: (raw: string) => void }) => {
    mockOnScan = onScan
    return null
  },
}))

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
}))

let mockUuid = 0
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockUuid}` }))

jest.mock('@/utils/offline-queue', () => ({
  ...jest.requireActual('@/utils/offline-queue'),
  enqueueCheckIn: jest.fn(async () => ({ kind: 'queued' })),
}))

jest.mock('@/hooks/use-offline-sync', () => ({ notifyQueueChanged: jest.fn() }))

jest.mock('@/lib/offline-queue-storage', () => ({ sqliteQueueStorage: {} }))

jest.mock('@/services/api-client', () => ({
  ...jest.requireActual('@/services/api-error'),
  refreshAccessToken: jest.fn(async () => false),
}))

jest.mock('@/services/boarding.service', () => ({
  boardingService: { checkIn: jest.fn(), getMyStatus: jest.fn() },
}))

jest.mock('@/services/trip.service', () => ({
  tripService: {
    getActiveTrip: jest.fn(),
    startTrip: jest.fn(),
    endTrip: jest.fn(),
    getTripStudents: jest.fn(),
  },
}))

jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }))

const mockTrip = jest.mocked(tripService)
const mockAuthStore = jest.mocked(useAuthStore)
const mockPermissions = jest.mocked(useCameraPermissions)
const mockRouter = jest.mocked(router)
const mockBoarding = jest.mocked(boardingService)
const mockNotification = jest.mocked(Haptics.notificationAsync)
const mockImpact = jest.mocked(Haptics.impactAsync)

const DRIVER = { id: 'driver-1', email: 'joao@escola.com', name: 'João', role: 'DRIVER' as const }
const STUDENT = { id: 'student-1', email: 'ana@escola.com', name: 'Ana', role: 'STUDENT' as const }

const ACTIVE_TRIP: Trip = {
  id: 'trip-1',
  companyId: 'company-1',
  routeId: 'route-1',
  driverId: DRIVER.id,
  type: 'OUTBOUND',
  status: 'ACTIVE',
  startedAt: '2026-09-07T18:00:00.000Z',
  endedAt: null,
  relatedTripId: null,
}

const ANA_ID = '550e8400-e29b-41d4-a716-446655440001'
const BRUNO_ID = '550e8400-e29b-41d4-a716-446655440002'
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440003'

function qrOf(studentId: string): string {
  return JSON.stringify({ studentId, sessionId: SESSION_ID })
}

function rosterWith(boarded: number, anaStatus: 'CHECKED_IN' | 'NOT_CHECKED_IN'): TripStudents {
  return {
    students: [
      {
        studentId: ANA_ID,
        name: 'Ana Souza',
        status: anaStatus,
        checkedInAt: anaStatus === 'CHECKED_IN' ? '2026-09-07T18:04:00.000Z' : null,
      },
    ],
    summary: { boarded, total: 38 },
  }
}

const requestPermission = jest.fn()
const logout = jest.fn()
let queryClient: QueryClient

function mockUser(user: typeof DRIVER | typeof STUDENT | null) {
  mockAuthStore.mockReturnValue({ user, logout } as unknown as ReturnType<typeof useAuthStore>)
}

function mockPermission(permission: { granted: boolean; canAskAgain: boolean } | null) {
  mockPermissions.mockReturnValue([
    permission,
    requestPermission,
    jest.fn(async () => permission),
  ] as unknown as ReturnType<typeof useCameraPermissions>)
}

// The StateView icon loads its font asynchronously; flushing keeps that update
// inside act().
async function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity, networkMode: 'always' } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ScanScreen />
    </QueryClientProvider>,
  )
  await act(async () => {})
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser(DRIVER)
  mockPermission({ granted: true, canAskAgain: true })
  mockTrip.getActiveTrip.mockResolvedValue(ACTIVE_TRIP)
  mockTrip.getTripStudents.mockResolvedValue(rosterWith(11, 'NOT_CHECKED_IN'))
  mockOnScan = undefined
})

afterEach(() => {
  queryClient.clear()
  jest.restoreAllMocks()
})

describe('ScanScreen — states before the camera', () => {
  it('role guard: "Entrar novamente" logs out before replacing the route', async () => {
    mockUser(STUDENT)
    const calls: string[] = []
    logout.mockImplementation(() => calls.push('logout'))
    mockRouter.replace.mockImplementation(() => {
      calls.push('replace')
    })
    await renderScreen()
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
    fireEvent.press(screen.getByText('Entrar novamente'))
    expect(calls).toEqual(['logout', 'replace'])
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login')
  })

  it('permission still resolving: scan skeleton named "Preparando câmera...", no spinner (story 6.11)', async () => {
    mockPermission(null)
    await renderScreen()
    expect(screen.getByLabelText('Preparando câmera...').props.testID).toBe('scan-skeleton')
    expect(screen.queryByText('Preparando câmera...')).toBeNull()
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
  })

  it('trip pending: scan skeleton named "Carregando viagem...", no spinner (story 6.11)', async () => {
    mockTrip.getActiveTrip.mockReturnValue(new Promise<Trip | null>(() => {}))
    await renderScreen()
    expect(screen.getByLabelText('Carregando viagem...').props.testID).toBe('scan-skeleton')
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
  })

  it('a rejected permission request shows the note', async () => {
    mockPermission({ granted: false, canAskAgain: true })
    requestPermission.mockRejectedValue(new Error('boom'))
    await renderScreen()
    fireEvent.press(screen.getByText('Permitir acesso à câmera'))
    expect(
      await screen.findByText(
        'Não foi possível pedir a permissão. Libere a câmera nas configurações do sistema.',
      ),
    ).toBeTruthy()
  })

  it('blocked camera: the action opens the system settings', async () => {
    mockPermission({ granted: false, canAskAgain: false })
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    await renderScreen()
    expect(screen.getByText('Câmera bloqueada')).toBeTruthy()
    fireEvent.press(screen.getByText('Abrir configurações'))
    expect(openSettings).toHaveBeenCalledTimes(1)
  })

  it('"Nenhuma viagem ativa" → "Ir para Viagem" navigates to the trip tab', async () => {
    mockTrip.getActiveTrip.mockResolvedValue(null)
    await renderScreen()
    expect(await screen.findByText('Nenhuma viagem ativa')).toBeTruthy()
    fireEvent.press(screen.getByText('Ir para Viagem'))
    expect(mockRouter.navigate).toHaveBeenCalledWith('/(driver)/trip')
  })
})

async function scan(studentId: string) {
  await waitFor(() => expect(mockOnScan).toBeDefined())
  await act(async () => {
    mockOnScan!(qrOf(studentId))
  })
}

describe('ScanScreen — camera, HUD and result overlay', () => {
  it('success shows the student name from the cached roster and fires the Success haptic', async () => {
    mockBoarding.checkIn.mockResolvedValue({} as never)
    await renderScreen()
    await screen.findByText('11/38')
    await scan(ANA_ID)
    expect(await screen.findByText('Embarque confirmado')).toBeTruthy()
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.getByLabelText('Ana Souza embarcou')).toBeTruthy()
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success)
  })

  it('success for a student outside the roster: no name line', async () => {
    mockBoarding.checkIn.mockResolvedValue({} as never)
    await renderScreen()
    await screen.findByText('11/38')
    await scan(BRUNO_ID)
    expect(await screen.findByText('Embarque confirmado')).toBeTruthy()
    expect(screen.queryByText('Ana Souza')).toBeNull()
    expect(screen.getByLabelText('Embarque confirmado')).toBeTruthy()
  })

  it('HUD: trip count plus the optimistic check-in, never counted twice after the refetch', async () => {
    let resolveRefetch: (roster: TripStudents) => void = () => {}
    mockBoarding.checkIn.mockResolvedValue({} as never)
    await renderScreen()
    expect(await screen.findByText('11/38')).toBeTruthy()
    expect(screen.getByText('0 embarques nesta sessão')).toBeTruthy()

    mockTrip.getTripStudents.mockImplementation(
      () => new Promise<TripStudents>((resolve) => (resolveRefetch = resolve)),
    )
    await scan(ANA_ID)
    expect(await screen.findByText('12/38')).toBeTruthy()
    expect(screen.getByText('1 embarque nesta sessão')).toBeTruthy()

    await act(async () => resolveRefetch(rosterWith(12, 'CHECKED_IN')))
    expect(screen.getByText('12/38')).toBeTruthy()
    expect(screen.queryByText('13/38')).toBeNull()
  })

  it('HUD shows "—" when the roster cannot be loaded', async () => {
    mockTrip.getTripStudents.mockRejectedValue(new ApiClientError('TRIP_NOT_FOUND', 'x', 404))
    await renderScreen()
    await waitFor(() => expect(mockOnScan).toBeDefined())
    expect(await screen.findByText('—')).toBeTruthy()
  })

  it.each([
    ['Warning', 'Já embarcou', new ApiClientError('DUPLICATE_CHECK_IN', 'x', 409)],
    ['Error', 'Aluno não autorizado', new ApiClientError('STUDENT_NOT_ALLOWED', 'x', 403)],
  ] as const)('%s haptic for "%s"', async (type, title, error) => {
    mockBoarding.checkIn.mockRejectedValue(error)
    await renderScreen()
    await scan(ANA_ID)
    expect(await screen.findByText(title)).toBeTruthy()
    expect(mockNotification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType[type])
  })

  it('duplicate check-in shows the student name', async () => {
    mockBoarding.checkIn.mockRejectedValue(new ApiClientError('DUPLICATE_CHECK_IN', 'x', 409))
    await renderScreen()
    await screen.findByText('11/38')
    await scan(ANA_ID)
    expect(await screen.findByText('Já embarcou')).toBeTruthy()
    expect(screen.getByText('Ana Souza')).toBeTruthy()
  })

  it('queued offline: Light impact and the session line counts it', async () => {
    mockBoarding.checkIn.mockRejectedValue(new TypeError('Network request failed'))
    await renderScreen()
    await scan(ANA_ID)
    expect(await screen.findByText('Salvo — será sincronizado')).toBeTruthy()
    expect(mockImpact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light)
    expect(screen.getByText('1 embarque nesta sessão')).toBeTruthy()
  })

  it('a tap anywhere on the success overlay resumes scanning', async () => {
    mockBoarding.checkIn.mockResolvedValue({} as never)
    await renderScreen()
    await scan(ANA_ID)
    await screen.findByText('Embarque confirmado')
    fireEvent.press(screen.getByTestId('scan-overlay-dismiss'))
    expect(screen.queryByText('Embarque confirmado')).toBeNull()
  })

  it('a failure does not resume on a tap outside its buttons', async () => {
    mockBoarding.checkIn.mockRejectedValue(new ApiClientError('STUDENT_NOT_ALLOWED', 'x', 403))
    await renderScreen()
    await scan(ANA_ID)
    await screen.findByText('Aluno não autorizado')
    expect(screen.queryByTestId('scan-overlay-dismiss')).toBeNull()
    fireEvent.press(screen.getByText('Aluno não autorizado'))
    expect(screen.getByText('Aluno não autorizado')).toBeTruthy()
  })

  it('"Ver lista" navigates to the roster', async () => {
    await renderScreen()
    await waitFor(() => expect(mockOnScan).toBeDefined())
    fireEvent.press(screen.getByRole('button', { name: 'Ver lista' }))
    expect(mockRouter.navigate).toHaveBeenCalledWith('/(driver)/student-list')
  })
})
