import { Effect } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { RouteAssignmentRepository } from '../ports/route-assignment-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type {
  RouteNotFoundError,
  UserNotFoundError,
  AssignmentAlreadyExistsError,
} from '../errors/routing.errors.js';

export const assignStudent = (input: {
  routeId: string;
  studentId: string;
  companyId: string;
}): Effect.Effect<
  WithEvents<{
    id: string;
    routeId: string;
    studentId: string;
    createdAt: Date;
  }>,
  RouteNotFoundError | UserNotFoundError | AssignmentAlreadyExistsError,
  RouteAssignmentRepository
> =>
  Effect.gen(function* () {
    const repo = yield* RouteAssignmentRepository;

    const assignment = yield* repo.assignStudent(
      input.routeId,
      input.studentId,
      input.companyId,
    );

    return withEvents(assignment, [
      {
        type: 'routing.student_assigned',
        data: {
          routeId: input.routeId,
          studentId: input.studentId,
          companyId: input.companyId,
        },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
