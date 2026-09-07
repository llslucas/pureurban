import { Effect } from 'effect';
import { describe, it, expect, vi } from 'vitest';
import { getActiveStudentTrip } from './get-active-student-trip.use-case.js';
import { TripRepository } from '../ports/trip-repository.port.js';
import type {
  TripData,
  TripRepositoryApi,
} from '../ports/trip-repository.port.js';

const makeTripData = (overrides: Partial<TripData> = {}): TripData => ({
  id: 'trip-return-1',
  companyId: 'company-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  type: 'RETURN',
  status: 'ACTIVE',
  startedAt: new Date('2024-01-01'),
  endedAt: null,
  relatedTripId: 'trip-outbound-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const makeRepo = (
  overrides: Partial<TripRepositoryApi> = {},
): TripRepositoryApi => ({
  create: vi.fn(() => Effect.succeed(makeTripData())),
  findById: vi.fn(() => Effect.succeed(makeTripData())),
  update: vi.fn(() => Effect.succeed(makeTripData())),
  findActiveByDriver: vi.fn(() => Effect.succeed(null)),
  findActiveReturnByStudent: vi.fn(() => Effect.succeed(null)),
  ...overrides,
});

const runWith = <A, E>(
  effect: Effect.Effect<A, E, TripRepository>,
  repo: TripRepositoryApi,
) =>
  Effect.runPromise(effect.pipe(Effect.provideService(TripRepository, repo)));

describe('getActiveStudentTrip', () => {
  it('retorna a viagem de retorno ativa da rota do aluno, sem eventos', async () => {
    const trip = makeTripData();
    const repo = makeRepo({
      findActiveReturnByStudent: vi.fn(() => Effect.succeed(trip)),
    });
    const [result, events] = await runWith(
      getActiveStudentTrip({ studentId: 'student-1', tenantId: 'company-1' }),
      repo,
    );
    expect(result).toEqual(trip);
    expect(events).toHaveLength(0);
  });

  it('retorna null quando não há retorno ativo (ou o aluno não está em nenhuma rota)', async () => {
    const repo = makeRepo({
      findActiveReturnByStudent: vi.fn(() => Effect.succeed(null)),
    });
    const [result] = await runWith(
      getActiveStudentTrip({ studentId: 'student-1', tenantId: 'company-1' }),
      repo,
    );
    expect(result).toBeNull();
  });

  it('consulta o repositório com studentId e tenant recebidos', async () => {
    const findActiveReturnByStudent = vi.fn(() => Effect.succeed(null));
    const repo = makeRepo({ findActiveReturnByStudent });
    await runWith(
      getActiveStudentTrip({ studentId: 'student-9', tenantId: 'company-9' }),
      repo,
    );
    expect(findActiveReturnByStudent).toHaveBeenCalledWith(
      'student-9',
      'company-9',
    );
  });
});
