import { Effect } from 'effect';
import {
  withEvents,
  noEvents,
} from '../../../shared/core/events/with-events.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import { RouteNotFoundError } from '../errors/routing.errors.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { RouteData } from '../ports/route-repository.port.js';
import type { UpdateRouteInput } from '../schemas/update-route.schema.js';

export const updateRoute = (input: {
  id: string;
  companyId: string;
  data: UpdateRouteInput;
}): Effect.Effect<WithEvents<RouteData>, RouteNotFoundError, RouteRepository> =>
  Effect.gen(function* () {
    const repo = yield* RouteRepository;

    // Verificar existência da rota antes de tentar update (multi-tenancy)
    const existing = yield* repo.findByIdAndCompany(input.id, input.companyId);
    if (!existing) {
      return yield* Effect.fail(RouteNotFoundError.create(input.id));
    }

    // Filtrar apenas campos definidos para atualização efetiva
    const dataToUpdate: Partial<
      Omit<RouteData, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>
    > = {};

    if (input.data.name !== undefined) dataToUpdate.name = input.data.name;
    if (input.data.description !== undefined)
      dataToUpdate.description = input.data.description;
    if (input.data.originCity !== undefined)
      dataToUpdate.originCity = input.data.originCity;
    if (input.data.destinationCity !== undefined)
      dataToUpdate.destinationCity = input.data.destinationCity;

    // Remover campos cujo valor é idêntico ao existente (true no-op)
    for (const key of Object.keys(dataToUpdate) as Array<
      keyof typeof dataToUpdate
    >) {
      if (dataToUpdate[key] === existing[key]) {
        delete dataToUpdate[key];
      }
    }

    // No-op: nenhum campo efetivo com valor diferente — não emite evento
    if (Object.keys(dataToUpdate).length === 0) {
      return noEvents(existing);
    }

    const updated = yield* repo.update(input.id, input.companyId, dataToUpdate);

    return withEvents(updated, [
      {
        type: 'routing.route_updated',
        data: { routeId: updated.id, companyId: input.companyId },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
