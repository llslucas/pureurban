import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject, interval } from 'rxjs';
import type { Redis } from 'ioredis';
import type { DomainEvent } from '../../shared/core/events/index.js';
import { RedisService } from '../../shared/shell/infra/redis.service.js';
import { trackingChannel } from './adapters/redis-location-bus.adapter.js';

// Sinal interno de fechamento — nunca parte do contrato 5.0 (só
// location.updated trafega como `event:`; pings não têm nome entregue). O
// listener de trip.ended publica o sentinel e o stream completa: o Nest faz
// response.end() e o cliente entra no fluxo reconexão → 409 do guard →
// encerra definitivamente.
const TRIP_ENDED_SIGNAL = '__trip_ended__';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ChannelEntry {
  subject: Subject<MessageEvent>;
  refs: number;
}

// Espelho do boarding-events.service (4.2): a posição é publicada no canal
// pelo RedisLocationBusAdapter dentro do ingest (5.1) — este serviço só
// consome o canal, adiciona o heartbeat e fecha o stream no fim da viagem.
@Injectable()
export class TrackingEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(TrackingEventsService.name);

  // Conexão dedicada ao modo subscribe: um cliente ioredis em subscribe só
  // aceita comandos pub/sub — publicar por ela seria um erro de protocolo.
  private readonly subscriber: Redis;

  // Alunos da mesma viagem compartilham UM subscribe Redis: o contador de
  // referências sobe a cada conexão e o unsubscribe só acontece no último.
  private readonly channels = new Map<string, ChannelEntry>();

  constructor(private readonly redis: RedisService) {
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('message', (channel, message) =>
      this.handleMessage(channel, message),
    );
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
        trackingChannel(tripId),
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
    const channel = trackingChannel(tripId);
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

  private handleMessage(channel: string, message: string): void {
    const entry = this.channels.get(channel);
    if (!entry) return;

    let parsed: { type: string; data?: unknown };
    try {
      parsed = JSON.parse(message) as { type: string; data?: unknown };
    } catch {
      // Mensagem malformada num canal ativo não pode derrubar o processo
      // (uncaught exception no listener 'message' do ioredis): descarta.
      this.logger.warn(`Malformed message on ${channel} — dropped`);
      return;
    }

    if (parsed.type === TRIP_ENDED_SIGNAL) {
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

    // O envelope cruza o Redis como texto e sai no stream verbatim — a linha
    // `data:` é exatamente o LocationUpdatedEventDto da 5.0. Tipos estranhos
    // no canal (pings alheios, eventos futuros) seguem o mesmo caminho: o
    // filtro do que é contrato é o subscribe deste canal, não um whitelist.
    entry.subject.next({
      type: parsed.type,
      data: JSON.stringify(parsed.data),
    });
  }
}
