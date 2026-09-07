import { Effect } from 'effect';
import { describe, it, expect, vi } from 'vitest';
import { startTrip } from './start-trip.use-case.js';
import { TripRepository } from '../ports/trip-repository.port.js';
import { RouteAccess } from '../ports/route-access.port.js';
import type {
  TripData,
  TripRepositoryApi,
} from '../ports/trip-repository.port.js';
import type { RouteAccessApi } from '../ports/route-access.port.js';

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

const makeRouteAccess = (isAssigned = true): RouteAccessApi => ({
  isDriverAssignedToRoute: vi.fn(() => Effect.succeed(isAssigned)),
});

const provide = <A, E>(
  effect: Effect.Effect<A, E, TripRepository | RouteAccess>,
  repo: TripRepositoryApi,
  routeAccess: RouteAccessApi = makeRouteAccess(),
) =>
  effect.pipe(
    Effect.provideService(TripRepository, repo),
    Effect.provideService(RouteAccess, routeAccess),
  );

const runWith = <A, E>(
  effect: Effect.Effect<A, E, TripRepository | RouteAccess>,
  repo: TripRepositoryApi,
  routeAccess: RouteAccessApi = makeRouteAccess(),
) => Effect.runPromise(provide(effect, repo, routeAccess));

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
      provide(program, repo).pipe(Effect.either),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('TripAlreadyActive');
    }
  });

  it('falha com DriverNotAssigned quando o motorista não está vinculado à rota', async () => {
    // Spies em consts: referenciar `repo.metodo` direto no expect dispara
    // @typescript-eslint/unbound-method.
    const findActiveByDriver = vi.fn(() => Effect.succeed(null));
    const create = vi.fn(() => Effect.succeed(makeTripData()));
    const repo = makeRepo({ findActiveByDriver, create });
    const routeAccess = makeRouteAccess(false);
    const program = startTrip({
      driverId: 'driver-1',
      routeId: 'route-de-outro-motorista',
      tenantId: 'company-1',
      type: 'OUTBOUND',
    });

    const result = await Effect.runPromise(
      provide(program, repo, routeAccess).pipe(Effect.either),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('DriverNotAssigned');
      expect((result.left as { code: string }).code).toBe(
        'DRIVER_NOT_ASSIGNED',
      );
    }
    // Autorização antes de regra de estado: nem chega a consultar viagem ativa
    // nem a criar nada.
    expect(findActiveByDriver).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('consulta o vínculo com o routeId da requisição e o tenant do token', async () => {
    const repo = makeRepo();
    const isDriverAssignedToRoute = vi.fn(() => Effect.succeed(true));
    const routeAccess: RouteAccessApi = { isDriverAssignedToRoute };
    const program = startTrip({
      driverId: 'driver-1',
      routeId: 'route-1',
      tenantId: 'company-1',
      type: 'OUTBOUND',
    });

    await runWith(program, repo, routeAccess);

    expect(isDriverAssignedToRoute).toHaveBeenCalledWith(
      'route-1',
      'driver-1',
      'company-1',
    );
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

  it('cria viagem RETURN repassando relatedTripId e status ACTIVE ao repositório', async () => {
    const createdTripData = makeTripData({
      type: 'RETURN',
      relatedTripId: 'trip-0',
    });
    const create = vi.fn(() => Effect.succeed(createdTripData));
    const repo = makeRepo({
      findActiveByDriver: vi.fn(() => Effect.succeed(null)),
      create,
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
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        routeId: 'route-1',
        driverId: 'driver-1',
        type: 'RETURN',
        status: 'ACTIVE',
        relatedTripId: 'trip-0',
      }),
    );
  });

  it('recusa RETURN sem relatedTripId com InvalidTripTransition (AC3)', async () => {
    const create = vi.fn(() => Effect.succeed(makeTripData()));
    const repo = makeRepo({ create });
    const program = startTrip({
      driverId: 'driver-1',
      routeId: 'route-1',
      tenantId: 'company-1',
      type: 'RETURN',
    });
    const result = await Effect.runPromise(
      provide(program, repo).pipe(Effect.either),
    );
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('InvalidTripTransition');
      expect((result.left as { code: string }).code).toBe(
        'RETURN_REQUIRES_RELATED_TRIP',
      );
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('descarta relatedTripId num OUTBOUND — não há viagem de ida a atrelar', async () => {
    const create = vi.fn(() => Effect.succeed(makeTripData()));
    const repo = makeRepo({
      findActiveByDriver: vi.fn(() => Effect.succeed(null)),
      create,
    });
    const program = startTrip({
      driverId: 'driver-1',
      routeId: 'route-1',
      tenantId: 'company-1',
      type: 'OUTBOUND',
      relatedTripId: 'trip-0',
    });
    await runWith(program, repo);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OUTBOUND', relatedTripId: undefined }),
    );
  });
});
