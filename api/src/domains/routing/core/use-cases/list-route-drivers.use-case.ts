import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { RouteAssignmentRepository } from '../ports/route-assignment-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { DriverAssignmentData } from '../ports/route-assignment-repository.port.js';

export const listRouteDrivers = (input: {
  routeId: string;
  companyId: string;
}): Effect.Effect<
  WithEvents<DriverAssignmentData[]>,
  never,
  RouteAssignmentRepository
> =>
  Effect.gen(function* () {
    const repo = yield* RouteAssignmentRepository;
    const drivers = yield* repo.findDriversByRoute(
      input.routeId,
      input.companyId,
    );
    return noEvents(drivers);
  });
