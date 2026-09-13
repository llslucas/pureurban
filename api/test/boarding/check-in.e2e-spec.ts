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
import {
  checkIn as checkInRequest,
  seedCompanyScenario,
  seedTrip,
} from '../support/company-scenario.js';

// Story 3.3a/3.4b block of the former boarding.e2e-spec.ts (wrap-4 slice):
// check-in auth, input validation, business rules, idempotent replay and the
// offline-queue occurredAt window.

describe('BoardingController (e2e) — POST /api/v1/boarding/check-in (stories 3.3a/3.4b)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let studentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;
  let outsiderStudentId: string;
  let completedTripId: string;
  let otherCompanyTripId: string;

  const post = (path: string) => http(app).post(path);

  const checkIn = (
    token: string,
    key: string | null,
    body: Record<string, unknown>,
  ) => checkInRequest(app, token, key, body);

  const seedActiveTrip = async (type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND') =>
    seedTrip(prisma, { companyId, routeId, driverId }, type);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const scenario = await seedCompanyScenario(app, prisma, 'boarding-checkin');
    adminToken = scenario.adminToken;
    driverToken = scenario.driverToken;
    otherDriverToken = scenario.otherDriverToken;
    studentToken = scenario.studentToken;
    routeId = scenario.routeId;
    driverId = scenario.driverId;
    companyId = scenario.companyId;
    allowedStudentId = scenario.allowedStudentId;
    outsiderStudentId = scenario.outsiderStudentId;
    completedTripId = scenario.completedTripId;
    otherCompanyTripId = scenario.otherCompanyTripId;
  });

  afterAll(async () => {
    await closeApp(app);
  });

  describe('POST /api/v1/boarding/check-in — autenticação e autorização', () => {
    it('deve retornar 401 sem token', async () => {
      const tripId = await seedActiveTrip();
      await post('/api/v1/boarding/check-in')
        .set('X-Idempotency-Key', randomUUID())
        .send({ studentId: allowedStudentId, tripId })
        .expect(401);
    });

    it('deve retornar 403 para role ADMIN (somente DRIVER)', async () => {
      const tripId = await seedActiveTrip();
      await checkIn(adminToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(403);
    });

    it('deve retornar 403 para role STUDENT (somente DRIVER)', async () => {
      const tripId = await seedActiveTrip();
      await checkIn(studentToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(403);
    });

    it('deve retornar DRIVER_NOT_ASSIGNED para motorista que não é o da viagem', async () => {
      const tripId = await seedActiveTrip();

      const response = await checkIn(otherDriverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(403);

      expect((response.body as ApiResponse).error?.code).toBe(
        'DRIVER_NOT_ASSIGNED',
      );

      // E nada foi persistido: o motorista certo ainda consegue registrar.
      await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(201);
    });
  });

  describe('POST /api/v1/boarding/check-in — validação de entrada', () => {
    it('sem header X-Idempotency-Key e com body inválido: deve vir MISSING_IDEMPOTENCY_KEY, não INVALID_QR_CODE', async () => {
      const response = await checkIn(driverToken, null, {
        studentId: 'not-a-uuid',
      }).expect(400);

      expect((response.body as ApiResponse).error?.code).toBe(
        'MISSING_IDEMPOTENCY_KEY',
      );
    });

    it('deve retornar MISSING_IDEMPOTENCY_KEY quando o header só tem espaços', async () => {
      const tripId = await seedActiveTrip();
      const response = await checkIn(driverToken, '   ', {
        studentId: allowedStudentId,
        tripId,
      }).expect(400);

      expect((response.body as ApiResponse).error?.code).toBe(
        'MISSING_IDEMPOTENCY_KEY',
      );
    });

    it('key gigante deve virar INVALID_IDEMPOTENCY_KEY (400), não erro de infraestrutura (500)', async () => {
      const tripId = await seedActiveTrip();
      const response = await checkIn(driverToken, 'a'.repeat(5000), {
        studentId: allowedStudentId,
        tripId,
      }).expect(400);

      expect((response.body as ApiResponse).error?.code).toBe(
        'INVALID_IDEMPOTENCY_KEY',
      );
    });

    it('deve retornar INVALID_QR_CODE para studentId malformado com header presente', async () => {
      const tripId = await seedActiveTrip();
      const response = await checkIn(driverToken, randomUUID(), {
        studentId: 'not-a-uuid',
        tripId,
      }).expect(400);

      expect((response.body as ApiResponse).error?.code).toBe(
        'INVALID_QR_CODE',
      );
    });
  });

  describe('POST /api/v1/boarding/check-in — regras de negócio', () => {
    it('deve retornar TRIP_NOT_ACTIVE para viagem inexistente', async () => {
      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId: '00000000-0000-4000-8000-000000000000',
      }).expect(409);

      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('deve retornar TRIP_NOT_ACTIVE para viagem já ENCERRADA', async () => {
      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId: completedTripId,
      }).expect(409);

      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('viagem ATIVA de outra empresa deve dar TRIP_NOT_ACTIVE (409), nunca 404 nem vazamento entre tenants', async () => {
      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId: otherCompanyTripId,
      }).expect(409);

      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('deve retornar STUDENT_NOT_ALLOWED para aluno não vinculado à rota da viagem', async () => {
      const tripId = await seedActiveTrip();
      const response = await checkIn(driverToken, randomUUID(), {
        studentId: outsiderStudentId,
        tripId,
      }).expect(403);

      expect((response.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ALLOWED',
      );
    });

    it('caminho feliz: deve registrar o check-in e retornar 201 em menos de 2s (NFR1)', async () => {
      const tripId = await seedActiveTrip();
      const start = Date.now();

      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(201);

      expect(Date.now() - start).toBeLessThan(2000);

      const body = response.body as ApiResponse;
      expect(body.data).toMatchObject({
        studentId: allowedStudentId,
        tripId,
        status: 'CHECKED_IN',
      });
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('checkedInAt');
      // Nem companyId nem idempotencyKey nem recordedBy saem na resposta.
      expect(body.data).not.toHaveProperty('companyId');
      expect(body.data).not.toHaveProperty('idempotencyKey');
      expect(body.data).not.toHaveProperty('recordedBy');
    });

    it('deve gravar recordedBy com o motorista autenticado (trilha de auditoria)', async () => {
      const tripId = await seedActiveTrip();

      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(201);

      const recordId = (response.body as ApiResponse).data.id as string;
      const stored = await prisma.boardingRecord.findUnique({
        where: { id: recordId },
      });
      expect(stored?.recordedBy).toBe(driverId);
    });

    it('deve retornar DUPLICATE_CHECK_IN ao repetir o check-in do mesmo aluno com key diferente', async () => {
      // Precondição própria: este teste não depende de nenhum outro ter rodado.
      const tripId = await seedActiveTrip();
      await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(201);

      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(409);

      expect((response.body as ApiResponse).error?.code).toBe(
        'DUPLICATE_CHECK_IN',
      );
    });
  });

  describe('POST /api/v1/boarding/check-in — idempotência', () => {
    it('replay: reenviar a mesma X-Idempotency-Key retorna 201 com o resultado anterior, sem duplicar', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const idempotencyKey = randomUUID();
      const payload = { studentId: allowedStudentId, tripId };

      const first = await checkIn(driverToken, idempotencyKey, payload).expect(
        201,
      );
      const second = await checkIn(driverToken, idempotencyKey, payload).expect(
        201,
      );

      expect((second.body as ApiResponse).data).toEqual(
        (first.body as ApiResponse).data,
      );

      const count = await prisma.boardingRecord.count({ where: { tripId } });
      expect(count).toBe(1);
    });

    it('mesma key para outro aluno deve dar IDEMPOTENCY_KEY_CONFLICT, nunca o registro do primeiro', async () => {
      const tripId = await seedActiveTrip();
      const idempotencyKey = randomUUID();

      await checkIn(driverToken, idempotencyKey, {
        studentId: allowedStudentId,
        tripId,
      }).expect(201);

      const response = await checkIn(driverToken, idempotencyKey, {
        studentId: outsiderStudentId,
        tripId,
      }).expect(409);

      expect((response.body as ApiResponse).error?.code).toBe(
        'IDEMPOTENCY_KEY_CONFLICT',
      );
    });

    it('replay continua funcionando depois da viagem ser encerrada — o item não pode ficar preso na fila', async () => {
      const tripId = await seedActiveTrip();
      const idempotencyKey = randomUUID();
      const payload = { studentId: allowedStudentId, tripId };

      const first = await checkIn(driverToken, idempotencyKey, payload).expect(
        201,
      );

      await prisma.trip.update({
        where: { id: tripId },
        data: { status: 'COMPLETED' },
      });

      const second = await checkIn(driverToken, idempotencyKey, payload).expect(
        201,
      );
      expect((second.body as ApiResponse).data).toEqual(
        (first.body as ApiResponse).data,
      );
    });
  });

  describe('POST /api/v1/boarding/check-in — occurredAt (fila offline)', () => {
    it('deve gravar o horário informado, não o do processamento', async () => {
      const tripId = await seedActiveTrip();
      const occurredAt = new Date(Date.now() - 35 * 60 * 1000).toISOString();

      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
        occurredAt,
      }).expect(201);

      expect((response.body as ApiResponse).data.checkedInAt).toBe(occurredAt);
    });

    it('deve rejeitar occurredAt no futuro com INVALID_QR_CODE', async () => {
      const tripId = await seedActiveTrip();
      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
        occurredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }).expect(400);

      expect((response.body as ApiResponse).error?.code).toBe(
        'INVALID_QR_CODE',
      );
    });

    it('deve rejeitar occurredAt de mais de 24h atrás com INVALID_QR_CODE', async () => {
      const tripId = await seedActiveTrip();
      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
        occurredAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      }).expect(400);

      expect((response.body as ApiResponse).error?.code).toBe(
        'INVALID_QR_CODE',
      );
    });

    it('deve rejeitar occurredAt não-ISO com INVALID_QR_CODE', async () => {
      const tripId = await seedActiveTrip();
      const response = await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
        occurredAt: 'ontem de manhã',
      }).expect(400);

      expect((response.body as ApiResponse).error?.code).toBe(
        'INVALID_QR_CODE',
      );
    });
  });
});
