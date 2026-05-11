import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { RouteAssignmentRepository } from '../ports/route-assignment-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { StudentAssignmentData } from '../ports/route-assignment-repository.port.js';

export const listRouteStudents = (input: {
  routeId: string;
  companyId: string;
}): Effect.Effect<
  WithEvents<StudentAssignmentData[]>,
  never,
  RouteAssignmentRepository
> =>
  Effect.gen(function* () {
    const repo = yield* RouteAssignmentRepository;
    const students = yield* repo.findStudentsByRoute(
      input.routeId,
      input.companyId,
    );
    return noEvents(students);
  });
