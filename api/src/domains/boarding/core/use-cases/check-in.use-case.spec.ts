import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { checkIn } from './check-in.use-case.js';
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
  StudentNotAllowedError,
  DriverNotAssignedError,
  IdempotencyKeyConflictError,
  InvalidQrCodeError,
  DuplicateCheckInError,
} from '../errors/boarding.errors.js';

const mockRecord: BoardingRecordData = {
  id: 'boarding-1',
  companyId: 'company-1',
  tripId: 'trip-1',
  studentId: 'student-1',
  recordedBy: 'driver-1',
  idempotencyKey: 'key-1',
  checkedInAt: new Date('2026-01-01T10:00:00.000Z'),
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

const baseInput = {
  studentId: 'student-1',
  tripId: 'trip-1',
  companyId: 'company-1',
  driverId: 'driver-1',
  idempotencyKey: 'key-1',
};

const activeTrip = {
  id: 'trip-1',
  routeId: 'route-1',
  driverId: 'driver-1',
};

function makeLayer(
  boardingRepo: Partial<BoardingRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) {
  return Layer.mergeAll(
    Layer.succeed(BoardingRepository, boardingRepo as BoardingRepositoryApi),
    Layer.succeed(TripAccess, tripAccess as TripAccessApi),
    Layer.succeed(
      StudentEligibility,
      studentEligibility as StudentEligibilityApi,
    ),
  );
}

const run = (
  input: Parameters<typeof checkIn>[0],
  boardingRepo: Partial<BoardingRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) =>
  Effect.runPromise(
    checkIn(input).pipe(
      Effect.provide(makeLayer(boardingRepo, tripAccess, studentEligibility)),
    ),
  );

const runEither = (
  input: Parameters<typeof checkIn>[0],
  boardingRepo: Partial<BoardingRepositoryApi>,
  tripAccess: Partial<TripAccessApi>,
  studentEligibility: Partial<StudentEligibilityApi>,
) =>
  Effect.runPromise(
    Effect.either(
      checkIn(input).pipe(
        Effect.provide(makeLayer(boardingRepo, tripAccess, studentEligibility)),
      ),
    ),
  );

// Portas satisfeitas para o caminho feliz — cada teste sobrescreve só o que precisa.
const happyRepo = (): Partial<BoardingRepositoryApi> => ({
  findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
  recordCheckIn: vi
    .fn()
    .mockReturnValue(Effect.succeed({ created: true, record: mockRecord })),
});
const happyTrip = (): Partial<TripAccessApi> => ({
  findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(activeTrip)),
});
const happyEligibility = (): Partial<StudentEligibilityApi> => ({
  isAllowedOnRoute: vi.fn().mockReturnValue(Effect.succeed(true)),
});

describe('checkIn', () => {
  it('deve persistir o check-in e emitir exatamente 1 evento boarding.checked_in', async () => {
    const boardingRepo = happyRepo();
    const tripAccess = happyTrip();
    const studentEligibility = happyEligibility();

    const [result, events] = await run(
      baseInput,
      boardingRepo,
      tripAccess,
      studentEligibility,
    );

    expect(result.id).toBe('boarding-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('boarding.checked_in');
    expect(boardingRepo.recordCheckIn).toHaveBeenCalledOnce();

    const args = vi.mocked(boardingRepo.recordCheckIn!).mock.calls[0][0];
    expect(args.checkedInAt).toBeInstanceOf(Date);
    expect(args).toEqual({
      companyId: 'company-1',
      tripId: 'trip-1',
      studentId: 'student-1',
      recordedBy: 'driver-1',
      idempotencyKey: 'key-1',
      checkedInAt: args.checkedInAt,
    });
  });

  it('o evento carrega companyId e recordedBy para o consumidor não precisar reconsultar o boarding', async () => {
    const [, events] = await run(
      baseInput,
      happyRepo(),
      happyTrip(),
      happyEligibility(),
    );

    expect(events[0].data).toMatchObject({
      boardingRecordId: 'boarding-1',
      companyId: 'company-1',
      studentId: 'student-1',
      tripId: 'trip-1',
      recordedBy: 'driver-1',
      checkedInAt: '2026-01-01T10:00:00.000Z',
    });
  });

  it('replay: retorna o registro existente sem emitir evento e sem chamar recordCheckIn', async () => {
    const boardingRepo: Partial<BoardingRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(mockRecord)),
      recordCheckIn: vi.fn(),
    };
    const tripAccess: Partial<TripAccessApi> = { findActiveTrip: vi.fn() };
    const studentEligibility: Partial<StudentEligibilityApi> = {
      isAllowedOnRoute: vi.fn(),
    };

    const [result, events] = await run(
      baseInput,
      boardingRepo,
      tripAccess,
      studentEligibility,
    );

    expect(result).toEqual(mockRecord);
    expect(events).toHaveLength(0);
    expect(boardingRepo.recordCheckIn).not.toHaveBeenCalled();
    expect(tripAccess.findActiveTrip).not.toHaveBeenCalled();
    expect(studentEligibility.isAllowedOnRoute).not.toHaveBeenCalled();
  });

  it('replay com viagem já encerrada ainda retorna sucesso — a fila offline não pode ficar presa', async () => {
    const boardingRepo: Partial<BoardingRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(mockRecord)),
      recordCheckIn: vi.fn(),
    };
    // Viagem encerrada entre o envio original e o reenvio.
    const tripAccess: Partial<TripAccessApi> = {
      findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)),
    };

    const [result, events] = await run(baseInput, boardingRepo, tripAccess, {
      isAllowedOnRoute: vi.fn(),
    });

    expect(result).toEqual(mockRecord);
    expect(events).toHaveLength(0);
  });

  it('replay com studentId diferente do armazenado ⇒ IdempotencyKeyConflictError, nunca o registro do outro aluno', async () => {
    const boardingRepo: Partial<BoardingRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(mockRecord)),
      recordCheckIn: vi.fn(),
    };

    const result = await runEither(
      { ...baseInput, studentId: 'outro-aluno' },
      boardingRepo,
      { findActiveTrip: vi.fn() },
      { isAllowedOnRoute: vi.fn() },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(IdempotencyKeyConflictError);
      expect(result.left.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
      expect(result.left.httpStatus).toBe(409);
    }
    expect(boardingRepo.recordCheckIn).not.toHaveBeenCalled();
  });

  it('replay com tripId diferente do armazenado ⇒ IdempotencyKeyConflictError', async () => {
    const result = await runEither(
      { ...baseInput, tripId: 'outra-viagem' },
      {
        findByIdempotencyKey: vi
          .fn()
          .mockReturnValue(Effect.succeed(mockRecord)),
      },
      { findActiveTrip: vi.fn() },
      { isAllowedOnRoute: vi.fn() },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(IdempotencyKeyConflictError);
    }
  });

  it('corrida de replay (created: false): não emite evento — quem inseriu já emitiu', async () => {
    const boardingRepo: Partial<BoardingRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      recordCheckIn: vi
        .fn()
        .mockReturnValue(
          Effect.succeed({ created: false, record: mockRecord }),
        ),
    };

    const [result, events] = await run(
      baseInput,
      boardingRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result).toEqual(mockRecord);
    expect(events).toHaveLength(0);
  });

  it('corrida de replay com payload divergente ⇒ IdempotencyKeyConflictError', async () => {
    const boardingRepo: Partial<BoardingRepositoryApi> = {
      findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
      recordCheckIn: vi.fn().mockReturnValue(
        Effect.succeed({
          created: false,
          record: { ...mockRecord, studentId: 'outro-aluno' },
        }),
      ),
    };

    const result = await runEither(
      baseInput,
      boardingRepo,
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(IdempotencyKeyConflictError);
    }
  });

  it('deve falhar com TripNotActiveError quando findActiveTrip retorna null', async () => {
    const studentEligibility: Partial<StudentEligibilityApi> = {
      isAllowedOnRoute: vi.fn(),
    };

    const result = await runEither(
      baseInput,
      { findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)) },
      { findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)) },
      studentEligibility,
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotActiveError);
      expect(result.left.code).toBe('TRIP_NOT_ACTIVE');
      expect(result.left.httpStatus).toBe(409);
    }
    expect(studentEligibility.isAllowedOnRoute).not.toHaveBeenCalled();
  });

  it('deve falhar com DriverNotAssignedError quando a viagem é de outro motorista', async () => {
    const boardingRepo = happyRepo();
    const studentEligibility: Partial<StudentEligibilityApi> = {
      isAllowedOnRoute: vi.fn(),
    };

    const result = await runEither(
      { ...baseInput, driverId: 'outro-motorista' },
      boardingRepo,
      happyTrip(),
      studentEligibility,
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(DriverNotAssignedError);
      expect(result.left.code).toBe('DRIVER_NOT_ASSIGNED');
      expect(result.left.httpStatus).toBe(403);
    }
    // Nada é persistido e a elegibilidade nem chega a ser consultada.
    expect(studentEligibility.isAllowedOnRoute).not.toHaveBeenCalled();
    expect(boardingRepo.recordCheckIn).not.toHaveBeenCalled();
  });

  it('ordem: viagem inativa vence motorista errado ⇒ TripNotActiveError', async () => {
    const result = await runEither(
      { ...baseInput, driverId: 'outro-motorista' },
      { findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)) },
      { findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)) },
      { isAllowedOnRoute: vi.fn() },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotActiveError);
    }
  });

  it('ordem: motorista errado vence aluno não vinculado ⇒ DriverNotAssignedError', async () => {
    const studentEligibility: Partial<StudentEligibilityApi> = {
      isAllowedOnRoute: vi.fn().mockReturnValue(Effect.succeed(false)),
    };

    const result = await runEither(
      { ...baseInput, driverId: 'outro-motorista' },
      { findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)) },
      happyTrip(),
      studentEligibility,
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(DriverNotAssignedError);
    }
    expect(studentEligibility.isAllowedOnRoute).not.toHaveBeenCalled();
  });

  it('deve falhar com StudentNotAllowedError quando isAllowedOnRoute retorna false', async () => {
    const result = await runEither(
      baseInput,
      { findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)) },
      happyTrip(),
      { isAllowedOnRoute: vi.fn().mockReturnValue(Effect.succeed(false)) },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotAllowedError);
      expect(result.left.code).toBe('STUDENT_NOT_ALLOWED');
      expect(result.left.httpStatus).toBe(403);
    }
  });

  it('deve propagar DuplicateCheckInError do repositório', async () => {
    const result = await runEither(
      baseInput,
      {
        findByIdempotencyKey: vi.fn().mockReturnValue(Effect.succeed(null)),
        recordCheckIn: vi
          .fn()
          .mockReturnValue(Effect.fail(DuplicateCheckInError.create())),
      },
      happyTrip(),
      happyEligibility(),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(DuplicateCheckInError);
      expect(result.left.code).toBe('DUPLICATE_CHECK_IN');
      expect(result.left.httpStatus).toBe(409);
    }
  });

  it('isAllowedOnRoute recebe o routeId vindo da viagem, não do input', async () => {
    const studentEligibility = happyEligibility();

    await run(
      baseInput,
      happyRepo(),
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

  describe('occurredAt (fila offline)', () => {
    it('ausente ⇒ usa o horário do servidor', async () => {
      const boardingRepo = happyRepo();
      const before = Date.now();

      await run(baseInput, boardingRepo, happyTrip(), happyEligibility());

      const { checkedInAt } = vi.mocked(boardingRepo.recordCheckIn!).mock
        .calls[0][0];
      expect(checkedInAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(checkedInAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('presente e plausível ⇒ é o horário gravado, não o do processamento', async () => {
      const boardingRepo = happyRepo();
      const occurredAt = new Date(Date.now() - 35 * 60 * 1000).toISOString();

      await run(
        { ...baseInput, occurredAt },
        boardingRepo,
        happyTrip(),
        happyEligibility(),
      );

      const { checkedInAt } = vi.mocked(boardingRepo.recordCheckIn!).mock
        .calls[0][0];
      expect(checkedInAt.toISOString()).toBe(occurredAt);
    });

    it('no futuro além da tolerância de relógio ⇒ InvalidQrCodeError', async () => {
      const boardingRepo = happyRepo();
      const occurredAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const result = await runEither(
        { ...baseInput, occurredAt },
        boardingRepo,
        happyTrip(),
        happyEligibility(),
      );

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(InvalidQrCodeError);
        expect(result.left.httpStatus).toBe(400);
      }
      expect(boardingRepo.recordCheckIn).not.toHaveBeenCalled();
    });

    it('pequeno adiantamento de relógio do celular ⇒ aceito', async () => {
      const boardingRepo = happyRepo();
      const occurredAt = new Date(Date.now() + 60 * 1000).toISOString();

      await run(
        { ...baseInput, occurredAt },
        boardingRepo,
        happyTrip(),
        happyEligibility(),
      );

      expect(boardingRepo.recordCheckIn).toHaveBeenCalledOnce();
    });

    it('mais de 24h no passado ⇒ InvalidQrCodeError', async () => {
      const occurredAt = new Date(
        Date.now() - 25 * 60 * 60 * 1000,
      ).toISOString();

      const result = await runEither(
        { ...baseInput, occurredAt },
        happyRepo(),
        happyTrip(),
        happyEligibility(),
      );

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(InvalidQrCodeError);
      }
    });

    it('occurredAt absurdo NÃO impede o replay — o item precisa sair da fila', async () => {
      const boardingRepo: Partial<BoardingRepositoryApi> = {
        findByIdempotencyKey: vi
          .fn()
          .mockReturnValue(Effect.succeed(mockRecord)),
        recordCheckIn: vi.fn(),
      };

      const [result, events] = await run(
        { ...baseInput, occurredAt: new Date(Date.now() + 1e10).toISOString() },
        boardingRepo,
        { findActiveTrip: vi.fn() },
        { isAllowedOnRoute: vi.fn() },
      );

      expect(result).toEqual(mockRecord);
      expect(events).toHaveLength(0);
    });
  });
});
