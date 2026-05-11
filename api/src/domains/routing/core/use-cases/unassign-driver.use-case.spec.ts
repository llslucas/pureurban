import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { unassignDriver } from './unassign-driver.use-case.js';
import {
  RouteAssignmentRepository,
  RouteAssignmentRepositoryApi,
} from '../ports/route-assignment-repository.port.js';
import { AssignmentNotFoundError } from '../errors/routing.errors.js';

function makeLayer(repo: Partial<RouteAssignmentRepositoryApi>) {
  return Layer.succeed(
    RouteAssignmentRepository,
    repo as RouteAssignmentRepositoryApi,
  );
}

describe('unassignDriver', () => {
  it('deve desvincular motorista com sucesso e emitir routing.driver_unassigned', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      unassignDriver: vi.fn().mockReturnValue(Effect.succeed(undefined)),
    };

    const [result, events] = await Effect.runPromise(
      unassignDriver({
        routeId: 'route-1',
        driverId: 'driver-1',
        companyId: 'company-1',
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(repo.unassignDriver).toHaveBeenCalledWith(
      'route-1',
      'driver-1',
      'company-1',
    );
    expect(result).toBeUndefined();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('routing.driver_unassigned');
    expect((events[0].data as { routeId: string }).routeId).toBe('route-1');
    expect((events[0].data as { driverId: string }).driverId).toBe('driver-1');
  });

  it('deve falhar com AssignmentNotFoundError quando vínculo não existe', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      unassignDriver: vi
        .fn()
        .mockReturnValue(Effect.fail(AssignmentNotFoundError.create())),
    };

    const result = await Effect.runPromise(
      Effect.either(
        unassignDriver({
          routeId: 'route-1',
          driverId: 'driver-99',
          companyId: 'company-1',
        }).pipe(Effect.provide(makeLayer(repo))),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(AssignmentNotFoundError);
      expect(result.left.code).toBe('ASSIGNMENT_NOT_FOUND');
      expect(result.left.httpStatus).toBe(404);
    }
  });
});
