import { render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import RootLayout from '@/app/_layout'
import { darkPalette, lightPalette } from '@/lib/palette'

const mockUseFonts = jest.fn<[boolean, Error | null], []>()
const mockColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light')

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}))

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
  const { useTheme: usePaperTheme } = jest.requireActual('react-native-paper')
  function Probe() {
    const { colors } = useNavTheme()
    const paper = usePaperTheme()
    const { darkPalette, lightPalette } = jest.requireActual('@/lib/palette')
    const scheme = paper.custom?.palette === darkPalette ? 'dark' : paper.custom?.palette === lightPalette ? 'light' : 'none'
    return (
      <>
        <RNText testID="nav-probe">{`${colors.background}|${colors.card}`}</RNText>
        <RNText testID="paper-probe">{scheme}</RNText>
      </>
    )
  }
  const Stack = Object.assign(() => <Probe />, {
    Protected: () => null,
    Screen: () => null,
  })
  return { Stack }
})

describe('RootLayout — font boot gate and navigation theme', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    mockColorScheme.mockReturnValue('light')
  })

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

  it.each([
    ['light', lightPalette],
    ['dark', darkPalette],
    [null, lightPalette],
  ] as const)('OS scheme %s picks the matching navigation and Paper themes', async (scheme, palette) => {
    mockUseFonts.mockReturnValue([true, null])
    mockColorScheme.mockReturnValue(scheme)
    render(<RootLayout />)
    const probe = await screen.findByTestId('nav-probe')
    expect(probe).toHaveTextContent(`${palette.surfaceSoft}|${palette.canvas}`)
    expect(screen.getByTestId('paper-probe')).toHaveTextContent(palette === darkPalette ? 'dark' : 'light')
  })
})
