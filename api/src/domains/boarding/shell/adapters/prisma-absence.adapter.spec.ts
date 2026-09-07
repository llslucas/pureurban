import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import { PrismaAbsenceAdapter } from './prisma-absence.adapter.js';

// Integração com banco real (docker compose up -d) — nunca mockar o Prisma
// aqui: é o único jeito de provar que o constraint @@unique([companyId,
// idempotencyKey]) do BoardingAbsence realmente dispara P2002 e é discriminado
// como corrida de replay (mesmo padrão de prisma-boarding.adapter.spec.ts).
describe('PrismaAbsenceAdapter (integração — banco real)', () => {
  let prisma: PrismaService;
  let adapter: PrismaAbsenceAdapter;
  const createdIds: string[] = [];

  const insert = (
    overrides: Partial<Parameters<PrismaAbsenceAdapter['create']>[0]> = {},
  ) => {
    const notifiedAt = new Date();
    return Effect.runPromise(
      adapter.create({
        companyId: randomUUID(),
        tripId: randomUUID(),
        studentId: randomUUID(),
        idempotencyKey: randomUUID(),
        notifiedAt,
        cancellableUntil: new Date(notifiedAt.getTime() + 2 * 60 * 1000),
        ...overrides,
      }),
    );
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    adapter = new PrismaAbsenceAdapter(prisma);
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await prisma.boardingAbsence.deleteMany({
        where: { id: { in: createdIds } },
      });
      createdIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('insere e sinaliza created: true, persistindo notifiedAt e cancellableUntil', async () => {
    const notifiedAt = new Date('2026-01-01T10:00:00.000Z');
    const cancellableUntil = new Date('2026-01-01T10:02:00.000Z');

    const { created, record } = await insert({ notifiedAt, cancellableUntil });
    createdIds.push(record.id);

    expect(created).toBe(true);
    expect(record.notifiedAt).toEqual(notifiedAt);
    expect(record.cancellableUntil).toEqual(cancellableUntil);
    expect(record.cancelledAt).toBeNull();
  });

  it('corrida de replay: mesma [companyId, idempotencyKey] devolve o registro armazenado com created: false', async () => {
    const companyId = randomUUID();
    const idempotencyKey = randomUUID();

    const first = await insert({ companyId, idempotencyKey });
    createdIds.push(first.record.id);

    // Payload divergente com a MESMA key: o adapter devolve o que está gravado
    // e sinaliza que não inseriu. Julgar a divergência (IDEMPOTENCY_KEY_CONFLICT)
    // é responsabilidade do use case — aqui só se prova que nada foi duplicado.
    const second = await insert({ companyId, idempotencyKey });

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.tripId).toBe(first.record.tripId);
    expect(second.record.studentId).toBe(first.record.studentId);
  });

  it('findActiveByTripAndStudent ignora ausência cancelada e devolve só a ativa', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();
    const studentId = randomUUID();

    const cancelled = await insert({ companyId, tripId, studentId });
    createdIds.push(cancelled.record.id);
    await prisma.boardingAbsence.update({
      where: { id: cancelled.record.id },
      data: { cancelledAt: new Date() },
    });

    // Append-only: o re-registro (4.3) cria NOVA linha para o mesmo par.
    const active = await insert({ companyId, tripId, studentId });
    createdIds.push(active.record.id);

    const result = await Effect.runPromise(
      adapter.findActiveByTripAndStudent(tripId, studentId, companyId),
    );

    expect(result?.id).toBe(active.record.id);
  });

  it('findActiveByTrip devolve todas as ativas da viagem, sem as canceladas', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();

    const a = await insert({ companyId, tripId });
    const b = await insert({ companyId, tripId });
    const cancelled = await insert({ companyId, tripId });
    createdIds.push(a.record.id, b.record.id, cancelled.record.id);
    await prisma.boardingAbsence.update({
      where: { id: cancelled.record.id },
      data: { cancelledAt: new Date() },
    });

    const result = await Effect.runPromise(
      adapter.findActiveByTrip(tripId, companyId),
    );

    expect(result.map((r) => r.id).sort()).toEqual(
      [a.record.id, b.record.id].sort(),
    );
  });

  it('queries com companyId de outra empresa não vaziam dados entre tenants', async () => {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const tripId = randomUUID();
    const studentId = randomUUID();
    const idempotencyKey = randomUUID();

    const created = await insert({
      companyId,
      tripId,
      studentId,
      idempotencyKey,
    });
    createdIds.push(created.record.id);

    const byKey = await Effect.runPromise(
      adapter.findByIdempotencyKey(idempotencyKey, otherCompanyId),
    );
    expect(byKey).toBeNull();

    const active = await Effect.runPromise(
      adapter.findActiveByTripAndStudent(tripId, studentId, otherCompanyId),
    );
    expect(active).toBeNull();

    const byTrip = await Effect.runPromise(
      adapter.findActiveByTrip(tripId, otherCompanyId),
    );
    expect(byTrip).toEqual([]);
  });
});
