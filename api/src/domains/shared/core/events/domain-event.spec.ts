import { describe, it, expect } from 'vitest'
import type { DomainEvent } from './domain-event.interface.js'
import { noEvents, withEvents } from './with-events.js'

describe('DomainEvent', () => {
  it('should conform to DomainEvent interface shape', () => {
    const event: DomainEvent = {
      type: 'user.created',
      data: { userId: '123' },
      occurredAt: new Date().toISOString(),
    }
    expect(event.type).toBe('user.created')
    expect(event.data).toEqual({ userId: '123' })
    expect(typeof event.occurredAt).toBe('string')
  })
})

describe('WithEvents helpers', () => {
  it('noEvents should return result with empty events array', () => {
    const [result, events] = noEvents('hello')
    expect(result).toBe('hello')
    expect(events).toEqual([])
  })

  it('noEvents should work with object result', () => {
    const value = { id: 1, name: 'test' }
    const [result, events] = noEvents(value)
    expect(result).toEqual(value)
    expect(events).toHaveLength(0)
  })

  it('withEvents should return result with provided events', () => {
    const event: DomainEvent = {
      type: 'order.placed',
      data: { orderId: '456' },
      occurredAt: new Date().toISOString(),
    }
    const [result, events] = withEvents('order-result', [event])
    expect(result).toBe('order-result')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('order.placed')
  })

  it('withEvents should support multiple events', () => {
    const events: DomainEvent[] = [
      { type: 'a.happened', data: {}, occurredAt: '2026-01-01T00:00:00Z' },
      { type: 'b.happened', data: { x: 1 }, occurredAt: '2026-01-01T00:00:01Z' },
    ]
    const [, dispatched] = withEvents(42, events)
    expect(dispatched).toHaveLength(2)
    expect(dispatched[1].type).toBe('b.happened')
  })

  it('tuples returned are readonly (immutable typing)', () => {
    const result = noEvents(99)
    // TypeScript would enforce readonly at compile time; runtime check is the tuple structure
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]).toBe(99)
    expect(result[1]).toEqual([])
  })
})
