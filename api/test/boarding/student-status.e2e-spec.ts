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
import {
  checkIn,
  seedCompanyScenario,
  seedTrip,
} from '../support/company-scenario.js';

describe('BoardingController (e2e) — GET /boarding/status (estado do aluno na volta)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverToken: string;
  let studentToken: string;
  let outsiderStudentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const scenario = await seedCompanyScenario(app, prisma, 'boarding-status');
    driverToken = scenario.driverToken;
    studentToken = scenario.studentToken;
    outsiderStudentToken = scenario.outsiderStudentToken;
    routeId = scenario.routeId;
    driverId = scenario.driverId;
    companyId = scenario.companyId;
    allowedStudentId = scenario.allowedStudentId;
  });

  afterAll(async () => {
    await closeApp(app);
  });

  // findActiveReturnByStudent picks the latest ACTIVE return: leftovers from
  // previous tests would compete with the trip seeded by each test.
  beforeEach(() =>
    prisma.trip.updateMany({
      where: { companyId, driverId, status: 'ACTIVE' },
      data: { status: 'COMPLETED' },
    }),
  );

  const seedReturn = () =>
    seedTrip(prisma, { companyId, routeId, driverId }, 'RETURN');

  const status = (token: string) =>
    http(app)
      .get('/api/v1/boarding/status')
      .set('Authorization', `Bearer ${token}`);

  const notReturning = (tripId: string) =>
    http(app)
      .post('/api/v1/boarding/not-returning')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ tripId });

  const cancelAbsence = (tripId: string) =>
    http(app)
      .post('/api/v1/boarding/cancel-absence')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Idempotency-Key', randomUUID())
      .send({ tripId });

  const readData = async (token: string) => {
    const response = await status(token).expect(200);
    const body = response.body as ApiResponse;
    expect(body.meta).toHaveProperty('timestamp');
    return body.data as Record<string, unknown> | null;
  };

  it('sem viagem de retorno ativa ⇒ { data: null }', async () => {
    expect(await readData(studentToken)).toBeNull();
  });

  it('só a ida ativa ⇒ { data: null } (o status é da volta)', async () => {
    await seedTrip(prisma, { companyId, routeId, driverId }, 'OUTBOUND');

    expect(await readData(studentToken)).toBeNull();
  });

  it('aluno fora da rota ⇒ { data: null }', async () => {
    await seedReturn();

    expect(await readData(outsiderStudentToken)).toBeNull();
  });

  it('pendente ⇒ NOT_CHECKED_IN sem ausência', async () => {
    const tripId = await seedReturn();

    expect(await readData(studentToken)).toEqual({
      tripId,
      status: 'NOT_CHECKED_IN',
      absence: null,
    });
  });

  it('ausência ativa ⇒ NOT_RETURNING com a janela do servidor', async () => {
    const tripId = await seedReturn();
    const created = await notReturning(tripId).expect(201);
    const absence = (created.body as ApiResponse).data;

    expect(await readData(studentToken)).toEqual({
      tripId,
      status: 'NOT_RETURNING',
      absence: {
        id: absence.id,
        notifiedAt: absence.notifiedAt,
        cancellableUntil: absence.cancellableUntil,
      },
    });
  });

  it('check-in ⇒ CHECKED_IN sem ausência', async () => {
    const tripId = await seedReturn();
    await checkIn(app, driverToken, randomUUID(), {
      studentId: allowedStudentId,
      tripId,
    }).expect(201);

    expect(await readData(studentToken)).toEqual({
      tripId,
      status: 'CHECKED_IN',
      absence: null,
    });
  });

  it('check-in depois da ausência ⇒ CHECKED_IN prevalece', async () => {
    const tripId = await seedReturn();
    await notReturning(tripId).expect(201);
    await checkIn(app, driverToken, randomUUID(), {
      studentId: allowedStudentId,
      tripId,
    }).expect(201);

    expect(await readData(studentToken)).toEqual({
      tripId,
      status: 'CHECKED_IN',
      absence: null,
    });
  });

  it('ausência cancelada ⇒ NOT_CHECKED_IN', async () => {
    const tripId = await seedReturn();
    await notReturning(tripId).expect(201);
    await cancelAbsence(tripId).expect(200);

    expect(await readData(studentToken)).toEqual({
      tripId,
      status: 'NOT_CHECKED_IN',
      absence: null,
    });
  });
});
