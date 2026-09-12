import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Subscriber } from 'rxjs';

import { RedisService } from '../../shared/shell/infra/redis.service.js';
import { TrackingEventsService } from './tracking-events.service.js';
import { trackingChannel } from './adapters/redis-location-bus.adapter.js';
import type { DomainEvent } from '../../shared/core/events/index.js';

// Fake Redis: grava publishes por canal e guarda o subscriber duplicado para o
// teste entregar mensagens na mão — sem Redis real e sem rede, a suíte roda em
// ms (mesma técnica do boarding-events.service.spec).
class FakeSubscriber {
  private messageHandler: ((channel: string, message: string) => void) | null =
    null;

  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];

  on(event: string, handler: (channel: string, message: string) => void) {
    if (event === 'message') this.messageHandler = handler;
  }

  subscribe(channel: string): Promise<number> {
    this.subscribed.push(channel);
    return Promise.resolve(1);
  }

  unsubscribe(channel: string): Promise<number> {
    this.unsubscribed.push(channel);
    return Promise.resolve(1);
  }

  disconnect(): void {}

  deliver(channel: string, message: string): void {
    this.messageHandler?.(channel, message);
  }
}

class FakeRedis {
  readonly subscriber = new FakeSubscriber();
  readonly published = new Map<string, string[]>();

  publish(channel: string, message: string): Promise<number> {
    const list = this.published.get(channel) ?? [];
    list.push(message);
    this.published.set(channel, list);
    return Promise.resolve(1);
  }

  duplicate(): FakeSubscriber {
    return this.subscriber;
  }

  publishedTo(channel: string): string[] {
    return this.published.get(channel) ?? [];
  }
}

const TRIP_ID = 'c5819ec5-6e0a-4b0a-9c1d-9c96f65a1d33';

const makeEvent = (
  type: string,
  data: Record<string, unknown>,
): DomainEvent => ({
  type,
  data,
  occurredAt: '2026-09-12T12:00:00.000Z',
});

const collect = (): {
  messages: unknown[];
  completed: Promise<void>;
  observer: never;
} => {
  const messages: unknown[] = [];
  let complete!: () => void;
  const completed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const observer = {
    next: (value: unknown) => messages.push(value),
    error: () => {},
    complete: () => complete(),
  };
  return { messages, completed, observer: observer as never };
};

describe('TrackingEventsService — sentinela de fim de viagem (EventEmitter2)', () => {
  let fake: FakeRedis;
  let module: TestingModule;
  let app: INestApplication;

  beforeEach(async () => {
    fake = new FakeRedis();
    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: false })],
      providers: [
        TrackingEventsService,
        { provide: RedisService, useValue: fake },
      ],
    }).compile();
    // O loader de @OnEvent roda no init da aplicação, não no compile().
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('trip.ended publica o sinal terminal interno no canal da viagem', () => {
    const emitter = module.get(EventEmitter2);

    emitter.emit(
      'trip.ended',
      makeEvent('trip.ended', {
        tripId: TRIP_ID,
        routeId: 'r1',
        driverId: 'd1',
      }),
    );

    const messages = fake.publishedTo(trackingChannel(TRIP_ID));
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({ type: '__trip_ended__' });
  });

  it('trip.ended sem tripId é descartado sem publicar', () => {
    const emitter = module.get(EventEmitter2);

    emitter.emit('trip.ended', makeEvent('trip.ended', { routeId: 'r1' }));

    expect(fake.published.size).toBe(0);
  });
});

describe('TrackingEventsService — stream com subscribe refcount', () => {
  let fake: FakeRedis;
  let service: TrackingEventsService;

  beforeEach(() => {
    fake = new FakeRedis();
    service = new TrackingEventsService(fake as unknown as RedisService);
  });

  it('entrega a posição do Redis como MessageEvent com data JSON stringificado', () => {
    const { messages, observer } = collect();
    service.stream(TRIP_ID).subscribe(observer);

    fake.subscriber.deliver(
      trackingChannel(TRIP_ID),
      JSON.stringify({
        type: 'location.updated',
        data: {
          tripId: TRIP_ID,
          latitude: -20.755549,
          longitude: -42.881728,
          accuracy: 12.5,
          timestamp: '2026-09-12T12:00:00.150Z',
        },
      }),
    );

    expect(messages).toEqual([
      {
        type: 'location.updated',
        data: JSON.stringify({
          tripId: TRIP_ID,
          latitude: -20.755549,
          longitude: -42.881728,
          accuracy: 12.5,
          timestamp: '2026-09-12T12:00:00.150Z',
        }),
      },
    ]);
  });

  it('2+ alunos da mesma viagem compartilham UM subscribe Redis; o último unsubscribe desinscreve', () => {
    const first = collect();
    const second = collect();
    const subs: Subscriber<MessageEvent>[] = [];
    subs.push(
      service
        .stream(TRIP_ID)
        .subscribe(first.observer) as Subscriber<MessageEvent>,
    );
    subs.push(
      service
        .stream(TRIP_ID)
        .subscribe(second.observer) as Subscriber<MessageEvent>,
    );

    // Um único subscribe no Redis, apesar de duas conexões.
    expect(fake.subscriber.subscribed).toEqual([trackingChannel(TRIP_ID)]);

    fake.subscriber.deliver(
      trackingChannel(TRIP_ID),
      JSON.stringify({
        type: 'location.updated',
        data: { tripId: TRIP_ID, latitude: 1, longitude: 2, timestamp: 't' },
      }),
    );
    expect(first.messages).toHaveLength(1);
    expect(second.messages).toHaveLength(1);

    // Um aluno sai: o subscribe fica. O último sai: desinscreve.
    subs[0].unsubscribe();
    expect(fake.subscriber.unsubscribed).toEqual([]);
    subs[1].unsubscribe();
    expect(fake.subscriber.unsubscribed).toEqual([trackingChannel(TRIP_ID)]);
  });

  it('viagens distintas têm canais distintos, cada um com seu subscribe', () => {
    const otherTrip = 'd5819ec5-6e0a-4b0a-9c1d-9c96f65a1d44';
    service.stream(TRIP_ID).subscribe(collect().observer);
    service.stream(otherTrip).subscribe(collect().observer);

    expect(fake.subscriber.subscribed).toEqual([
      trackingChannel(TRIP_ID),
      trackingChannel(otherTrip),
    ]);
  });

  it('mensagem malformada num canal ATIVO é descartada sem derrubar o stream', () => {
    const { messages, observer } = collect();
    service.stream(TRIP_ID).subscribe(observer);

    expect(() =>
      fake.subscriber.deliver(trackingChannel(TRIP_ID), '{not json'),
    ).not.toThrow();
    expect(messages).toEqual([]);

    // O canal segue vivo: a mensagem válida seguinte é entregue normalmente.
    fake.subscriber.deliver(
      trackingChannel(TRIP_ID),
      JSON.stringify({
        type: 'location.updated',
        data: { tripId: TRIP_ID, latitude: 1, longitude: 2, timestamp: 't' },
      }),
    );
    expect(messages).toHaveLength(1);
  });

  it('sinal terminal completa o stream, desinscreve o canal e limpa a entrada', async () => {
    const first = collect();
    const second = collect();
    const subs = [
      service
        .stream(TRIP_ID)
        .subscribe(first.observer) as Subscriber<MessageEvent>,
      service
        .stream(TRIP_ID)
        .subscribe(second.observer) as Subscriber<MessageEvent>,
    ];

    fake.subscriber.deliver(
      trackingChannel(TRIP_ID),
      JSON.stringify({ type: '__trip_ended__' }),
    );

    await Promise.all([first.completed, second.completed]);
    expect(fake.subscriber.unsubscribed).toEqual([trackingChannel(TRIP_ID)]);

    // O teardown de cada cliente roda após o complete — sem desinscrever em
    // duplicidade nem recriar a entrada morta.
    for (const sub of subs) sub.unsubscribe();
    expect(fake.subscriber.unsubscribed).toEqual([trackingChannel(TRIP_ID)]);
  });

  it('heartbeat a cada 30s como MessageEvent ping (fake timers)', () => {
    vi.useFakeTimers();
    try {
      const { messages, observer } = collect();
      service.stream(TRIP_ID).subscribe(observer);

      vi.advanceTimersByTime(30_000);
      vi.advanceTimersByTime(30_000);

      expect(messages).toEqual([
        { type: 'ping', data: '' },
        { type: 'ping', data: '' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('heartbeat é por conexão: unsubscribe encerra o intervalo do cliente', () => {
    vi.useFakeTimers();
    try {
      const { messages, observer } = collect();
      const sub = service
        .stream(TRIP_ID)
        .subscribe(observer) as Subscriber<MessageEvent>;

      sub.unsubscribe();
      vi.advanceTimersByTime(120_000);

      expect(messages).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
