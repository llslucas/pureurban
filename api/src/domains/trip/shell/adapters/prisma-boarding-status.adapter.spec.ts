import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import { PrismaBoardingStatusAdapter } from './prisma-boarding-status.adapter.js';

// Integração com banco real (docker compose up -d) — mocks de banco são
// proibidos pelo project-context. BoardingRecord não tem FK cross-schema,
// então IDs aleatórios bastam (mesmo padrão de prisma-boarding.adapter.spec.ts).
describe('PrismaBoardingStatusAdapter (integração — banco real)', () => {
  let prisma: PrismaService;
  let adapter: PrismaBoardingStatusAdapter;
  const createdIds: string[] = [];
  const companyIds: string[] = [];
  const userIds: string[] = [];

  const createCompany = async () => {
    const company = await prisma.company.create({
      data: { name: `Empresa ${randomUUID()}` },
    });
    companyIds.push(company.id);
    return company.id;
  };

  const createStudent = async (
    companyId: string,
    overrides: { name?: string; isActive?: boolean } = {},
  ) => {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        password: 'hash',
        name: overrides.name ?? 'Aluno Teste',
        role: 'STUDENT',
        isActive: overrides.isActive ?? true,
        companyId,
      },
    });
    userIds.push(user.id);
    return user.id;
  };

  const insertRecord = async (
    overrides: Partial<{
      companyId: string;
      tripId: string;
      studentId: string;
      checkedInAt: Date;
    }> = {},
  ) => {
    const record = await prisma.boardingRecord.create({
      data: {
        companyId: overrides.companyId ?? randomUUID(),
        tripId: overrides.tripId ?? randomUUID(),
        studentId: overrides.studentId ?? randomUUID(),
        recordedBy: randomUUID(),
        idempotencyKey: randomUUID(),
        checkedInAt: overrides.checkedInAt ?? new Date(),
      },
    });
    createdIds.push(record.id);
    return record;
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    adapter = new PrismaBoardingStatusAdapter(prisma);
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await prisma.boardingRecord.deleteMany({
        where: { id: { in: createdIds } },
      });
      createdIds.length = 0;
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
    if (companyIds.length > 0) {
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
      companyIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('retorna só registros da viagem pedida', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();
    const otherTripId = randomUUID();
    const checkedInAt = new Date('2026-01-05T10:00:00.000Z');

    const target = await insertRecord({ companyId, tripId, checkedInAt });
    await insertRecord({ companyId, tripId: otherTripId });

    const result = await Effect.runPromise(
      adapter.findCheckedInByTrip(tripId, companyId),
    );

    expect(result).toHaveLength(1);
    expect(result[0].studentId).toBe(target.studentId);
    expect(result[0].checkedInAt).toEqual(checkedInAt);
  });

  it('traz o nome do aluno e não filtra por isActive — quem embarcou não some ao ser desativado', async () => {
    const companyId = await createCompany();
    const tripId = randomUUID();

    const active = await createStudent(companyId, { name: 'Ana Ativa' });
    const deactivated = await createStudent(companyId, {
      name: 'Zilda Desativada',
      isActive: false,
    });

    await insertRecord({ companyId, tripId, studentId: active });
    await insertRecord({ companyId, tripId, studentId: deactivated });

    const result = await Effect.runPromise(
      adapter.findCheckedInByTrip(tripId, companyId),
    );

    expect(result).toHaveLength(2);
    const byId = new Map(result.map((r) => [r.studentId, r.name]));
    expect(byId.get(active)).toBe('Ana Ativa');
    expect(byId.get(deactivated)).toBe('Zilda Desativada');
  });

  it('não vaza nome de usuário de outra empresa', async () => {
    const companyId = await createCompany();
    const otherCompanyId = await createCompany();
    const tripId = randomUUID();

    const foreignStudent = await createStudent(otherCompanyId, {
      name: 'Bruno De Fora',
    });
    // Registro gravado na empresa A apontando para um usuário da empresa B.
    await insertRecord({ companyId, tripId, studentId: foreignStudent });

    const result = await Effect.runPromise(
      adapter.findCheckedInByTrip(tripId, companyId),
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('');
  });

  it('companyId de outra empresa retorna lista vazia', async () => {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const tripId = randomUUID();

    await insertRecord({ companyId, tripId });

    const result = await Effect.runPromise(
      adapter.findCheckedInByTrip(tripId, otherCompanyId),
    );

    expect(result).toEqual([]);
  });
});
