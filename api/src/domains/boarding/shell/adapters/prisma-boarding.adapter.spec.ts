import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import { PrismaBoardingAdapter } from './prisma-boarding.adapter.js';
import { DuplicateCheckInError } from '../../core/errors/boarding.errors.js';

// Integração com banco real (docker compose up -d) — nunca mockar o Prisma
// aqui: é o único jeito de provar que os constraints @@unique do
// BoardingRecord realmente disparam P2002 e são discriminados corretamente.
describe('PrismaBoardingAdapter (integração — banco real)', () => {
  let prisma: PrismaService;
  let adapter: PrismaBoardingAdapter;
  const createdIds: string[] = [];

  const insert = (
    overrides: Partial<
      Parameters<PrismaBoardingAdapter['recordCheckIn']>[0]
    > = {},
  ) =>
    Effect.runPromise(
      adapter.recordCheckIn({
        companyId: randomUUID(),
        tripId: randomUUID(),
        studentId: randomUUID(),
        recordedBy: randomUUID(),
        idempotencyKey: randomUUID(),
        checkedInAt: new Date(),
        ...overrides,
      }),
    );

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    adapter = new PrismaBoardingAdapter(prisma);
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await prisma.boardingRecord.deleteMany({
        where: { id: { in: createdIds } },
      });
      createdIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('insere e sinaliza created: true, persistindo recordedBy', async () => {
    const recordedBy = randomUUID();

    const { created, record } = await insert({ recordedBy });
    createdIds.push(record.id);

    expect(created).toBe(true);
    expect(record.recordedBy).toBe(recordedBy);
  });

  it('deve falhar com DuplicateCheckInError ao inserir o mesmo [tripId, studentId] com keys diferentes', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();
    const studentId = randomUUID();

    const first = await insert({ companyId, tripId, studentId });
    createdIds.push(first.record.id);

    const result = await Effect.runPromise(
      Effect.either(
        adapter.recordCheckIn({
          companyId,
          tripId,
          studentId,
          recordedBy: randomUUID(),
          idempotencyKey: randomUUID(),
          checkedInAt: new Date(),
        }),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(DuplicateCheckInError);
      expect(result.left.code).toBe('DUPLICATE_CHECK_IN');
    }
  });

  it('corrida de replay: mesma [companyId, idempotencyKey] devolve o registro armazenado com created: false', async () => {
    const companyId = randomUUID();
    const idempotencyKey = randomUUID();

    const first = await insert({ companyId, idempotencyKey });
    createdIds.push(first.record.id);

    // Payload diferente com a MESMA key: o adapter devolve o que está gravado e
    // sinaliza que não inseriu. Julgar se essa divergência é um conflito é
    // responsabilidade do use case (IDEMPOTENCY_KEY_CONFLICT) — aqui só se prova
    // que nada foi duplicado e que o registro devolvido é o original.
    const second = await insert({ companyId, idempotencyKey });

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.tripId).toBe(first.record.tripId);
    expect(second.record.studentId).toBe(first.record.studentId);
  });

  it('mesma key reenviada para o MESMO par [tripId, studentId] viola os dois constraints e ainda assim é replay, não duplicata', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();
    const studentId = randomUUID();
    const idempotencyKey = randomUUID();

    const first = await insert({
      companyId,
      tripId,
      studentId,
      idempotencyKey,
    });
    createdIds.push(first.record.id);

    // Ambos os índices únicos são violados de uma vez; o Postgres reporta apenas
    // um, à sua escolha. A releitura pela key é o que torna o resultado
    // determinístico independente de qual deles vier no P2002.
    const second = await insert({
      companyId,
      tripId,
      studentId,
      idempotencyKey,
    });

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
  });

  it('findByIdempotencyKey com companyId de outra empresa deve retornar null', async () => {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const idempotencyKey = randomUUID();

    const created = await insert({ companyId, idempotencyKey });
    createdIds.push(created.record.id);

    const result = await Effect.runPromise(
      adapter.findByIdempotencyKey(idempotencyKey, otherCompanyId),
    );
    expect(result).toBeNull();

    const sameCompanyResult = await Effect.runPromise(
      adapter.findByIdempotencyKey(idempotencyKey, companyId),
    );
    expect(sameCompanyResult?.id).toBe(created.record.id);
  });

  it('findCheckInByTripAndStudent encontra o check-in do par e respeita o tenant', async () => {
    const companyId = randomUUID();
    const tripId = randomUUID();
    const studentId = randomUUID();

    const created = await insert({ companyId, tripId, studentId });
    createdIds.push(created.record.id);

    const found = await Effect.runPromise(
      adapter.findCheckInByTripAndStudent(tripId, studentId, companyId),
    );
    expect(found?.id).toBe(created.record.id);

    const otherCompany = await Effect.runPromise(
      adapter.findCheckInByTripAndStudent(tripId, studentId, randomUUID()),
    );
    expect(otherCompany).toBeNull();

    const absentPair = await Effect.runPromise(
      adapter.findCheckInByTripAndStudent(tripId, randomUUID(), companyId),
    );
    expect(absentPair).toBeNull();
  });
});
