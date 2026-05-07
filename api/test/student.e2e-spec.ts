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

describe('StudentController (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let otherAdminToken: string;
  let studentId: string;

  const adminCredentials = {
    email: `admin-student-e2e-${Date.now()}@empresa.com`,
    password: 'senha12345',
    name: 'Admin E2E Students',
    companyName: 'Empresa E2E Students',
  };

  const otherAdminCredentials = {
    email: `other-admin-student-e2e-${Date.now()}@empresa.com`,
    password: 'senha12345',
    name: 'Outro Admin E2E',
    companyName: 'Outra Empresa E2E',
  };

  const studentData = {
    name: 'Maria Aluna',
    email: `aluno-e2e-${Date.now()}@escola.com`,
    password: 'senha12345',
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
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } catch {
      // Suprime erros no teardown
    }
  });

  describe('POST /api/v1/students', () => {
    it('deve criar aluno com sucesso e retornar 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(studentData)
        .expect(201);

      const body = response.body as ApiResponse;
      expect(body.data).toMatchObject({
        name: studentData.name,
        email: studentData.email,
        role: 'STUDENT',
        isActive: true,
      });
      expect(body.data).not.toHaveProperty('password');
      expect(body.data).not.toHaveProperty('companyId');
      expect(body.meta).toHaveProperty('timestamp');

      studentId = body.data.id as string;
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .send(studentData)
        .expect(401);
    });

    it('deve retornar 403 sem token de admin', async () => {
      // Login como aluno para obter token de não-admin
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: studentData.email, password: studentData.password });

      if (loginRes.status === 200) {
        const loginBody = loginRes.body as ApiResponse;
        await request(app.getHttpServer())
          .post('/api/v1/students')
          .set(
            'Authorization',
            `Bearer ${loginBody.data.accessToken as string}`,
          )
          .send({
            name: 'Outro',
            email: 'outro@test.com',
            password: 'senha123',
          })
          .expect(403);
      }
    });

    it('deve retornar 400 com dados inválidos', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'A', email: 'email-invalido', password: '123' })
        .expect(400);
    });

    it('deve retornar 409 com email já cadastrado', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(studentData);

      expect(res.status).toBe(409);
      const body = res.body as ApiResponse;
      expect(body.error?.code).toBe('EMAIL_ALREADY_EXISTS');
    });
  });

  describe('GET /api/v1/students', () => {
    it('deve listar apenas alunos da empresa do admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as ApiListResponse;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      body.data.forEach((s) => {
        expect(s).not.toHaveProperty('password');
        expect(s).not.toHaveProperty('companyId');
        expect(s.role).toBe('STUDENT');
      });
    });

    it('admin de outra empresa NÃO deve ver alunos desta empresa (lista vazia)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(200);

      const body = response.body as ApiListResponse;
      expect(body.data).toHaveLength(0);
    });

    it('deve retornar 400 para valor inválido de isActive', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/students?isActive=maybe')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('deve filtrar alunos ativos com isActive=true', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/students?isActive=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('GET /api/v1/students/:id', () => {
    it('deve retornar aluno existente', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as ApiResponse;
      expect(body.data.id).toBe(studentId);
      expect(body.data).not.toHaveProperty('password');
    });

    it('deve retornar 400 para ID não-UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/students/nao-e-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('deve retornar 404 para aluno de outra empresa', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/students/:id', () => {
    it('deve atualizar aluno com sucesso', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Maria Aluna Atualizada' })
        .expect(200);

      const body = response.body as ApiResponse;
      expect(body.data.name).toBe('Maria Aluna Atualizada');
    });

    it('deve retornar 400 com body vazio', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('deve retornar 400 para ID não-UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/students/nao-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Nome' })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/students/:id + login flow', () => {
    it('deve desativar aluno (204) e impedir login subsequente (401)', async () => {
      // Desativar aluno
      await request(app.getHttpServer())
        .delete(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Aluno desativado não consegue mais logar
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: studentData.email, password: studentData.password });

      expect(loginRes.status).toBe(401);
      const loginBody = loginRes.body as ApiResponse;
      expect(loginBody.error?.code).toBe('INVALID_CREDENTIALS');
    });

    it('deve ser idempotente — DELETE em aluno já inativo retorna 204', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('deve retornar 404 ao desativar aluno de outra empresa', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Aluno Isolado',
          email: `isolado-${Date.now()}@escola.com`,
          password: 'senha12345',
        })
        .expect(201);

      const createBody = createRes.body as ApiResponse;
      await request(app.getHttpServer())
        .delete(`/api/v1/students/${createBody.data.id as string}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .expect(404);
    });
  });
});
