import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { UserRepository } from '../ports/user-repository.port.js';

export const listDrivers = (input: { companyId: string; isActive?: boolean }) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository;

    const users = yield* userRepo.findManyByCompanyAndRole(
      input.companyId,
      'DRIVER',
      input.isActive !== undefined ? { isActive: input.isActive } : undefined,
    );

    return noEvents(users);
  });
