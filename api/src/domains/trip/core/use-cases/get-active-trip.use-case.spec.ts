import { Effect } from 'effect';
import { describe, it, expect, vi } from 'vitest';
import { getActiveTrip } from './get-active-trip.use-case.js';
import { TripRepository } from '../ports/trip-repository.port.js';
import type {
  TripData,
  TripRepositoryApi,
} from '../ports/trip-repository.port.js';

const makeTripData = (overrides: Partial<TripData> = {}): TripData => ({
  id: 'trip-1',
  companyId: 'company-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  type: 'OUTBOUND',
  status: 'ACTIVE',
  startedAt: new Date('2024-01-01'),
  endedAt: null,
  relatedTripId: null,
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
  ...overrides,
});

const runWith = <A, E>(
  effect: Effect.Effect<A, E, TripRepository>,
  repo: TripRepositoryApi,
) =>
  Effect.runPromise(effect.pipe(Effect.provideService(TripRepository, repo)));

describe('getActiveTrip', () => {
  it('retorna a viagem ativa do motorista, sem eventos', async () => {
    const trip = makeTripData();
    const repo = makeRepo({
      findActiveByDriver: vi.fn(() => Effect.succeed(trip)),
    });
    const [result, events] = await runWith(
      getActiveTrip({ driverId: 'driver-1', tenantId: 'company-1' }),
      repo,
    );
    expect(result).toEqual(trip);
    expect(events).toHaveLength(0);
  });

  it('retorna null quando o motorista não tem viagem ativa', async () => {
    const repo = makeRepo({
      findActiveByDriver: vi.fn(() => Effect.succeed(null)),
    });
    const [result] = await runWith(
      getActiveTrip({ driverId: 'driver-1', tenantId: 'company-1' }),
      repo,
    );
    expect(result).toBeNull();
  });

  it('consulta o repositório com driverId e tenant recebidos', async () => {
    const findActiveByDriver = vi.fn(() => Effect.succeed(null));
    const repo = makeRepo({ findActiveByDriver });
    await runWith(
      getActiveTrip({ driverId: 'driver-9', tenantId: 'company-9' }),
      repo,
    );
    expect(findActiveByDriver).toHaveBeenCalledWith('driver-9', 'company-9');
  });
});
