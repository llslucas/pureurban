import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'
import { EffectEventDispatcher } from './event-dispatcher.service.js'
import type { WithEvents } from '../../core/events/index.js'
import { noEvents, withEvents } from '../../core/events/index.js'
import type { DomainEvent } from '../../core/events/domain-event.interface.js'

// Minimal ManagedRuntime mock
function makeMockRuntime<R>(returnValue: unknown) {
  return {
    runPromise: vi.fn().mockResolvedValue(returnValue),
  } as any
}

describe('EffectEventDispatcher', () => {
  let emitter: { emit: ReturnType<typeof vi.fn> }
  let dispatcher: EffectEventDispatcher

  beforeEach(() => {
    emitter = { emit: vi.fn() }
    dispatcher = new EffectEventDispatcher(emitter as any)
  })

  it('should return the result value from the WithEvents tuple', async () => {
    const program = Effect.succeed(noEvents({ id: 1 })) as Effect.Effect<WithEvents<{ id: number }>, never, never>
    const runtime = makeMockRuntime(noEvents({ id: 1 }))

    const result = await dispatcher.runAndDispatch(runtime, program)

    expect(result).toEqual({ id: 1 })
  })

  it('should emit each domain event via EventEmitter2', async () => {
    const events: DomainEvent[] = [
      { type: 'user.created', data: { userId: '42' }, occurredAt: '2026-01-01T00:00:00Z' },
      { type: 'email.sent', data: { to: 'a@b.com' }, occurredAt: '2026-01-01T00:00:01Z' },
    ]
    const payload = withEvents('done', events)
    const program = Effect.succeed(payload) as Effect.Effect<WithEvents<string>, never, never>
    const runtime = makeMockRuntime(payload)

    await dispatcher.runAndDispatch(runtime, program)

    expect(emitter.emit).toHaveBeenCalledTimes(2)
    expect(emitter.emit).toHaveBeenCalledWith('user.created', events[0])
    expect(emitter.emit).toHaveBeenCalledWith('email.sent', events[1])
  })

  it('should NOT emit any events when noEvents is used', async () => {
    const payload = noEvents('result')
    const program = Effect.succeed(payload) as Effect.Effect<WithEvents<string>, never, never>
    const runtime = makeMockRuntime(payload)

    await dispatcher.runAndDispatch(runtime, program)

    expect(emitter.emit).not.toHaveBeenCalled()
  })
})
