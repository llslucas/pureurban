import { focusManager } from '@tanstack/react-query'
import { AppState, Platform, type AppStateStatus } from 'react-native'

import { setupAppFocus } from '@/lib/app-focus'

type Listener = (status: AppStateStatus) => void

describe('setupAppFocus', () => {
  let listener: Listener | undefined
  const remove = jest.fn()

  beforeEach(() => {
    listener = undefined
    remove.mockClear()
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, handler) => {
        listener = handler as Listener
        return { remove }
      })
    // jest-expo already ships AppState.addEventListener as a jest.fn, so the
    // spy is that same mock and keeps call history across tests.
    jest.mocked(AppState.addEventListener).mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    // Back to the default detection so other suites are not affected.
    focusManager.setFocused(undefined)
  })

  it('mirrors AppState into the focusManager: background pauses, active resumes', () => {
    const unsubscribe = setupAppFocus()

    listener!('background')
    expect(focusManager.isFocused()).toBe(false)

    listener!('active')
    expect(focusManager.isFocused()).toBe(true)

    listener!('inactive')
    expect(focusManager.isFocused()).toBe(false)

    unsubscribe()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('refetches stale queries when the app comes back to the foreground', () => {
    const onFocus = jest.fn()
    const unsubscribeFocus = focusManager.subscribe(onFocus)
    setupAppFocus()

    listener!('background')
    listener!('active')

    expect(onFocus).toHaveBeenLastCalledWith(true)
    unsubscribeFocus()
  })

  it('on web leaves the TanStack default alone', () => {
    jest.replaceProperty(Platform, 'OS', 'web')

    const unsubscribe = setupAppFocus()

    expect(AppState.addEventListener).not.toHaveBeenCalled()
    expect(() => unsubscribe()).not.toThrow()
  })
})
