import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { StudentNotFoundError } from '../errors/auth.errors.js';

export const getStudent = (input: { id: string; companyId: string }) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository;

    const user = yield* userRepo.findByIdAndCompanyAndRole(
      input.id,
      input.companyId,
      'STUDENT',
    );

    if (!user) {
      return yield* Effect.fail(StudentNotFoundError.create(input.id));
    }

    return noEvents(user);
  });
