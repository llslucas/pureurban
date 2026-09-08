import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer, Runtime } from 'effect';
import { TestClock, TestContext } from 'effect';
import { cancelAbsence } from './cancel-absence.use-case.js';
import {
  AbsenceRepository,
  AbsenceRepositoryApi,
  BoardingAbsenceData,
} from '../ports/absence-repository.port.js';
import { TripAccess, TripAccessApi } from '../ports/trip-access.port.js';
import {
  StudentEligibility,
  StudentEligibilityApi,
} from '../ports/student-eligibility.port.js';
import {
  TripNotActiveError,
  StudentNotOnTripError,
  AbsenceNotFoundError,
  CancellationPeriodExpiredError,
  IdempotencyKeyConflictError,
} from '../errors/boarding.errors.js';

// now fixado pelo TestClock: a suíte inteira roda contra este instante, sem
// depender do relógio real (fronteira inclusiva provada com igualdade exata).
const NOW = new Date('2026-01-01T10:01:30.000Z');

const mockAbsence: BoardingAbsenceData = {
  id: 'absence-1',
  companyId: 'company-1',
  tripId: 'trip-1',
  studentId: 'student-1',
  idempotencyKey: 'key-1',
  notifiedAt: new Date('2026-01-01T10:00:00.000Z'),
  cancellableUntil: new Date('2026-01-01T10:02:00.000Z'),
  cancelledAt: null,
  cancelIdempotencyKey: null,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

const mockCancelled: BoardingAbsenceData = {
  ...mockAbsence,
  cancelledAt: NOW,
  cancelIdempotencyKey: 'cancel-key-1',
};

const baseInput = {
  studentId: 'student-1',
  tripId: 'trip-1',
  companyId: 'company-1',
  idempotencyKey: 'cancel-key-1',
};

const activeTrip = {
  id: 'trip-1',
  routeId: 'route-1',
  driverId: 'driver-1',
};

function makeLayer(
  absenceRepo: Partial<AbsenceRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) {
  return Layer.mergeAll(
    Layer.succeed(AbsenceRepository, absenceRepo as AbsenceRepositoryApi),
    Layer.succeed(TripAccess, tripAccess as TripAccessApi),
    Layer.succeed(
      StudentEligibility,
      studentEligibility as StudentEligibilityApi,
    ),
  );
}

// O build do TestContext e o próprio TestClock.setTime são caros (~5ms cada):
// o Runtime é capturado UMA vez em módulo e o relógio só é reajustado quando o
// now pedido difere do instante corrente — cada teste declara o instante em
// que roda e o estado persiste entre runs no mesmo Runtime.
const testRuntimePromise: Promise<Runtime.Runtime<never>> = Effect.runPromise(
  Effect.runtime<never>().pipe(Effect.provide(TestContext.TestContext)),
);
let clockNowMs = Number.NaN;

const setClock = async (now: Date) => {
  if (now.getTime() === clockNowMs) return;
  const runtime = await testRuntimePromise;
  await Runtime.runPromise(runtime)(TestClock.setTime(now));
  clockNowMs = now.getTime();
};

const runEither = async (
  now: Date,
  input: Parameters<typeof cancelAbsence>[0],
  absenceRepo: Partial<AbsenceRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) => {
  await setClock(now);
  const runtime = await testRuntimePromise;
  return Runtime.runPromise(runtime)(
    Effect.either(
      cancelAbsence(input).pipe(
        Effect.provide(makeLayer(absenceRepo, tripAccess, studentEligibility)),
      ),
    ),
  );
};

const run = async (
  now: Date,
  input: Parameters<typeof cancelAbsence>[0],
  absenceRepo: Partial<AbsenceRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) => {
  await setClock(now);
  const runtime = await testRuntimePromise;
  return Runtime.runPromise(runtime)(
    cancelAbsence(input).pipe(
      Effect.provide(makeLayer(absenceRepo, tripAccess, studentEligibility)),
    ),
  );
};

// Portas satisfeitas para o caminho feliz — cada teste sobrescreve só o que precisa.
const happyAbsenceRepo = (): Partial<AbsenceRepositoryApi> => ({
  findByCancelIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
  findActiveByTripAndStudent: vi
    .fn()
    .mockReturnValue(Effect.succeed(mockAbsence)),
  // O adapter real persiste o que recebe: a linha anulada carrega o
  // cancelledAt do argumento — imprescindível para a prova da fronteira
  // inclusiva, em que now difere do NOW global da suíte.
  cancel: vi.fn((args: Parameters<AbsenceRepositoryApi['cancel']>[0]) =>
    Effect.succeed({
      cancelled: true,
      record: {
        ...mockAbsence,
        cancelledAt: args.cancelledAt,
        cancelIdempotencyKey: args.cancelIdempotencyKey,
      },
    }),
  ),
});
const happyTrip = (): Partial<TripAccessApi> => ({
  findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(activeTrip)),
});
const happyEligibility = (): Partial<StudentEligibilityApi> => ({
  isAllowedOnRoute: vi.fn().mockReturnValue(Effect.succeed(true)),
});

describe('cancelAbsence', () => {
  it('deve anular a ausência ativa e emitir exatamente 1 evento boarding.absence_cancelled', async () => {
    const absenceRepo = happyAbsenceRepo();

    const [result, events] = await run(
      NOW,
      baseInput,
      absenceRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result.cancelledAt).toEqual(NOW);
    expect(result.cancelIdempotencyKey).toBe('cancel-key-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('boarding.absence_cancelled');
    expect(absenceRepo.cancel).toHaveBeenCalledOnce();

    const args = vi.mocked(absenceRepo.cancel!).mock.calls[0][0];
    expect(args).toMatchObject({
      absenceId: 'absence-1',
      companyId: 'company-1',
      cancelIdempotencyKey: 'cancel-key-1',
    });
    expect(args.cancelledAt).toEqual(NOW);
  });

  it('o evento carrega tripId, studentId e cancelledAt do relógio injetado — o payload do contrato SSE', async () => {
    const [, events] = await run(
      NOW,
      baseInput,
      happyAbsenceRepo(),
      happyTrip(),
      happyEligibility(),
    );

    expect(events[0].data).toEqual({
      tripId: 'trip-1',
      studentId: 'student-1',
      cancelledAt: '2026-01-01T10:01:30.000Z',
    });
    expect(events[0].occurredAt).toBe('2026-01-01T10:01:30.000Z');
  });

  it('fronteira INCLUSIVA: now == cancellableUntil ainda cancela', async () => {
    // TestClock congela o tempo: agora é exatamente o fim da janela.
    const boundary = new Date('2026-01-01T10:02:00.000Z');
    const absenceRepo = happyAbsenceRepo();

    const [result, events] = await run(
      boundary,
      baseInput,
      absenceRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(absenceRepo.cancel).toHaveBeenCalledOnce();
    expect(events).toHaveLength(1);
    expect(result.cancelledAt).toEqual(boundary);
  });

  it('1ms depois da janela ⇒ CancellationPeriodExpiredError (409), sem tocar a linha nem emitir evento', async () => {
    const expired = new Date('2026-01-01T10:02:00.001Z');
    const absenceRepo = happyAbsenceRepo();

    const result = await runEither(
      expired,
      baseInput,
      absenceRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(CancellationPeriodExpiredError);
      expect(result.left.code).toBe('CANCELLATION_PERIOD_EXPIRED');
      expect(result.left.httpStatus).toBe(409);
    }
    expect(absenceRepo.cancel).not.toHaveBeenCalled();
  });

  it('replay: mesma cancel key retorna o resultado original sem evento e sem tocar regra de negócio', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByCancelIdempotencyKey: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockCancelled)),
      cancel: vi.fn(),
    };
    const tripAccess: Partial<TripAccessApi> = { findActiveTrip: vi.fn() };
    const studentEligibility: Partial<StudentEligibilityApi> = {
      isAllowedOnRoute: vi.fn(),
    };

    const [result, events] = await run(
      NOW,
      baseInput,
      absenceRepo,
      tripAccess,
      studentEligibility,
    );

    expect(result).toEqual(mockCancelled);
    expect(events).toHaveLength(0);
    expect(absenceRepo.cancel).not.toHaveBeenCalled();
    expect(tripAccess.findActiveTrip).not.toHaveBeenCalled();
    expect(studentEligibility.isAllowedOnRoute).not.toHaveBeenCalled();
  });

  it('replay com viagem já encerrada ainda retorna sucesso — o reenvio não pode virar erro', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByCancelIdempotencyKey: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockCancelled)),
      cancel: vi.fn(),
    };

    const [result, events] = await run(
      NOW,
      baseInput,
      absenceRepo,
      { findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)) },
      { isAllowedOnRoute: vi.fn() },
    );

    expect(result).toEqual(mockCancelled);
    expect(events).toHaveLength(0);
  });

  it('replay com tripId diferente do armazenado ⇒ IdempotencyKeyConflictError', async () => {
    const result = await runEither(
      NOW,
      { ...baseInput, tripId: 'outra-viagem' },
      {
        findByCancelIdempotencyKey: vi
          .fn()
          .mockReturnValue(Effect.succeed(mockCancelled)),
      },
      { findActiveTrip: vi.fn() },
      { isAllowedOnRoute: vi.fn() },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(IdempotencyKeyConflictError);
      expect(result.left.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
      expect(result.left.httpStatus).toBe(409);
    }
  });

  it('replay com studentId diferente do armazenado ⇒ IdempotencyKeyConflictError', async () => {
    const result = await runEither(
      NOW,
      { ...baseInput, studentId: 'outro-aluno' },
      {
        findByCancelIdempotencyKey: vi
          .fn()
          .mockReturnValue(Effect.succeed(mockCancelled)),
      },
      { findActiveTrip: vi.fn() },
      { isAllowedOnRoute: vi.fn() },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(IdempotencyKeyConflictError);
    }
  });

  it('corrida da unique (cancelled: false) com payload igual: resultado original sem evento', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByCancelIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      findActiveByTripAndStudent: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockAbsence)),
      cancel: vi
        .fn()
        .mockReturnValue(
          Effect.succeed({ cancelled: false, record: mockCancelled }),
        ),
    };

    const [result, events] = await run(
      NOW,
      baseInput,
      absenceRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result).toEqual(mockCancelled);
    expect(events).toHaveLength(0);
  });

  it('corrida da unique com payload divergente ⇒ IdempotencyKeyConflictError', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByCancelIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      findActiveByTripAndStudent: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockAbsence)),
      cancel: vi.fn().mockReturnValue(
        Effect.succeed({
          cancelled: false,
          record: { ...mockCancelled, studentId: 'outro-aluno' },
        }),
      ),
    };

    const result = await runEither(
      NOW,
      baseInput,
      absenceRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(IdempotencyKeyConflictError);
    }
  });

  it('sem ausência ativa ⇒ AbsenceNotFoundError (404 ABSENCE_NOT_FOUND) e nenhum cancel', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByCancelIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      findActiveByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
      cancel: vi.fn(),
    };

    const result = await runEither(
      NOW,
      baseInput,
      absenceRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(AbsenceNotFoundError);
      expect(result.left.code).toBe('ABSENCE_NOT_FOUND');
      expect(result.left.httpStatus).toBe(404);
    }
    expect(absenceRepo.cancel).not.toHaveBeenCalled();
  });

  it('ordem: ausência inexistente vence janela expirada ⇒ ABSENCE_NOT_FOUND, não CANCELLATION_PERIOD_EXPIRED', async () => {
    const expired = new Date('2026-01-01T10:05:00.000Z');
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByCancelIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      findActiveByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
      cancel: vi.fn(),
    };

    const result = await runEither(
      expired,
      baseInput,
      absenceRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(AbsenceNotFoundError);
    }
  });

  it('deve falhar com TripNotActiveError quando findActiveTrip retorna null', async () => {
    const absenceRepo = happyAbsenceRepo();
    const studentEligibility: Partial<StudentEligibilityApi> = {
      isAllowedOnRoute: vi.fn(),
    };

    const result = await runEither(
      NOW,
      baseInput,
      absenceRepo,
      { findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)) },
      studentEligibility,
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotActiveError);
      expect(result.left.code).toBe('TRIP_NOT_ACTIVE');
      expect(result.left.httpStatus).toBe(409);
    }
    // Ordem das regras: nada foi consultado nem anulado depois da viagem.
    expect(studentEligibility.isAllowedOnRoute).not.toHaveBeenCalled();
    expect(absenceRepo.findActiveByTripAndStudent).not.toHaveBeenCalled();
    expect(absenceRepo.cancel).not.toHaveBeenCalled();
  });

  it('deve falhar com StudentNotOnTripError quando o aluno não é da rota (403)', async () => {
    const absenceRepo = happyAbsenceRepo();

    const result = await runEither(NOW, baseInput, absenceRepo, happyTrip(), {
      isAllowedOnRoute: vi.fn().mockReturnValue(Effect.succeed(false)),
    });

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotOnTripError);
      expect(result.left.code).toBe('STUDENT_NOT_ON_TRIP');
      expect(result.left.httpStatus).toBe(403);
    }
    expect(absenceRepo.findActiveByTripAndStudent).not.toHaveBeenCalled();
    expect(absenceRepo.cancel).not.toHaveBeenCalled();
  });

  it('isAllowedOnRoute recebe o routeId vindo da viagem, não do input', async () => {
    const studentEligibility = happyEligibility();

    await run(
      NOW,
      baseInput,
      happyAbsenceRepo(),
      {
        findActiveTrip: vi
          .fn()
          .mockReturnValue(
            Effect.succeed({ ...activeTrip, routeId: 'route-from-trip' }),
          ),
      },
      studentEligibility,
    );

    expect(studentEligibility.isAllowedOnRoute).toHaveBeenCalledWith(
      'student-1',
      'route-from-trip',
      'company-1',
    );
  });

  it('sucesso não depende de estado de check-in: o use case não requer port de check-in', async () => {
    // O layer abaixo NÃO fornece BoardingRepository — se o R do cancelamento
    // o exigisse, o Effect morreria com serviço faltante e este teste falharia.
    // A autoridade do CHECKED_IN vive na derivação do roster; o contrato do
    // cancelamento não declara erro de check-in.
    const absenceRepo = happyAbsenceRepo();

    const [result, events] = await run(
      NOW,
      baseInput,
      absenceRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(events).toHaveLength(1);
    expect(result.cancelledAt).toEqual(NOW);
  });
});
