import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { RouteRepository } from '../ports/route-repository.port.js';
import { RouteNotFoundError } from '../errors/routing.errors.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { RouteData } from '../ports/route-repository.port.js';

export const getRoute = (input: {
  id: string;
  companyId: string;
}): Effect.Effect<WithEvents<RouteData>, RouteNotFoundError, RouteRepository> =>
  Effect.gen(function* () {
    const repo = yield* RouteRepository;
    const route = yield* repo.findByIdAndCompany(input.id, input.companyId);
    if (!route) {
      return yield* Effect.fail(RouteNotFoundError.create(input.id));
    }
    return noEvents(route);
  });
