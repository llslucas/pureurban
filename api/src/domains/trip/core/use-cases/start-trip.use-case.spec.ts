import { Effect } from 'effect';
import { describe, it, expect, vi } from 'vitest';
import { startTrip } from './start-trip.use-case.js';
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

describe('startTrip', () => {
  it('cria viagem quando motorista não tem viagem ativa', async () => {
    const repo = makeRepo({
      findActiveByDriver: vi.fn(() => Effect.succeed(null)),
    });
    const program = startTrip({
      driverId: 'driver-1',
      routeId: 'route-1',
      tenantId: 'company-1',
      type: 'OUTBOUND',
    });
    const [result] = await runWith(program, repo);
    expect(result.type).toBe('OUTBOUND');
    expect(result.status).toBe('ACTIVE');
  });

  it('falha com TripAlreadyActive quando motorista já tem viagem ativa', async () => {
    const repo = makeRepo({
      findActiveByDriver: vi.fn(() => Effect.succeed(makeTripData())),
    });
    const program = startTrip({
      driverId: 'driver-1',
      routeId: 'route-1',
      tenantId: 'company-1',
      type: 'OUTBOUND',
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provideService(TripRepository, repo), Effect.either),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('TripAlreadyActive');
    }
  });

  it('emite evento trip.started', async () => {
    const repo = makeRepo({
      findActiveByDriver: vi.fn(() => Effect.succeed(null)),
    });
    const program = startTrip({
      driverId: 'driver-1',
      routeId: 'route-1',
      tenantId: 'company-1',
      type: 'OUTBOUND',
    });
    const [, events] = await runWith(program, repo);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('trip.started');
  });

  it('cria viagem RETURN com relatedTripId', async () => {
    const createdTripData = makeTripData({
      type: 'RETURN',
      relatedTripId: 'trip-0',
    });
    const repo = makeRepo({
      findActiveByDriver: vi.fn(() => Effect.succeed(null)),
      create: vi.fn(() => Effect.succeed(createdTripData)),
    });
    const program = startTrip({
      driverId: 'driver-1',
      routeId: 'route-1',
      tenantId: 'company-1',
      type: 'RETURN',
      relatedTripId: 'trip-0',
    });
    const [result] = await runWith(program, repo);
    expect(result.type).toBe('RETURN');
    expect(result.relatedTripId).toBe('trip-0');
  });
});
