import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { createRoute } from './create-route.use-case.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import type { RouteData } from '../ports/route-repository.port.js';

const mockRoute: RouteData = {
  id: 'route-1',
  name: 'Rota Universitária Norte',
  description: 'Saída às 17h',
  originCity: 'Viçosa',
  destinationCity: 'Belo Horizonte',
  companyId: 'company-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makeLayer(repo: Partial<RouteRepository>) {
  return Layer.succeed(RouteRepository, repo as RouteRepository);
}

describe('createRoute', () => {
  it('deve criar rota com sucesso e emitir evento routing.route_created', async () => {
    const repo: Partial<RouteRepository> = {
      create: vi.fn().mockReturnValue(Effect.succeed(mockRoute)),
    };

    const [result, events] = await Effect.runPromise(
      createRoute(
        {
          name: 'Rota Universitária Norte',
          description: 'Saída às 17h',
          originCity: 'Viçosa',
          destinationCity: 'Belo Horizonte',
        },
        'company-1',
      ).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(repo.create).toHaveBeenCalledWith({
      name: 'Rota Universitária Norte',
      description: 'Saída às 17h',
      originCity: 'Viçosa',
      destinationCity: 'Belo Horizonte',
      companyId: 'company-1',
    });
    expect(result.id).toBe('route-1');
    expect(result.companyId).toBe('company-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('routing.route_created');
    expect((events[0].data as { routeId: string }).routeId).toBe('route-1');
    expect((events[0].data as { companyId: string }).companyId).toBe(
      'company-1',
    );
  });

  it('deve criar rota sem description (campo opcional)', async () => {
    const routeWithoutDesc = { ...mockRoute, description: null };
    const repo: Partial<RouteRepository> = {
      create: vi.fn().mockReturnValue(Effect.succeed(routeWithoutDesc)),
    };

    const [result, events] = await Effect.runPromise(
      createRoute(
        {
          name: 'Rota Norte',
          originCity: 'Viçosa',
          destinationCity: 'BH',
        },
        'company-1',
      ).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(result.description).toBeNull();
    expect(events[0].type).toBe('routing.route_created');
  });
});
