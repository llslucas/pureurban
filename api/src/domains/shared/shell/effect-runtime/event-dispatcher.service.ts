import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type { ManagedRuntime, Effect } from 'effect'
import type { WithEvents } from '../../core/events/index.js'

@Injectable()
export class EffectEventDispatcher {
  private readonly logger = new Logger(EffectEventDispatcher.name)

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async runAndDispatch<A, E, R>(
    runtime: ManagedRuntime.ManagedRuntime<R, never>,
    program: Effect.Effect<WithEvents<A>, E, R>,
  ): Promise<A> {
    const [result, events] = await runtime.runPromise(program)
    const eventList = events ?? []
    for (const event of eventList) {
      try {
        this.eventEmitter.emit(event.type, event)
      } catch (error) {
        this.logger.error(
          `Failed to emit domain event "${event.type}"`,
          error instanceof Error ? error.stack : error,
        )
      }
    }
    return result
  }
}
