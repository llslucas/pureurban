import { render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import RootLayout from '@/app/_layout'
import { lightPalette } from '@/lib/palette'

const mockUseFonts = jest.fn<[boolean, Error | null], []>()

jest.mock('@expo-google-fonts/inter', () => ({
  useFonts: () => mockUseFonts(),
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}))

jest.mock('@/lib/database', () => ({
  initializeDatabase: jest.fn(() => Promise.resolve()),
}))

jest.mock('@/lib/mmkv-persister', () => ({
  mmkvPersister: {
    persistClient: jest.fn(),
    restoreClient: jest.fn(() => undefined),
    removeClient: jest.fn(),
  },
}))

jest.mock('@/lib/offline-queue-lifecycle', () => ({
  registerOfflineQueueLifecycle: jest.fn(() => () => {}),
}))

jest.mock('@/lib/app-focus', () => ({
  setupAppFocus: jest.fn(() => () => {}),
}))

jest.mock('@/mocks', () => ({
  MOCKS_ENABLED: false,
  enableMocking: jest.fn(() => Promise.resolve()),
}))

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ user: null, isAuthenticated: false }),
}))

// The probe stands in for the navigator and reports the theme it inherits.
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual('react-native')
  const { useTheme: useNavTheme } = jest.requireActual('@react-navigation/native')
  function Probe() {
    const { colors } = useNavTheme()
    return <RNText testID="nav-probe">{`${colors.background}|${colors.card}`}</RNText>
  }
  const Stack = Object.assign(() => <Probe />, {
    Protected: () => null,
    Screen: () => null,
  })
  return { Stack }
})

describe('RootLayout — font boot gate and navigation theme', () => {
  afterEach(() => jest.restoreAllMocks())

  it('keeps the spinner while fonts are loading', async () => {
    mockUseFonts.mockReturnValue([false, null])
    render(<RootLayout />)
    // Let the database gate settle so only the font gate can hold the boot.
    await waitFor(() => expect(jest.requireMock('@/lib/database').initializeDatabase).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTestId('nav-probe')).toBeNull()
  })

  it.each([
    ['fonts loaded', [true, null]],
    ['font load failed', [false, new Error('network')]],
  ] as [string, [boolean, Error | null]][])('opens the navigator when %s', async (_, fonts) => {
    mockUseFonts.mockReturnValue(fonts)
    jest.spyOn(console, 'error').mockImplementation(() => {})
    render(<RootLayout />)
    const probe = await screen.findByTestId('nav-probe')
    expect(probe).toHaveTextContent(`${lightPalette.surfaceSoft}|${lightPalette.canvas}`)
  })
})
