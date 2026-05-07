import { Effect, Clock } from 'effect';
import {
  withEvents,
  noEvents,
} from '../../../shared/core/events/with-events.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { StudentNotFoundError } from '../errors/auth.errors.js';

export const deactivateStudent = (input: { id: string; companyId: string }) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository;

    const student = yield* userRepo.findByIdAndCompanyAndRole(
      input.id,
      input.companyId,
      'STUDENT',
    );
    if (!student) {
      return yield* Effect.fail(StudentNotFoundError.create(input.id));
    }

    if (!student.isActive) {
      return noEvents(student);
    }

    const updated = yield* userRepo.updatePartial(input.id, input.companyId, {
      isActive: false,
    });

    const occurredAt = new Date(yield* Clock.currentTimeMillis).toISOString();

    return withEvents(updated, [
      {
        type: 'auth.student_deactivated',
        data: { studentId: updated.id, companyId: input.companyId },
        occurredAt,
      },
    ]);
  });
