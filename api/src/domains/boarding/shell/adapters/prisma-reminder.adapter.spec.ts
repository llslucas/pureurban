import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import { PrismaReminderAdapter } from './prisma-reminder.adapter.js';

// Real-database integration (docker compose up -d) — never mock Prisma
// here: it is the only way to prove that the BoardingReminder's
// @@unique([tripId, studentId]) really raises P2002 and is discriminated as
// a race between scan executions (same pattern as
// prisma-absence.adapter.spec.ts).
describe('PrismaReminderAdapter (integração — banco real)', () => {
  let prisma: PrismaService;
  let adapter: PrismaReminderAdapter;
  const createdIds: string[] = [];

  const insert = (
    overrides: Partial<Parameters<PrismaReminderAdapter['create']>[0]> = {},
  ) => {
    const remindedAt = new Date();
    return Effect.runPromise(
      adapter.create({
        companyId: randomUUID(),
        tripId: randomUUID(),
        studentId: randomUUID(),
        remindedAt,
        ...overrides,
      }),
    );
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    adapter = new PrismaReminderAdapter(prisma);
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await prisma.boardingReminder.deleteMany({
        where: { id: { in: createdIds } },
      });
      createdIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('inserts and signals created: true, persisting remindedAt', async () => {
    const remindedAt = new Date('2026-01-01T12:15:00.000Z');

    const { created, record } = await insert({ remindedAt });
    createdIds.push(record.id);

    expect(created).toBe(true);
    expect(record.remindedAt).toEqual(remindedAt);
  });

  it('race between scan executions: same [tripId, studentId] returns the stored row with created: false', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();
    const studentId = randomUUID();

    const first = await insert({ companyId, tripId, studentId });
    createdIds.push(first.record.id);

    // Two ticks over the same pair: the second does NOT insert — it returns
    // the first row with created: false, and the use case emits no event.
    const second = await insert({ companyId, tripId, studentId });

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.remindedAt).toEqual(first.record.remindedAt);
  });

  it('findByTripAndStudent returns the row for the [tripId, studentId] pair', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();
    const studentId = randomUUID();
    const created = await insert({ companyId, tripId, studentId });
    createdIds.push(created.record.id);

    const found = await Effect.runPromise(
      adapter.findByTripAndStudent(tripId, studentId, companyId),
    );

    expect(found?.id).toBe(created.record.id);
  });

  it('findByTrip returns every row of the trip', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();

    const a = await insert({ companyId, tripId });
    const b = await insert({ companyId, tripId });
    createdIds.push(a.record.id, b.record.id);

    const result = await Effect.runPromise(
      adapter.findByTrip(tripId, companyId),
    );

    expect(result.map((r) => r.id).sort()).toEqual(
      [a.record.id, b.record.id].sort(),
    );
  });

  it('queries with a companyId from another company never leak data across tenants', async () => {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const tripId = randomUUID();
    const studentId = randomUUID();

    const created = await insert({ companyId, tripId, studentId });
    createdIds.push(created.record.id);

    const byTrip = await Effect.runPromise(
      adapter.findByTrip(tripId, otherCompanyId),
    );
    expect(byTrip).toEqual([]);

    const byStudent = await Effect.runPromise(
      adapter.findByTripAndStudent(tripId, studentId, otherCompanyId),
    );
    expect(byStudent).toBeNull();
  });
});
