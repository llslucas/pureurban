import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import {
  registerNotReturning,
  CANCELLABLE_WINDOW_MS,
} from './register-not-returning.use-case.js';
import {
  AbsenceRepository,
  AbsenceRepositoryApi,
  BoardingAbsenceData,
} from '../ports/absence-repository.port.js';
import {
  BoardingRepository,
  BoardingRepositoryApi,
  BoardingRecordData,
} from '../ports/boarding-repository.port.js';
import { TripAccess, TripAccessApi } from '../ports/trip-access.port.js';
import {
  StudentEligibility,
  StudentEligibilityApi,
} from '../ports/student-eligibility.port.js';
import {
  TripNotActiveError,
  StudentNotOnTripError,
  AbsenceAlreadyRegisteredError,
  StudentAlreadyCheckedInError,
  IdempotencyKeyConflictError,
} from '../errors/boarding.errors.js';

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

const mockRecord: BoardingRecordData = {
  id: 'boarding-1',
  companyId: 'company-1',
  tripId: 'trip-1',
  studentId: 'student-1',
  recordedBy: 'driver-1',
  idempotencyKey: 'key-checkin-1',
  checkedInAt: new Date('2026-01-01T09:30:00.000Z'),
  createdAt: new Date('2026-01-01T09:30:00.000Z'),
  updatedAt: new Date('2026-01-01T09:30:00.000Z'),
};

const baseInput = {
  studentId: 'student-1',
  tripId: 'trip-1',
  companyId: 'company-1',
  idempotencyKey: 'key-1',
};

const activeTrip = {
  id: 'trip-1',
  routeId: 'route-1',
  driverId: 'driver-1',
};

function makeLayer(
  absenceRepo: Partial<AbsenceRepositoryApi>,
  boardingRepo: Partial<BoardingRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) {
  return Layer.mergeAll(
    Layer.succeed(AbsenceRepository, absenceRepo as AbsenceRepositoryApi),
    Layer.succeed(BoardingRepository, boardingRepo as BoardingRepositoryApi),
    Layer.succeed(TripAccess, tripAccess as TripAccessApi),
    Layer.succeed(
      StudentEligibility,
      studentEligibility as StudentEligibilityApi,
    ),
  );
}

const run = (
  input: Parameters<typeof registerNotReturning>[0],
  absenceRepo: Partial<AbsenceRepositoryApi>,
  boardingRepo: Partial<BoardingRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) =>
  Effect.runPromise(
    registerNotReturning(input).pipe(
      Effect.provide(
        makeLayer(absenceRepo, boardingRepo, tripAccess, studentEligibility),
      ),
    ),
  );

const runEither = (
  input: Parameters<typeof registerNotReturning>[0],
  absenceRepo: Partial<AbsenceRepositoryApi>,
  boardingRepo: Partial<BoardingRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) =>
  Effect.runPromise(
    Effect.either(
      registerNotReturning(input).pipe(
        Effect.provide(
          makeLayer(absenceRepo, boardingRepo, tripAccess, studentEligibility),
        ),
      ),
    ),
  );

// Portas satisfeitas para o caminho feliz — cada teste sobrescreve só o que precisa.
const happyAbsenceRepo = (): Partial<AbsenceRepositoryApi> => ({
  findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
  findActiveByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
  create: vi
    .fn()
    .mockReturnValue(Effect.succeed({ created: true, record: mockAbsence })),
});
const happyBoardingRepo = (): Partial<BoardingRepositoryApi> => ({
  findCheckInByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
});
const happyTrip = (): Partial<TripAccessApi> => ({
  findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(activeTrip)),
});
const happyEligibility = (): Partial<StudentEligibilityApi> => ({
  isAllowedOnRoute: vi.fn().mockReturnValue(Effect.succeed(true)),
});

describe('registerNotReturning', () => {
  it('deve persistir a ausência e emitir exatamente 1 evento boarding.not_returning', async () => {
    const absenceRepo = happyAbsenceRepo();

    const [result, events] = await run(
      baseInput,
      absenceRepo,
      happyBoardingRepo(),
      happyTrip(),
      happyEligibility(),
    );

    expect(result.id).toBe('absence-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('boarding.not_returning');
    expect(absenceRepo.create).toHaveBeenCalledOnce();

    const args = vi.mocked(absenceRepo.create!).mock.calls[0][0];
    expect(args).toMatchObject({
      companyId: 'company-1',
      tripId: 'trip-1',
      studentId: 'student-1',
      idempotencyKey: 'key-1',
    });
    expect(args.notifiedAt).toBeInstanceOf(Date);
    expect(args.cancellableUntil).toBeInstanceOf(Date);
  });

  it('o evento carrega tripId, studentId e notifiedAt — o payload do contrato SSE', async () => {
    const [, events] = await run(
      baseInput,
      happyAbsenceRepo(),
      happyBoardingRepo(),
      happyTrip(),
      happyEligibility(),
    );

    expect(events[0].data).toEqual({
      tripId: 'trip-1',
      studentId: 'student-1',
      notifiedAt: '2026-01-01T10:00:00.000Z',
    });
    expect(events[0].occurredAt).toEqual(expect.any(String));
  });

  it('cancellableUntil = notifiedAt + CANCELLABLE_WINDOW_MS, do mesmo relógio', async () => {
    const before = Date.now();
    const absenceRepo = happyAbsenceRepo();

    await run(
      baseInput,
      absenceRepo,
      happyBoardingRepo(),
      happyTrip(),
      happyEligibility(),
    );

    const args = vi.mocked(absenceRepo.create!).mock.calls[0][0];
    expect(CANCELLABLE_WINDOW_MS).toBe(2 * 60 * 1000);
    expect(args.cancellableUntil.getTime() - args.notifiedAt.getTime()).toBe(
      CANCELLABLE_WINDOW_MS,
    );
    expect(args.notifiedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(args.notifiedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('replay: retorna a ausência existente sem emitir evento e sem tocar regra de negócio', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByIdempotencyKey: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockAbsence)),
      create: vi.fn(),
    };
    const tripAccess: Partial<TripAccessApi> = { findActiveTrip: vi.fn() };
    const studentEligibility: Partial<StudentEligibilityApi> = {
      isAllowedOnRoute: vi.fn(),
    };
    const boardingRepo: Partial<BoardingRepositoryApi> = {
      findCheckInByTripAndStudent: vi.fn(),
    };

    const [result, events] = await run(
      baseInput,
      absenceRepo,
      boardingRepo,
      tripAccess,
      studentEligibility,
    );

    expect(result).toEqual(mockAbsence);
    expect(events).toHaveLength(0);
    expect(absenceRepo.create).not.toHaveBeenCalled();
    expect(tripAccess.findActiveTrip).not.toHaveBeenCalled();
    expect(studentEligibility.isAllowedOnRoute).not.toHaveBeenCalled();
    expect(boardingRepo.findCheckInByTripAndStudent).not.toHaveBeenCalled();
  });

  it('replay com viagem já encerrada ainda retorna sucesso — a fila offline não pode ficar presa', async () => {
    // Replay-first: a viagem sumiu (encerrada) entre o envio original e o reenvio.
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByIdempotencyKey: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockAbsence)),
      create: vi.fn(),
    };

    const [result, events] = await run(
      baseInput,
      absenceRepo,
      happyBoardingRepo(),
      { findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)) },
      { isAllowedOnRoute: vi.fn() },
    );

    expect(result).toEqual(mockAbsence);
    expect(events).toHaveLength(0);
  });

  it('replay com tripId diferente do armazenado ⇒ IdempotencyKeyConflictError', async () => {
    const result = await runEither(
      { ...baseInput, tripId: 'outra-viagem' },
      {
        findByIdempotencyKey: vi
          .fn()
          .mockReturnValue(Effect.succeed(mockAbsence)),
      },
      happyBoardingRepo(),
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
      { ...baseInput, studentId: 'outro-aluno' },
      {
        findByIdempotencyKey: vi
          .fn()
          .mockReturnValue(Effect.succeed(mockAbsence)),
      },
      happyBoardingRepo(),
      { findActiveTrip: vi.fn() },
      { isAllowedOnRoute: vi.fn() },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(IdempotencyKeyConflictError);
    }
  });

  it('corrida de replay (created: false): não emite evento — quem inseriu já emitiu', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      findActiveByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
      create: vi
        .fn()
        .mockReturnValue(
          Effect.succeed({ created: false, record: mockAbsence }),
        ),
    };

    const [result, events] = await run(
      baseInput,
      absenceRepo,
      happyBoardingRepo(),
      happyTrip(),
      happyEligibility(),
    );

    expect(result).toEqual(mockAbsence);
    expect(events).toHaveLength(0);
  });

  it('corrida de replay com payload divergente ⇒ IdempotencyKeyConflictError', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      findActiveByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
      create: vi.fn().mockReturnValue(
        Effect.succeed({
          created: false,
          record: { ...mockAbsence, studentId: 'outro-aluno' },
        }),
      ),
    };

    const result = await runEither(
      baseInput,
      absenceRepo,
      happyBoardingRepo(),
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(IdempotencyKeyConflictError);
    }
  });

  it('deve falhar com TripNotActiveError quando findActiveTrip retorna null', async () => {
    const absenceRepo = happyAbsenceRepo();
    const studentEligibility: Partial<StudentEligibilityApi> = {
      isAllowedOnRoute: vi.fn(),
    };

    const result = await runEither(
      baseInput,
      absenceRepo,
      happyBoardingRepo(),
      { findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)) },
      studentEligibility,
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotActiveError);
      expect(result.left.code).toBe('TRIP_NOT_ACTIVE');
      expect(result.left.httpStatus).toBe(409);
    }
    // Ordem das regras: nada foi consultado nem persistido depois da viagem.
    expect(studentEligibility.isAllowedOnRoute).not.toHaveBeenCalled();
    expect(absenceRepo.create).not.toHaveBeenCalled();
  });

  it('deve falhar com StudentNotOnTripError quando o aluno não é da rota (403)', async () => {
    const absenceRepo = happyAbsenceRepo();

    const result = await runEither(
      baseInput,
      absenceRepo,
      happyBoardingRepo(),
      happyTrip(),
      { isAllowedOnRoute: vi.fn().mockReturnValue(Effect.succeed(false)) },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotOnTripError);
      expect(result.left.code).toBe('STUDENT_NOT_ON_TRIP');
      expect(result.left.httpStatus).toBe(403);
    }
    expect(absenceRepo.create).not.toHaveBeenCalled();
  });

  it('isAllowedOnRoute recebe o routeId vindo da viagem, não do input', async () => {
    const studentEligibility = happyEligibility();

    await run(
      baseInput,
      happyAbsenceRepo(),
      happyBoardingRepo(),
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

  it('aluno já CHECKED_IN ⇒ StudentAlreadyCheckedInError (check-in tem autoridade) e nada é persistido', async () => {
    const absenceRepo = happyAbsenceRepo();
    const boardingRepo: Partial<BoardingRepositoryApi> = {
      findCheckInByTripAndStudent: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockRecord)),
    };

    const result = await runEither(
      baseInput,
      absenceRepo,
      boardingRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentAlreadyCheckedInError);
      expect(result.left.code).toBe('ALREADY_CHECKED_IN');
      expect(result.left.httpStatus).toBe(409);
    }
    // A ausência ativa nem é consultada: o conflito com o check-in vence.
    expect(absenceRepo.findActiveByTripAndStudent).not.toHaveBeenCalled();
    expect(absenceRepo.create).not.toHaveBeenCalled();
  });

  it('ordem: check-in existente vence ausência ativa ⇒ ALREADY_CHECKED_IN', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      findActiveByTripAndStudent: vi
        .fn()
        .mockReturnValue(
          Effect.succeed({ ...mockAbsence, id: 'absence-antiga' }),
        ),
      create: vi.fn(),
    };

    const result = await runEither(
      baseInput,
      absenceRepo,
      {
        findCheckInByTripAndStudent: vi
          .fn()
          .mockReturnValue(Effect.succeed(mockRecord)),
      },
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentAlreadyCheckedInError);
    }
  });

  it('ausência ativa existente ⇒ AbsenceAlreadyRegisteredError (ALREADY_NOT_RETURNING) e nenhum create', async () => {
    const absenceRepo: Partial<AbsenceRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      findActiveByTripAndStudent: vi
        .fn()
        .mockReturnValue(
          Effect.succeed({ ...mockAbsence, id: 'absence-antiga' }),
        ),
      create: vi.fn(),
    };

    const result = await runEither(
      baseInput,
      absenceRepo,
      happyBoardingRepo(),
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(AbsenceAlreadyRegisteredError);
      expect(result.left.code).toBe('ALREADY_NOT_RETURNING');
      expect(result.left.httpStatus).toBe(409);
    }
    expect(absenceRepo.create).not.toHaveBeenCalled();
  });
});
