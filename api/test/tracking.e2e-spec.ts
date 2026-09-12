import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/domains/shared/shell/infra/prisma.service.js';
import { RedisService } from '../src/domains/shared/shell/infra/redis.service.js';
import type { Redis } from 'ioredis';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

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
// Story 5.1 wires POST /location and GET /trips/:id/location to the real core
// (Effect use cases + Redis behind LocationBus) — this spec now locks the I/O
// matrix of the 5.1 slice. The stream REMAINS a 501 stub: flipping it to @Sse
// is Story 5.2, and losing it here would silently authorize the wrong side.
describe('TrackingController (e2e) — Story 5.1 ingestão e last-known', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let adminToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let studentToken: string;
  let outsiderStudentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;
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

  const stream = (token: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/tracking/trips/${randomUUID()}/stream`)
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
  const seedActiveTrip = async (driver = driverId) => {
    const trip = await prisma.trip.create({
      data: {
        companyId,
        routeId,
        driverId: driver,
        type: 'OUTBOUND',
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
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } catch {
      // Suprime erros no teardown
    }
  });

  describe('Matriz de roles (congelada na 5.0)', () => {
    it('sem token, os 3 endpoints dão 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tracking/location')
        .send(validBody(randomUUID()))
        .expect(401);
      await lastKnown(null).expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/tracking/trips/${randomUUID()}/stream`)
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

    it('o stream permanece 501 NOT_IMPLEMENTED (Story 5.2) mesmo com role correta', async () => {
      const response = await stream(studentToken).expect(501);
      expect((response.body as ApiResponse).error?.code).toBe(
        'NOT_IMPLEMENTED',
      );
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
});
