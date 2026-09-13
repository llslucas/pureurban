import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import type { Redis } from 'ioredis';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { RedisService } from '../../src/domains/shared/shell/infra/redis.service.js';
import type { PrismaService } from '../../src/domains/shared/shell/infra/prisma.service.js';
import {
  bootApp,
  closeApp,
  http,
  type ApiResponse,
} from '../support/supertest-app.js';
import { seedCompanyScenario, seedTrip } from '../support/company-scenario.js';

// Story 5.1 block of the former tracking.e2e-spec.ts (wrap-4 slice): GPS
// ingestion (Redis last-write-wins + location.updated publication) and the
// last-known REST read.

describe('TrackingController (e2e) — Stories 5.1 (ingestão e last-known)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
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

  const validBody = (tripId: string) => ({
    tripId,
    latitude: -20.755549,
    longitude: -42.881728,
    accuracy: 12.5,
    capturedAt: new Date().toISOString(),
  });

  const ingest = (token: string, body: Record<string, unknown>) =>
    http(app)
      .post('/api/v1/tracking/location')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const lastKnown = (token: string | null, tripId: string = randomUUID()) => {
    const req = http(app).get(`/api/v1/tracking/trips/${tripId}/location`);
    if (token !== null) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  // Espera a primeira mensagem publicada num canal Redis (conexão dedicada de
  // subscribe — um cliente em subscribe não aceita comandos comuns). No timeout
  // o listener é removido: sem isso ele sobreviveria ao promise rejeitado.
  const nextMessage = (
    subscriber: Redis,
  ): Promise<{
    type: string;
    channel: string;
    data: Record<string, unknown>;
  }> =>
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

  // Viagem nova por teste: a posição fica no Redis por tripId, então reaproveitar
  // viagem cruzaria last-write-wins entre testes.
  const seedActiveTrip = async (type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND') =>
    seedTrip(prisma, { companyId, routeId, driverId }, type);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    redis = app.get(RedisService);
    const scenario = await seedCompanyScenario(app, prisma, 'tracking-ingest');
    driverToken = scenario.driverToken;
    otherDriverToken = scenario.otherDriverToken;
    studentToken = scenario.studentToken;
    outsiderStudentToken = scenario.outsiderStudentToken;
    routeId = scenario.routeId;
    driverId = scenario.driverId;
    companyId = scenario.companyId;
    allowedStudentId = scenario.allowedStudentId;
    completedTripId = scenario.completedTripId;
    otherCompanyTripId = scenario.otherCompanyTripId;
  });

  afterAll(async () => {
    await closeApp(app);
  });

  describe('POST /api/v1/tracking/location — ingestão', () => {
    it('caminho feliz: 200 { data: { tripId, receivedAt } } com envelope de sucesso', async () => {
      const tripId = await seedActiveTrip();

      const response = await ingest(driverToken, validBody(tripId)).expect(200);

      const body = response.body as ApiResponse;
      // Valor capturado antes: o shape exato é checado contra um receivedAt
      // real (string ISO parseável), não contra ele mesmo.
      const receivedAt = body.data.receivedAt;
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
      const data = (response.body as ApiResponse).data;
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
          timestamp: (response.body as ApiResponse).data.receivedAt,
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

      // Ampliar a precisão fracionária (wrap-3/R11) não abriu a porta para
      // não-ISO: âncora Z obrigatória mesmo com casas fracionárias.
      const noZoneCapturedAt = await ingest(driverToken, {
        ...validBody(tripId),
        capturedAt: '2026-09-12T12:00:00.123456789',
      }).expect(400);
      expect((noZoneCapturedAt.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      // Borda accuracy >= 0 do contrato (R16): -5 é coordenada válida de
      // longitude na mão errada — atravessaria Redis/evento/tela com tudo
      // verde se o limite sair do schema.
      const negativeAccuracy = await ingest(driverToken, {
        ...validBody(tripId),
        accuracy: -5,
      }).expect(400);
      expect((negativeAccuracy.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      // Lado inclusivo da mesma borda: 0 É accuracy válida (leitura perfeita
      // da Geolocation API) — o schema não pode derivar de gte(0) para gt(0).
      await ingest(driverToken, { ...validBody(tripId), accuracy: 0 }).expect(
        200,
      );

      // Lado inclusivo da ampliação (wrap-3/R11): 0 casas fracionárias é a
      // forma ISO comum à mão — segue aceita, como o contrato da 5.0 promete.
      await ingest(driverToken, {
        ...validBody(tripId),
        capturedAt: '2026-09-12T12:00:00Z',
      }).expect(200);
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
      const response = await http(app)
        .get('/api/v1/tracking/trips/not-a-uuid/location')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(400);
      expect((response.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );
    });
  });
});
