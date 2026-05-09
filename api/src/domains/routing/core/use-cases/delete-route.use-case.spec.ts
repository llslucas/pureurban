import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { deleteRoute } from './delete-route.use-case.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import { RouteNotFoundError } from '../errors/routing.errors.js';

function makeLayer(repo: Partial<RouteRepository>) {
  return Layer.succeed(RouteRepository, repo as RouteRepository);
}

describe('deleteRoute', () => {
  it('deve deletar rota com sucesso e emitir evento routing.route_deleted', async () => {
    const repo: Partial<RouteRepository> = {
      remove: vi.fn().mockReturnValue(Effect.succeed(undefined)),
    };

    const [result, events] = await Effect.runPromise(
      deleteRoute({ id: 'route-1', companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(repo)),
      ),
    );

    expect(repo.remove).toHaveBeenCalledWith('route-1', 'company-1');
    expect(result).toBeUndefined();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('routing.route_deleted');
    expect((events[0].data as { routeId: string }).routeId).toBe('route-1');
    expect((events[0].data as { companyId: string }).companyId).toBe(
      'company-1',
    );
  });

  it('deve falhar com RouteNotFoundError quando rota não existe ou é de outra empresa', async () => {
    const repo: Partial<RouteRepository> = {
      remove: vi
        .fn()
        .mockReturnValue(Effect.fail(RouteNotFoundError.create('route-99'))),
    };

    const result = await Effect.runPromise(
      Effect.either(
        deleteRoute({ id: 'route-99', companyId: 'company-1' }).pipe(
          Effect.provide(makeLayer(repo)),
        ),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(RouteNotFoundError);
      expect(result.left.code).toBe('ROUTE_NOT_FOUND');
      expect(result.left.httpStatus).toBe(404);
    }
  });
});
