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
  createUser as createUserRequest,
  login as loginRequest,
  seedCompanyScenario,
  seedTrip,
} from '../support/company-scenario.js';

// Story 4.1 block of the former boarding.e2e-spec.ts (wrap-4 slice): absence
// registration (validation, business rules, idempotency) and the trip roster
// reflecting it.

describe('BoardingController (e2e) — not-returning e roster (Story 4.1)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let driverToken: string;
  let studentToken: string;
  let outsiderStudentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;
  let completedTripId: string;
  let otherCompanyTripId: string;
  let stamp: number;

  const post = (path: string) => http(app).post(path);

  const checkIn = (
    token: string,
    key: string | null,
    body: Record<string, unknown>,
  ) => checkInRequest(app, token, key, body);

  const createUser = async (path: string, data: Record<string, unknown>) =>
    createUserRequest(app, adminToken, path, data);

  const login = async (email: string, password: string) =>
    loginRequest(app, email, password);

  const seedActiveTrip = async (type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND') =>
    seedTrip(prisma, { companyId, routeId, driverId }, type);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const scenario = await seedCompanyScenario(
      app,
      prisma,
      'boarding-notreturning',
    );
    adminToken = scenario.adminToken;
    driverToken = scenario.driverToken;
    studentToken = scenario.studentToken;
    outsiderStudentToken = scenario.outsiderStudentToken;
    routeId = scenario.routeId;
    driverId = scenario.driverId;
    companyId = scenario.companyId;
    allowedStudentId = scenario.allowedStudentId;
    completedTripId = scenario.completedTripId;
    otherCompanyTripId = scenario.otherCompanyTripId;
    stamp = scenario.stamp;
  });

  afterAll(async () => {
    await closeApp(app);
  });

  describe('POST /api/v1/boarding/not-returning — validação e regras de negócio (Story 4.1)', () => {
    const notReturning = (
      token: string,
      body: Record<string, unknown> = { tripId: randomUUID() },
      key: string | null = randomUUID(),
    ) => {
      const req = post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      if (key !== null) req.set('X-Idempotency-Key', key);
      return req;
    };

    it('body sem tripId (ou não-UUID) deve virar VALIDATION_ERROR (400), não erro de infra', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const response = await notReturning(
        studentToken,
        {},
        randomUUID(),
      ).expect(400);
      expect((response.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      const malformed = await notReturning(studentToken, {
        tripId: 'not-a-uuid',
      }).expect(400);
      expect((malformed.body as ApiResponse).error?.code).toBe(
        'VALIDATION_ERROR',
      );

      // Viagem válida inutilizada por este teste: encerra para não vazar estado.
      await prisma.trip.update({
        where: { id: tripId },
        data: { status: 'COMPLETED' },
      });
    });

    it('header X-Idempotency-Key ausente/vazio ⇒ MISSING_IDEMPOTENCY_KEY; gigante ⇒ INVALID_IDEMPOTENCY_KEY', async () => {
      const missing = await notReturning(
        studentToken,
        { tripId: randomUUID() },
        null,
      ).expect(400);
      expect((missing.body as ApiResponse).error?.code).toBe(
        'MISSING_IDEMPOTENCY_KEY',
      );

      const giant = await notReturning(
        studentToken,
        { tripId: randomUUID() },
        'a'.repeat(5000),
      ).expect(400);
      expect((giant.body as ApiResponse).error?.code).toBe(
        'INVALID_IDEMPOTENCY_KEY',
      );
    });

    it('viagem inexistente, encerrada ou de outra empresa ⇒ 409 TRIP_NOT_ACTIVE', async () => {
      const nonexistent = await notReturning(studentToken, {
        tripId: '00000000-0000-4000-8000-000000000000',
      }).expect(409);
      expect((nonexistent.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const completed = await notReturning(studentToken, {
        tripId: completedTripId,
      }).expect(409);
      expect((completed.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const otherCompany = await notReturning(studentToken, {
        tripId: otherCompanyTripId,
      }).expect(409);
      expect((otherCompany.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('aluno fora da rota da viagem ⇒ 403 STUDENT_NOT_ON_TRIP', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const response = await notReturning(outsiderStudentToken, {
        tripId,
      }).expect(403);

      expect((response.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );
    });

    it('caminho feliz: 201 persiste a ausência; cancellableUntil = notifiedAt + 2 min; sem vazamento de campos internos', async () => {
      const tripId = await seedActiveTrip('RETURN');

      const response = await notReturning(studentToken, { tripId }).expect(201);

      const body = response.body as ApiResponse;
      const data = body.data as Record<string, string>;
      expect(data.status).toBe('NOT_RETURNING');
      expect(data.studentId).toBe(allowedStudentId);
      expect(data.tripId).toBe(tripId);
      expect(
        Date.parse(data.cancellableUntil) - Date.parse(data.notifiedAt),
      ).toBe(2 * 60 * 1000);
      expect(data).not.toHaveProperty('companyId');
      expect(data).not.toHaveProperty('idempotencyKey');

      const stored = await prisma.boardingAbsence.findFirst({
        where: { tripId, studentId: allowedStudentId },
      });
      expect(stored).not.toBeNull();
      expect(stored!.notifiedAt.toISOString()).toBe(data.notifiedAt);
    });

    it('ausência duplicada com key diferente ⇒ 409 ALREADY_NOT_RETURNING e nenhuma segunda linha ativa', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await notReturning(studentToken, { tripId }).expect(201);

      const response = await notReturning(studentToken, { tripId }).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'ALREADY_NOT_RETURNING',
      );

      const activeRows = await prisma.boardingAbsence.findMany({
        where: { tripId, studentId: allowedStudentId, cancelledAt: null },
      });
      expect(activeRows).toHaveLength(1);
    });

    it('aluno já CHECKED_IN ⇒ 409 ALREADY_CHECKED_IN — o check-in do motorista tem autoridade', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(201);

      const response = await notReturning(studentToken, { tripId }).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'ALREADY_CHECKED_IN',
      );

      const absences = await prisma.boardingAbsence.findMany({
        where: { tripId, studentId: allowedStudentId },
      });
      expect(absences).toHaveLength(0);
    });
  });

  describe('POST /api/v1/boarding/not-returning — idempotência (Story 4.1)', () => {
    const notReturning = (
      token: string,
      body: Record<string, unknown>,
      key: string,
    ) =>
      post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Idempotency-Key', key)
        .send(body);

    it('replay: reenviar a mesma X-Idempotency-Key retorna 201 com o resultado original, sem duplicar', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const key = randomUUID();
      const payload = { tripId };

      const first = await notReturning(studentToken, payload, key).expect(201);
      const second = await notReturning(studentToken, payload, key).expect(201);

      expect((second.body as ApiResponse).data).toEqual(
        (first.body as ApiResponse).data,
      );

      const count = await prisma.boardingAbsence.count({ where: { tripId } });
      expect(count).toBe(1);
    });

    it('mesma key para outra viagem ⇒ 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const key = randomUUID();

      await notReturning(studentToken, { tripId }, key).expect(201);

      const otherTripId = await seedActiveTrip('RETURN');
      const response = await notReturning(
        studentToken,
        { tripId: otherTripId },
        key,
      ).expect(409);

      expect((response.body as ApiResponse).error?.code).toBe(
        'IDEMPOTENCY_KEY_CONFLICT',
      );
    });

    it('replay continua funcionando depois da viagem ser encerrada — o item não pode ficar preso na fila', async () => {
      const tripId = await seedActiveTrip('RETURN');
      const key = randomUUID();
      const payload = { tripId };

      const first = await notReturning(studentToken, payload, key).expect(201);

      await prisma.trip.update({
        where: { id: tripId },
        data: { status: 'COMPLETED' },
      });

      const second = await notReturning(studentToken, payload, key).expect(201);
      expect((second.body as ApiResponse).data).toEqual(
        (first.body as ApiResponse).data,
      );
    });
  });

  describe('GET /api/v1/trips/:id/students — roster pós-ausência (Story 4.1)', () => {
    it('aluno com ausência ativa aparece NOT_RETURNING e o total do resumo o exclui', async () => {
      // Rota com um único aluno vinculado: "0/0" prova a exclusão do total.
      const tripId = await seedActiveTrip('RETURN');
      await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId })
        .expect(201);

      const response = await http(app)
        .get(`/api/v1/trips/${tripId}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const body = response.body as unknown as {
        data: {
          students: Array<{
            studentId: string;
            status: string;
            checkedInAt: string | null;
          }>;
          summary: { boarded: number; total: number };
        };
      };

      expect(body.data.students).toHaveLength(1);
      const student = body.data.students[0];
      expect(student.studentId).toBe(allowedStudentId);
      expect(student.status).toBe('NOT_RETURNING');
      expect(student.checkedInAt).toBeNull();
      expect(body.data.summary).toEqual({ boarded: 0, total: 0 });
    });

    it('check-in E ausência ⇒ CHECKED_IN prevalece e o aluno volta a contar no total', async () => {
      const tripId = await seedActiveTrip('RETURN');
      await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId })
        .expect(201);

      // O motorista presente embarcou o aluno DEPOIS do aviso de ausência:
      // last-write-wins do épico — o check-in vence.
      await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(201);

      const response = await http(app)
        .get(`/api/v1/trips/${tripId}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const body = response.body as unknown as {
        data: {
          students: Array<{ studentId: string; status: string }>;
          summary: { boarded: number; total: number };
        };
      };

      expect(body.data.students[0].status).toBe('CHECKED_IN');
      expect(body.data.summary).toEqual({ boarded: 1, total: 1 });
    });

    // Pluralidade sem teste era o RV2: todos os casos anteriores exercitavam
    // UMA ausência. Dois alunos ausentes na MESMA viagem têm de refletir 2 no
    // estado que o motorista vê — 2 badges NOT_RETURNING e o total excluindo os
    // dois (o ajuste otimista 2x da tela consome este contrato).
    it('2 alunos ausentes na MESMA viagem: 2 NOT_RETURNING no roster e o total exclui os dois (RV2)', async () => {
      const tripId = await seedActiveTrip('RETURN');

      // Segundo aluno NA rota, semeado no teste: o beforeAll do arquivo vincula
      // só o allowedStudentId, e o @@unique([tripId, studentId]) pede alunos
      // distintos — não reaproveito a viagem de outro teste.
      const secondStudentId = await createUser('/api/v1/students', {
        name: 'Segundo Aluno Ausente E2E',
        email: `student-second-absent-${stamp}@escola.com`,
        password: 'senha12345',
      });
      await post(`/api/v1/routes/${routeId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: secondStudentId })
        .expect(201);
      const secondStudentToken = await login(
        `student-second-absent-${stamp}@escola.com`,
        'senha12345',
      );

      await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId })
        .expect(201);
      await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId })
        .expect(201);

      const response = await http(app)
        .get(`/api/v1/trips/${tripId}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const body = response.body as unknown as {
        data: {
          students: Array<{ studentId: string; status: string }>;
          summary: { boarded: number; total: number };
        };
      };

      // Ordem-independente de propósito: ordenar por studentId aqui flakaria
      // (localeCompare não ordena hex como codepoint e o id do segundo aluno é
      // aleatório por execução).
      expect(body.data.students).toHaveLength(2);
      const statusByStudent = new Map(
        body.data.students.map((s) => [s.studentId, s.status]),
      );
      expect(statusByStudent.get(allowedStudentId)).toBe('NOT_RETURNING');
      expect(statusByStudent.get(secondStudentId)).toBe('NOT_RETURNING');
      // O total do resumo exclui AMBOS os ausentes — não só o primeiro.
      expect(body.data.summary).toEqual({ boarded: 0, total: 0 });
    });
  });
});
