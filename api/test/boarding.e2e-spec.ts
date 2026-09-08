import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/domains/shared/shell/infra/prisma.service.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

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
  let outsiderStudentToken: string;
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
    // Token do aluno FORA da rota: prova que STUDENT_NOT_ON_TRIP é regra de
    // negócio (403 do core), não isolamento de tenant disfarçado.
    outsiderStudentToken = await login(
      outsiderStudentData.email,
      outsiderStudentData.password,
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
      const req = post('/api/v1/boarding/not-returning').send({ tripId });
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      if (key !== null) req.set('X-Idempotency-Key', key);
      return req;
    };

    const cancelAbsence = (
      token: string | null,
      tripId: string = randomUUID(),
    ) => {
      const req = post('/api/v1/boarding/cancel-absence').send({ tripId });
      if (token !== null) req.set('Authorization', `Bearer ${token}`);
      return req.set('X-Idempotency-Key', randomUUID());
    };

    const events = (token: string | null) => {
      const req = request(app.getHttpServer()).get('/api/v1/boarding/events');
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

    it('STUDENT em /events deve dar 403 — o stream é do motorista', async () => {
      await events(studentToken).expect(403);
    });

    it('sem token, as 3 rotas novas devem dar 401', async () => {
      await notReturning(null).expect(401);
      await cancelAbsence(null).expect(401);
      await events(null).expect(401);
    });
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

    interface StreamMessage {
      event: string;
      data: Record<string, unknown>;
    }

    interface StreamHandle {
      ready: Promise<void>;
      status: () => number | undefined;
      headers: () => Record<string, unknown>;
      messages: StreamMessage[];
      firstMessage: Promise<StreamMessage>;
      closed: Promise<void>;
      abort: () => void;
    }

    // O Response do superagent não resolve tipos sob o eslint-type-checked —
    // o shape mínimo que o teste usa vem daqui.
    const responseOf = (
      r: unknown,
    ): {
      statusCode?: number;
      headers?: Record<string, unknown>;
      on: (event: string, listener: () => void) => unknown;
    } =>
      (
        r as {
          response: {
            statusCode?: number;
            headers?: Record<string, unknown>;
            on: (event: string, listener: () => void) => unknown;
          };
        }
      ).response;

    const openStream = (token: string): StreamHandle => {
      const messages: StreamMessage[] = [];
      let resolveReady!: () => void;
      let resolveFirst: (message: StreamMessage) => void = () => {};
      let resolveClosed: () => void = () => {};
      const ready = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      const firstMessage = new Promise<StreamMessage>((resolve) => {
        resolveFirst = resolve;
      });
      const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve;
      });

      const req = request(app.getHttpServer())
        .get('/api/v1/boarding/events')
        .set('Authorization', `Bearer ${token}`)
        // Streaming sem buffer: o superagent não resolve a promessa do request
        // em respostas não terminadas — `ready`, `firstMessage` e `closed`
        // são resolvidos pelos eventos do parser.
        .buffer(false)
        .parse((res: IncomingMessage) => {
          resolveReady();
          res.on('error', () => resolveClosed());
          res.on('end', () => resolveClosed());
          res.on('close', () => resolveClosed());
          let raw = '';
          res.on('data', (chunk: Buffer) => {
            raw += chunk.toString();
            let boundary = raw.indexOf('\n\n');
            while (boundary >= 0) {
              const block = raw.slice(0, boundary);
              raw = raw.slice(boundary + 2);
              boundary = raw.indexOf('\n\n');
              const lines = block.split('\n');
              const eventLine = lines.find((line) => line.startsWith('event:'));
              const dataLine = lines.find((line) => line.startsWith('data:'));
              if (!eventLine) continue;
              const message: StreamMessage = {
                event: eventLine.slice('event:'.length).trim(),
                data: dataLine
                  ? (JSON.parse(
                      dataLine.slice('data:'.length).trim(),
                    ) as Record<string, unknown>)
                  : {},
              };
              messages.push(message);
              resolveFirst(message);
            }
          });
        });

      // O request fica pendente até o abort; sem isso o worker quebra com
      // unhandled rejection ('Aborted') quando o teste encerra a conexão.
      void Promise.resolve(req).catch(() => undefined);

      return {
        // Parser anexado ⇒ headers do stream chegaram ⇒ guard passou e o Nest
        // já subscreveu o canal Redis (subscrição síncrona, mesmo tick do pipe).
        ready: ready.then(() => {
          // O Response do superagent reemite o ECONNRESET do socket no abort —
          // sem listener vira uncaught exception e derruba o worker do vitest.
          responseOf(req).on('error', () => resolveClosed());
        }),
        headers: () => responseOf(req).headers ?? {},
        status: () => responseOf(req).statusCode,
        messages,
        firstMessage,
        closed,
        abort: () => {
          try {
            req.abort();
          } catch {
            // Stream já fechado — nada a abortar.
          }
        },
      };
    };

    // O supertest fecha o server após o end() de cada request que ele próprio
    // bindou (serverAddress → app.listen(0) quando não há porta; end() →
    // server.close()). Com um stream SSE aberto, o close() pendura esperando a
    // conexão e requests seguintes não conectam. Bind explícito uma vez: os
    // Test passam a reusar a porta e nunca anexam o _server que fecha o app.
    beforeAll(async () => {
      const server = app.getHttpServer() as HttpServer;
      if (!server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.once('listening', () => resolve());
          server.once('error', reject);
          server.listen(0);
        });
      }
    });

    beforeEach(endAllActiveTrips);

    const events = (token: string | null) => {
      const req = request(app.getHttpServer()).get('/api/v1/boarding/events');
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

      await request(app.getHttpServer())
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
      request(app.getHttpServer())
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
      await checkIn(driverToken, randomUUID(), {
        studentId: allowedStudentId,
        tripId,
      }).expect(201);

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

  describe('GET /api/v1/trips/:id/students — roster pós-ausência (Story 4.1)', () => {
    it('aluno com ausência ativa aparece NOT_RETURNING e o total do resumo o exclui', async () => {
      // Rota com um único aluno vinculado: "0/0" prova a exclusão do total.
      const tripId = await seedActiveTrip('RETURN');
      await post('/api/v1/boarding/not-returning')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ tripId })
        .expect(201);

      const response = await request(app.getHttpServer())
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

      const response = await request(app.getHttpServer())
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
  });
});
