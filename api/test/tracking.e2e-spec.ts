import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/domains/shared/shell/infra/prisma.service.js';
import { RedisService } from '../src/domains/shared/shell/infra/redis.service.js';
import type { Redis } from 'ioredis';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

interface ApiResponse {
  data?: Record<string, unknown>;
  meta?: { timestamp: string };
  error?: { code: string; message: string };
}

interface StreamMessage {
  type: string;
  channel: string;
  data: Record<string, unknown>;
}

// Espera a primeira mensagem publicada num canal Redis (conexão dedicada de
// subscribe — um cliente em subscribe não aceita comandos comuns). No timeout
// o listener é removido: sem isso ele sobreviveria ao promise rejeitado.
const nextMessage = (subscriber: Redis): Promise<StreamMessage> =>
  new Promise((resolve, reject) => {
    const onMessage = (channel: string, raw: string) => {
      clearTimeout(timeout);
      const parsed = JSON.parse(raw) as { type: string; data: unknown };
      resolve({
        type: parsed.type,
        channel,
        data: parsed.data as Record<string, unknown>,
      });
    };
    const timeout = setTimeout(() => {
      subscriber.removeListener('message', onMessage);
      reject(new Error('timeout aguardando mensagem do canal'));
    }, 10_000);
    subscriber.once('message', onMessage);
  });

// Story 5.0 locked the roles matrix of the three endpoints as 501 stubs.
// Story 5.1 wired POST /location and GET /trips/:id/location to the real core
// (Effect use cases + Redis behind LocationBus) — this spec locks the I/O
// matrix of the 5.1 slice. Story 5.2 flips the stream to a real @Sse and adds
// GET /trips/active: the 501 lock is replaced by the stream matrix (happy path
// < 5s, 400/401/403/409 before any stream byte, two students on one subscribe,
// trip-end graceful close + 409 on reconnect).
describe('TrackingController (e2e) — Stories 5.1 e 5.2 (ingestão, last-known, stream e descoberta)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let adminToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let studentToken: string;
  let secondStudentToken: string;
  let outsiderStudentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;
  let secondStudentId: string;
  let completedTripId: string;
  let otherCompanyTripId: string;

  const stamp = Date.now();

  const adminCredentials = {
    email: `admin-tracking-e2e-${stamp}@empresa.com`,
    password: 'senha12345',
    name: 'Admin E2E Tracking',
    companyName: 'Empresa E2E Tracking',
  };

  const driverData = {
    name: 'Motorista E2E Tracking',
    email: `driver-tracking-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  // Segundo motorista da MESMA empresa: prova que DRIVER_NOT_ON_TRIP não é
  // apenas isolamento de tenant disfarçado.
  const otherDriverData = {
    name: 'Motorista Sem Vínculo E2E Tracking',
    email: `driver-other-tracking-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  const allowedStudentData = {
    name: 'Aluno Permitido E2E Tracking',
    email: `student-tracking-${stamp}@escola.com`,
    password: 'senha12345',
  };

  // Segundo aluno NA MESMA rota: prova que 2+ alunos da viagem compartilham
  // um único subscribe Redis no serviço de eventos (Story 5.2).
  const secondStudentData = {
    name: 'Segundo Aluno E2E Tracking',
    email: `student-second-tracking-${stamp}@escola.com`,
    password: 'senha12345',
  };

  const outsiderStudentData = {
    name: 'Aluno Fora da Rota E2E Tracking',
    email: `student-outsider-tracking-${stamp}@escola.com`,
    password: 'senha12345',
  };

  const validBody = (tripId: string) => ({
    tripId,
    latitude: -20.755549,
    longitude: -42.881728,
    accuracy: 12.5,
    capturedAt: new Date().toISOString(),
  });

  const ingest = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/tracking/location')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const lastKnown = (token: string | null, tripId: string = randomUUID()) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/tracking/trips/${tripId}/location`,
    );
    if (token !== null) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const stream = (token: string, tripId: string = randomUUID()) =>
    request(app.getHttpServer())
      .get(`/api/v1/tracking/trips/${tripId}/stream`)
      .set('Authorization', `Bearer ${token}`);

  const login = async (email: string, password: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return (res.body as ApiResponse).data!.accessToken as string;
  };

  const createUser = async (path: string, data: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(data)
      .expect(201);
    return (res.body as ApiResponse).data!.id as string;
  };

  // Viagem nova por teste: a posição fica no Redis por tripId, então reaproveitar
  // viagem cruzaria last-write-wins entre testes.
  const seedActiveTrip = async (
    driver = driverId,
    type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND',
  ) => {
    const trip = await prisma.trip.create({
      data: {
        companyId,
        routeId,
        driverId: driver,
        type,
        status: 'ACTIVE',
      },
    });
    return trip.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(adminCredentials)
      .expect(201);
    const registerBody = registerRes.body as ApiResponse;
    adminToken = registerBody.data!.accessToken as string;
    companyId = (registerBody.data!.company as Record<string, unknown>)
      .id as string;

    driverId = await createUser('/api/v1/drivers', driverData);
    await createUser('/api/v1/drivers', otherDriverData);
    allowedStudentId = await createUser('/api/v1/students', allowedStudentData);
    secondStudentId = await createUser('/api/v1/students', secondStudentData);
    // O id do aluno de fora não é consumido — só o token dele importa.
    await createUser('/api/v1/students', outsiderStudentData);

    driverToken = await login(driverData.email, driverData.password);
    otherDriverToken = await login(
      otherDriverData.email,
      otherDriverData.password,
    );
    studentToken = await login(
      allowedStudentData.email,
      allowedStudentData.password,
    );
    secondStudentToken = await login(
      secondStudentData.email,
      secondStudentData.password,
    );
    // Token do aluno FORA da rota: prova que STUDENT_NOT_ON_TRIP é regra de
    // negócio (403 do core), não isolamento de tenant disfarçado.
    outsiderStudentToken = await login(
      outsiderStudentData.email,
      outsiderStudentData.password,
    );

    const routeRes = await request(app.getHttpServer())
      .post('/api/v1/routes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rota E2E Tracking',
        originCity: 'Viçosa',
        destinationCity: 'Belo Horizonte',
      })
      .expect(201);
    routeId = (routeRes.body as ApiResponse).data!.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/routes/${routeId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: allowedStudentId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/routes/${routeId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: secondStudentId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/routes/${routeId}/drivers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverId })
      .expect(201);

    // TripController não tem JwtAuthGuard religado ainda (review pendente da
    // Story 3.1) — seed direto via Prisma (padrão boarding.e2e-spec).
    const completed = await prisma.trip.create({
      data: {
        companyId,
        routeId,
        driverId,
        type: 'OUTBOUND',
        status: 'COMPLETED',
      },
    });
    completedTripId = completed.id;

    // Empresa B, para provar isolamento multi-tenant com uma viagem que existe
    // e está ATIVA — só que não pertence a quem está autenticado.
    const otherAdminRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `admin-other-tracking-${stamp}@empresa.com`,
        password: 'senha12345',
        name: 'Admin Outra Empresa Tracking',
        companyName: 'Outra Empresa E2E Tracking',
      })
      .expect(201);
    const otherCompanyId = (
      (otherAdminRes.body as ApiResponse).data!.company as Record<
        string,
        unknown
      >
    ).id as string;

    const otherTrip = await prisma.trip.create({
      data: {
        companyId: otherCompanyId,
        routeId: randomUUID(),
        driverId: randomUUID(),
        type: 'OUTBOUND',
        status: 'ACTIVE',
      },
    });
    otherCompanyTripId = otherTrip.id;

    // O supertest fecha o server após o end() de cada request que ele próprio
    // bindou (serverAddress → app.listen(0) quando não há porta; end() →
    // server.close()). Com um stream SSE aberto, o close() pendura esperando a
    // conexão e requests seguintes não conectam. Bind explícito uma vez: os
    // Test passam a reusar a porta e nunca anexam o _server que fecha o app.
    const server = app.getHttpServer() as HttpServer;
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once('listening', () => resolve());
        server.once('error', reject);
        server.listen(0);
      });
    }
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } catch {
      // Suprime erros no teardown
    }
  });

  describe('Matriz de roles (congelada na 5.0)', () => {
    it('sem token, os 4 endpoints dão 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tracking/location')
        .send(validBody(randomUUID()))
        .expect(401);
      await lastKnown(null).expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/tracking/trips/${randomUUID()}/stream`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/active')
        .expect(401);
    });

    it('STUDENT no POST de ingestão dá 403 — somente o motorista transmite GPS', async () => {
      const response = await ingest(
        studentToken,
        validBody(randomUUID()),
      ).expect(403);
      expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
    });

    it('DRIVER no last-known dá 403 — o acompanhamento é do aluno', async () => {
      const response = await lastKnown(driverToken).expect(403);
      expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
    });

    it('DRIVER no stream dá 403 — o acompanhamento é do aluno', async () => {
      const response = await stream(driverToken).expect(403);
      expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/tracking/location — ingestão', () => {
    it('caminho feliz: 200 { data: { tripId, receivedAt } } com envelope de sucesso', async () => {
      const tripId = await seedActiveTrip();

      const response = await ingest(driverToken, validBody(tripId)).expect(200);

      const body = response.body as ApiResponse;
      // Valor capturado antes: o shape exato é checado contra um receivedAt
      // real (string ISO parseável), não contra ele mesmo.
      const receivedAt = body.data!.receivedAt;
      expect(typeof receivedAt).toBe('string');
      expect(Number.isNaN(Date.parse(receivedAt as string))).toBe(false);
      expect(body.data).toEqual({ tripId, receivedAt });
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('accuracy ausente no body: POST 200 e GET last-known sem a chave accuracy', async () => {
      const tripId = await seedActiveTrip();
      const body = {
        tripId,
        latitude: -20.755549,
        longitude: -42.881728,
        capturedAt: new Date().toISOString(),
      };

      await ingest(driverToken, body).expect(200);

      const response = await lastKnown(studentToken, tripId).expect(200);
      const data = (response.body as ApiResponse).data as Record<
        string,
        unknown
      >;
      expect(data).toEqual({
        tripId,
        latitude: body.latitude,
        longitude: body.longitude,
        capturedAt: body.capturedAt,
      });
      expect('accuracy' in data).toBe(false);
    });

    it('campo obrigatório ausente (sem latitude): 400 VALIDATION_ERROR', async () => {
      const tripId = await seedActiveTrip();

      const response = await ingest(driverToken, {
        tripId,
        longitude: -42.881728,
        capturedAt: new Date().toISOString(),
      }).expect(400);

      expect((response.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('last-write-wins: cada POST sobrescreve a posição no Redis com TTL ≤ 60s', async () => {
      const tripId = await seedActiveTrip();

      await ingest(driverToken, {
        ...validBody(tripId),
        latitude: -20.1,
        longitude: -42.1,
      }).expect(200);
      await ingest(driverToken, {
        ...validBody(tripId),
        latitude: -20.2,
        longitude: -42.2,
      }).expect(200);

      const raw = await redis.get(`tracking:trip:${tripId}:location`);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw!) as { latitude: number };
      expect(stored.latitude).toBe(-20.2);

      const ttl = await redis.ttl(`tracking:trip:${tripId}:location`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('publica location.updated no canal tracking:trip:{id} com o MESMO instante do receivedAt', async () => {
      const tripId = await seedActiveTrip();
      const subscriber = redis.duplicate();
      // O subscribe conecta antes de qualquer assert: se uma asserção lançar,
      // o finally garante o disconnect (o duplicate nunca vaza).
      try {
        await subscriber.subscribe(`tracking:trip:${tripId}`);

        const ackPromise = nextMessage(subscriber);
        const response = await ingest(driverToken, validBody(tripId)).expect(
          200,
        );
        const message = await ackPromise;

        expect(message.type).toBe('location.updated');
        expect(message.channel).toBe(`tracking:trip:${tripId}`);
        expect(message.data).toEqual({
          tripId,
          latitude: -20.755549,
          longitude: -42.881728,
          accuracy: 12.5,
          // Uma única leitura de relógio por ingestão: o timestamp do evento e
          // o receivedAt do ack são o mesmo instante do servidor.
          timestamp: (response.body as ApiResponse).data!.receivedAt,
        });
      } finally {
        subscriber.disconnect();
      }
    });

    it('motorista errado (mesma empresa): 403 DRIVER_NOT_ON_TRIP e nada gravado no Redis', async () => {
      const tripId = await seedActiveTrip();

      const response = await ingest(otherDriverToken, validBody(tripId)).expect(
        403,
      );

      expect((response.body as ApiResponse).error?.code).toBe(
        'DRIVER_NOT_ON_TRIP',
      );
      expect(await redis.get(`tracking:trip:${tripId}:location`)).toBeNull();
    });

    it('viagem inexistente, encerrada ou de outra empresa: 409 TRIP_NOT_ACTIVE', async () => {
      const nonexistent = await ingest(
        driverToken,
        validBody('00000000-0000-4000-8000-000000000000'),
      ).expect(409);
      expect((nonexistent.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const completed = await ingest(
        driverToken,
        validBody(completedTripId),
      ).expect(409);
      expect((completed.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const otherCompany = await ingest(
        driverToken,
        validBody(otherCompanyTripId),
      ).expect(409);
      expect((otherCompany.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('ordem: viagem inativa vence motorista errado ⇒ 409 TRIP_NOT_ACTIVE', async () => {
      const response = await ingest(
        otherDriverToken,
        validBody(completedTripId),
      ).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('body inválido: 400 VALIDATION_ERROR (tripId não-UUID, coordenada fora dos bounds, capturedAt malformado)', async () => {
      const tripId = await seedActiveTrip();

      const notUuid = await ingest(driverToken, {
        ...validBody(tripId),
        tripId: 'not-a-uuid',
      }).expect(400);
      expect((notUuid.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      const badLatitude = await ingest(driverToken, {
        ...validBody(tripId),
        latitude: 95,
      }).expect(400);
      expect((badLatitude.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      const badLongitude = await ingest(driverToken, {
        ...validBody(tripId),
        longitude: -200,
      }).expect(400);
      expect((badLongitude.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      const badCapturedAt = await ingest(driverToken, {
        ...validBody(tripId),
        capturedAt: 'ontem de manhã',
      }).expect(400);
      expect((badCapturedAt.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      // Date.parse aceitaria — o regex do schema não: o contrato promete ISO.
      const nonIsoCapturedAt = await ingest(driverToken, {
        ...validBody(tripId),
        capturedAt: 'March 5, 2020',
      }).expect(400);
      expect((nonIsoCapturedAt.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );
    });
  });

  describe('GET /api/v1/tracking/trips/:id/location — last-known', () => {
    it('hit: 200 com a última posição { tripId, latitude, longitude, accuracy, capturedAt }', async () => {
      const tripId = await seedActiveTrip();
      const body = validBody(tripId);
      await ingest(driverToken, body).expect(200);

      const response = await lastKnown(studentToken, tripId).expect(200);

      const responseBody = response.body as ApiResponse;
      expect(responseBody.data).toEqual({
        tripId,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy: body.accuracy,
        capturedAt: body.capturedAt,
      });
      expect(responseBody.meta).toHaveProperty('timestamp');
    });

    it('miss: 404 NO_LOCATION_AVAILABLE quando nenhuma posição foi enviada', async () => {
      const tripId = await seedActiveTrip();

      const response = await lastKnown(studentToken, tripId).expect(404);

      expect((response.body as ApiResponse).error?.code).toBe(
        'NO_LOCATION_AVAILABLE',
      );
    });

    it('aluno fora da rota: 403 STUDENT_NOT_ON_TRIP', async () => {
      const tripId = await seedActiveTrip();

      const response = await lastKnown(outsiderStudentToken, tripId).expect(
        403,
      );

      expect((response.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );
    });

    it('aluno na rota desativado (isActive false): 403 STUDENT_NOT_ON_TRIP', async () => {
      const tripId = await seedActiveTrip();
      await prisma.user.update({
        where: { id: allowedStudentId },
        data: { isActive: false },
      });
      try {
        const response = await lastKnown(studentToken, tripId).expect(403);
        expect((response.body as ApiResponse).error?.code).toBe(
          'STUDENT_NOT_ON_TRIP',
        );
      } finally {
        // Reativa: o token do aluno é usado pelos testes seguintes e o
        // isActive do user é estado compartilhado do arquivo.
        await prisma.user.update({
          where: { id: allowedStudentId },
          data: { isActive: true },
        });
      }
    });

    it('viagem inexistente, encerrada ou de outra empresa: 409 TRIP_NOT_ACTIVE', async () => {
      const nonexistent = await lastKnown(
        studentToken,
        '00000000-0000-4000-8000-000000000000',
      ).expect(409);
      expect((nonexistent.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const completed = await lastKnown(studentToken, completedTripId).expect(
        409,
      );
      expect((completed.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const otherCompany = await lastKnown(
        studentToken,
        otherCompanyTripId,
      ).expect(409);
      expect((otherCompany.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('ordem: viagem inativa vence aluno fora da rota ⇒ 409 TRIP_NOT_ACTIVE', async () => {
      const response = await lastKnown(
        outsiderStudentToken,
        completedTripId,
      ).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('id não-UUID: 400 VALIDATION_ERROR antes de qualquer regra de negócio', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/not-a-uuid/location')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(400);
      expect((response.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );
    });
  });

  // ---- Helpers de stream SSE (espelho do boarding.e2e-spec, com tripId da
  // URL: no tracking o guard valida o id do path, não resolve a viagem
  // server-side). ----
  interface StreamEvent {
    event: string;
    data: Record<string, unknown>;
  }

  interface StreamHandle {
    ready: Promise<void>;
    status: () => number | undefined;
    headers: () => Record<string, unknown>;
    messages: StreamEvent[];
    firstMessage: Promise<StreamEvent>;
    closed: Promise<void>;
    abort: () => void;
  }

  // O Response do superagent não resolve tipos sob o eslint-type-checked —
  // o shape mínimo que o teste usa vem daqui.
  const responseOf = (
    r: unknown,
  ): {
    statusCode?: number;
    headers?: Record<string, unknown>;
    on: (event: string, listener: () => void) => unknown;
  } =>
    (
      r as {
        response: {
          statusCode?: number;
          headers?: Record<string, unknown>;
          on: (event: string, listener: () => void) => unknown;
        };
      }
    ).response;

  const openStream = (token: string, tripId: string): StreamHandle => {
    const messages: StreamEvent[] = [];
    let resolveReady!: () => void;
    let resolveFirst: (message: StreamEvent) => void = () => {};
    let resolveClosed: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const firstMessage = new Promise<StreamEvent>((resolve) => {
      resolveFirst = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });

    const req = request(app.getHttpServer())
      .get(`/api/v1/tracking/trips/${tripId}/stream`)
      .set('Authorization', `Bearer ${token}`)
      // Streaming sem buffer: o superagent não resolve a promessa do request
      // em respostas não terminadas — `ready`, `firstMessage` e `closed`
      // são resolvidos pelos eventos do parser.
      .buffer(false)
      .parse((res: IncomingMessage) => {
        resolveReady();
        res.on('error', () => resolveClosed());
        res.on('end', () => resolveClosed());
        res.on('close', () => resolveClosed());
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
          let boundary = raw.indexOf('\n\n');
          while (boundary >= 0) {
            const block = raw.slice(0, boundary);
            raw = raw.slice(boundary + 2);
            boundary = raw.indexOf('\n\n');
            const lines = block.split('\n');
            const eventLine = lines.find((line) => line.startsWith('event:'));
            const dataLine = lines.find((line) => line.startsWith('data:'));
            if (!eventLine) continue;
            // Frames sem payload (heartbeat `data: ` vazio) não passam por
            // JSON.parse — só os eventos de contrato carregam JSON.
            const rawData = dataLine
              ? dataLine.slice('data:'.length).trim()
              : '';
            const message: StreamEvent = {
              event: eventLine.slice('event:'.length).trim(),
              data: rawData
                ? (JSON.parse(rawData) as Record<string, unknown>)
                : {},
            };
            messages.push(message);
            resolveFirst(message);
          }
        });
      });

    // O request fica pendente até o abort; sem isso o worker quebra com
    // unhandled rejection ('Aborted') quando o teste encerra a conexão.
    void Promise.resolve(req).catch(() => undefined);

    return {
      // Parser anexado ⇒ headers do stream chegaram ⇒ guard passou e o Nest
      // já subscreveu o canal Redis (subscrição síncrona, mesmo tick do pipe).
      ready: ready.then(() => {
        // O Response do superagent reemite o ECONNRESET do socket no abort —
        // sem listener vira uncaught exception e derruba o worker do vitest.
        responseOf(req).on('error', () => resolveClosed());
      }),
      headers: () => responseOf(req).headers ?? {},
      status: () => responseOf(req).statusCode,
      messages,
      firstMessage,
      closed,
      abort: () => {
        try {
          req.abort();
        } catch {
          // Stream já fechado — nada a abortar.
        }
      },
    };
  };

  describe('GET /api/v1/tracking/trips/:id/stream — SSE real (Story 5.2)', () => {
    it('stream feliz: location.updated com o schema do contrato em < 5s (NFR2)', async () => {
      const tripId = await seedActiveTrip();
      const handle = openStream(studentToken, tripId);
      await handle.ready;

      expect(handle.status()).toBe(200);
      expect(String(handle.headers()['content-type'])).toMatch(
        /^text\/event-stream/,
      );

      const start = Date.now();
      const response = await ingest(driverToken, validBody(tripId)).expect(200);
      const first = await handle.firstMessage;
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(first.event).toBe('location.updated');
      expect(first.data).toEqual({
        tripId,
        latitude: -20.755549,
        longitude: -42.881728,
        accuracy: 12.5,
        // Verbatim do envelope publicado pela 5.1: o timestamp do evento é o
        // MESMO instante do receivedAt do ack.
        timestamp: (response.body as ApiResponse).data!.receivedAt,
      });

      handle.abort();
    });

    it('2 alunos na mesma viagem recebem o mesmo evento servidos por UM subscribe Redis', async () => {
      const tripId = await seedActiveTrip();
      const handle1 = openStream(studentToken, tripId);
      const handle2 = openStream(secondStudentToken, tripId);
      await Promise.all([handle1.ready, handle2.ready]);

      await ingest(driverToken, validBody(tripId)).expect(200);
      const [toFirst, toSecond] = await Promise.all([
        handle1.firstMessage,
        handle2.firstMessage,
      ]);

      expect(toFirst).toEqual(toSecond);

      // A prova do compartilhamento: PUBSUB NUMSUB é server-wide — 1 significa
      // que as duas conexões SSE dividem o subscribe dedicado do serviço, e
      // não há um subscriber Redis por aluno.
      const numsub = (await redis.pubsub(
        'NUMSUB',
        `tracking:trip:${tripId}`,
      )) as (string | number)[];
      expect(numsub).toEqual([`tracking:trip:${tripId}`, 1]);

      handle1.abort();
      handle2.abort();
    });

    it('id não-UUID: 400 VALIDATION_ERROR no envelope, nunca byte de stream', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/not-a-uuid/stream')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(400);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body).not.toHaveProperty('data');
      expect(body).not.toHaveProperty('meta');
    });

    it('viagem inexistente, encerrada ou de outra empresa: 409 TRIP_NOT_ACTIVE', async () => {
      const nonexistent = await stream(
        studentToken,
        '00000000-0000-4000-8000-000000000000',
      ).expect(409);
      expect((nonexistent.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const completed = await stream(studentToken, completedTripId).expect(409);
      expect((completed.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const otherCompany = await stream(
        studentToken,
        otherCompanyTripId,
      ).expect(409);
      expect((otherCompany.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('aluno fora da rota: 403 STUDENT_NOT_ON_TRIP mesmo com viagem ativa', async () => {
      const tripId = await seedActiveTrip();

      const response = await stream(outsiderStudentToken, tripId).expect(403);
      expect((response.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );
    });

    it('ordem do guard: viagem inativa vence aluno fora da rota ⇒ 409 TRIP_NOT_ACTIVE', async () => {
      const response = await stream(
        outsiderStudentToken,
        completedTripId,
      ).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('end-trip com stream aberto: o stream completa, a transmissão cessa e a reconexão recebe 409', async () => {
      const tripId = await seedActiveTrip();
      const handle = openStream(studentToken, tripId);
      await handle.ready;

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/end`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      // Sinal terminal do trip.ended completa o stream (response.end()) —
      // sem abort(): a resposta já terminou e abortar aqui destruiria o
      // socket keep-alive com um ECONNRESET órfão.
      await handle.closed;

      // A captura é amarrada ao ciclo da viagem: encerrada, o POST do
      // motorista é rejeitado.
      const latePost = await ingest(driverToken, validBody(tripId)).expect(409);
      expect((latePost.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      // Reconexão pós-fim: guard responde 409 — o cliente para de reconectar.
      const response = await stream(studentToken, tripId).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });
  });

  describe('GET /api/v1/tracking/trips/active — descoberta da viagem (Story 5.2)', () => {
    // Sobras de viagens ACTIVE dos describes anteriores poluem a descoberta
    // (qualquer ativa na rota do aluno vence): zerar antes de cada caso.
    beforeEach(async () => {
      await prisma.trip.updateMany({
        where: { routeId, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });
    });

    it('sem viagem ativa: 200 { data: null } com envelope de sucesso', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const body = response.body as ApiResponse;
      expect(body.data).toBeNull();
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('viagem OUTBOUND ativa na rota: { data: { tripId, type: "OUTBOUND" } }', async () => {
      const tripId = await seedActiveTrip();

      const response = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toEqual({
        tripId,
        type: 'OUTBOUND',
      });
    });

    it('viagem RETURN ativa na rota: { data: { tripId, type: "RETURN" } } — qualquer perna', async () => {
      const tripId = await seedActiveTrip(driverId, 'RETURN');

      const response = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toEqual({
        tripId,
        type: 'RETURN',
      });
    });

    it('aluno fora de rota: { data: null } — autorização implícita da query, não 403', async () => {
      await seedActiveTrip();

      const response = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${outsiderStudentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toBeNull();
    });

    it('aluno desativado: { data: null } — isActive vale também na descoberta (R7)', async () => {
      // Antes da desativação, o segundo aluno (na rota) enxerga a viagem como
      // qualquer outro: prova que o null abaixo vem do isActive, não do roster.
      const tripId = await seedActiveTrip();
      const before = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .expect(200);
      expect((before.body as ApiResponse).data).toEqual({
        tripId,
        type: 'OUTBOUND',
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/students/${secondStudentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Os 3 endpoints concordam: a descoberta nega com { data: null }, o
      // last-known nega com 403 STUDENT_NOT_ON_TRIP (isStudentOnRoute já
      // exigia isActive) e o stream nega com o mesmo 403 no guard.
      const after = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .expect(200);
      expect((after.body as ApiResponse).data).toBeNull();

      const lastKnownRes = await request(app.getHttpServer())
        .get(`/api/v1/tracking/trips/${tripId}/location`)
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .expect(403);
      expect((lastKnownRes.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );

      const streamRes = await request(app.getHttpServer())
        .get(`/api/v1/tracking/trips/${tripId}/stream`)
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .expect(403);
      expect((streamRes.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );
    });

    it('DRIVER: 403 FORBIDDEN — o endpoint é do aluno', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
    });
  });
});
