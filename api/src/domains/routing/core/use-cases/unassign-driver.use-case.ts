import { Effect } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { RouteAssignmentRepository } from '../ports/route-assignment-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { AssignmentNotFoundError } from '../errors/routing.errors.js';

export const unassignDriver = (input: {
  routeId: string;
  driverId: string;
  companyId: string;
}): Effect.Effect<
  WithEvents<void>,
  AssignmentNotFoundError,
  RouteAssignmentRepository
> =>
  Effect.gen(function* () {
    const repo = yield* RouteAssignmentRepository;

    yield* repo.unassignDriver(input.routeId, input.driverId, input.companyId);

    return withEvents(undefined as void, [
      {
        type: 'routing.driver_unassigned',
        data: {
          routeId: input.routeId,
          driverId: input.driverId,
          companyId: input.companyId,
        },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
