import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Subscriber } from 'rxjs';

import { RedisService } from '../../../shared/shell/infra/redis.service.js';
import {
  BoardingEventsService,
  boardingChannel,
} from './boarding-events.service.js';
import type { DomainEvent } from '../../../shared/core/events/index.js';

// Fake Redis: grava publishes por canal (map evento→canal auxiliar) e guarda o
// subscriber duplicado para o teste entregar mensagens na mão — sem Redis real
// e sem rede, a suíte roda em ms.
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

  channelsFor(type: string): string[] {
    const channels: string[] = [];
    for (const [channel, messages] of this.published) {
      if (
        messages.some((m) => (JSON.parse(m) as { type: string }).type === type)
      ) {
        channels.push(channel);
      }
    }
    return channels;
  }
}

const TRIP_ID = 'a5819ec5-6e0a-4b0a-9c1d-9c96f65a1d11';

const makeEvent = (
  type: string,
  data: Record<string, unknown>,
): DomainEvent => ({
  type,
  data,
  occurredAt: '2026-09-07T21:10:00.000Z',
});

const makeService = (fake: FakeRedis): BoardingEventsService =>
  new BoardingEventsService(fake as unknown as RedisService);

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

describe('BoardingEventsService — dispatch dos eventos de domínio (EventEmitter2)', () => {
  let fake: FakeRedis;
  let module: TestingModule;
  let app: INestApplication;

  beforeEach(async () => {
    fake = new FakeRedis();
    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: false })],
      providers: [
        BoardingEventsService,
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

  it('boarding.not_returning vai ao canal da viagem com o payload do contrato', () => {
    const emitter = module.get(EventEmitter2);
    const event = makeEvent('boarding.not_returning', {
      tripId: TRIP_ID,
      studentId: 'student-1',
      notifiedAt: '2026-09-07T21:10:00.000Z',
    });

    emitter.emit(event.type, event);

    const messages = fake.publishedTo(boardingChannel(TRIP_ID));
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({
      type: 'boarding.not_returning',
      data: {
        tripId: TRIP_ID,
        studentId: 'student-1',
        notifiedAt: '2026-09-07T21:10:00.000Z',
      },
    });
  });

  it('whitelist: boarding.checked_in e trip.started nunca chegam a nenhum canal', () => {
    const emitter = module.get(EventEmitter2);

    emitter.emit(
      'boarding.checked_in',
      makeEvent('boarding.checked_in', { tripId: TRIP_ID, studentId: 's1' }),
    );
    emitter.emit(
      'trip.started',
      makeEvent('trip.started', { tripId: TRIP_ID, routeId: 'r1' }),
    );

    expect(fake.published.size).toBe(0);
    expect(fake.channelsFor('boarding.checked_in')).toEqual([]);
    expect(fake.channelsFor('trip.started')).toEqual([]);
  });

  it('trip.ended publica o sinal terminal interno (não um evento de contrato)', () => {
    const emitter = module.get(EventEmitter2);

    emitter.emit(
      'trip.ended',
      makeEvent('trip.ended', {
        tripId: TRIP_ID,
        routeId: 'r1',
        driverId: 'd1',
      }),
    );

    const messages = fake.publishedTo(boardingChannel(TRIP_ID));
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({ type: '__trip_ended__' });
  });

  it('evento sem tripId no payload é descartado sem publicar', () => {
    const emitter = module.get(EventEmitter2);

    emitter.emit(
      'boarding.not_returning',
      makeEvent('boarding.not_returning', { studentId: 's1' }),
    );

    expect(fake.published.size).toBe(0);
  });
});

describe('BoardingEventsService — stream com subscribe refcount', () => {
  let fake: FakeRedis;
  let service: BoardingEventsService;

  beforeEach(() => {
    fake = new FakeRedis();
    service = makeService(fake);
  });

  it('entrega a mensagem do Redis como MessageEvent com data JSON stringificado', () => {
    const { messages, observer } = collect();
    service.stream(TRIP_ID).subscribe(observer);

    fake.subscriber.deliver(
      boardingChannel(TRIP_ID),
      JSON.stringify({
        type: 'boarding.not_returning',
        data: {
          tripId: TRIP_ID,
          studentId: 's1',
          notifiedAt: '2026-09-07T21:10:00.000Z',
        },
      }),
    );

    expect(messages).toEqual([
      {
        type: 'boarding.not_returning',
        data: JSON.stringify({
          tripId: TRIP_ID,
          studentId: 's1',
          notifiedAt: '2026-09-07T21:10:00.000Z',
        }),
      },
    ]);
  });

  it('2+ clientes da mesma viagem compartilham UM subscribe Redis e ambos recebem', () => {
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
    expect(fake.subscriber.subscribed).toEqual([boardingChannel(TRIP_ID)]);

    fake.subscriber.deliver(
      boardingChannel(TRIP_ID),
      JSON.stringify({
        type: 'boarding.absence_cancelled',
        data: {
          tripId: TRIP_ID,
          studentId: 's1',
          cancelledAt: '2026-09-07T21:11:00.000Z',
        },
      }),
    );

    expect(first.messages).toHaveLength(1);
    expect(second.messages).toHaveLength(1);

    // Um cliente sai: o subscribe fica. O último sai: desinscreve.
    subs[0].unsubscribe();
    expect(fake.subscriber.unsubscribed).toEqual([]);
    subs[1].unsubscribe();
    expect(fake.subscriber.unsubscribed).toEqual([boardingChannel(TRIP_ID)]);
  });

  it('viagens distintas têm canais distintos, cada um com seu subscribe', () => {
    const otherTrip = 'b5819ec5-6e0a-4b0a-9c1d-9c96f65a1d22';
    service.stream(TRIP_ID).subscribe(collect().observer);
    service.stream(otherTrip).subscribe(collect().observer);

    expect(fake.subscriber.subscribed).toEqual([
      boardingChannel(TRIP_ID),
      boardingChannel(otherTrip),
    ]);
  });

  it('mensagem de um canal sem inscritos não quebra o serviço', () => {
    expect(() =>
      fake.subscriber.deliver(
        boardingChannel(TRIP_ID),
        JSON.stringify({ type: 'x' }),
      ),
    ).not.toThrow();
  });

  it('mensagem malformada num canal ATIVO é descartada sem derrubar o stream', () => {
    const { messages, observer } = collect();
    service.stream(TRIP_ID).subscribe(observer);

    expect(() =>
      fake.subscriber.deliver(boardingChannel(TRIP_ID), '{not json'),
    ).not.toThrow();
    expect(messages).toEqual([]);

    // O canal segue vivo: a mensagem válida seguinte é entregue normalmente.
    fake.subscriber.deliver(
      boardingChannel(TRIP_ID),
      JSON.stringify({
        type: 'boarding.not_returning',
        data: { tripId: TRIP_ID, studentId: 's1', notifiedAt: 'x' },
      }),
    );
    expect(messages).toHaveLength(1);
  });

  it('mensagem JSON válida mas NÃO-objeto (R2) é descartada sem lançar — null, array, string e objeto sem type', () => {
    const { messages, observer } = collect();
    service.stream(TRIP_ID).subscribe(observer);

    // JSON.parse('null') NÃO lança — sem o guard de tipo, `parsed.type`
    // explode dentro do listener 'message' do ioredis e derruba o processo.
    for (const raw of ['null', '[1,2,3]', '"texto"', '{"data":{"x":1}}']) {
      expect(() =>
        fake.subscriber.deliver(boardingChannel(TRIP_ID), raw),
      ).not.toThrow();
    }
    expect(messages).toEqual([]);

    // O canal segue vivo após as mensagens rejeitadas.
    fake.subscriber.deliver(
      boardingChannel(TRIP_ID),
      JSON.stringify({
        type: 'boarding.not_returning',
        data: { tripId: TRIP_ID, studentId: 's1', notifiedAt: 'x' },
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
      boardingChannel(TRIP_ID),
      JSON.stringify({ type: '__trip_ended__' }),
    );

    await Promise.all([first.completed, second.completed]);
    expect(fake.subscriber.unsubscribed).toEqual([boardingChannel(TRIP_ID)]);

    // O teardown de cada cliente roda após o complete — sem desinscrever em
    // duplicidade nem recriar a entrada morta.
    for (const sub of subs) sub.unsubscribe();
    expect(fake.subscriber.unsubscribed).toEqual([boardingChannel(TRIP_ID)]);
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
