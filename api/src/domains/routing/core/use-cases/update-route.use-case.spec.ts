import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { updateRoute } from './update-route.use-case.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import { RouteNotFoundError } from '../errors/routing.errors.js';
import type { RouteData } from '../ports/route-repository.port.js';
import type { UpdateRouteInput } from '../schemas/update-route.schema.js';

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

describe('updateRoute', () => {
  it('deve atualizar parcialmente — apenas name — e emitir evento', async () => {
    const updatedRoute = { ...mockRoute, name: 'Nova Rota' };
    const repo: Partial<RouteRepository> = {
      findByIdAndCompany: vi.fn().mockReturnValue(Effect.succeed(mockRoute)),
      update: vi.fn().mockReturnValue(Effect.succeed(updatedRoute)),
    };

    const [result, events] = await Effect.runPromise(
      updateRoute({
        id: 'route-1',
        companyId: 'company-1',
        data: { name: 'Nova Rota' },
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(result.name).toBe('Nova Rota');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('routing.route_updated');
    expect((events[0].data as { routeId: string }).routeId).toBe('route-1');
  });

  it('deve falhar com RouteNotFoundError quando rota não existe', async () => {
    const repo: Partial<RouteRepository> = {
      findByIdAndCompany: vi.fn().mockReturnValue(Effect.succeed(null)),
      update: vi.fn(),
    };

    const result = await Effect.runPromise(
      Effect.either(
        updateRoute({
          id: 'inexistente',
          companyId: 'company-1',
          data: { name: 'Novo Nome' },
        }).pipe(Effect.provide(makeLayer(repo))),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(RouteNotFoundError);
    }
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('deve retornar noEvents quando dataToUpdate fica vazio (no-op defensivo)', async () => {
    const repo: Partial<RouteRepository> = {
      findByIdAndCompany: vi.fn().mockReturnValue(Effect.succeed(mockRoute)),
      update: vi.fn(),
    };

    // Bypass schema to test the no-op code path in the use-case directly
    const [result, events] = await Effect.runPromise(
      updateRoute({
        id: 'route-1',
        companyId: 'company-1',
        data: {} as UpdateRouteInput,
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(events).toHaveLength(0);
    expect(repo.update).not.toHaveBeenCalled();
    expect(result.id).toBe('route-1');
  });

  it('deve retornar noEvents quando valores enviados são idênticos aos existentes (true no-op)', async () => {
    const repo: Partial<RouteRepository> = {
      findByIdAndCompany: vi.fn().mockReturnValue(Effect.succeed(mockRoute)),
      update: vi.fn(),
    };

    // Enviar os mesmos valores que já existem — deve ser tratado como no-op
    const [result, events] = await Effect.runPromise(
      updateRoute({
        id: 'route-1',
        companyId: 'company-1',
        data: { name: 'Rota Norte', originCity: 'Viçosa' },
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(events).toHaveLength(0);
    expect(repo.update).not.toHaveBeenCalled();
    expect(result.name).toBe('Rota Norte');
  });

  it('deve atualizar múltiplos campos simultaneamente', async () => {
    const updatedRoute = {
      ...mockRoute,
      originCity: 'Nova Origem',
      destinationCity: 'Novo Destino',
    };
    const repo: Partial<RouteRepository> = {
      findByIdAndCompany: vi.fn().mockReturnValue(Effect.succeed(mockRoute)),
      update: vi.fn().mockReturnValue(Effect.succeed(updatedRoute)),
    };

    const [result, events] = await Effect.runPromise(
      updateRoute({
        id: 'route-1',
        companyId: 'company-1',
        data: { originCity: 'Nova Origem', destinationCity: 'Novo Destino' },
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(result.originCity).toBe('Nova Origem');
    expect(result.destinationCity).toBe('Novo Destino');
    expect(events[0].type).toBe('routing.route_updated');
  });
});
