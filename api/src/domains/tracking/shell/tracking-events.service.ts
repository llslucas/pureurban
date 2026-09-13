import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { DomainEvent } from '../../shared/core/events/index.js';
import { RedisService } from '../../shared/shell/infra/redis.service.js';
import { SseBroadcaster } from '../../shared/shell/sse/sse-broadcaster.service.js';
import { trackingChannel } from './adapters/redis-location-bus.adapter.js';

// A posição é publicada no canal pelo RedisLocationBusAdapter dentro do ingest
// (5.1) — este serviço só consome o canal via broadcaster compartilhado e fecha
// o stream no fim da viagem (sentinela do trip.ended).
@Injectable()
export class TrackingEventsService implements OnModuleDestroy {
  private readonly broadcaster: SseBroadcaster;

  private readonly logger = new Logger(TrackingEventsService.name);

  constructor(redis: RedisService) {
    this.broadcaster = new SseBroadcaster(redis, TrackingEventsService.name);
  }

  @OnEvent('trip.ended')
  onTripEnded(event: DomainEvent): void {
    const { tripId } = event.data as { tripId?: string };
    if (!tripId) {
      this.logger.warn(`trip.ended without tripId — no stream to close`);
      return;
    }
    this.broadcaster.publishTripEnded(trackingChannel(tripId));
  }

  stream(tripId: string): Observable<MessageEvent> {
    return this.broadcaster.stream(trackingChannel(tripId));
  }

  onModuleDestroy(): void {
    this.broadcaster.dispose();
  }
}
