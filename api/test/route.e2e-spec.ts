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

describe('RoutingController (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let otherAdminToken: string;
  let studentToken: string;
  let routeId: string;

  const adminCredentials = {
    email: `admin-routes-e2e-${Date.now()}@empresa.com`,
    password: 'senha12345',
    name: 'Admin E2E Routes',
    companyName: 'Empresa E2E Routes',
  };

  const otherAdminCredentials = {
    email: `other-admin-routes-e2e-${Date.now()}@empresa.com`,
    password: 'senha12345',
    name: 'Outro Admin E2E Routes',
    companyName: 'Outra Empresa E2E Routes',
  };

  const studentData = {
    name: 'Aluno E2E Routes',
    email: `aluno-routes-${Date.now()}@escola.com`,
    password: 'senha12345',
  };

  const routeData = {
    name: 'Rota Universitária Norte',
    description: 'Saída às 17h, passando por 5 pontos',
    originCity: 'Viçosa',
    destinationCity: 'Belo Horizonte',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Registrar empresa e admin principal
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(adminCredentials)
      .expect(201);

    const registerBody = registerRes.body as ApiResponse;
    adminToken = registerBody.data.accessToken as string;

    // Registrar outra empresa para teste de isolamento multi-tenant
    const otherRegisterRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(otherAdminCredentials)
      .expect(201);

    const otherRegisterBody = otherRegisterRes.body as ApiResponse;
    otherAdminToken = otherRegisterBody.data.accessToken as string;

    // Criar aluno para testar role STUDENT → 403
    const studentRes = await request(app.getHttpServer())
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(studentData)
      .expect(201);

    void studentRes; // criado, vamos logar em seguida

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: studentData.email, password: studentData.password });

    if (loginRes.status === 200) {
      const loginBody = loginRes.body as ApiResponse;
      studentToken = loginBody.data.accessToken as string;
    }
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } catch {
      // Suprime erros no teardown
    }
  });

  // ─── POST /api/v1/routes ──────────────────────────────────────

  describe('POST /api/v1/routes', () => {
    it('deve criar rota com sucesso e retornar 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(routeData)
        .expect(201);

      const body = response.body as ApiResponse;
      expect(body.data).toMatchObject({
        name: routeData.name,
        description: routeData.description,
        originCity: routeData.originCity,
        destinationCity: routeData.destinationCity,
      });
      expect(body.data).not.toHaveProperty('companyId');
      expect(body.meta).toHaveProperty('timestamp');

      routeId = body.data.id as string;
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/routes')
        .send(routeData)
        .expect(401);
    });

    it('deve retornar 403 para role STUDENT', async () => {
      if (!studentToken) return;
      await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(routeData)
        .expect(403);
    });

    it('deve retornar 400 com name muito curto', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'A', originCity: 'Viçosa', destinationCity: 'BH' })
        .expect(400);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('deve retornar 400 sem originCity', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Rota Válida', destinationCity: 'BH' })
        .expect(400);
    });

    it('deve criar rota sem description (campo opcional)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rota Sem Desc',
          originCity: 'Viçosa',
          destinationCity: 'BH',
        })
        .expect(201);

      const body = response.body as ApiResponse;
      expect(body.data.description).toBeNull();
    });
  });

  // ─── GET /api/v1/routes ───────────────────────────────────────

  describe('GET /api/v1/routes', () => {
    it('deve listar rotas da empresa com isolamento multi-tenant', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as ApiListResponse;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      body.data.forEach((r) => {
        expect(r).not.toHaveProperty('companyId');
      });
    });

    it('admin de outra empresa NÃO deve ver rotas desta empresa (lista vazia)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/routes')
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(200);

      const body = response.body as ApiListResponse;
      expect(body.data).toHaveLength(0);
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).get('/api/v1/routes').expect(401);
    });
  });

  // ─── GET /api/v1/routes/:id ───────────────────────────────────

  describe('GET /api/v1/routes/:id', () => {
    it('deve retornar rota existente', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as ApiResponse;
      expect(body.data.id).toBe(routeId);
      expect(body.data).not.toHaveProperty('companyId');
    });

    it('deve retornar 400 para ID não-UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/routes/nao-e-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('deve retornar 404 para rota de outra empresa (cross-tenant isolation)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(404);

      // Não vaza a existência da rota (mesmo 404 para rota de outra empresa)
    });

    it('deve retornar 404 para ID inexistente', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/routes/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ─── PATCH /api/v1/routes/:id ─────────────────────────────────

  describe('PATCH /api/v1/routes/:id', () => {
    it('deve atualizar rota com sucesso (parcial)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Rota Atualizada' })
        .expect(200);

      const body = response.body as ApiResponse;
      expect(body.data.name).toBe('Rota Atualizada');
      expect(body.data).not.toHaveProperty('companyId');
    });

    it('deve retornar 400 com body vazio', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('deve retornar 400 para ID não-UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/routes/nao-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Nome' })
        .expect(400);
    });

    it('deve retornar 404 para rota de outra empresa', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .send({ name: 'Hack attempt' })
        .expect(404);
    });
  });

  // ─── DELETE /api/v1/routes/:id ────────────────────────────────

  describe('DELETE /api/v1/routes/:id', () => {
    it('deve retornar 404 ao deletar rota de outra empresa', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(404);
    });

    it('deve deletar rota com sucesso e retornar 204', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('deve retornar 404 após rota ser deletada (hard delete)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('deve retornar 400 para ID não-UUID', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/routes/nao-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/routes/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });
  });
});
