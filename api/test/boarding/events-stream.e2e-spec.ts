import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

import type { PrismaService } from '../../src/domains/shared/shell/infra/prisma.service.js';
import {
  bootApp,
  closeApp,
  http,
  type ApiResponse,
} from '../support/supertest-app.js';
import { seedCompanyScenario, seedTrip } from '../support/company-scenario.js';
import { openStream as openSseStream } from '../support/sse-stream.js';

// Story 4.2 block of the former boarding.e2e-spec.ts (wrap-4 slice): the
// driver SSE stream — guard, contract payload delivery, terminal signal.

describe('BoardingController (e2e) — GET /api/v1/boarding/events (Story 4.2)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverToken: string;
  let studentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;

  const post = (path: string) => http(app).post(path);

  const openStream = (token: string) =>
    openSseStream(app, '/api/v1/boarding/events', token);

  const seedActiveTrip = async (type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND') =>
    seedTrip(prisma, { companyId, routeId, driverId }, type);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const scenario = await seedCompanyScenario(app, prisma, 'boarding-stream');
    driverToken = scenario.driverToken;
    studentToken = scenario.studentToken;
    routeId = scenario.routeId;
    driverId = scenario.driverId;
    companyId = scenario.companyId;
    allowedStudentId = scenario.allowedStudentId;
  });

  afterAll(async () => {
    await closeApp(app);
  });

  describe('GET /api/v1/boarding/events — stream SSE (Story 4.2)', () => {
    // O guard resolve a viagem ativa do driver: encerrar todas antes de cada
    // teste garante que o canal do stream é exatamente a viagem semeada aqui
    // (testes anteriores do arquivo deixam viagens ACTIVE para trás).
    const endAllActiveTrips = () =>
      prisma.trip.updateMany({
        where: { driverId, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });

    beforeEach(endAllActiveTrips);

    const events = (token: string | null) => {
      const req = http(app).get('/api/v1/boarding/events');
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      return req;
    };

    it('driver sem viagem ativa: 409 TRIP_NOT_ACTIVE no envelope, nunca stream', async () => {
      const response = await events(driverToken).expect(409);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('TRIP_NOT_ACTIVE');
      expect(body.error?.message).toBeDefined();
      expect(body).not.toHaveProperty('data');
      expect(body).not.toHaveProperty('meta');
    });

    it('stream entrega boarding.not_returning com o schema do contrato em < 3s (NFR3)', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const stream = openStream(driverToken);
      await stream.ready;

      expect(stream.status()).toBe(200);
      expect(String(stream.headers()['content-type'])).toMatch(
        /^text\/event-stream/,
      );

      const start = Date.now();
      const response = await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId })
        .expect(201);
      const first = await stream.firstMessage;
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3000);
      expect(first.event).toBe('boarding.not_returning');
      expect(first.data).toEqual({
        tripId,
        studentId: allowedStudentId,
        notifiedAt: (response.body as ApiResponse).data.notifiedAt as string,
      });

      stream.abort();
    });

    it('stream entrega boarding.absence_cancelled com o payload do contrato em < 3s (NFR3, Story 4.3)', async () => {
      const tripId = await seedActiveTrip('RETURN');
      // Ausência visível ANTES do stream abrir: é o estado que o cancelamento desfaz.
      await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId })
        .expect(201);

      const stream = openStream(driverToken);
      await stream.ready;
      expect(stream.status()).toBe(200);

      const start = Date.now();
      const response = await post('/api/v1/boarding/cancel-absence')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId })
        .expect(200);
      const first = await stream.firstMessage;
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3000);
      expect(first.event).toBe('boarding.absence_cancelled');
      expect(first.data).toEqual({
        tripId,
        studentId: allowedStudentId,
        cancelledAt: (response.body as ApiResponse).data.cancelledAt as string,
      });

      stream.abort();
    });

    it('end-trip com stream aberto: o stream completa e a reconexão recebe 409 (sem loop)', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const stream = openStream(driverToken);
      await stream.ready;

      await http(app)
        .patch(`/api/v1/trips/${tripId}/end`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      // Sinal terminal do trip.ended completa o stream (response.end()) —
      // sem abort(): a resposta já terminou e abortar aqui destruiria o
      // socket keep-alive com um ECONNRESET órfão.
      await stream.closed;

      // Reconexão pós-fim: guard responde 409 — o cliente para de reconectar.
      const response = await events(driverToken).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });
  });
});
