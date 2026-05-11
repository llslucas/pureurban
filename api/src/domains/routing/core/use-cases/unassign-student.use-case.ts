import { Effect } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { RouteAssignmentRepository } from '../ports/route-assignment-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { AssignmentNotFoundError } from '../errors/routing.errors.js';

export const unassignStudent = (input: {
  routeId: string;
  studentId: string;
  companyId: string;
}): Effect.Effect<
  WithEvents<void>,
  AssignmentNotFoundError,
  RouteAssignmentRepository
> =>
  Effect.gen(function* () {
    const repo = yield* RouteAssignmentRepository;

    yield* repo.unassignStudent(
      input.routeId,
      input.studentId,
      input.companyId,
    );

    return withEvents(undefined as void, [
      {
        type: 'routing.student_unassigned',
        data: {
          routeId: input.routeId,
          studentId: input.studentId,
          companyId: input.companyId,
        },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
