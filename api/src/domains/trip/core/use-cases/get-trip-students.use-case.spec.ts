import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { getTripStudents } from './get-trip-students.use-case.js';
import {
  TripRepository,
  TripRepositoryApi,
  TripData,
} from '../ports/trip-repository.port.js';
import { TripRoster, TripRosterApi } from '../ports/trip-roster.port.js';
import {
  BoardingStatus,
  BoardingStatusApi,
} from '../ports/boarding-status.port.js';
import { TripNotFound, DriverNotAssigned } from '../errors/trip.errors.js';

const makeTripData = (overrides: Partial<TripData> = {}): TripData => ({
  id: 'trip-1',
  companyId: 'company-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  type: 'OUTBOUND',
  status: 'ACTIVE',
  startedAt: new Date('2026-01-01'),
  endedAt: null,
  relatedTripId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const baseInput = {
  tripId: 'trip-1',
  driverId: 'driver-1',
  tenantId: 'company-1',
};

function makeLayer(
  tripRepo: Partial<TripRepositoryApi>,
  tripRoster: Partial<TripRosterApi>,
  boardingStatus: Partial<BoardingStatusApi>,
) {
  return Layer.mergeAll(
    Layer.succeed(TripRepository, tripRepo as TripRepositoryApi),
    Layer.succeed(TripRoster, tripRoster as TripRosterApi),
    Layer.succeed(BoardingStatus, boardingStatus as BoardingStatusApi),
  );
}

const run = (
  input: Parameters<typeof getTripStudents>[0],
  tripRepo: Partial<TripRepositoryApi>,
  tripRoster: Partial<TripRosterApi>,
  boardingStatus: Partial<BoardingStatusApi>,
) =>
  Effect.runPromise(
    getTripStudents(input).pipe(
      Effect.provide(makeLayer(tripRepo, tripRoster, boardingStatus)),
    ),
  );

const runEither = (
  input: Parameters<typeof getTripStudents>[0],
  tripRepo: Partial<TripRepositoryApi>,
  tripRoster: Partial<TripRosterApi>,
  boardingStatus: Partial<BoardingStatusApi>,
) =>
  Effect.runPromise(
    Effect.either(
      getTripStudents(input).pipe(
        Effect.provide(makeLayer(tripRepo, tripRoster, boardingStatus)),
      ),
    ),
  );

const happyRepo = (
  overrides: Partial<TripData> = {},
): Partial<TripRepositoryApi> => ({
  findById: vi.fn().mockReturnValue(Effect.succeed(makeTripData(overrides))),
});

// Porta de ausências satisfeita (lista vazia) — cada teste sobrescreve o que
// precisa. Existe porque o core chama findActiveAbsencesByTrip em TODA leitura
// de roster: sem o stub, os mocks parciais quebrariam em tempo de execução.
const noAbsences = (): Partial<BoardingStatusApi> => ({
  findActiveAbsencesByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
});

describe('getTripStudents', () => {
  it('caso feliz: 3 alunos, 1 com check-in', async () => {
    const checkedInAt = new Date('2026-01-05T10:00:00.000Z');
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi.fn().mockReturnValue(
        Effect.succeed([
          { studentId: 's1', name: 'Ana' },
          { studentId: 's2', name: 'Bruno' },
          { studentId: 's3', name: 'Carla' },
        ]),
      ),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi
        .fn()
        .mockReturnValue(
          Effect.succeed([{ studentId: 's2', name: 'Bruno', checkedInAt }]),
        ),
      ...noAbsences(),
    };

    const [result, events] = await run(
      baseInput,
      happyRepo(),
      tripRoster,
      boardingStatus,
    );

    expect(result.students).toHaveLength(3);
    const bruno = result.students.find((s) => s.studentId === 's2')!;
    expect(bruno.status).toBe('CHECKED_IN');
    expect(bruno.checkedInAt).toBe(checkedInAt);
    const ana = result.students.find((s) => s.studentId === 's1')!;
    expect(ana.status).toBe('NOT_CHECKED_IN');
    expect(ana.checkedInAt).toBeNull();
    expect(result.summary).toEqual({ boarded: 1, total: 3 });
    expect(events).toHaveLength(0);
  });

  it('roster vazio ⇒ students: [] e summary { boarded: 0, total: 0 }, sem erro', async () => {
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi.fn().mockReturnValue(Effect.succeed([])),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
      ...noAbsences(),
    };

    const [result] = await run(
      baseInput,
      happyRepo(),
      tripRoster,
      boardingStatus,
    );

    expect(result.students).toEqual([]);
    expect(result.summary).toEqual({ boarded: 0, total: 0 });
  });

  it('propaga TripNotFound quando findById falha, e findRouteStudents nunca é chamado', async () => {
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi.fn(),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn(),
      ...noAbsences(),
    };

    const result = await runEither(
      baseInput,
      {
        findById: vi.fn().mockReturnValue(
          Effect.fail(
            new TripNotFound({
              code: 'TRIP_NOT_FOUND',
              message: 'Não encontrada',
            }),
          ),
        ),
      },
      tripRoster,
      boardingStatus,
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotFound);
    }
    expect(tripRoster.findRouteStudents).not.toHaveBeenCalled();
    expect(boardingStatus.findCheckedInByTrip).not.toHaveBeenCalled();
  });

  it('falha com DriverNotAssigned quando trip.driverId difere do driverId, e nenhum port de leitura é chamado', async () => {
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi.fn(),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn(),
      ...noAbsences(),
    };

    const result = await runEither(
      baseInput,
      happyRepo({ driverId: 'outro-motorista' }),
      tripRoster,
      boardingStatus,
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(DriverNotAssigned);
      expect(result.left.code).toBe('DRIVER_NOT_ASSIGNED');
      expect(result.left.httpStatus).toBe(403);
    }
    expect(tripRoster.findRouteStudents).not.toHaveBeenCalled();
    expect(boardingStatus.findCheckedInByTrip).not.toHaveBeenCalled();
  });

  it('check-in de aluno que saiu do roster continua na lista e conta nos dois lados do summary', async () => {
    const checkedInAt = new Date('2026-01-05T10:00:00.000Z');
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi
        .fn()
        .mockReturnValue(Effect.succeed([{ studentId: 's1', name: 'Ana' }])),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn().mockReturnValue(
        Effect.succeed([
          {
            studentId: 's-desvinculado',
            name: 'Zilda Desvinculada',
            checkedInAt,
          },
        ]),
      ),
      ...noAbsences(),
    };

    const [result] = await run(
      baseInput,
      happyRepo(),
      tripRoster,
      boardingStatus,
    );

    // O aluno embarcou e depois foi desativado/desvinculado — sumir da tela do
    // motorista é a pior direção de falha, então ele permanece visível.
    expect(result.students).toHaveLength(2);
    const orfao = result.students.find(
      (s) => s.studentId === 's-desvinculado',
    )!;
    expect(orfao.status).toBe('CHECKED_IN');
    expect(orfao.name).toBe('Zilda Desvinculada');
    expect(orfao.checkedInAt).toBe(checkedInAt);

    const ana = result.students.find((s) => s.studentId === 's1')!;
    expect(ana.status).toBe('NOT_CHECKED_IN');

    // Entra no boarded E no total: `boarded <= total` sempre — nada de "2 de 1".
    expect(result.summary).toEqual({ boarded: 1, total: 2 });
  });

  it('não duplica o aluno que está no roster e tem check-in', async () => {
    const checkedInAt = new Date('2026-01-05T10:00:00.000Z');
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi
        .fn()
        .mockReturnValue(Effect.succeed([{ studentId: 's1', name: 'Ana' }])),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi
        .fn()
        .mockReturnValue(
          Effect.succeed([{ studentId: 's1', name: 'Ana', checkedInAt }]),
        ),
      ...noAbsences(),
    };

    const [result] = await run(
      baseInput,
      happyRepo(),
      tripRoster,
      boardingStatus,
    );

    expect(result.students).toHaveLength(1);
    expect(result.summary).toEqual({ boarded: 1, total: 1 });
  });

  it('findRouteStudents recebe o routeId vindo da viagem e o companyId do tenant, não do input do cliente', async () => {
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi.fn().mockReturnValue(Effect.succeed([])),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
      ...noAbsences(),
    };

    await run(
      baseInput,
      happyRepo({ routeId: 'route-from-trip' }),
      tripRoster,
      boardingStatus,
    );

    expect(tripRoster.findRouteStudents).toHaveBeenCalledWith(
      'route-from-trip',
      'company-1',
    );
  });

  it('ordenação: roster fora de ordem entra, sai ordenado por nome; empate desempata por studentId', async () => {
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi.fn().mockReturnValue(
        Effect.succeed([
          { studentId: 's3', name: 'Carla' },
          { studentId: 's2', name: 'Ana' },
          { studentId: 's1', name: 'Ana' },
        ]),
      ),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
      ...noAbsences(),
    };

    const [result] = await run(
      baseInput,
      happyRepo(),
      tripRoster,
      boardingStatus,
    );

    expect(result.students.map((s) => s.studentId)).toEqual(['s1', 's2', 's3']);
  });

  it('viagem COMPLETED ⇒ 200 com a lista (nenhuma checagem de status no core)', async () => {
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi
        .fn()
        .mockReturnValue(Effect.succeed([{ studentId: 's1', name: 'Ana' }])),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
      ...noAbsences(),
    };

    const [result] = await run(
      baseInput,
      happyRepo({ status: 'COMPLETED', endedAt: new Date() }),
      tripRoster,
      boardingStatus,
    );

    expect(result.students).toHaveLength(1);
  });

  it('ausência ativa ⇒ status NOT_RETURNING e o total do summary EXCLUI o aluno', async () => {
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi.fn().mockReturnValue(
        Effect.succeed([
          { studentId: 's1', name: 'Ana' },
          { studentId: 's2', name: 'Bruno' },
          { studentId: 's3', name: 'Carla' },
        ]),
      ),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
      findActiveAbsencesByTrip: vi
        .fn()
        .mockReturnValue(Effect.succeed([{ studentId: 's2' }])),
    };

    const [result] = await run(
      baseInput,
      happyRepo(),
      tripRoster,
      boardingStatus,
    );

    const bruno = result.students.find((s) => s.studentId === 's2')!;
    expect(bruno.status).toBe('NOT_RETURNING');
    expect(bruno.checkedInAt).toBeNull();
    // "28/32" → "28/31": quem avisou que não volta sai do denominador.
    expect(result.summary).toEqual({ boarded: 0, total: 2 });
  });

  it('check-in E ausência ativa ⇒ CHECKED_IN prevalece e o aluno conta nos dois lados', async () => {
    const checkedInAt = new Date('2026-01-05T10:00:00.000Z');
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi
        .fn()
        .mockReturnValue(Effect.succeed([{ studentId: 's1', name: 'Ana' }])),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi
        .fn()
        .mockReturnValue(
          Effect.succeed([{ studentId: 's1', name: 'Ana', checkedInAt }]),
        ),
      findActiveAbsencesByTrip: vi
        .fn()
        .mockReturnValue(Effect.succeed([{ studentId: 's1' }])),
    };

    const [result] = await run(
      baseInput,
      happyRepo(),
      tripRoster,
      boardingStatus,
    );

    expect(result.students).toHaveLength(1);
    expect(result.students[0].status).toBe('CHECKED_IN');
    // boarded <= total sempre: o motorista que embarcou vence o "não vou voltar".
    expect(result.summary).toEqual({ boarded: 1, total: 1 });
  });

  it('todos ausentes ⇒ summary zerado sem erro', async () => {
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi.fn().mockReturnValue(
        Effect.succeed([
          { studentId: 's1', name: 'Ana' },
          { studentId: 's2', name: 'Bruno' },
        ]),
      ),
    };
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
      findActiveAbsencesByTrip: vi
        .fn()
        .mockReturnValue(
          Effect.succeed([{ studentId: 's1' }, { studentId: 's2' }]),
        ),
    };

    const [result] = await run(
      baseInput,
      happyRepo(),
      tripRoster,
      boardingStatus,
    );

    expect(result.students).toHaveLength(2);
    expect(result.summary).toEqual({ boarded: 0, total: 0 });
  });

  it('findActiveAbsencesByTrip recebe tripId da viagem e o tenant, junto das outras leituras', async () => {
    const boardingStatus: Partial<BoardingStatusApi> = {
      findCheckedInByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
      findActiveAbsencesByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
    };
    const tripRoster: Partial<TripRosterApi> = {
      findRouteStudents: vi
        .fn()
        .mockReturnValue(Effect.succeed([{ studentId: 's1', name: 'Ana' }])),
    };

    await run(baseInput, happyRepo(), tripRoster, boardingStatus);

    expect(boardingStatus.findActiveAbsencesByTrip).toHaveBeenCalledWith(
      'trip-1',
      'company-1',
    );
  });
});
