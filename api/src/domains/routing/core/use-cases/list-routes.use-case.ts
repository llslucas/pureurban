import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { RouteData } from '../ports/route-repository.port.js';

export const listRoutes = (input: {
  companyId: string;
}): Effect.Effect<WithEvents<RouteData[]>, never, RouteRepository> =>
  Effect.gen(function* () {
    const repo = yield* RouteRepository;
    const routes = yield* repo.findAllByCompany(input.companyId);
    return noEvents(routes);
  });
