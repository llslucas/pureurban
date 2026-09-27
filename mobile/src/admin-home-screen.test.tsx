import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import AdminHome from '@/app/(admin)/home'
import { renderUi } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { useAuthStore } from '@/stores/auth.store'

// Lives at src/ root, not src/app/: every file under src/app/ becomes a route
// (same reason as trip-screen.test.tsx).

jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }))

const mockAuthStore = jest.mocked(useAuthStore)
const logout = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  const state = { logout }
  mockAuthStore.mockImplementation(((selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state) as never)
})

describe('AdminHome (story 6.13)', () => {
  it('brand band with the wordmark over the "Em breve" StateView', async () => {
    await renderUi(<AdminHome />)

    expect(StyleSheet.flatten(screen.getByTestId('admin-brand').props.style).backgroundColor).toBe(
      lightPalette.brand,
    )
    const wordmark = screen.getByText('PureUrban')
    expect(StyleSheet.flatten(wordmark.props.style).color).toBe(lightPalette.onBrand)
    expect(screen.getByTestId('admin-soon')).toBeTruthy()
    expect(screen.getByText('Em breve')).toBeTruthy()
    expect(screen.queryByText('Painel Administrativo')).toBeNull()
  })

  it('"Sair" logs out', async () => {
    await renderUi(<AdminHome />)

    fireEvent.press(screen.getByTestId('admin-soon-action'))

    expect(logout).toHaveBeenCalledTimes(1)
  })
})
