import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { assignDriver } from './assign-driver.use-case.js';
import {
  RouteAssignmentRepository,
  RouteAssignmentRepositoryApi,
} from '../ports/route-assignment-repository.port.js';
import {
  RouteNotFoundError,
  UserNotFoundError,
  AssignmentAlreadyExistsError,
} from '../errors/routing.errors.js';

const mockAssignment = {
  id: 'assign-2',
  routeId: 'route-1',
  driverId: 'driver-1',
  createdAt: new Date('2026-01-01'),
};

function makeLayer(repo: Partial<RouteAssignmentRepositoryApi>) {
  return Layer.succeed(
    RouteAssignmentRepository,
    repo as RouteAssignmentRepositoryApi,
  );
}

describe('assignDriver', () => {
  it('deve vincular motorista com sucesso e emitir routing.driver_assigned', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      assignDriver: vi.fn().mockReturnValue(Effect.succeed(mockAssignment)),
    };

    const [result, events] = await Effect.runPromise(
      assignDriver({
        routeId: 'route-1',
        driverId: 'driver-1',
        companyId: 'company-1',
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(repo.assignDriver).toHaveBeenCalledWith(
      'route-1',
      'driver-1',
      'company-1',
    );
    expect(result.id).toBe('assign-2');
    expect(result.routeId).toBe('route-1');
    expect(result.driverId).toBe('driver-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('routing.driver_assigned');
    expect((events[0].data as { routeId: string }).routeId).toBe('route-1');
  });

  it('deve falhar com RouteNotFoundError quando rota não existe', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      assignDriver: vi
        .fn()
        .mockReturnValue(Effect.fail(RouteNotFoundError.create('route-99'))),
    };

    const result = await Effect.runPromise(
      Effect.either(
        assignDriver({
          routeId: 'route-99',
          driverId: 'driver-1',
          companyId: 'company-1',
        }).pipe(Effect.provide(makeLayer(repo))),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(RouteNotFoundError);
      expect(result.left.code).toBe('ROUTE_NOT_FOUND');
    }
  });

  it('deve falhar com UserNotFoundError quando motorista não existe ou é de outra empresa', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      assignDriver: vi
        .fn()
        .mockReturnValue(Effect.fail(UserNotFoundError.create('driver-99'))),
    };

    const result = await Effect.runPromise(
      Effect.either(
        assignDriver({
          routeId: 'route-1',
          driverId: 'driver-99',
          companyId: 'company-1',
        }).pipe(Effect.provide(makeLayer(repo))),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(UserNotFoundError);
      expect(result.left.code).toBe('USER_NOT_FOUND');
    }
  });

  it('deve falhar com AssignmentAlreadyExistsError em duplicata', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      assignDriver: vi
        .fn()
        .mockReturnValue(Effect.fail(AssignmentAlreadyExistsError.create())),
    };

    const result = await Effect.runPromise(
      Effect.either(
        assignDriver({
          routeId: 'route-1',
          driverId: 'driver-1',
          companyId: 'company-1',
        }).pipe(Effect.provide(makeLayer(repo))),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(AssignmentAlreadyExistsError);
      expect(result.left.code).toBe('ASSIGNMENT_ALREADY_EXISTS');
      expect(result.left.httpStatus).toBe(409);
    }
  });
});
