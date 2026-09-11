import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

interface ApiResponse {
  data?: Record<string, unknown>;
  meta?: { timestamp: string };
  error?: { code: string; message: string };
}

// Story 5.0 declares the contract only: every tracking handler is a typed 501
// stub. This spec locks the roles/status matrix of the three stubs — losing a
// @Roles override here would authorize the wrong side silently in 5.1/5.2.
describe('TrackingController (e2e) — Story 5.0 contract stubs', () => {
  let app: INestApplication<App>;
  let driverToken: string;
  let studentToken: string;

  const stamp = Date.now();

  const adminCredentials = {
    email: `admin-tracking-e2e-${stamp}@empresa.com`,
    password: 'senha12345',
    name: 'Admin E2E Tracking',
    companyName: 'Empresa E2E Tracking',
  };

  const driverData = {
    name: 'Motorista E2E Tracking',
    email: `driver-tracking-${stamp}@empresa.com`,
    password: 'senha12345',
  };

  const studentData = {
    name: 'Aluno E2E Tracking',
    email: `student-tracking-${stamp}@escola.com`,
    password: 'senha12345',
  };

  const ingest = (token: string | null) => {
    const req = request(app.getHttpServer())
      .post('/api/v1/tracking/location')
      .send({
        tripId: randomUUID(),
        latitude: -20.755549,
        longitude: -42.881728,
        accuracy: 12.5,
        capturedAt: new Date().toISOString(),
      });
    if (token !== null) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const lastKnown = (token: string | null) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/tracking/trips/${randomUUID()}/location`,
    );
    if (token !== null) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const stream = (token: string | null) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/tracking/trips/${randomUUID()}/stream`,
    );
    if (token !== null) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const login = async (email: string, password: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return (res.body as ApiResponse).data!.accessToken as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(adminCredentials)
      .expect(201);
    const adminToken = (registerRes.body as ApiResponse).data!
      .accessToken as string;

    for (const [path, data] of [
      ['/api/v1/drivers', driverData],
      ['/api/v1/students', studentData],
    ] as const) {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(data)
        .expect(201);
    }

    driverToken = await login(driverData.email, driverData.password);
    studentToken = await login(studentData.email, studentData.password);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } catch {
      // Suprime erros no teardown
    }
  });

  it('sem token, os 3 endpoints dão 401', async () => {
    await ingest(null).expect(401);
    await lastKnown(null).expect(401);
    await stream(null).expect(401);
  });

  it('STUDENT no POST de ingestão dá 403 — somente o motorista transmite GPS', async () => {
    const response = await ingest(studentToken).expect(403);
    expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
  });

  it('DRIVER no stream e no last-known dão 403 — o acompanhamento é do aluno', async () => {
    const streamResponse = await stream(driverToken).expect(403);
    expect((streamResponse.body as ApiResponse).error?.code).toBe('FORBIDDEN');

    const lastKnownResponse = await lastKnown(driverToken).expect(403);
    expect((lastKnownResponse.body as ApiResponse).error?.code).toBe(
      'FORBIDDEN',
    );
  });

  it('com a role correta, os 3 stubs respondem 501 no envelope de erro NOT_IMPLEMENTED', async () => {
    for (const response of [
      await ingest(driverToken).expect(501),
      await lastKnown(studentToken).expect(501),
      await stream(studentToken).expect(501),
    ]) {
      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('NOT_IMPLEMENTED');
      expect(body.error?.message).toBeDefined();
      // Envelope de erro puro: exceção não passa pelo ResponseWrapperInterceptor
      expect(body).not.toHaveProperty('data');
      expect(body).not.toHaveProperty('meta');
    }
  });
});
