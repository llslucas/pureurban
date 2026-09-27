import { fireEvent, screen } from '@testing-library/react-native'
import React, { type ReactNode } from 'react'

import type { NativeStackNavigationOptions } from '@react-navigation/native-stack'

import { renderUi } from '@/components/ui/test-utils'
import { useOfflineSync } from '@/hooks/use-offline-sync'
import { useAppHeaderOptions } from '@/lib/app-header'
import { darkTheme, lightTheme } from '@/lib/theme'
import { useAuthStore } from '@/stores/auth.store'
import AdminLayout from '@/app/(admin)/_layout'
import DriverLayout from '@/app/(driver)/_layout'
import StudentLayout from '@/app/(student)/_layout'

type ScreenOptions = NativeStackNavigationOptions & { headerRight?: () => ReactNode }

const mockScreenOptions: ScreenOptions[] = []

// The Stack stub records `screenOptions` and renders only the header's right
// slot, so these tests pin the layout → header wiring without a navigator.
jest.mock('expo-router', () => {
  function Stack({ screenOptions }: { screenOptions?: ScreenOptions }) {
    if (screenOptions) mockScreenOptions.push(screenOptions)
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
  mockScreenOptions.length = 0
  mockOfflineSync.mockReturnValue({ pendingCount: 0, failedCount: 0, dismissFailed: jest.fn() })
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

describe('group layouts — shared AppHeader options (R7a)', () => {
  let expected: NativeStackNavigationOptions | undefined

  function HeaderOptionsProbe() {
    expected = useAppHeaderOptions()
    return null
  }

  const lastScreenOptions = () => mockScreenOptions.at(-1)

  it.each([
    ['claro', lightTheme],
    ['escuro', darkTheme],
  ] as const)('%s: driver, student and admin apply the same useAppHeaderOptions()', async (_, theme) => {
    await renderUi(<HeaderOptionsProbe />, theme)
    const headerKeys = Object.keys(expected!).sort()

    for (const Layout of [DriverLayout, StudentLayout, AdminLayout]) {
      await renderUi(<Layout />, theme)
      const options = lastScreenOptions()!
      const { headerRight: _headerRight, ...shared } = options
      expect(Object.keys(shared).sort()).toEqual(headerKeys)
      expect(shared).toEqual(expected)
    }
  })

  it('driver and student add the account menu; admin has no headerRight', async () => {
    await renderUi(<DriverLayout />)
    expect(lastScreenOptions()?.headerRight).toEqual(expect.any(Function))
    await renderUi(<StudentLayout />)
    expect(lastScreenOptions()?.headerRight).toEqual(expect.any(Function))
    await renderUi(<AdminLayout />)
    expect(lastScreenOptions()).not.toHaveProperty('headerRight')
    expect(screen.queryByLabelText('Mais opções')).toBeNull()
  })
})
