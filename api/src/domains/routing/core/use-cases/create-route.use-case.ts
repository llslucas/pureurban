import { Effect } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { RouteData } from '../ports/route-repository.port.js';
import type { CreateRouteInput } from '../schemas/create-route.schema.js';

export const createRoute = (
  input: CreateRouteInput,
  companyId: string,
): Effect.Effect<WithEvents<RouteData>, never, RouteRepository> =>
  Effect.gen(function* () {
    const repo = yield* RouteRepository;

    const route = yield* repo.create({
      name: input.name,
      description: input.description,
      originCity: input.originCity,
      destinationCity: input.destinationCity,
      companyId,
    });

    return withEvents(route, [
      {
        type: 'routing.route_created',
        data: { routeId: route.id, companyId },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
