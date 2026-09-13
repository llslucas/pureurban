import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import type { PrismaService } from '../../src/domains/shared/shell/infra/prisma.service.js';
import type { ApiResponse } from './supertest-app.js';

// Shared seed for the boarding/tracking e2e slices: one company (admin),
// a route with one allowed student and one driver (plus an unassigned driver
// and an off-route student as negative cases), a COMPLETED trip and another
// company's ACTIVE trip for tenant-isolation checks. Extracted from the
// god-specs' beforeAll (wrap-4); the assertions live on in the specs.

export interface CompanyScenario {
  stamp: number;
  companyId: string;
  routeId: string;
  driverId: string;
  adminToken: string;
  driverToken: string;
  otherDriverToken: string;
  studentToken: string;
  outsiderStudentToken: string;
  allowedStudentId: string;
  outsiderStudentId: string;
  completedTripId: string;
  otherCompanyTripId: string;
}

export const login = async (
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    // 200 é o contrato (@HttpCode(OK) no controller desde o hardening
    // pré-Épico 5; antes o default do @Post devolvia 201).
    .expect(200);
  return (res.body as ApiResponse).data.accessToken as string;
};

export const createUser = async (
  app: INestApplication<App>,
  adminToken: string,
  path: string,
  data: Record<string, unknown>,
): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post(path)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(data)
    .expect(201);
  return (res.body as ApiResponse).data.id as string;
};

// Cada teste que registra um embarque do mesmo aluno precisa da sua própria
// viagem: @@unique([tripId, studentId]) faria o segundo virar
// DUPLICATE_CHECK_IN. Semear aqui, e não reaproveitar a viagem de outro
// teste, é o que mantém os testes independentes de ordem.
export const seedTrip = async (
  prisma: PrismaService,
  refs: { companyId: string; routeId: string; driverId: string },
  type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND',
): Promise<string> => {
  const trip = await prisma.trip.create({
    data: { ...refs, type, status: 'ACTIVE' },
  });
  return trip.id;
};

export const checkIn = (
  app: INestApplication<App>,
  token: string,
  key: string | null,
  body: Record<string, unknown>,
) => {
  const req = request(app.getHttpServer())
    .post('/api/v1/boarding/check-in')
    .set('Authorization', `Bearer ${token}`);
  if (key !== null) req.set('X-Idempotency-Key', key);
  return req.send(body);
};

export const seedCompanyScenario = async (
  app: INestApplication<App>,
  prisma: PrismaService,
  prefix: string,
): Promise<CompanyScenario> => {
  const stamp = Date.now();

  const adminCredentials = {
    email: `admin-${prefix}-e2e-${stamp}@empresa.com`,
    password: 'senha12345',
    name: `Admin E2E ${prefix}`,
    companyName: `Empresa E2E ${prefix}`,
  };

  const driverData = {
    name: `Motorista E2E ${prefix}`,
    email: `driver-${prefix}-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  // Segundo motorista da MESMA empresa: prova que DRIVER_NOT_ASSIGNED não é
  // apenas isolamento de tenant disfarçado.
  const otherDriverData = {
    name: `Motorista Sem Vínculo E2E ${prefix}`,
    email: `driver-other-${prefix}-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  const allowedStudentData = {
    name: `Aluno Permitido E2E ${prefix}`,
    email: `student-allowed-${prefix}-${stamp}@escola.com`,
    password: 'senha12345',
  };

  const outsiderStudentData = {
    name: `Aluno Fora da Rota E2E ${prefix}`,
    email: `student-outsider-${prefix}-${stamp}@escola.com`,
    password: 'senha12345',
  };

  const post = (path: string) => request(app.getHttpServer()).post(path);

  const registerRes = await post('/api/v1/auth/register')
    .send(adminCredentials)
    .expect(201);
  const registerBody = registerRes.body as ApiResponse;
  const adminToken = registerBody.data.accessToken as string;
  const companyId = (registerBody.data.company as Record<string, unknown>)
    .id as string;

  const driverId = await createUser(
    app,
    adminToken,
    '/api/v1/drivers',
    driverData,
  );
  await createUser(app, adminToken, '/api/v1/drivers', otherDriverData);
  const allowedStudentId = await createUser(
    app,
    adminToken,
    '/api/v1/students',
    allowedStudentData,
  );
  const outsiderStudentId = await createUser(
    app,
    adminToken,
    '/api/v1/students',
    outsiderStudentData,
  );

  const driverToken = await login(app, driverData.email, driverData.password);
  const otherDriverToken = await login(
    app,
    otherDriverData.email,
    otherDriverData.password,
  );
  const studentToken = await login(
    app,
    allowedStudentData.email,
    allowedStudentData.password,
  );
  // Token do aluno FORA da rota: prova que STUDENT_NOT_ON_TRIP/STUDENT_NOT_ALLOWED
  // é regra de negócio (403 do core), não isolamento de tenant disfarçado.
  const outsiderStudentToken = await login(
    app,
    outsiderStudentData.email,
    outsiderStudentData.password,
  );

  const routeRes = await post('/api/v1/routes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: `Rota E2E ${prefix}`,
      originCity: 'Viçosa',
      destinationCity: 'Belo Horizonte',
    })
    .expect(201);
  const routeId = (routeRes.body as ApiResponse).data.id as string;

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

  // Empresa B, para provar isolamento multi-tenant com uma viagem que existe
  // e está ATIVA — só que não pertence a quem está autenticado.
  const otherAdminRes = await post('/api/v1/auth/register')
    .send({
      email: `admin-other-${prefix}-${stamp}@empresa.com`,
      password: 'senha12345',
      name: `Admin Outra Empresa ${prefix}`,
      companyName: `Outra Empresa E2E ${prefix}`,
    })
    .expect(201);
  const otherCompanyId = (
    (otherAdminRes.body as ApiResponse).data.company as Record<string, unknown>
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

  return {
    stamp,
    companyId,
    routeId,
    driverId,
    adminToken,
    driverToken,
    otherDriverToken,
    studentToken,
    outsiderStudentToken,
    allowedStudentId,
    outsiderStudentId,
    completedTripId: completed.id,
    otherCompanyTripId: otherTrip.id,
  };
};
