import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

import { RedisService } from '../../src/domains/shared/shell/infra/redis.service.js';
import type { PrismaService } from '../../src/domains/shared/shell/infra/prisma.service.js';
import {
  bootApp,
  closeApp,
  http,
  type ApiResponse,
} from '../support/supertest-app.js';
import {
  createUser as createUserRequest,
  login as loginRequest,
  seedCompanyScenario,
  seedTrip,
} from '../support/company-scenario.js';
import { openStream as openSseStream } from '../support/sse-stream.js';

// Story 5.2 block of the former tracking.e2e-spec.ts (wrap-4 slice): the real
// @Sse stream (happy path, guard, shared subscribe, graceful close) and the
// active-trip discovery endpoint with its tie-break pins.

describe('TrackingController (e2e) — Story 5.2 (stream e descoberta)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let adminToken: string;
  let driverToken: string;
  let studentToken: string;
  let secondStudentToken: string;
  let outsiderStudentToken: string;
  let routeId: string;
  let driverId: string;
  let companyId: string;
  let secondStudentId: string;
  let completedTripId: string;
  let otherCompanyTripId: string;

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

  // Parser do stream compartilhado com o caminho do tracking: o tripId vai na
  // URL — no tracking o guard valida o id do path, não resolve a viagem
  // server-side.
  const openStream = (token: string, tripId: string) =>
    openSseStream(app, `/api/v1/tracking/trips/${tripId}/stream`, token);

  // Segundo aluno NA MESMA rota: prova que 2+ alunos da viagem compartilham
  // um único subscribe Redis no serviço de eventos (Story 5.2).
  const seedSecondStudent = async (stamp: number) => {
    secondStudentId = await createUserRequest(
      app,
      adminToken,
      '/api/v1/students',
      {
        name: 'Segundo Aluno E2E Tracking',
        email: `student-second-tracking-${stamp}@escola.com`,
        password: 'senha12345',
      },
    );
    await http(app)
      .post(`/api/v1/routes/${routeId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: secondStudentId })
      .expect(201);
    secondStudentToken = await loginRequest(
      app,
      `student-second-tracking-${stamp}@escola.com`,
      'senha12345',
    );
  };

  // Viagem nova por teste: a posição fica no Redis por tripId, então reaproveitar
  // viagem cruzaria last-write-wins entre testes.
  const seedActiveTrip = async (
    driver: string | undefined = undefined,
    type: 'OUTBOUND' | 'RETURN' = 'OUTBOUND',
  ) =>
    seedTrip(
      prisma,
      { companyId, routeId, driverId: driver ?? driverId },
      type,
    );

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    redis = app.get(RedisService);
    const scenario = await seedCompanyScenario(app, prisma, 'tracking-stream');
    adminToken = scenario.adminToken;
    driverToken = scenario.driverToken;
    studentToken = scenario.studentToken;
    outsiderStudentToken = scenario.outsiderStudentToken;
    routeId = scenario.routeId;
    driverId = scenario.driverId;
    companyId = scenario.companyId;
    completedTripId = scenario.completedTripId;
    otherCompanyTripId = scenario.otherCompanyTripId;
    await seedSecondStudent(scenario.stamp);
  });

  afterAll(async () => {
    await closeApp(app);
  });

  describe('GET /api/v1/tracking/trips/:id/stream — SSE real (Story 5.2)', () => {
    it('stream feliz: location.updated com o schema do contrato em < 5s (NFR2)', async () => {
      const tripId = await seedActiveTrip();
      const handle = openStream(studentToken, tripId);
      await handle.ready;

      expect(handle.status()).toBe(200);
      expect(String(handle.headers()['content-type'])).toMatch(
        /^text\/event-stream/,
      );

      const start = Date.now();
      const response = await ingest(driverToken, validBody(tripId)).expect(200);
      const first = await handle.firstMessage;
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(first.event).toBe('location.updated');
      expect(first.data).toEqual({
        tripId,
        latitude: -20.755549,
        longitude: -42.881728,
        accuracy: 12.5,
        // Verbatim do envelope publicado pela 5.1: o timestamp do evento é o
        // MESMO instante do receivedAt do ack.
        timestamp: (response.body as ApiResponse).data.receivedAt,
      });

      handle.abort();
    });

    it('capturedAt com precisão fracionária arbitrária (wrap-3/R11): 200, posição atravessa o stream e o last-known ecoa verbatim', async () => {
      const tripId = await seedActiveTrip();
      const handle = openStream(studentToken, tripId);
      await handle.ready;

      // GPS nativo comum manda mais de 3 casas; o contrato promete ISO 8601
      // UTC sem teto de precisão — rejeitar quem o seguia era aceitar só quem
      // desvia. O evento NÃO carrega capturedAt: o timestamp do fio é o
      // receivedAt do servidor; o eco verbatim sai no last-known.
      const nanos = '2026-09-12T12:00:00.123456789Z';
      const response = await ingest(driverToken, {
        ...validBody(tripId),
        capturedAt: nanos,
      }).expect(200);

      const first = await handle.firstMessage;
      expect(first.event).toBe('location.updated');
      expect(first.data).toEqual({
        tripId,
        latitude: -20.755549,
        longitude: -42.881728,
        accuracy: 12.5,
        timestamp: (response.body as ApiResponse).data.receivedAt,
      });

      const lastKnownResponse = await lastKnown(studentToken, tripId).expect(
        200,
      );
      expect((lastKnownResponse.body as ApiResponse).data.capturedAt).toBe(
        nanos,
      );

      handle.abort();
    });

    it('2 alunos na mesma viagem recebem o mesmo evento servidos por UM subscribe Redis', async () => {
      const tripId = await seedActiveTrip();
      const handle1 = openStream(studentToken, tripId);
      const handle2 = openStream(secondStudentToken, tripId);
      await Promise.all([handle1.ready, handle2.ready]);

      await ingest(driverToken, validBody(tripId)).expect(200);
      const [toFirst, toSecond] = await Promise.all([
        handle1.firstMessage,
        handle2.firstMessage,
      ]);

      expect(toFirst).toEqual(toSecond);

      // A prova do compartilhamento: PUBSUB NUMSUB é server-wide — 1 significa
      // que as duas conexões SSE dividem o subscribe dedicado do serviço, e
      // não há um subscriber Redis por aluno.
      const numsub = (await redis.pubsub(
        'NUMSUB',
        `tracking:trip:${tripId}`,
      )) as (string | number)[];
      expect(numsub).toEqual([`tracking:trip:${tripId}`, 1]);

      handle1.abort();
      handle2.abort();
    });

    it('id não-UUID: 400 VALIDATION_ERROR no envelope, nunca byte de stream', async () => {
      const response = await http(app)
        .get('/api/v1/tracking/trips/not-a-uuid/stream')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(400);

      const body = response.body as ApiResponse;
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body).not.toHaveProperty('data');
      expect(body).not.toHaveProperty('meta');
    });

    it('viagem inexistente, encerrada ou de outra empresa: 409 TRIP_NOT_ACTIVE', async () => {
      const nonexistent = await stream(
        studentToken,
        '00000000-0000-4000-8000-000000000000',
      ).expect(409);
      expect((nonexistent.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const completed = await stream(studentToken, completedTripId).expect(409);
      expect((completed.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      const otherCompany = await stream(
        studentToken,
        otherCompanyTripId,
      ).expect(409);
      expect((otherCompany.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('aluno fora da rota: 403 STUDENT_NOT_ON_TRIP mesmo com viagem ativa', async () => {
      const tripId = await seedActiveTrip();

      const response = await stream(outsiderStudentToken, tripId).expect(403);
      expect((response.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );
    });

    it('ordem do guard: viagem inativa vence aluno fora da rota ⇒ 409 TRIP_NOT_ACTIVE', async () => {
      const response = await stream(
        outsiderStudentToken,
        completedTripId,
      ).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });

    it('end-trip com stream aberto: o stream completa, a transmissão cessa e a reconexão recebe 409', async () => {
      const tripId = await seedActiveTrip();
      const handle = openStream(studentToken, tripId);
      await handle.ready;

      await http(app)
        .patch(`/api/v1/trips/${tripId}/end`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      // Sinal terminal do trip.ended completa o stream (response.end()) —
      // sem abort(): a resposta já terminou e abortar aqui destruiria o
      // socket keep-alive com um ECONNRESET órfão.
      await handle.closed;

      // A captura é amarrada ao ciclo da viagem: encerrada, o POST do
      // motorista é rejeitado.
      const latePost = await ingest(driverToken, validBody(tripId)).expect(409);
      expect((latePost.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );

      // Reconexão pós-fim: guard responde 409 — o cliente para de reconectar.
      const response = await stream(studentToken, tripId).expect(409);
      expect((response.body as ApiResponse).error?.code).toBe(
        'TRIP_NOT_ACTIVE',
      );
    });
  });

  describe('GET /api/v1/tracking/trips/active — descoberta da viagem (Story 5.2)', () => {
    // Sobras de viagens ACTIVE dos describes anteriores poluem a descoberta
    // (qualquer ativa na rota do aluno vence): zerar antes de cada caso.
    beforeEach(async () => {
      await prisma.trip.updateMany({
        where: { routeId, status: 'ACTIVE' },
        data: { status: 'COMPLETED' },
      });
    });

    it('sem viagem ativa: 200 { data: null } com envelope de sucesso', async () => {
      const response = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const body = response.body as ApiResponse;
      expect(body.data).toBeNull();
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('viagem OUTBOUND ativa na rota: { data: { tripId, type: "OUTBOUND" } }', async () => {
      const tripId = await seedActiveTrip();

      const response = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toEqual({
        tripId,
        type: 'OUTBOUND',
      });
    });

    it('viagem RETURN ativa na rota: { data: { tripId, type: "RETURN" } } — qualquer perna', async () => {
      const tripId = await seedActiveTrip(driverId, 'RETURN');

      const response = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toEqual({
        tripId,
        type: 'RETURN',
      });
    });

    // Tie-break da descoberta (R14): duas ativas na mesma rota acontecem no
    // fluxo normal (iniciar a volta sem encerrar a ida) e o adapter resolve
    // com `startedAt desc, id desc`. Inverter qualquer um dos dois para `asc`
    // faz o aluno seguir a perna errada do ônibus — sem estes casos, nada
    // quebra.
    it('OUTBOUND e RETURN ativas na mesma rota: a mais recente por startedAt vence (R14)', async () => {
      const outboundId = await seedActiveTrip(driverId, 'OUTBOUND');
      const returnId = await seedActiveTrip(driverId, 'RETURN');

      // startedAt explícito: o default now() das duas criações pode cair no
      // mesmo microssegundo do Postgres e o caso degeneraria no tie-break por id.
      await prisma.trip.update({
        where: { id: outboundId },
        data: { startedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      await prisma.trip.update({
        where: { id: returnId },
        data: { startedAt: new Date() },
      });

      const response = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toEqual({
        tripId: returnId,
        type: 'RETURN',
      });
    });

    it('startedAt empatado: o maior id vence — tiebreak determinístico (R14)', async () => {
      const firstId = await seedActiveTrip(driverId, 'OUTBOUND');
      const secondId = await seedActiveTrip(driverId, 'RETURN');

      const tie = new Date('2026-09-12T12:00:00.000Z');
      await prisma.trip.update({
        where: { id: firstId },
        data: { startedAt: tie },
      });
      await prisma.trip.update({
        where: { id: secondId },
        data: { startedAt: tie },
      });

      const response = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      // O vencedor é calculado, não escolhido: a ordem de criação não decide
      // qual UUID é lexicograficamente maior.
      const expectedId = [firstId, secondId].sort()[1];
      expect((response.body as ApiResponse).data).toEqual({
        tripId: expectedId,
        type: expectedId === secondId ? 'RETURN' : 'OUTBOUND',
      });
    });

    it('aluno fora de rota: { data: null } — autorização implícita da query, não 403', async () => {
      await seedActiveTrip();

      const response = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${outsiderStudentToken}`)
        .expect(200);

      expect((response.body as ApiResponse).data).toBeNull();
    });

    it('aluno desativado: { data: null } — isActive vale também na descoberta (R7)', async () => {
      // Antes da desativação, o segundo aluno (na rota) enxerga a viagem como
      // qualquer outro: prova que o null abaixo vem do isActive, não do roster.
      const tripId = await seedActiveTrip();
      const before = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .expect(200);
      expect((before.body as ApiResponse).data).toEqual({
        tripId,
        type: 'OUTBOUND',
      });

      await http(app)
        .delete(`/api/v1/students/${secondStudentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Os 3 endpoints concordam: a descoberta nega com { data: null }, o
      // last-known nega com 403 STUDENT_NOT_ON_TRIP (isStudentOnRoute já
      // exigia isActive) e o stream nega com o mesmo 403 no guard.
      const after = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .expect(200);
      expect((after.body as ApiResponse).data).toBeNull();

      const lastKnownRes = await http(app)
        .get(`/api/v1/tracking/trips/${tripId}/location`)
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .expect(403);
      expect((lastKnownRes.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );

      const streamRes = await http(app)
        .get(`/api/v1/tracking/trips/${tripId}/stream`)
        .set('Authorization', `Bearer ${secondStudentToken}`)
        .expect(403);
      expect((streamRes.body as ApiResponse).error?.code).toBe(
        'STUDENT_NOT_ON_TRIP',
      );
    });

    it('DRIVER: 403 FORBIDDEN — o endpoint é do aluno', async () => {
      const response = await http(app)
        .get('/api/v1/tracking/trips/active')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);

      expect((response.body as ApiResponse).error?.code).toBe('FORBIDDEN');
    });
  });
});
