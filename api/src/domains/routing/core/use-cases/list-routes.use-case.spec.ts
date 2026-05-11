import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { listRoutes } from './list-routes.use-case.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import type {
  RouteData,
  RouteRepositoryApi,
} from '../ports/route-repository.port.js';

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

const mockRouteOtherCompany: RouteData = {
  ...mockRoute,
  id: 'route-2',
  companyId: 'company-2',
};

function makeLayer(repo: Partial<RouteRepositoryApi>) {
  return Layer.succeed(RouteRepository, repo as RouteRepositoryApi);
}

describe('listRoutes', () => {
  it('deve retornar lista de rotas da empresa sem emitir eventos', async () => {
    const repo: Partial<RouteRepositoryApi> = {
      findAllByCompany: vi.fn().mockReturnValue(Effect.succeed([mockRoute])),
    };

    const [routes, events] = await Effect.runPromise(
      listRoutes({ companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(repo)),
      ),
    );

    expect(repo.findAllByCompany).toHaveBeenCalledWith('company-1');
    expect(routes).toHaveLength(1);
    expect(routes[0].id).toBe('route-1');
    expect(events).toHaveLength(0);
  });

  it('deve retornar lista vazia quando empresa não tem rotas', async () => {
    const repo: Partial<RouteRepositoryApi> = {
      findAllByCompany: vi.fn().mockReturnValue(Effect.succeed([])),
    };

    const [routes] = await Effect.runPromise(
      listRoutes({ companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(repo)),
      ),
    );

    expect(routes).toHaveLength(0);
  });

  it('NÃO deve retornar rotas de outra empresa (filtro por companyId)', async () => {
    // Simula que o adapter filtra corretamente por companyId
    const repo: Partial<RouteRepositoryApi> = {
      findAllByCompany: vi
        .fn()
        .mockImplementation((companyId: string) =>
          Effect.succeed(
            companyId === 'company-1' ? [mockRoute] : [mockRouteOtherCompany],
          ),
        ),
    };

    const [routesCompany1] = await Effect.runPromise(
      listRoutes({ companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(repo)),
      ),
    );
    const [routesCompany2] = await Effect.runPromise(
      listRoutes({ companyId: 'company-2' }).pipe(
        Effect.provide(makeLayer(repo)),
      ),
    );

    expect(routesCompany1.every((r) => r.companyId === 'company-1')).toBe(true);
    expect(routesCompany2.every((r) => r.companyId === 'company-2')).toBe(true);
  });
});
