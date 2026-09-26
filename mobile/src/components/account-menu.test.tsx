import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'

import { AccountMenu } from '@/components/account-menu'
import { renderUi } from '@/components/ui/test-utils'
import { spacing } from '@/lib/tokens'
import { useAuthStore } from '@/stores/auth.store'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}))

jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }))

const mockRouter = jest.mocked(router)
const mockAuthStore = jest.mocked(useAuthStore)
const logout = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthStore.mockImplementation(((selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout })) as unknown as typeof useAuthStore)
})

// Paper puts the testID on the inner touchable; the size lives on its Surface.
function sizeOf(testID: string): { width?: unknown; height?: unknown } {
  let node: ReturnType<typeof screen.getByTestId> | null = screen.getByTestId(testID)
  while (node) {
    const style = StyleSheet.flatten(node.props.style) as { width?: unknown; height?: unknown }
    if (style?.width !== undefined) return style
    node = node.parent
  }
  return {}
}

async function openMenu() {
  fireEvent.press(screen.getByLabelText('Mais opções'))
  fireEvent.press(await screen.findByText('Sair'))
}

describe('AccountMenu', () => {
  it('exposes the overflow button with a 48dp target', async () => {
    await renderUi(<AccountMenu />)

    const style = sizeOf('account-menu-button')
    expect(style.width).toBe(spacing.touchMin)
    expect(style.height).toBe(spacing.touchMin)
    expect(screen.queryByText('Sair')).toBeNull()
  })

  it('logs out straight away when nothing is pending', async () => {
    await renderUi(<AccountMenu pendingCount={0} />)

    await openMenu()

    expect(screen.queryByTestId('logout-confirm-dialog')).toBeNull()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login')
    expect(logout.mock.invocationCallOrder[0]).toBeLessThan(
      mockRouter.replace.mock.invocationCallOrder[0],
    )
  })

  it('logs out straight away for the student (no queue)', async () => {
    await renderUi(<AccountMenu />)

    await openMenu()

    expect(logout).toHaveBeenCalledTimes(1)
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login')
  })

  it('warns about pending check-ins and only logs out on confirm', async () => {
    await renderUi(<AccountMenu pendingCount={2} />)

    await openMenu()

    expect(await screen.findByText('Sair da conta?')).toBeTruthy()
    expect(
      screen.getByText('2 embarques ainda não foram enviados e serão descartados.'),
    ).toBeTruthy()
    expect(logout).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('logout-confirm-dialog-confirm'))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login')
  })

  it('uses the singular message for one pending check-in', async () => {
    await renderUi(<AccountMenu pendingCount={1} />)

    await openMenu()

    expect(
      await screen.findByText('1 embarque ainda não foi enviado e será descartado.'),
    ).toBeTruthy()
  })

  it('keeps the session when the driver backs out of the dialog', async () => {
    await renderUi(<AccountMenu pendingCount={3} />)

    await openMenu()
    fireEvent.press(await screen.findByTestId('logout-confirm-dialog-cancel'))

    await waitFor(() => expect(screen.queryByText('Sair da conta?')).toBeNull(), { timeout: 5000 })
    expect(logout).not.toHaveBeenCalled()
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('keeps the count it warned about when the queue drains under the open dialog', async () => {
    function Harness() {
      const [count, setCount] = useState(2)
      return (
        <>
          <AccountMenu pendingCount={count} />
          <Pressable testID="drain" onPress={() => setCount(0)} />
        </>
      )
    }
    await renderUi(<Harness />)

    await openMenu()
    fireEvent.press(screen.getByTestId('drain'))

    expect(
      await screen.findByText('2 embarques ainda não foram enviados e serão descartados.'),
    ).toBeTruthy()
  })
})
