import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/domains/shared/shell/infra/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

interface ApiResponse {
  data: Record<string, unknown>;
  meta: { timestamp: string };
  error?: { code: string; message: string };
}

describe('BoardingController (e2e)', () => {
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

  const stamp = Date.now();

  const adminCredentials = {
    email: `admin-boarding-e2e-${stamp}@empresa.com`,
    password: 'senha12345',
    name: 'Admin E2E Boarding',
    companyName: 'Empresa E2E Boarding',
  };

  const driverData = {
    name: 'Motorista E2E Boarding',
    email: `driver-boarding-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  // Segundo motorista da MESMA empresa: prova que DRIVER_NOT_ASSIGNED não é
  // apenas isolamento de tenant disfarçado.
  const otherDriverData = {
    name: 'Motorista Sem Vínculo E2E',
    email: `driver-other-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  const allowedStudentData = {
    name: 'Aluno Permitido E2E',
    email: `student-allowed-${stamp}@escola.com`,
    password: 'senha12345',
  };

  const outsiderStudentData = {
    name: 'Aluno Fora da Rota E2E',
    email: `student-outsider-${stamp}@escola.com`,
    password: 'senha12345',
  };

  const post = (path: string) => request(app.getHttpServer()).post(path);

  const checkIn = (
    token: string,
    key: string | null,
    body: Record<string, unknown>,
  ) => {
    const req = post('/api/v1/boarding/check-in').set(
      'Authorization',
      `Bearer ${token}`,
    );
    if (key !== null) req.set('X-Idempotency-Key', key);
    return req.send(body);
  };

  // Cada teste que registra um embarque do mesmo aluno precisa da sua própria
  // viagem: @@unique([tripId, studentId]) faria o segundo virar DUPLICATE_CHECK_IN.
  // Semear aqui, e não reaproveitar a viagem de outro teste, é o que mantém os
  // testes independentes de ordem.
  const seedActiveTrip = async (type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND') => {
    const trip = await prisma.trip.create({
      data: { companyId, routeId, driverId, type, status: 'ACTIVE' },
    });
    return trip.id;
  };

  const login = async (email: string, password: string) => {
    const res = await post('/api/v1/auth/login')
      .send({ email, password })
      // POST /auth/login retorna 201 (sem @HttpCode override) — comportamento
      // pré-existente, fora do escopo desta story corrigir.
      .expect(201);
    return (res.body as ApiResponse).data.accessToken as string;
  };

  const createUser = async (path: string, data: Record<string, unknown>) => {
    const res = await post(path)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(data)
      .expect(201);
    return (res.body as ApiResponse).data.id as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const registerRes = await post('/api/v1/auth/register')
      .send(adminCredentials)
      .expect(201);
    const registerBody = registerRes.body as ApiResponse;
    adminToken = registerBody.data.accessToken as string;
    companyId = (registerBody.data.company as Record<string, unknown>)
      .id as string;

    driverId = await createUser('/api/v1/drivers', driverData);
    await createUser('/api/v1/drivers', otherDriverData);
    allowedStudentId = await createUser('/api/v1/students', allowedStudentData);
    outsiderStudentId = await createUser(
      '/api/v1/students',
      outsiderStudentData,
    );

    driverToken = await login(driverData.email, driverData.password);
    otherDriverToken = await login(
      otherDriverData.email,
      otherDriverData.password,
    );
    studentToken = await login(
      allowedStudentData.email,
      allowedStudentData.password,
    );

    const routeRes = await post('/api/v1/routes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rota E2E Boarding',
        originCity: 'Viçosa',
        destinationCity: 'Belo Horizonte',
      })
      .expect(201);
    routeId = (routeRes.body as ApiResponse).data.id as string;

    await post(`/api/v1/routes/${routeId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: allowedStudentId })
      .expect(201);

    await post(`/api/v1/routes/${routeId}/drivers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverId })
      .expect(201);

    // TripController não tem JwtAuthGuard religado ainda (review pendente da
    // Story 3.1) — seed direto via Prisma.
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
    const otherAdminRes = await post('/api/v1/auth/register')
      .send({
        email: `admin-other-${stamp}@empresa.com`,
        password: 'senha12345',
        name: 'Admin Outra Empresa',
        companyName: 'Outra Empresa E2E',
      })
      .expect(201);
    const otherCompanyId = (
      (otherAdminRes.body as ApiResponse).data.company as Record<
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
