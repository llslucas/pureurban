import { Effect } from 'effect';
import { describe, it, expect, vi } from 'vitest';
import { endTrip } from './end-trip.use-case.js';
import { TripRepository } from '../ports/trip-repository.port.js';
import type {
  TripData,
  TripRepositoryApi,
} from '../ports/trip-repository.port.js';
import { TripNotFound } from '../errors/trip.errors.js';

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
  update: vi.fn(() =>
    Effect.succeed(makeTripData({ status: 'COMPLETED', endedAt: new Date() })),
  ),
  findActiveByDriver: vi.fn(() => Effect.succeed(null)),
  ...overrides,
});

const runWith = <A, E>(
  effect: Effect.Effect<A, E, TripRepository>,
  repo: TripRepositoryApi,
) =>
  Effect.runPromise(effect.pipe(Effect.provideService(TripRepository, repo)));

describe('endTrip', () => {
  it('encerra viagem ativa: manda status COMPLETED e endedAt ao repositório (AC2)', async () => {
    let captured:
      | { id: string; patch: Partial<TripData>; tenantId: string }
      | undefined;
    const update = vi.fn(
      (id: string, patch: Partial<TripData>, tenantId: string) => {
        captured = { id, patch, tenantId };
        return Effect.succeed(
          makeTripData({ status: 'COMPLETED', endedAt: new Date() }),
        );
      },
    );
    const repo = makeRepo({ update });
    const [result] = await runWith(
      endTrip({
        tripId: 'trip-1',
        driverId: 'driver-1',
        tenantId: 'company-1',
      }),
      repo,
    );
    expect(result.status).toBe('COMPLETED');
    expect(captured?.id).toBe('trip-1');
    expect(captured?.tenantId).toBe('company-1');
    expect(captured?.patch.status).toBe('COMPLETED');
    expect(captured?.patch.endedAt).toBeInstanceOf(Date);
  });

  it('emite evento trip.ended', async () => {
    const repo = makeRepo();
    const [, events] = await runWith(
      endTrip({
        tripId: 'trip-1',
        driverId: 'driver-1',
        tenantId: 'company-1',
      }),
      repo,
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('trip.ended');
  });

  it('viagem de outro motorista falha com DriverNotAssigned — mesmo disclosure do get-trip-students (DS6)', async () => {
    const update = vi.fn(() => Effect.succeed(makeTripData()));
    const repo = makeRepo({
      findById: vi.fn(() =>
        Effect.succeed(makeTripData({ driverId: 'outro-driver' })),
      ),
      update,
    });
    const result = await Effect.runPromise(
      endTrip({
        tripId: 'trip-1',
        driverId: 'driver-1',
        tenantId: 'company-1',
      }).pipe(Effect.provideService(TripRepository, repo), Effect.either),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('DriverNotAssigned');
      expect(result.left.code).toBe('DRIVER_NOT_ASSIGNED');
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('falha com InvalidTripTransition quando viagem já está COMPLETED', async () => {
    const repo = makeRepo({
      findById: vi.fn(() =>
        Effect.succeed(makeTripData({ status: 'COMPLETED' })),
      ),
    });
    const result = await Effect.runPromise(
      endTrip({
        tripId: 'trip-1',
        driverId: 'driver-1',
        tenantId: 'company-1',
      }).pipe(Effect.provideService(TripRepository, repo), Effect.either),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('InvalidTripTransition');
      expect(result.left.code).toBe('TRIP_NOT_ACTIVE');
    }
  });

  it('falha com TripNotFound quando viagem não existe', async () => {
    const repo = makeRepo({
      findById: vi.fn(() =>
        Effect.fail(
          new TripNotFound({
            code: 'TRIP_NOT_FOUND',
            message: 'Não encontrada',
          }),
        ),
      ),
    });
    const result = await Effect.runPromise(
      endTrip({
        tripId: 'trip-999',
        driverId: 'driver-1',
        tenantId: 'company-1',
      }).pipe(Effect.provideService(TripRepository, repo), Effect.either),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('TripNotFound');
    }
  });
});
