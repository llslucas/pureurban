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
import { seedCompanyScenario } from '../support/company-scenario.js';

// Story 5.0 block of the former tracking.e2e-spec.ts (wrap-4 slice): the
// roles matrix frozen by the contract story. No trip is seeded — the guard
// answers 401/403 before any trip lookup.

describe('TrackingController (e2e) — matriz de roles (congelada na 5.0)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverToken: string;
  let studentToken: string;

  const validBody = (tripId: string) => ({
    tripId,
    latitude: -20.755549,
    longitude: -42.881728,
    accuracy: 12.5,
    capturedAt: new Date().toISOString(),
  });

  const ingest = (token: string, body: Record<string, unknown>) =>
    http(app)
      .post('/api/v1/tracking/location')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const lastKnown = (token: string | null, tripId: string = randomUUID()) => {
    const req = http(app).get(`/api/v1/tracking/trips/${tripId}/location`);
    if (token !== null) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const stream = (token: string, tripId: string = randomUUID()) =>
    http(app)
      .get(`/api/v1/tracking/trips/${tripId}/stream`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    const scenario = await seedCompanyScenario(app, prisma, 'tracking-roles');
    driverToken = scenario.driverToken;
    studentToken = scenario.studentToken;
  });

  afterAll(async () => {
    await closeApp(app);
  });

  it('sem token, os 4 endpoints dão 401', async () => {
    await http(app)
      .post('/api/v1/tracking/location')
      .send(validBody(randomUUID()))
      .expect(401);
    await lastKnown(null).expect(401);
    await http(app)
      .get(`/api/v1/tracking/trips/${randomUUID()}/stream`)
      .expect(401);
    await http(app).get('/api/v1/tracking/trips/active').expect(401);
  });

  it('STUDENT no POST de ingestão dá 403 — somente o motorista transmite GPS', async () => {
    const response = await ingest(studentToken, validBody(randomUUID())).expect(
      403,
    );
    expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
  });

  it('DRIVER no last-known dá 403 — o acompanhamento é do aluno', async () => {
    const response = await lastKnown(driverToken).expect(403);
    expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
  });

  it('DRIVER no stream dá 403 — o acompanhamento é do aluno', async () => {
    const response = await stream(driverToken).expect(403);
    expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
  });
});
