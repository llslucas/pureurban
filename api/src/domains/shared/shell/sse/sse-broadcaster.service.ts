import { Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, interval } from 'rxjs';
import type { Redis } from 'ioredis';
import { RedisService } from '../infra/redis.service.js';

// The ONE implementation of the SSE delivery machinery (wrap-4): ref-counted
// channel map over a dedicated Redis subscriber, 30s heartbeat per connection,
// terminal sentinel and the defensive handleMessage (parse catch + non-object
// type guard). DO NOT copy this block into a domain service — compose it:
// `new SseBroadcaster(redis, <ContextName>)` and declare only the domain's
// channel names and which domain events reach them. The first copy born after
// this file is a regression of epic-5-retro-item-19 (R9).

// Internal terminal signal — never part of any published contract (only the
// domain's own event types travel as `event:`). The trip.ended listener
// publishes it, the stream completes, Nest does response.end() and the client
// enters the reconnect → 409-from-guard flow that ends it for good.
const TRIP_ENDED_SIGNAL = '__trip_ended__';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ChannelEntry {
  subject: Subject<MessageEvent>;
  refs: number;
}

// Not an @Injectable singleton on purpose: each domain service owns its own
// instance, preserving the one dedicated subscriber connection and channel map
// per domain (exactly the shape the extracted copies had).
export class SseBroadcaster {
  private readonly logger: Logger;

  // Dedicated connection for subscribe mode: an ioredis client in subscribe
  // only accepts pub/sub commands — publishing through it is a protocol error.
  private readonly subscriber: Redis;

  private readonly redis: RedisService;

  private readonly channels = new Map<string, ChannelEntry>();

  constructor(redis: RedisService, context: string) {
    this.redis = redis;
    this.logger = new Logger(context);
    this.subscriber = redis.duplicate();
    this.subscriber.on('message', (channel, message) =>
      this.handleMessage(channel, message),
    );
  }

  // Terminal signal publisher for the domain's trip.ended listener. Kept on
  // the main (non-subscriber) client: publishing on the subscriber would be a
  // protocol error.
  publishTripEnded(channel: string): void {
    this.redis
      .publish(channel, JSON.stringify({ type: TRIP_ENDED_SIGNAL }))
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to publish terminal signal for channel ${channel}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  stream(channel: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const existing = this.channels.get(channel);
      const entry: ChannelEntry = existing ?? {
        subject: new Subject<MessageEvent>(),
        refs: 0,
      };
      if (!existing) {
        this.channels.set(channel, entry);
        this.subscriber.subscribe(channel).catch((error: unknown) => {
          this.logger.error(
            `Failed to subscribe to ${channel}`,
            error instanceof Error ? error.stack : String(error),
          );
        });
      }
      entry.refs += 1;

      const heartbeat = interval(HEARTBEAT_INTERVAL_MS).subscribe(() => {
        subscriber.next({ type: 'ping', data: '' });
      });

      const subscription = entry.subject.subscribe({
        next: (message) => subscriber.next(message),
        complete: () => {
          heartbeat.unsubscribe();
          subscriber.complete();
        },
        error: (error: unknown) => subscriber.error(error),
      });

      // Teardown runs both on client unsubscribe and when the subject
      // completes (rxjs tears the chain down after complete/error).
      return () => {
        heartbeat.unsubscribe();
        subscription.unsubscribe();
        entry.refs -= 1;
        // Identity check avoids tearing down a channel the terminal signal
        // already cleaned — or that another stream has already recreated.
        if (entry.refs <= 0 && this.channels.get(channel) === entry) {
          this.channels.delete(channel);
          this.subscriber.unsubscribe(channel).catch((error: unknown) => {
            this.logger.error(
              `Failed to unsubscribe from ${channel}`,
              error instanceof Error ? error.stack : String(error),
            );
          });
        }
      };
    });
  }

  dispose(): void {
    this.subscriber.disconnect();
  }

  private handleMessage(channel: string, message: string): void {
    const entry = this.channels.get(channel);
    if (!entry) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      // Syntactically broken JSON on an active channel must not take the
      // process down (uncaught exception in the ioredis 'message' listener).
      this.logger.warn(`Malformed message on ${channel} — dropped`);
      return;
    }

    // JSON.parse of null/array/string does NOT throw: without this guard the
    // `parsed.type` access explodes inside the ioredis listener — the same
    // failure mode as the catch above, in a shape it does not cover.
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { type?: unknown }).type !== 'string'
    ) {
      this.logger.warn(`Non-object message on ${channel} — dropped`);
      return;
    }
    const envelope = parsed as { type: string; data?: unknown };

    if (envelope.type === TRIP_ENDED_SIGNAL) {
      // Out of the map BEFORE complete: no new message enters a subject that
      // is being shut down.
      this.channels.delete(channel);
      this.subscriber.unsubscribe(channel).catch((error: unknown) => {
        this.logger.error(
          `Failed to unsubscribe from ${channel}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
      entry.subject.complete();
      return;
    }

    // The envelope crosses Redis as text and leaves the stream verbatim — the
    // `data:` line is exactly the domain's published DTO. Unexpected types on
    // the channel (foreign pings, future events) follow the same path: what
    // filters the contract is the channel subscription, not a whitelist.
    entry.subject.next({
      type: envelope.type,
      data: JSON.stringify(envelope.data),
    });
  }
}
