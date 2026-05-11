import { Effect } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { RouteAssignmentRepository } from '../ports/route-assignment-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type {
  RouteNotFoundError,
  UserNotFoundError,
  AssignmentAlreadyExistsError,
} from '../errors/routing.errors.js';

export const assignDriver = (input: {
  routeId: string;
  driverId: string;
  companyId: string;
}): Effect.Effect<
  WithEvents<{
    id: string;
    routeId: string;
    driverId: string;
    createdAt: Date;
  }>,
  RouteNotFoundError | UserNotFoundError | AssignmentAlreadyExistsError,
  RouteAssignmentRepository
> =>
  Effect.gen(function* () {
    const repo = yield* RouteAssignmentRepository;

    const assignment = yield* repo.assignDriver(
      input.routeId,
      input.driverId,
      input.companyId,
    );

    return withEvents(assignment, [
      {
        type: 'routing.driver_assigned',
        data: {
          routeId: input.routeId,
          driverId: input.driverId,
          companyId: input.companyId,
        },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
