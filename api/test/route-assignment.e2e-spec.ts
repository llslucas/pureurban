import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

interface ApiResponse {
  data: Record<string, unknown>;
  meta: { timestamp: string };
  error?: { code: string; message: string };
}

interface ApiListResponse {
  data: Array<Record<string, unknown>>;
  meta: { timestamp: string };
}

describe('RouteAssignmentController (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let driverToken: string;
  let studentToken: string;
  let routeId: string;
  let driverId: string;
  let studentId: string;

  const adminCredentials = {
    email: `admin-assign-e2e-${Date.now()}@empresa.com`,
    password: 'senha12345',
    name: 'Admin E2E Assign',
    companyName: 'Empresa E2E Assign',
  };

  const driverData = {
    name: 'Motorista E2E Assign',
    email: `driver-assign-${Date.now()}@empresa.com`,
    password: 'senha12345',
  };

  const studentData = {
    name: 'Aluno E2E Assign',
    email: `student-assign-${Date.now()}@escola.com`,
    password: 'senha12345',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Registrar empresa principal e admin
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(adminCredentials)
      .expect(201);

    const registerBody = registerRes.body as ApiResponse;
    adminToken = registerBody.data.accessToken as string;

    // Criar motorista
    const driverRes = await request(app.getHttpServer())
      .post('/api/v1/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(driverData)
      .expect(201);

    const driverBody = driverRes.body as ApiResponse;
    driverId = driverBody.data.id as string;

    // Login motorista — deve sempre suceder; falhas devem fazer testes falharem alto
    const driverLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: driverData.email, password: driverData.password })
      .expect(200);
    driverToken = (driverLoginRes.body as ApiResponse).data
      .accessToken as string;

    // Criar aluno
    const studentRes = await request(app.getHttpServer())
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(studentData)
      .expect(201);

    const studentBody = studentRes.body as ApiResponse;
    studentId = studentBody.data.id as string;

    // Login aluno
    const studentLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: studentData.email, password: studentData.password })
      .expect(200);
    studentToken = (studentLoginRes.body as ApiResponse).data
      .accessToken as string;

    // Criar rota
    const routeRes = await request(app.getHttpServer())
      .post('/api/v1/routes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rota E2E Assign',
        originCity: 'Viçosa',
        destinationCity: 'Belo Horizonte',
      })
      .expect(201);

    const routeBody = routeRes.body as ApiResponse;
    routeId = routeBody.data.id as string;
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } catch {
      // Suprime erros no teardown
    }
  });

  // ─── POST /api/v1/routes/:routeId/students ───────────────────

  describe('POST /api/v1/routes/:routeId/students', () => {
    it('deve vincular aluno à rota e retornar 201', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId })
        .expect(201);

      const body = response.body as ApiResponse;
      expect(body.data).toHaveProperty('id');
      expect(body.data.routeId).toBe(routeId);
      expect(body.data.studentId).toBe(studentId);
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('deve retornar 409 em duplicata (ASSIGNMENT_ALREADY_EXISTS)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId })
        .expect(409);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('ASSIGNMENT_ALREADY_EXISTS');
    });

    it('deve retornar 404 USER_NOT_FOUND para studentId inexistente (cross-tenant)', async () => {
      // UUID v4 válido sintaticamente mas inexistente — não vaza existência
      const response = await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('USER_NOT_FOUND');
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/students`)
        .send({ studentId })
        .expect(401);
    });

    it('deve retornar 403 para role DRIVER', async () => {
      expect(driverToken).toBeDefined();
      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/students`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ studentId })
        .expect(403);
    });
  });

  // ─── GET /api/v1/routes/:routeId/students ────────────────────

  describe('GET /api/v1/routes/:routeId/students', () => {
    it('deve listar alunos vinculados à rota', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as ApiListResponse;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0]).toHaveProperty('name');
      expect(body.data[0]).toHaveProperty('email');
      expect(body.data[0]).not.toHaveProperty('companyId');
    });
  });

  // ─── POST /api/v1/routes/:routeId/drivers ────────────────────

  describe('POST /api/v1/routes/:routeId/drivers', () => {
    it('deve vincular motorista à rota e retornar 201', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/drivers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId })
        .expect(201);

      const body = response.body as ApiResponse;
      expect(body.data).toHaveProperty('id');
      expect(body.data.routeId).toBe(routeId);
      expect(body.data.driverId).toBe(driverId);
    });

    it('deve retornar 409 em duplicata (ASSIGNMENT_ALREADY_EXISTS)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/drivers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId })
        .expect(409);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('ASSIGNMENT_ALREADY_EXISTS');
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/drivers`)
        .send({ driverId })
        .expect(401);
    });
  });

  // ─── GET /api/v1/routes/:routeId/drivers ─────────────────────

  describe('GET /api/v1/routes/:routeId/drivers', () => {
    it('deve listar motoristas vinculados à rota', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}/drivers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as ApiListResponse;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0]).toHaveProperty('name');
      expect(body.data[0]).toHaveProperty('email');
    });
  });

  // ─── GET /api/v1/routes/mine ─────────────────────────────────

  describe('GET /api/v1/routes/mine (DRIVER)', () => {
    it('motorista deve ver as rotas atribuídas a ele', async () => {
      expect(driverToken).toBeDefined();
      const response = await request(app.getHttpServer())
        .get('/api/v1/routes/mine')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const body = response.body as ApiListResponse;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      body.data.forEach((r) => {
        expect(r).not.toHaveProperty('companyId');
        expect(r).toHaveProperty('name');
        expect(r).toHaveProperty('originCity');
        expect(r).toHaveProperty('destinationCity');
      });
    });

    it('aluno deve ver as rotas atribuídas a ele', async () => {
      expect(studentToken).toBeDefined();
      const response = await request(app.getHttpServer())
        .get('/api/v1/routes/mine')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const body = response.body as ApiListResponse;
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('ADMIN não deve acessar /routes/mine (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/routes/mine')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).get('/api/v1/routes/mine').expect(401);
    });
  });

  // ─── DELETE /api/v1/routes/:routeId/students/:studentId ──────

  describe('DELETE /api/v1/routes/:routeId/students/:studentId', () => {
    it('deve desvincular aluno da rota e retornar 204', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('deve retornar 404 após desvincular (vínculo não existe)', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('ASSIGNMENT_NOT_FOUND');
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}/students/${studentId}`)
        .expect(401);
    });
  });

  // ─── DELETE /api/v1/routes/:routeId/drivers/:driverId ────────

  describe('DELETE /api/v1/routes/:routeId/drivers/:driverId', () => {
    it('deve desvincular motorista da rota e retornar 204', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}/drivers/${driverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('deve retornar 404 após desvincular (ASSIGNMENT_NOT_FOUND)', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}/drivers/${driverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('ASSIGNMENT_NOT_FOUND');
    });
  });
});
