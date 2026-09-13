import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

import { ReminderSchedulerService } from '../../src/domains/boarding/shell/reminder-scheduler.service.js';
import type { PrismaService } from '../../src/domains/shared/shell/infra/prisma.service.js';
import {
  bootApp,
  closeApp,
  http,
  type ApiResponse,
} from '../support/supertest-app.js';
import {
  checkIn as checkInRequest,
  seedCompanyScenario,
} from '../support/company-scenario.js';
import { openStream as openSseStream } from '../support/sse-stream.js';

// Story 4.4 block of the former boarding.e2e-spec.ts (wrap-4 slice): the
// automatic reminder for pending check-ins on the RETURN leg — explicit
// runOnce() scans, stream delivery, GET /reminder states.

describe('BoardingController (e2e) — lembrete automático de check-in pendente (Story 4.4)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverToken: string;
  let studentToken: string;
  let outsiderStudentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;

  const post = (path: string) => http(app).post(path);

  const checkIn = (
    token: string,
    key: string | null,
    body: Record<string, unknown>,
  ) => checkInRequest(app, token, key, body);

  const openStream = (token: string) =>
    openSseStream(app, '/api/v1/boarding/events', token);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const scenario = await seedCompanyScenario(
      app,
      prisma,
      'boarding-reminder',
    );
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

  describe('Lembrete automático de check-in pendente (Story 4.4)', () => {
    // The scheduler's interval (60s since app init) would make these tests
    // non-deterministic: every outcome here triggers runOnce() explicitly.
    // Nothing before this block seeds a RETURN with relatedTripId, so not
    // even the interval that ran until now created any reminder.
    beforeAll(() => {
      app.get(ReminderSchedulerService).onModuleDestroy();
    });

    // findActiveReturnByStudent orders by startedAt desc: ACTIVE leftovers
    // from previous tests would compete with the seeded trip — end every trip
    // of this driver/company before each test.
    const endMyActiveTrips = () =>
      prisma.trip.updateMany({
        where: { companyId, driverId, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });

    beforeEach(endMyActiveTrips);

    const runOnce = () => app.get(ReminderSchedulerService).runOnce();

    const reminder = (token: string | null) => {
      const req = http(app).get('/api/v1/boarding/reminder');
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      return req;
    };

    // Outbound with REAL check-ins (via API while the outbound is active) —
    // the scan crosses those check-ins with the RETURN seeded next. Completes
    // it by default; `finalStatus: 'ACTIVE'` keeps it live for scenarios that
    // need the trip itself to be visible on the driver's state.
    const seedOutboundWithCheckIns = async (
      studentIds: string[],
      finalStatus: 'ACTIVE' | 'COMPLETED' = 'COMPLETED',
    ) => {
      const outbound = await prisma.trip.create({
        data: {
          companyId,
          routeId,
          driverId,
          type: 'OUTBOUND',
          status: 'ACTIVE',
        },
      });
      for (const studentId of studentIds) {
        await checkIn(driverToken, randomUUID(), {
          studentId,
          tripId: outbound.id,
        }).expect(201);
      }
      if (finalStatus === 'COMPLETED') {
        await prisma.trip.update({
          where: { id: outbound.id },
          data: { status: 'COMPLETED' },
        });
      }
      return outbound.id;
    };

    const seedReturn = async (outboundId: string | null, startedAt: Date) => {
      const ret = await prisma.trip.create({
        data: {
          companyId,
          routeId,
          driverId,
          type: 'RETURN',
          status: 'ACTIVE',
          relatedTripId: outboundId,
          startedAt,
        },
      });
      return ret.id;
    };

    const seedDueScenario = async (
      studentIds: string[] = [allowedStudentId],
    ) => {
      const outboundId = await seedOutboundWithCheckIns(studentIds);
      // startedAt 16 minutes ago: past the inclusive 15-minute boundary.
      return seedReturn(outboundId, new Date(Date.now() - 16 * 60 * 1000));
    };

    it('runOnce ⇒ boarding.checkin_reminder no stream do motorista com o payload exato e uma única linha persistida', async () => {
      const returnTripId = await seedDueScenario();

      const stream = openStream(driverToken);
      await stream.ready;
      expect(stream.status()).toBe(200);

      await runOnce();

      const first = await stream.firstMessage;
      expect(first.event).toBe('boarding.checkin_reminder');
      // The contract payload carries the row's remindedAt — validated below.
      const remindedAt = String(first.data.remindedAt);
      expect(first.data).toEqual({
        tripId: returnTripId,
        studentId: allowedStudentId,
        remindedAt,
      });

      const rows = await prisma.boardingReminder.findMany({
        where: { tripId: returnTripId },
      });
      expect(rows).toHaveLength(1);
      expect(remindedAt).toBe(rows[0].remindedAt.toISOString());

      stream.abort();
    });

    it('2º runOnce (re-scan): nada novo — sem segunda linha, sem novo evento', async () => {
      const returnTripId = await seedDueScenario();

      const first = await runOnce();
      expect(first).toMatchObject({ remindersCreated: 1 });

      const stream = openStream(driverToken);
      await stream.ready;
      await runOnce();

      const second = await runOnce();
      // scannedTrips is a system-wide sweep: other e2e files run in parallel
      // and may hold active RETURNs — what is deterministic here is that the
      // re-execution creates nothing for THIS trip.
      expect(second.remindersCreated).toBe(0);

      // No new reminder reached the stream after the re-scans.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(stream.messages).toEqual([]);
      expect(
        await prisma.boardingReminder.count({
          where: { tripId: returnTripId },
        }),
      ).toBe(1);

      stream.abort();
    });

    it('GET /reminder: pendente após o disparo — { data: { tripId, remindedAt } } sem nunca ter aberto o stream', async () => {
      const returnTripId = await seedDueScenario();
      await runOnce();

      const response = await reminder(studentToken).expect(200);

      const body = response.body as ApiResponse;
      expect(body.data).toMatchObject({ tripId: returnTripId });
      expect(Number.isNaN(Date.parse(body.data.remindedAt as string))).toBe(
        false,
      );
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('GET /reminder sem linha (RETURN elegível, scan ainda não rodou) ⇒ { data: null }', async () => {
      await seedDueScenario();

      const response = await reminder(studentToken).expect(200);

      expect((response.body as ApiResponse).data).toBeNull();
    });

    it('check-in na volta: scan não cria lembrete e GET ⇒ { data: null }', async () => {
      const returnTripId = await seedDueScenario();
      await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId: returnTripId,
      }).expect(201);

      const scan = await runOnce();
      expect(scan).toMatchObject({ remindersCreated: 0 });

      const response = await reminder(studentToken).expect(200);
      expect((response.body as ApiResponse).data).toBeNull();
      expect(
        await prisma.boardingReminder.count({
          where: { tripId: returnTripId },
        }),
      ).toBe(0);
    });

    it('ausência ativa: scan não cria lembrete e GET ⇒ { data: null }', async () => {
      const returnTripId = await seedDueScenario();
      await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId: returnTripId })
        .expect(201);

      const scan = await runOnce();
      expect(scan).toMatchObject({ remindersCreated: 0 });

      const response = await reminder(studentToken).expect(200);
      expect((response.body as ApiResponse).data).toBeNull();
      expect(
        await prisma.boardingReminder.count({
          where: { tripId: returnTripId },
        }),
      ).toBe(0);
    });

    it('ausência cancelada: o aluno volta a ser elegível — runOnce cria e GET traz pendente', async () => {
      const returnTripId = await seedDueScenario();
      await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId: returnTripId })
        .expect(201);
      await post('/api/v1/boarding/cancel-absence')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId: returnTripId })
        .expect(200);

      await runOnce();

      const response = await reminder(studentToken).expect(200);
      expect((response.body as ApiResponse).data).toMatchObject({
        tripId: returnTripId,
      });
    });

    it('RETURN dentro do período (< 15 min): runOnce não cria linha', async () => {
      const outboundId = await seedOutboundWithCheckIns([allowedStudentId]);
      const returnTripId = await seedReturn(outboundId, new Date());

      const scan = await runOnce();
      // System-wide sweep ⇒ scannedTrips >= 1 is not exact in parallel; what
      // is deterministic is that a trip outside the period creates nothing.
      expect(scan.remindersCreated).toBe(0);
      expect(
        await prisma.boardingReminder.count({
          where: { tripId: returnTripId },
        }),
      ).toBe(0);
    });

    it('RETURN órfã (relatedTripId nulo): skip — nenhuma linha', async () => {
      await seedReturn(null, new Date(Date.now() - 16 * 60 * 1000));

      const scan = await runOnce();
      expect(scan.remindersCreated).toBe(0);
    });

    it('viagem fora do scan: OUTBOUND ativa e RETURN encerrada com due vencido são ignoradas', async () => {
      // Matrix row "Viagem fora do scan": the sweep only reads type RETURN +
      // status ACTIVE. An ACTIVE OUTBOUND holding a REAL check-in (with the
      // same old startedAt a due RETURN would have) never enters it...
      const activeOutboundId = await seedOutboundWithCheckIns(
        [allowedStudentId],
        'ACTIVE',
      );
      const startedAt = new Date(Date.now() - 16 * 60 * 1000);
      await prisma.trip.update({
        where: { id: activeOutboundId },
        data: { startedAt },
      });

      // ...and neither does a COMPLETED RETURN due 16 min ago, linked to
      // ANOTHER outbound that also holds a real check-in.
      const otherOutboundId = await seedOutboundWithCheckIns([
        allowedStudentId,
      ]);
      const completedReturnId = await seedReturn(otherOutboundId, startedAt);
      await prisma.trip.update({
        where: { id: completedReturnId },
        data: { status: 'COMPLETED' },
      });

      const scan = await runOnce();
      // System-wide sweep ⇒ scannedTrips >= 1 is not exact in parallel; what
      // is deterministic is that neither trip produces a reminder.
      expect(scan.remindersCreated).toBe(0);
      expect(
        await prisma.boardingReminder.count({
          where: { tripId: { in: [activeOutboundId, completedReturnId] } },
        }),
      ).toBe(0);
    });

    it('GET sem viagem de retorno ativa (aluno fora de rota) ⇒ { data: null } antes de tocar o boarding', async () => {
      const response = await reminder(outsiderStudentToken).expect(200);

      expect((response.body as ApiResponse).data).toBeNull();
    });
  });
});
