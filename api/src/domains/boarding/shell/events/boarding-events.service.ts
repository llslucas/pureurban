import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject, interval } from 'rxjs';
import type { Redis } from 'ioredis';
import type { DomainEvent } from '../../../shared/core/events/index.js';
import { RedisService } from '../../../shared/shell/infra/redis.service.js';

// Sinal interno de fechamento — nunca parte do contrato 4.0 (só os 3 tipos de
// boarding.* trafegam como `event:`). O listener de trip.ended publica o
// sentinel e o stream completa: o Nest faz response.end() e o cliente entra no
// fluxo reconexão → 409 do guard → encerra definitivamente.
const TRIP_ENDED_SIGNAL = '__trip_ended__';

const HEARTBEAT_INTERVAL_MS = 30_000;

export const boardingChannel = (tripId: string): string =>
  `boarding:trip:${tripId}`;

interface ChannelEntry {
  subject: Subject<MessageEvent>;
  refs: number;
}

@Injectable()
export class BoardingEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(BoardingEventsService.name);

  // Conexão dedicada ao modo subscribe: um cliente ioredis em subscribe só
  // aceita comandos pub/sub — publicar por ela seria um erro de protocolo.
  private readonly subscriber: Redis;

  // Clientes da mesma viagem compartilham UM subscribe Redis: o contador de
  // referências sobe a cada conexão e o unsubscribe só acontece no último.
  private readonly channels = new Map<string, ChannelEntry>();

  constructor(private readonly redis: RedisService) {
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('message', (channel, message) =>
      this.handleMessage(channel, message),
    );
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
    this.redis
      .publish(
        boardingChannel(tripId),
        JSON.stringify({ type: TRIP_ENDED_SIGNAL }),
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to publish terminal signal for trip ${tripId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  stream(tripId: string): Observable<MessageEvent> {
    const channel = boardingChannel(tripId);
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

      // Teardown roda no unsubscribe do cliente E quando o subject completa
      // (rxjs desinscreve a cadeia após complete/error).
      return () => {
        heartbeat.unsubscribe();
        subscription.unsubscribe();
        entry.refs -= 1;
        // A checagem de identidade evita desfazer um canal que o sinal
        // terminal já limpou — ou que já foi recriado por outro stream.
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

  onModuleDestroy(): void {
    this.subscriber.disconnect();
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

  private handleMessage(channel: string, message: string): void {
    const entry = this.channels.get(channel);
    if (!entry) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      // JSON sintaticamente quebrado num canal ativo não pode derrubar o
      // processo (uncaught exception no listener 'message' do ioredis).
      this.logger.warn(`Malformed message on ${channel} — dropped`);
      return;
    }

    // JSON.parse de null/array/string NÃO lança: sem este guard, o acesso a
    // `parsed.type` explode dentro do listener do ioredis — o mesmo modo de
    // falha do catch acima, numa forma que ele não cobre.
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
      // Fora do mapa ANTES do complete: nenhuma mensagem nova entra num
      // subject em processo de encerramento.
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

    entry.subject.next({
      type: envelope.type,
      data: JSON.stringify(envelope.data),
    });
  }
}
