import { isE2eScanHookEnabled, registerE2eScanHook } from './e2e-scan-hook'

const GLOBAL_KEY = '__E2E_INJECT_SCAN__' as const

type WithHook = typeof globalThis & { [GLOBAL_KEY]?: (raw: string) => void }

function readHook(): ((raw: string) => void) | undefined {
  return (globalThis as WithHook)[GLOBAL_KEY]
}

describe('registerE2eScanHook', () => {
  const originalEnv = process.env.EXPO_PUBLIC_E2E

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.EXPO_PUBLIC_E2E
    else process.env.EXPO_PUBLIC_E2E = originalEnv
    delete (globalThis as WithHook)[GLOBAL_KEY]
  })

  it('does not expose the backdoor when EXPO_PUBLIC_E2E is unset', () => {
    delete process.env.EXPO_PUBLIC_E2E

    const cleanup = registerE2eScanHook(() => () => {
      throw new Error('handler must never be reachable')
    })

    expect(isE2eScanHookEnabled()).toBe(false)
    expect(readHook()).toBeUndefined()
    // Cleanup is a safe no-op.
    expect(cleanup).not.toThrow()
  })

  it('does not expose the backdoor for a non-"1" value', () => {
    process.env.EXPO_PUBLIC_E2E = '0'

    registerE2eScanHook(() => () => undefined)

    expect(readHook()).toBeUndefined()
  })

  it('registers a function that forwards to the current handler when enabled', () => {
    process.env.EXPO_PUBLIC_E2E = '1'
    const handler = jest.fn()

    registerE2eScanHook(() => handler)

    const hook = readHook()
    expect(typeof hook).toBe('function')

    hook!('{"studentId":"s","sessionId":"x"}')
    expect(handler).toHaveBeenCalledWith('{"studentId":"s","sessionId":"x"}')
  })

  it('always reads the latest handler via getHandler', () => {
    process.env.EXPO_PUBLIC_E2E = '1'
    const first = jest.fn()
    const second = jest.fn()
    let current = first

    registerE2eScanHook(() => current)
    readHook()!('a')
    current = second
    readHook()!('b')

    expect(first).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledWith('a')
    expect(second).toHaveBeenCalledWith('b')
  })

  it('removes the backdoor on cleanup (unmount)', () => {
    process.env.EXPO_PUBLIC_E2E = '1'

    const cleanup = registerE2eScanHook(() => () => undefined)
    expect(readHook()).toBeDefined()

    cleanup()
    expect(readHook()).toBeUndefined()
  })
})
