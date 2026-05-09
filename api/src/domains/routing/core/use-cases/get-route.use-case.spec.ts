import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { getRoute } from './get-route.use-case.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import { RouteNotFoundError } from '../errors/routing.errors.js';
import type { RouteData } from '../ports/route-repository.port.js';

const mockRoute: RouteData = {
  id: 'route-1',
  name: 'Rota Norte',
  description: null,
  originCity: 'Viçosa',
  destinationCity: 'BH',
  companyId: 'company-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makeLayer(repo: Partial<RouteRepository>) {
  return Layer.succeed(RouteRepository, repo as RouteRepository);
}

describe('getRoute', () => {
  it('deve retornar rota existente sem emitir eventos', async () => {
    const repo: Partial<RouteRepository> = {
      findByIdAndCompany: vi.fn().mockReturnValue(Effect.succeed(mockRoute)),
    };

    const [result, events] = await Effect.runPromise(
      getRoute({ id: 'route-1', companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(repo)),
      ),
    );

    expect(repo.findByIdAndCompany).toHaveBeenCalledWith(
      'route-1',
      'company-1',
    );
    expect(result.id).toBe('route-1');
    expect(events).toHaveLength(0);
  });

  it('deve falhar com RouteNotFoundError quando rota não existe', async () => {
    const repo: Partial<RouteRepository> = {
      findByIdAndCompany: vi.fn().mockReturnValue(Effect.succeed(null)),
    };

    const result = await Effect.runPromise(
      Effect.either(
        getRoute({ id: 'inexistente', companyId: 'company-1' }).pipe(
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

  it('deve falhar com RouteNotFoundError para rota de outra empresa (isolamento cross-tenant)', async () => {
    // Simula que o adapter retorna null para rota de companyId diferente
    const repo: Partial<RouteRepository> = {
      findByIdAndCompany: vi
        .fn()
        .mockImplementation((_id: string, companyId: string) =>
          Effect.succeed(companyId === 'company-1' ? mockRoute : null),
        ),
    };

    const result = await Effect.runPromise(
      Effect.either(
        getRoute({ id: 'route-1', companyId: 'company-2' }).pipe(
          Effect.provide(makeLayer(repo)),
        ),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(RouteNotFoundError);
    }
  });
});
