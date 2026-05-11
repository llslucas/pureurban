import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { getMyRoutes } from './get-my-routes.use-case.js';
import { RouteAssignmentRepository } from '../ports/route-assignment-repository.port.js';
import type {
  RouteAssignedData,
  RouteAssignmentRepositoryApi,
} from '../ports/route-assignment-repository.port.js';

const mockRoute: RouteAssignedData = {
  id: 'route-1',
  name: 'Rota Norte',
  description: 'Saída às 7h',
  originCity: 'Viçosa',
  destinationCity: 'Belo Horizonte',
  companyId: 'company-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makeLayer(repo: Partial<RouteAssignmentRepositoryApi>) {
  return Layer.succeed(
    RouteAssignmentRepository,
    repo as RouteAssignmentRepositoryApi,
  );
}

describe('getMyRoutes', () => {
  it('deve retornar rotas do motorista (DRIVER) sem emitir eventos', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      findRoutesByDriver: vi.fn().mockReturnValue(Effect.succeed([mockRoute])),
      findRoutesByStudent: vi.fn().mockReturnValue(Effect.succeed([])),
    };

    const [routes, events] = await Effect.runPromise(
      getMyRoutes({
        userId: 'driver-1',
        role: 'DRIVER',
        companyId: 'company-1',
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(repo.findRoutesByDriver).toHaveBeenCalledWith(
      'driver-1',
      'company-1',
    );
    expect(repo.findRoutesByStudent).not.toHaveBeenCalled();
    expect(routes).toHaveLength(1);
    expect(routes[0].id).toBe('route-1');
    expect(events).toHaveLength(0); // noEvents
  });

  it('deve retornar rotas do aluno (STUDENT) sem emitir eventos', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      findRoutesByDriver: vi.fn().mockReturnValue(Effect.succeed([])),
      findRoutesByStudent: vi.fn().mockReturnValue(Effect.succeed([mockRoute])),
    };

    const [routes, events] = await Effect.runPromise(
      getMyRoutes({
        userId: 'student-1',
        role: 'STUDENT',
        companyId: 'company-1',
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(repo.findRoutesByStudent).toHaveBeenCalledWith(
      'student-1',
      'company-1',
    );
    expect(repo.findRoutesByDriver).not.toHaveBeenCalled();
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe('Rota Norte');
    expect(events).toHaveLength(0);
  });

  it('deve retornar lista vazia quando usuário não tem rotas atribuídas', async () => {
    const repo: Partial<RouteAssignmentRepositoryApi> = {
      findRoutesByDriver: vi.fn().mockReturnValue(Effect.succeed([])),
      findRoutesByStudent: vi.fn().mockReturnValue(Effect.succeed([])),
    };

    const [routes, events] = await Effect.runPromise(
      getMyRoutes({
        userId: 'driver-1',
        role: 'DRIVER',
        companyId: 'company-1',
      }).pipe(Effect.provide(makeLayer(repo))),
    );

    expect(routes).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
