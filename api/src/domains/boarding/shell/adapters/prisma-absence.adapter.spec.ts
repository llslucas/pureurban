import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Effect, Exit } from 'effect';
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

  it('cancel anula a linha ativa persistindo cancelledAt e cancelIdempotencyKey (append-only, sem delete)', async () => {
    const created = await insert();
    createdIds.push(created.record.id);
    const cancelledAt = new Date('2026-01-01T10:05:00.000Z');
    const cancelKey = randomUUID();

    const { cancelled, record } = await Effect.runPromise(
      adapter.cancel({
        absenceId: created.record.id,
        companyId: created.record.companyId,
        cancelledAt,
        cancelIdempotencyKey: cancelKey,
      }),
    );

    expect(cancelled).toBe(true);
    expect(record.cancelledAt).toEqual(cancelledAt);
    expect(record.cancelIdempotencyKey).toBe(cancelKey);
    expect(record.id).toBe(created.record.id);
  });

  it('findByCancelIdempotencyKey devolve a linha anulada pela cancel key — o lookup do replay do cancelamento', async () => {
    const companyId = randomUUID();
    const created = await insert({ companyId });
    createdIds.push(created.record.id);
    const cancelKey = randomUUID();
    await Effect.runPromise(
      adapter.cancel({
        absenceId: created.record.id,
        companyId,
        cancelledAt: new Date(),
        cancelIdempotencyKey: cancelKey,
      }),
    );

    const found = await Effect.runPromise(
      adapter.findByCancelIdempotencyKey(cancelKey, companyId),
    );

    expect(found?.id).toBe(created.record.id);
    expect(found?.cancelIdempotencyKey).toBe(cancelKey);
    expect(found?.cancelledAt).not.toBeNull();
  });

  it('corrida da unique [companyId, cancelIdempotencyKey]: cancelar OUTRA linha com key já usada devolve cancelled: false e a linha original (re-leitura pela key)', async () => {
    const companyId = randomUUID();
    const cancelKey = randomUUID();

    const first = await insert({ companyId });
    createdIds.push(first.record.id);
    await Effect.runPromise(
      adapter.cancel({
        absenceId: first.record.id,
        companyId,
        cancelledAt: new Date(),
        cancelIdempotencyKey: cancelKey,
      }),
    );

    // Ausência ativa diferente, mesma empresa: o update com a MESMA cancel key
    // estoura P2002 — o adapter relê pela key em vez de quebrar.
    const second = await insert({ companyId });
    createdIds.push(second.record.id);

    const outcome = await Effect.runPromise(
      adapter.cancel({
        absenceId: second.record.id,
        companyId,
        cancelledAt: new Date(),
        cancelIdempotencyKey: cancelKey,
      }),
    );

    expect(outcome.cancelled).toBe(false);
    expect(outcome.record.id).toBe(first.record.id);
    expect(outcome.record.cancelIdempotencyKey).toBe(cancelKey);
  });

  it('cancel com companyId de outra empresa nem toca a linha — o isolamento vive no where da escrita', async () => {
    const created = await insert();
    createdIds.push(created.record.id);

    const exit = await Effect.runPromiseExit(
      adapter.cancel({
        absenceId: created.record.id,
        companyId: randomUUID(),
        cancelledAt: new Date(),
        cancelIdempotencyKey: randomUUID(),
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);

    const after = await prisma.boardingAbsence.findUnique({
      where: { id: created.record.id },
    });
    expect(after?.cancelledAt).toBeNull();
    expect(after?.cancelIdempotencyKey).toBeNull();
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
    const cancelKey = randomUUID();
    await Effect.runPromise(
      adapter.cancel({
        absenceId: created.record.id,
        companyId,
        cancelledAt: new Date(),
        cancelIdempotencyKey: cancelKey,
      }),
    );

    const byKey = await Effect.runPromise(
      adapter.findByIdempotencyKey(idempotencyKey, otherCompanyId),
    );
    expect(byKey).toBeNull();

    const byCancelKey = await Effect.runPromise(
      adapter.findByCancelIdempotencyKey(cancelKey, otherCompanyId),
    );
    expect(byCancelKey).toBeNull();

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
