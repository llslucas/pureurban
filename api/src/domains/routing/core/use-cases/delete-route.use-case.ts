import { Effect } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import { RouteNotFoundError } from '../errors/routing.errors.js';
import type { WithEvents } from '../../../shared/core/events/index.js';

export const deleteRoute = (input: {
  id: string;
  companyId: string;
}): Effect.Effect<WithEvents<void>, RouteNotFoundError, RouteRepository> =>
  Effect.gen(function* () {
    const repo = yield* RouteRepository;

    // Hard delete — sem soft delete por design (ver Dev Notes)
    yield* repo.remove(input.id, input.companyId);

    return withEvents(undefined as void, [
      {
        type: 'routing.route_deleted',
        data: { routeId: input.id, companyId: input.companyId },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
