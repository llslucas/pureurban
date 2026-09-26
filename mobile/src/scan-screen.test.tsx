import React from 'react'
import { Linking } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useCameraPermissions } from 'expo-camera'

import ScanScreen from '@/app/(driver)/scan'
import { tripService, type Trip } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'

// Lives at src/ root, not src/app/ (Expo Router would bundle it as a route).
// Covers only the states rendered before the camera mounts — the StateView call
// sites. The camera itself (QrScanner) is stubbed out; its native stack does not
// load under jest-expo.

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

jest.mock('@/components/qr-scanner', () => ({ QrScanner: () => null }))

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
