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

// Story 4.3 block of the former boarding.e2e-spec.ts (wrap-4 slice):
// absence cancellation — validation, append-only anulamento, roster revert,
// cancellation window and replay semantics.

describe('BoardingController (e2e) — POST /api/v1/boarding/cancel-absence (Story 4.3)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverToken: string;
  let studentToken: string;
  let outsiderStudentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;
  let completedTripId: string;
  let otherCompanyTripId: string;

  const post = (path: string) => http(app).post(path);

  const seedActiveTrip = async (type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND') =>
    seedTrip(prisma, { companyId, routeId, driverId }, type);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const scenario = await seedCompanyScenario(app, prisma, 'boarding-cancel');
    driverToken = scenario.driverToken;
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

  describe('POST /api/v1/boarding/cancel-absence — validação e regras de negócio (Story 4.3)', () => {
    const cancelAbsence = (
      token: string,
      body: Record<string, unknown> = { tripId: randomUUID() },
      key: string | null = randomUUID(),
    ) => {
      const req = post('/api/v1/boarding/cancel-absence')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      if (key !== null) req.set('X-Idempotency-Key', key);
      return req;
    };

    const registerAbsence = (tripId: string, key: string = randomUUID()) =>
      post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', key)
        .send({ tripId })
        .expect(201);

    const rosterOf = (tripId: string) =>
      http(app)
        .get(`/api/v1/trips/${tripId}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

    it('body sem tripId (ou não-UUID) ⇒ 400 VALIDATION_ERROR; sem header ⇒ MISSING_IDEMPOTENCY_KEY', async () => {
      const missing = await cancelAbsence(
        studentToken,
        { tripId: randomUUID() },
        null,
      ).expect(400);
      expect((missing.body as ApiResponse).error?.code).toBe(
        'MISSING_IDEMPOTENCY_KEY',
      );

      const malformed = await cancelAbsence(studentToken, {}).expect(400);
      expect((malformed.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      const notUuid = await cancelAbsence(studentToken, {
        tripId: 'not-a-uuid',
      }).expect(400);
      expect((notUuid.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('caminho feliz: 200 com o shape do contrato; linha anula (cancelledAt + cancelIdempotencyKey) sem deletar nada', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await registerAbsence(tripId);

      const response = await cancelAbsence(studentToken, { tripId }).expect(
        200,
      );

      const data = (response.body as ApiResponse).data as Record<
        string,
        string
      >;
      expect(data).toMatchObject({
        studentId: allowedStudentId,
        tripId,
        status: 'NOT_CHECKED_IN',
      });
      expect(Number.isNaN(Date.parse(data.cancelledAt))).toBe(false);
      expect(data).not.toHaveProperty('companyId');
      expect(data).not.toHaveProperty('cancelIdempotencyKey');

      const rows = await prisma.boardingAbsence.findMany({
        where: { tripId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].cancelledAt).not.toBeNull();
      expect(rows[0].cancelIdempotencyKey).not.toBeNull();
      // Append-only: o registro original (notifiedAt, key) permanece na linha.
      expect(rows[0].notifiedAt).toBeDefined();
      expect(rows[0].idempotencyKey).toBeDefined();
    });

    it('roster reverte: aluno volta a NOT_CHECKED_IN e o total re-inclui o aluno', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await registerAbsence(tripId);

      const before = await rosterOf(tripId);
      expect(
        (before.body as unknown as { data: { summary: unknown } }).data.summary,
      ).toEqual({
        boarded: 0,
        total: 0,
      });

      await cancelAbsence(studentToken, { tripId }).expect(200);

      const after = await rosterOf(tripId);
      const body = after.body as unknown as {
        data: {
          students: Array<{ studentId: string; status: string }>;
          summary: { boarded: number; total: number };
        };
      };
      expect(body.data.students[0]).toMatchObject({
        studentId: allowedStudentId,
        status: 'NOT_CHECKED_IN',
      });
      expect(body.data.summary).toEqual({ boarded: 0, total: 1 });
    });

    it('aluno já CHECKED_IN: o cancelamento não rejeita (o contrato não declara erro de check-in aqui) e o roster mantém CHECKED_IN', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await registerAbsence(tripId);

      // O motorista presente embarcou o aluno DEPOIS do aviso de ausência.
      await post('/api/v1/boarding/check-in')
        .set('Authorization', `Bearer ${driverToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ studentId: allowedStudentId, tripId })
        .expect(201);

      // A autoridade do check-in vive no roster (last-write-wins), não no
      // cancelamento — este endpoint não tem ALREADY_CHECKED_IN no contrato.
      const response = await cancelAbsence(studentToken, { tripId }).expect(
        200,
      );
      expect(
        ((response.body as ApiResponse).data as Record<string, string>).status,
      ).toBe('NOT_CHECKED_IN');

      const body = (
        (await rosterOf(tripId)).body as unknown as {
          data: {
            students: Array<{ studentId: string; status: string }>;
            summary: { boarded: number; total: number };
          };
        }
      ).data;
      expect(body.students[0]).toMatchObject({
        studentId: allowedStudentId,
        status: 'CHECKED_IN',
      });
      expect(body.summary).toEqual({ boarded: 1, total: 1 });
    });

    it('viagem encerrada ou de outra empresa ⇒ 409 TRIP_NOT_ACTIVE', async () => {
      const completed = await cancelAbsence(studentToken, {
        tripId: completedTripId,
      }).expect(409);
      expect((completed.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const otherCompany = await cancelAbsence(studentToken, {
        tripId: otherCompanyTripId,
      }).expect(409);
      expect((otherCompany.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('aluno fora da rota ⇒ 403 STUDENT_NOT_ON_TRIP', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const response = await cancelAbsence(outsiderStudentToken, {
        tripId,
      }).expect(403);
      expect((response.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );
    });

    it('fora da janela ⇒ 409 CANCELLATION_PERIOD_EXPIRED, sem anular a linha nem gravar cancel key', async () => {
      const tripId = await seedActiveTrip('RETURN');
      // O endpoint não registra ausência "no passado": a janela vencida só é
      // alcançável semeando a linha direto no banco (padrão seedActiveTrip de
      // estado próprio por teste).
      await prisma.boardingAbsence.create({
        data: {
          companyId,
          tripId,
          studentId: allowedStudentId,
          idempotencyKey: randomUUID(),
          notifiedAt: new Date(Date.now() - 10 * 60 * 1000),
          cancellableUntil: new Date(Date.now() - 5 * 60 * 1000),
        },
      });

      const response = await cancelAbsence(studentToken, { tripId }).expect(
        409,
      );
      expect((response.body as ApiResponse).error?.code).toBe(
        'CANCELLATION_PERIOD_EXPIRED',
      );

      const stored = await prisma.boardingAbsence.findFirst({
        where: { tripId },
      });
      expect(stored?.cancelledAt).toBeNull();
      expect(stored?.cancelIdempotencyKey).toBeNull();
    });

    it('sem ausência ativa ⇒ 404 ABSENCE_NOT_FOUND (nunca registrada)', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const response = await cancelAbsence(studentToken, { tripId }).expect(
        404,
      );
      expect((response.body as ApiResponse).error?.code).toBe(
        'ABSENCE_NOT_FOUND',
      );
    });

    it('ausência já cancelada com key DIFERENTE ⇒ 404 ABSENCE_NOT_FOUND — o 404 é só para key diferente', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await registerAbsence(tripId);
      await cancelAbsence(studentToken, { tripId }).expect(200);

      const response = await cancelAbsence(studentToken, { tripId }).expect(
        404,
      );
      expect((response.body as ApiResponse).error?.code).toBe(
        'ABSENCE_NOT_FOUND',
      );
    });

    it('replay: mesma X-Idempotency-Key do cancelamento devolve 200 com o resultado original, sem re-anular', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await registerAbsence(tripId);
      const cancelKey = randomUUID();

      const first = await cancelAbsence(
        studentToken,
        { tripId },
        cancelKey,
      ).expect(200);
      const second = await cancelAbsence(
        studentToken,
        { tripId },
        cancelKey,
      ).expect(200);

      expect((second.body as ApiResponse).data).toEqual(
        (first.body as ApiResponse).data,
      );

      const rows = await prisma.boardingAbsence.findMany({
        where: { tripId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].cancelIdempotencyKey).toBe(cancelKey);
    });

    it('replay do cancelamento funciona mesmo com a viagem já encerrada — o reenvio não pode virar erro', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await registerAbsence(tripId);
      const cancelKey = randomUUID();

      const first = await cancelAbsence(
        studentToken,
        { tripId },
        cancelKey,
      ).expect(200);

      await prisma.trip.update({
        where: { id: tripId },
        data: { status: 'COMPLETED' },
      });

      const second = await cancelAbsence(
        studentToken,
        { tripId },
        cancelKey,
      ).expect(200);
      expect((second.body as ApiResponse).data).toEqual(
        (first.body as ApiResponse).data,
      );
    });

    it('replay do REGISTRO (key K) após o cancelamento devolve 201 com a linha ORIGINAL, sem segunda linha (fecha o defer #3 da 4.1)', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const registerKey = randomUUID();
      const first = await registerAbsence(tripId, registerKey);

      await cancelAbsence(studentToken, { tripId }).expect(200);

      // O reenvio do registro com a MESMA key NÃO vira 404 pós-cancelamento:
      // a key do registro segue na linha anulada e o replay devolve o payload
      // original (id, notifiedAt, cancellableUntil), sem criar nova linha.
      const replay = await registerAbsence(tripId, registerKey);
      expect((replay.body as ApiResponse).data).toEqual(
        (first.body as ApiResponse).data,
      );

      const rows = await prisma.boardingAbsence.findMany({
        where: { tripId },
      });
      expect(rows).toHaveLength(1);
    });

    it('mesma cancel key para outra viagem ⇒ 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await registerAbsence(tripId);
      const cancelKey = randomUUID();
      await cancelAbsence(studentToken, { tripId }, cancelKey).expect(200);

      const otherTripId = await seedActiveTrip('RETURN');
      await registerAbsence(otherTripId);
      const response = await cancelAbsence(
        studentToken,
        { tripId: otherTripId },
        cancelKey,
      ).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'IDEMPOTENCY_KEY_CONFLICT',
      );
    });
  });
});
