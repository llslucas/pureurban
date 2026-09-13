import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { DomainEvent } from '../../../shared/core/events/index.js';
import { RedisService } from '../../../shared/shell/infra/redis.service.js';
import { SseBroadcaster } from '../../../shared/shell/sse/sse-broadcaster.service.js';

export const boardingChannel = (tripId: string): string =>
  `boarding:trip:${tripId}`;

@Injectable()
export class BoardingEventsService implements OnModuleDestroy {
  // Stream/heartbeat/sentinel machinery lives once in shared/shell/sse — this
  // service only declares the boarding channel and which domain events reach it.
  private readonly broadcaster: SseBroadcaster;

  private readonly logger = new Logger(BoardingEventsService.name);

  constructor(private readonly redis: RedisService) {
    this.broadcaster = new SseBroadcaster(redis, BoardingEventsService.name);
  }

  // Whitelist dos 3 tipos do contrato: boarding.checked_in e trip.started
  // permanecem internos ao backend — sem handler, nunca chegam ao canal.

  @OnEvent('boarding.not_returning')
  onNotReturning(event: DomainEvent): void {
    this.publish(event);
  }

  @OnEvent('boarding.absence_cancelled')
  onAbsenceCancelled(event: DomainEvent): void {
    this.publish(event);
  }

  @OnEvent('boarding.checkin_reminder')
  onCheckinReminder(event: DomainEvent): void {
    this.publish(event);
  }

  @OnEvent('trip.ended')
  onTripEnded(event: DomainEvent): void {
    const { tripId } = event.data as { tripId?: string };
    if (!tripId) {
      this.logger.warn(`trip.ended without tripId — no stream to close`);
      return;
    }
    this.broadcaster.publishTripEnded(boardingChannel(tripId));
  }

  stream(tripId: string): Observable<MessageEvent> {
    return this.broadcaster.stream(boardingChannel(tripId));
  }

  onModuleDestroy(): void {
    this.broadcaster.dispose();
  }

  private publish(event: DomainEvent): void {
    const { tripId } = event.data as { tripId?: string };
    if (!tripId) {
      this.logger.warn(`Event "${event.type}" without tripId — dropped`);
      return;
    }
    // O payload cruza o Redis como texto e sai no stream como a linha
    // `data:` JSON exatamente com o schema do contrato 4.0.
    this.redis
      .publish(
        boardingChannel(tripId),
        JSON.stringify({ type: event.type, data: event.data }),
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to publish "${event.type}" to ${boardingChannel(tripId)}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }
}
