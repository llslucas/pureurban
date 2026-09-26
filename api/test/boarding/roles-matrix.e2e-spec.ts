import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { PrismaService } from '../../src/domains/shared/shell/infra/prisma.service.js';
import {
  bootApp,
  closeApp,
  http,
  type ApiResponse,
} from '../support/supertest-app.js';
import { seedCompanyScenario, seedTrip } from '../support/company-scenario.js';

// Story 4.0 block of the former boarding.e2e-spec.ts (wrap-4 slice).

describe('BoardingController (e2e) — matriz de roles dos endpoints 4.x (Story 4.0)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let driverToken: string;
  let studentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;

  const seedActiveTrip = async (type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND') =>
    seedTrip(prisma, { companyId, routeId, driverId }, type);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const scenario = await seedCompanyScenario(app, prisma, 'boarding-roles');
    adminToken = scenario.adminToken;
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

  // Story 4.0 declarou o contrato; a 4.1 implementou o POST /not-returning, a
  // 4.2 o stream de /events e a 4.3 o POST /cancel-absence. A matriz de roles
  // fica travada aqui porque o override por handler (@Roles STUDENT nos
  // POSTs, DRIVER no stream) vence o ['DRIVER'] da classe — perdê-lo é falha
  // silenciosa de autorização.
  describe('Story 4.0-4.3 — matriz de roles (not-returning, cancel-absence, events)', () => {
    const notReturning = (
      token: string | null,
      tripId: string = randomUUID(),
      key: string | null = randomUUID(),
    ) => {
      const req = http(app)
        .post('/api/v1/boarding/not-returning')
        .send({ tripId });
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      if (key !== null) req.set('X-Idempotency-Key', key);
      return req;
    };

    const cancelAbsence = (
      token: string | null,
      tripId: string = randomUUID(),
    ) => {
      const req = http(app)
        .post('/api/v1/boarding/cancel-absence')
        .send({ tripId });
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      return req.set('X-Idempotency-Key', randomUUID());
    };

    const events = (token: string | null) => {
      const req = http(app).get('/api/v1/boarding/events');
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      return req;
    };

    const reminder = (token: string | null) => {
      const req = http(app).get('/api/v1/boarding/reminder');
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      return req;
    };

    const status = (token: string | null) => {
      const req = http(app).get('/api/v1/boarding/status');
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      return req;
    };

    it('STUDENT: POST /not-returning registra a ausência com 201', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const response = await notReturning(studentToken, tripId).expect(201);

      const body = response.body as ApiResponse;
      expect(body.data).toMatchObject({
        studentId: allowedStudentId,
        tripId,
        status: 'NOT_RETURNING',
      });
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('notifiedAt');
      expect(body.data).toHaveProperty('cancellableUntil');
    });

    it('STUDENT: POST /cancel-absence cancela a ausência com 200 (stub 501 da 4.0 removido na 4.3)', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await notReturning(studentToken, tripId).expect(201);

      const response = await cancelAbsence(studentToken, tripId).expect(200);

      const body = response.body as ApiResponse;
      expect(body.data).toMatchObject({
        studentId: allowedStudentId,
        tripId,
        status: 'NOT_CHECKED_IN',
      });
      expect(body.data).toHaveProperty('cancelledAt');
    });

    it('DRIVER nos POSTs deve dar 403 — o override STUDENT por handler vence o DRIVER da classe', async () => {
      await notReturning(driverToken).expect(403);
      await cancelAbsence(driverToken).expect(403);
    });

    it('DRIVER no GET /reminder deve dar 403 — o lembrete é consultado pelo aluno (mesmo override)', async () => {
      await reminder(driverToken).expect(403);
    });

    it('DRIVER no GET /status deve dar 403 — o estado é consultado pelo aluno (mesmo override)', async () => {
      await status(driverToken).expect(403);
    });

    it('STUDENT em /events deve dar 403 — o stream é do motorista', async () => {
      await events(studentToken).expect(403);
    });

    // ADMIN nunca foi exercitado nos endpoints novos (RV8): a matriz original
    // pinou DRIVER/STUDENT/anônimo — um typo de @Roles que concedesse ADMIN
    // passaria com a suíte toda verde.
    it('ADMIN nos endpoints novos deve dar 403 — nenhum deles é dele (RV8)', async () => {
      const forbidden = (response: { body: ApiResponse }) =>
        expect(response.body.error?.code).toBe('FORBIDDEN');

      forbidden(await notReturning(adminToken).expect(403));
      forbidden(await cancelAbsence(adminToken).expect(403));
      forbidden(await reminder(adminToken).expect(403));
      forbidden(await events(adminToken).expect(403));
      forbidden(await status(adminToken).expect(403));
    });

    it('sem token, as rotas novas devem dar 401', async () => {
      await notReturning(null).expect(401);
      await cancelAbsence(null).expect(401);
      await events(null).expect(401);
      await reminder(null).expect(401);
      await status(null).expect(401);
    });
  });
});
