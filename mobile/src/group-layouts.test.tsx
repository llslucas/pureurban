import { fireEvent, screen } from '@testing-library/react-native'
import React, { type ReactNode } from 'react'

import { renderUi } from '@/components/ui/test-utils'
import { useOfflineSync } from '@/hooks/use-offline-sync'
import { useAuthStore } from '@/stores/auth.store'
import DriverLayout from '@/app/(driver)/_layout'
import StudentLayout from '@/app/(student)/_layout'

// The Stack stub renders only the header's right slot, so these tests pin the
// layout → headerRight → AccountMenu wiring without a navigator.
jest.mock('expo-router', () => {
  function Stack({ screenOptions }: { screenOptions?: { headerRight?: () => ReactNode } }) {
    return <>{screenOptions?.headerRight?.()}</>
  }
  Stack.Screen = function Screen() {
    return null
  }
  return { Stack, router: { replace: jest.fn() } }
})

jest.mock('@/hooks/use-offline-sync', () => ({ useOfflineSync: jest.fn() }))
jest.mock('@/components/offline-banner', () => ({ OfflineBanner: () => null }))
jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }))

const mockOfflineSync = jest.mocked(useOfflineSync)
const mockAuthStore = jest.mocked(useAuthStore)
const logout = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthStore.mockImplementation(((selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout })) as unknown as typeof useAuthStore)
})

async function pressSair() {
  fireEvent.press(screen.getByLabelText('Mais opções'))
  fireEvent.press(await screen.findByText('Sair'))
}

describe('group layouts — header account menu', () => {
  it('driver: the queue count from useOfflineSync gates logout behind the warning', async () => {
    mockOfflineSync.mockReturnValue({ pendingCount: 2, failedCount: 0, dismissFailed: jest.fn() })
    await renderUi(<DriverLayout />)

    await pressSair()

    expect(
      await screen.findByText('2 embarques ainda não foram enviados e serão descartados.'),
    ).toBeTruthy()
    expect(logout).not.toHaveBeenCalled()
  })

  it('student: the header offers Sair and logs out directly', async () => {
    await renderUi(<StudentLayout />)

    await pressSair()

    expect(logout).toHaveBeenCalledTimes(1)
  })
})
