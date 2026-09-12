import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { faker } from '@faker-js/faker';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/domains/shared/shell/infra/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

interface ApiResponse {
  data: Record<string, unknown>;
  meta: { timestamp: string };
  error?: { code: string; message: string };
}

interface TripStudentItem {
  studentId: string;
  name: string;
  status: 'CHECKED_IN' | 'NOT_CHECKED_IN' | 'NOT_RETURNING';
  checkedInAt: string | null;
}

interface TripStudentsData {
  students: TripStudentItem[];
  summary: { boarded: number; total: number };
}

describe('TripController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let postDriverToken: string;
  let studentToken: string;
  let routeId: string;
  let unassignedRouteId: string;
  let driverId: string;
  let companyId: string;
  let allowedStudentId: string;

  const stamp = Date.now();

  const adminCredentials = {
    email: `admin-trip-e2e-${stamp}@empresa.com`,
    password: 'senha12345',
    name: 'Admin E2E Trip',
    companyName: 'Empresa E2E Trip',
  };

  const driverData = {
    name: 'Motorista E2E Trip',
    email: `driver-trip-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  // Segundo motorista da MESMA empresa: prova que DRIVER_NOT_ASSIGNED não é
  // apenas isolamento de tenant disfarçado.
  const otherDriverData = {
    name: 'Motorista Sem Vínculo E2E Trip',
    email: `driver-other-trip-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  // Motorista exclusivo do teste de POST /trips: startTrip recusa um segundo
  // trip ativo, então usar o motorista compartilhado tornaria o resultado
  // dependente da ordem de execução (409 em vez de 201 se qualquer teste
  // anterior já tivesse semeado uma viagem para ele).
  const postDriverData = {
    name: 'Motorista Exclusivo POST E2E Trip',
    email: `driver-post-trip-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  const allowedStudentData = {
    name: 'Aluno E2E Trip',
    email: `student-trip-${stamp}@escola.com`,
    password: 'senha12345',
  };

  const post = (path: string) => request(app.getHttpServer()).post(path);
  const get = (path: string) => request(app.getHttpServer()).get(path);

  // Cada teste que precisa de uma viagem semeia a sua própria — não reaproveitar
  // entre testes é o que evita o acoplamento de ordem que a 3.3a teve que
  // reescrever para eliminar.
  const seedActiveTrip = async (
    overrides: Partial<{ driverId: string }> = {},
  ) => {
    const trip = await prisma.trip.create({
      data: {
        companyId,
        routeId,
        driverId: overrides.driverId ?? driverId,
        type: 'OUTBOUND',
        status: 'ACTIVE',
      },
    });
    return trip.id;
  };

  const login = async (email: string, password: string) => {
    const res = await post('/api/v1/auth/login')
      .send({ email, password })
      // 200 é o contrato (@HttpCode(OK) no controller desde o hardening
      // pré-Épico 5; antes o default do @Post devolvia 201).
      .expect(200);
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
    const postDriverId = await createUser('/api/v1/drivers', postDriverData);
    allowedStudentId = await createUser('/api/v1/students', allowedStudentData);

    driverToken = await login(driverData.email, driverData.password);
    otherDriverToken = await login(
      otherDriverData.email,
      otherDriverData.password,
    );
    postDriverToken = await login(
      postDriverData.email,
      postDriverData.password,
    );
    studentToken = await login(
      allowedStudentData.email,
      allowedStudentData.password,
    );

    const routeRes = await post('/api/v1/routes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rota E2E Trip',
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

    await post(`/api/v1/routes/${routeId}/drivers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverId: postDriverId })
      .expect(201);

    // Rota da MESMA empresa à qual nenhum dos motoristas está vinculado —
    // alvo do teste de escalonamento por startTrip.
    const unassignedRouteRes = await post('/api/v1/routes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rota Sem Vínculo E2E Trip',
        originCity: 'Viçosa',
        destinationCity: 'Belo Horizonte',
      })
      .expect(201);
    unassignedRouteId = (unassignedRouteRes.body as ApiResponse).data
      .id as string;
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } catch {
      // Suprime erros no teardown
    }
  });

  describe('Regressão dos guards (Task 1) — POST /trips, PATCH /trips/:id/end, GET /trips/active', () => {
    it('POST /api/v1/trips sem token ⇒ 401 HTTP_ERROR (linha 1 da tabela de verdade)', async () => {
      const response = await post('/api/v1/trips')
        .send({ routeId, type: 'OUTBOUND' })
        .expect(401);

      expect((response.body as ApiResponse).error?.code).toBe('HTTP_ERROR');
    });

    it('POST /api/v1/trips com token de aluno ⇒ 403 FORBIDDEN (linha 2 da tabela de verdade)', async () => {
      const response = await post('/api/v1/trips')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ routeId, type: 'OUTBOUND' })
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
    });

    it('POST /api/v1/trips com token de motorista vinculado à rota ⇒ 201', async () => {
      const response = await post('/api/v1/trips')
        .set('Authorization', `Bearer ${postDriverToken}`)
        .send({ routeId, type: 'OUTBOUND' })
        .expect(201);

      expect((response.body as ApiResponse).data).toHaveProperty('id');
    });

    it('GET /api/v1/trips/active com token de motorista ⇒ 200', async () => {
      await get('/api/v1/trips/active')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);
    });

    it('GET /api/v1/trips/active sem token ⇒ 401', async () => {
      await get('/api/v1/trips/active').expect(401);
    });

    it('PATCH /api/v1/trips/:id/end sem token ⇒ 401', async () => {
      const tripId = await seedActiveTrip();
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/end`)
        .expect(401);
    });

    it('PATCH /api/v1/trips/:id/end com token de aluno ⇒ 403 FORBIDDEN', async () => {
      const tripId = await seedActiveTrip();
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/end`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
    });

    it('PATCH /api/v1/trips/:id/end com o motorista da viagem ⇒ 200 e status COMPLETED', async () => {
      const tripId = await seedActiveTrip();
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/end`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data.status).toBe('COMPLETED');
    });

    it('PATCH /api/v1/trips/:id/end de outro motorista da mesma empresa ⇒ 403 DRIVER_NOT_ASSIGNED (mesmo disclosure do GET students, DS6)', async () => {
      const tripId = await seedActiveTrip();
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/end`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe(
        'DRIVER_NOT_ASSIGNED',
      );

      // A viagem continua ativa: o 403 não é efeito colateral de encerramento.
      const stillActive = await prisma.trip.findUnique({
        where: { id: tripId },
        select: { status: true },
      });
      expect(stillActive?.status).toBe('ACTIVE');
    });

    it('PATCH /api/v1/trips/:id/end com :id inexistente ⇒ 404 TRIP_NOT_FOUND', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${randomUUID()}/end`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);

      expect((response.body as ApiResponse).error?.code).toBe('TRIP_NOT_FOUND');
    });
  });

  // Story 4.1: GET /trips/active passa a aceitar STUDENT (decisão do Lucas) —
  // para o aluno, a viagem de retorno ativa na rota dele alimenta o botão
  // "Não vou voltar" da home. Shape da resposta inalterado.
  describe('GET /api/v1/trips/active — branch STUDENT (Story 4.1)', () => {
    const seedReturnTrip = async (driverForTrip = driverId) => {
      const trip = await prisma.trip.create({
        data: {
          companyId,
          routeId,
          driverId: driverForTrip,
          type: 'RETURN',
          status: 'ACTIVE',
        },
      });
      return trip.id;
    };

    // Testes anteriores deixam viagens ACTIVE penduradas no motorista e na
    // rota compartilhados (lição do cabeçalho do arquivo). Encerrá-las dá
    // determinismo ao findFirst daqui — e só na empresa DESTE spec, que é
    // criada fresca no beforeAll: nunca cruza com os outros arquivos e2e.
    beforeEach(async () => {
      await prisma.trip.updateMany({
        where: { companyId, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });
    });

    it('aluno com retorno ativo na rota dele ⇒ 200 com a viagem (type RETURN)', async () => {
      const tripId = await seedReturnTrip();

      const response = await get('/api/v1/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const data = (response.body as ApiResponse).data;
      expect(data).not.toBeNull();
      expect(data).toMatchObject({
        id: tripId,
        type: 'RETURN',
        status: 'ACTIVE',
        routeId,
      });
    });

    it('aluno sem retorno ativo (só ida) ⇒ 200 com data null', async () => {
      // Uma ida ativa NÃO é retorno: o aviso de ausência é da volta.
      await prisma.trip.create({
        data: {
          companyId,
          routeId,
          driverId,
          type: 'OUTBOUND',
          status: 'ACTIVE',
        },
      });

      const response = await get('/api/v1/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toBeNull();
    });

    it('aluno sem nenhuma viagem ⇒ 200 com data null', async () => {
      const response = await get('/api/v1/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toBeNull();
    });

    it('ADMIN ⇒ 403 FORBIDDEN — o handler agora aceita DRIVER e STUDENT, não qualquer papel', async () => {
      await get('/api/v1/trips/active')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('motorista continua recebendo a própria viagem ativa ⇒ 200', async () => {
      const tripId = await seedReturnTrip();

      const response = await get('/api/v1/trips/active')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toMatchObject({
        id: tripId,
        type: 'RETURN',
      });
    });
  });

  describe('POST /api/v1/trips — autorização de rota e validação de payload', () => {
    it('motorista não vinculado à rota ⇒ 403 DRIVER_NOT_ASSIGNED', async () => {
      // Sem esta checagem, qualquer motorista da empresa iniciaria uma viagem
      // numa rota alheia e leria o roster dela pelo GET /trips/:id/students,
      // que autoriza por trip.driverId.
      const response = await post('/api/v1/trips')
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .send({ routeId: unassignedRouteId, type: 'OUTBOUND' })
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe(
        'DRIVER_NOT_ASSIGNED',
      );
    });

    it('rota inexistente ⇒ 403 DRIVER_NOT_ASSIGNED (routeId não tem FK)', async () => {
      const response = await post('/api/v1/trips')
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .send({ routeId: randomUUID(), type: 'OUTBOUND' })
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe(
        'DRIVER_NOT_ASSIGNED',
      );
    });

    it('type fora do enum ⇒ 400, não 500', async () => {
      await post('/api/v1/trips')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ routeId, type: 'BOGUS' })
        .expect(400);
    });

    it('routeId que não é UUID ⇒ 400, não 500', async () => {
      await post('/api/v1/trips')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ routeId: 'nao-e-uuid', type: 'OUTBOUND' })
        .expect(400);
    });

    it('type RETURN sem relatedTripId ⇒ 400 (AC3)', async () => {
      await post('/api/v1/trips')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ routeId, type: 'RETURN' })
        .expect(400);
    });
  });

  describe('Ciclo de vida da viagem — encerrar e iniciar retorno (AC2, AC3)', () => {
    // Motorista e rota próprios: o ciclo ida→fim→volta precisa de um motorista
    // sem viagem ativa, e os outros testes deixam viagens ACTIVE penduradas nos
    // motoristas compartilhados.
    let lifecycleToken: string;
    let lifecycleRouteId: string;
    let lifecycleDriverId: string;

    beforeAll(async () => {
      const email = `driver-lifecycle-${stamp}@empresa.com`;
      lifecycleDriverId = await createUser('/api/v1/drivers', {
        name: 'Motorista Ciclo de Vida E2E Trip',
        email,
        password: 'senha12345',
      });
      lifecycleToken = await login(email, 'senha12345');

      const routeRes = await post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Rota Ciclo de Vida ${randomUUID()}`,
          originCity: 'Viçosa',
          destinationCity: 'Belo Horizonte',
        })
        .expect(201);
      lifecycleRouteId = (routeRes.body as ApiResponse).data.id as string;

      await post(`/api/v1/routes/${lifecycleRouteId}/drivers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId: lifecycleDriverId })
        .expect(201);
    });

    it('PATCH /:id/end grava endedAt ~agora, além de status COMPLETED', async () => {
      const trip = await prisma.trip.create({
        data: {
          companyId,
          routeId: lifecycleRouteId,
          driverId: lifecycleDriverId,
          type: 'OUTBOUND',
          status: 'ACTIVE',
        },
      });

      const before = Date.now();
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${trip.id}/end`)
        .set('Authorization', `Bearer ${lifecycleToken}`)
        .expect(200);

      const data = (response.body as ApiResponse).data;
      expect(data.status).toBe('COMPLETED');
      expect(data.endedAt).toBeTruthy();
      const endedAt = new Date(data.endedAt as string).getTime();
      expect(endedAt).toBeGreaterThanOrEqual(before - 1000);
      expect(endedAt).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('POST type RETURN com relatedTripId cria a volta atrelada à ida', async () => {
      const outbound = await prisma.trip.create({
        data: {
          companyId,
          routeId: lifecycleRouteId,
          driverId: lifecycleDriverId,
          type: 'OUTBOUND',
          status: 'COMPLETED',
          endedAt: new Date(),
        },
      });

      const response = await post('/api/v1/trips')
        .set('Authorization', `Bearer ${lifecycleToken}`)
        .send({
          routeId: lifecycleRouteId,
          type: 'RETURN',
          relatedTripId: outbound.id,
        })
        .expect(201);

      const data = (response.body as ApiResponse).data;
      expect(data.type).toBe('RETURN');
      expect(data.status).toBe('ACTIVE');
      expect(data.relatedTripId).toBe(outbound.id);
    });
  });

  describe('GET /api/v1/trips/:id/students — autenticação e autorização', () => {
    it('sem token ⇒ 401 HTTP_ERROR (linha 1 da tabela de verdade)', async () => {
      const tripId = await seedActiveTrip();
      const response = await get(`/api/v1/trips/${tripId}/students`).expect(
        401,
      );

      expect((response.body as ApiResponse).error?.code).toBe('HTTP_ERROR');
    });

    it('token de aluno ⇒ 403 FORBIDDEN (linha 2 da tabela de verdade)', async () => {
      const tripId = await seedActiveTrip();
      const response = await get(`/api/v1/trips/${tripId}/students`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
    });

    it('segundo motorista da mesma empresa, sem ser o da viagem ⇒ 403 DRIVER_NOT_ASSIGNED', async () => {
      const tripId = await seedActiveTrip();
      const response = await get(`/api/v1/trips/${tripId}/students`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe(
        'DRIVER_NOT_ASSIGNED',
      );
    });
  });

  describe('GET /api/v1/trips/:id/students — regras de negócio', () => {
    it(':id inexistente ⇒ 404 TRIP_NOT_FOUND', async () => {
      const response = await get(`/api/v1/trips/${randomUUID()}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);

      expect((response.body as ApiResponse).error?.code).toBe('TRIP_NOT_FOUND');
    });

    it(':id malformado ⇒ 404 TRIP_NOT_FOUND, nunca 400', async () => {
      const response = await get('/api/v1/trips/nao-e-uuid/students')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);

      expect((response.body as ApiResponse).error?.code).toBe('TRIP_NOT_FOUND');
    });

    it('viagem de outra empresa ⇒ 404, nunca 403 (isolamento não vaza existência)', async () => {
      const otherAdminRes = await post('/api/v1/auth/register')
        .send({
          email: `admin-other-trip-${stamp}@empresa.com`,
          password: 'senha12345',
          name: 'Admin Outra Empresa Trip',
          companyName: 'Outra Empresa E2E Trip',
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

      const response = await get(`/api/v1/trips/${otherTrip.id}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);

      expect((response.body as ApiResponse).error?.code).toBe('TRIP_NOT_FOUND');
    });

    it('viagem COMPLETED ⇒ 200 com a lista', async () => {
      const trip = await prisma.trip.create({
        data: {
          companyId,
          routeId,
          driverId,
          type: 'OUTBOUND',
          status: 'COMPLETED',
          endedAt: new Date(),
        },
      });

      const response = await get(`/api/v1/trips/${trip.id}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const body = (response.body as ApiResponse)
        .data as unknown as TripStudentsData;
      expect(body.students.length).toBeGreaterThan(0);
    });

    it('caminho feliz: 1 de 3 alunos embarcados ⇒ status corretos e summary { boarded: 1, total: 3 }', async () => {
      // Rota e vínculos próprios do teste — não reaproveitar allowedStudentId
      // da rota compartilhada, para não colidir com outros testes que também
      // fazem check-in nela.
      const localRouteRes = await post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Rota Local ${randomUUID()}`,
          originCity: 'Viçosa',
          destinationCity: 'Belo Horizonte',
        })
        .expect(201);
      const localRouteId = (localRouteRes.body as ApiResponse).data
        .id as string;

      await post(`/api/v1/routes/${localRouteId}/drivers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId })
        .expect(201);

      const studentIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const id = await createUser('/api/v1/students', {
          name: `Aluno Local ${i} ${randomUUID()}`,
          email: `student-local-${i}-${randomUUID()}@escola.com`,
          password: 'senha12345',
        });
        studentIds.push(id);
        await post(`/api/v1/routes/${localRouteId}/students`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ studentId: id })
          .expect(201);
      }

      const trip = await prisma.trip.create({
        data: {
          companyId,
          routeId: localRouteId,
          driverId,
          type: 'OUTBOUND',
          status: 'ACTIVE',
        },
      });

      const checkInRes = await post('/api/v1/boarding/check-in')
        .set('Authorization', `Bearer ${driverToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ studentId: studentIds[0], tripId: trip.id })
        .expect(201);
      const checkedInAt = (checkInRes.body as ApiResponse).data
        .checkedInAt as string;

      const response = await get(`/api/v1/trips/${trip.id}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const body = (response.body as ApiResponse)
        .data as unknown as TripStudentsData;
      expect(body.summary).toEqual({ boarded: 1, total: 3 });

      const boarded = body.students.find((s) => s.studentId === studentIds[0])!;
      expect(boarded.status).toBe('CHECKED_IN');
      expect(boarded.checkedInAt).toBe(checkedInAt);

      const notBoarded = body.students.filter(
        (s) => s.studentId !== studentIds[0],
      );
      expect(notBoarded).toHaveLength(2);
      for (const s of notBoarded) {
        expect(s.status).toBe('NOT_CHECKED_IN');
        expect(s.checkedInAt).toBeNull();
      }
    });

    it('aluno desativado após o check-in continua na lista como CHECKED_IN', async () => {
      const localRouteRes = await post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Rota Desativação ${randomUUID()}`,
          originCity: 'Viçosa',
          destinationCity: 'Belo Horizonte',
        })
        .expect(201);
      const localRouteId = (localRouteRes.body as ApiResponse).data
        .id as string;

      await post(`/api/v1/routes/${localRouteId}/drivers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId })
        .expect(201);

      const studentId = await createUser('/api/v1/students', {
        name: `Aluno Desativado ${randomUUID()}`,
        email: `student-deactivated-${randomUUID()}@escola.com`,
        password: 'senha12345',
      });
      await post(`/api/v1/routes/${localRouteId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId })
        .expect(201);

      const trip = await prisma.trip.create({
        data: {
          companyId,
          routeId: localRouteId,
          driverId,
          type: 'OUTBOUND',
          status: 'ACTIVE',
        },
      });

      await post('/api/v1/boarding/check-in')
        .set('Authorization', `Bearer ${driverToken}`)
        .set('X-Idempotency-Key', randomUUID())
        .send({ studentId, tripId: trip.id })
        .expect(201);

      await prisma.user.update({
        where: { id: studentId },
        data: { isActive: false },
      });

      const response = await get(`/api/v1/trips/${trip.id}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const body = (response.body as ApiResponse)
        .data as unknown as TripStudentsData;

      // Desativar o cadastro não desembarca a criança: ela sai do roster, mas o
      // check-in a mantém visível para o motorista.
      const desativado = body.students.find((s) => s.studentId === studentId);
      expect(desativado).toBeDefined();
      expect(desativado!.status).toBe('CHECKED_IN');
      expect(desativado!.checkedInAt).not.toBeNull();
      expect(body.summary).toEqual({ boarded: 1, total: 1 });
    });

    it('aluno desativado que NÃO embarcou some da lista', async () => {
      const localRouteRes = await post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Rota Desativado Sem Embarque ${randomUUID()}`,
          originCity: 'Viçosa',
          destinationCity: 'Belo Horizonte',
        })
        .expect(201);
      const localRouteId = (localRouteRes.body as ApiResponse).data
        .id as string;

      await post(`/api/v1/routes/${localRouteId}/drivers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId })
        .expect(201);

      const studentId = await createUser('/api/v1/students', {
        name: `Aluno Sem Embarque ${randomUUID()}`,
        email: `student-noboard-${randomUUID()}@escola.com`,
        password: 'senha12345',
      });
      await post(`/api/v1/routes/${localRouteId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId })
        .expect(201);

      const trip = await prisma.trip.create({
        data: {
          companyId,
          routeId: localRouteId,
          driverId,
          type: 'OUTBOUND',
          status: 'ACTIVE',
        },
      });

      await prisma.user.update({
        where: { id: studentId },
        data: { isActive: false },
      });

      const response = await get(`/api/v1/trips/${trip.id}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const body = (response.body as ApiResponse)
        .data as unknown as TripStudentsData;
      expect(
        body.students.find((s) => s.studentId === studentId),
      ).toBeUndefined();
      expect(body.summary).toEqual({ boarded: 0, total: 0 });
    });
  });

  describe('NFR4 — resposta em menos de 1 segundo com 50+ alunos na rota', () => {
    it('GET com 50 alunos, metade com check-in ⇒ < 1000ms', async () => {
      const nfrRouteRes = await post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Rota NFR4 ${randomUUID()}`,
          originCity: 'Viçosa',
          destinationCity: 'Belo Horizonte',
        })
        .expect(201);
      const nfrRouteId = (nfrRouteRes.body as ApiResponse).data.id as string;

      const trip = await prisma.trip.create({
        data: {
          companyId,
          routeId: nfrRouteId,
          driverId,
          type: 'OUTBOUND',
          status: 'ACTIVE',
        },
      });

      // Seed direto via Prisma — 50 requisições HTTP sequenciais mediriam a
      // suíte, não o endpoint sob teste.
      // E-mail único E sintaticamente válido: o UUID vai no local-part, nunca
      // depois do TLD. `password` é placeholder de hash — estes usuários são
      // semeados direto no banco e não têm caminho de login.
      const students = Array.from({ length: 50 }, () => ({
        id: randomUUID(),
        email: `${randomUUID()}@nfr4.example.com`,
        password: 'hash-placeholder-sem-login',
        name: faker.person.fullName(),
        role: 'STUDENT' as const,
        isActive: true,
        companyId,
      }));
      await prisma.user.createMany({ data: students });
      await prisma.routeStudent.createMany({
        data: students.map((s) => ({
          routeId: nfrRouteId,
          studentId: s.id,
          companyId,
        })),
      });

      const half = students.slice(0, 25);
      await prisma.boardingRecord.createMany({
        data: half.map((s) => ({
          companyId,
          tripId: trip.id,
          studentId: s.id,
          recordedBy: driverId,
          idempotencyKey: randomUUID(),
          checkedInAt: new Date(),
        })),
      });

      // Warmup descartado: a primeira requisição paga abertura de conexão do
      // pool e JIT, custos que não são do endpoint. Sem isso a asserção flaca
      // em runner de CI frio.
      await get(`/api/v1/trips/${trip.id}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const start = Date.now();
      const response = await get(`/api/v1/trips/${trip.id}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);
      const elapsed = Date.now() - start;

      // Mede o endpoint em processo, com banco local e sem carga concorrente —
      // é prova contra N+1 no adapter, não medição de latência de produção.
      expect(elapsed).toBeLessThan(1000);

      const body = (response.body as ApiResponse)
        .data as unknown as TripStudentsData;
      expect(body.summary).toEqual({ boarded: 25, total: 50 });
    });
  });
});
