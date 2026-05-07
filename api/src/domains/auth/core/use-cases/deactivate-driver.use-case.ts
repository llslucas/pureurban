import { Effect, Clock } from 'effect';
import {
  withEvents,
  noEvents,
} from '../../../shared/core/events/with-events.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { DriverNotFoundError } from '../errors/auth.errors.js';

export const deactivateDriver = (input: { id: string; companyId: string }) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository;

    const driver = yield* userRepo.findByIdAndCompanyAndRole(
      input.id,
      input.companyId,
      'DRIVER',
    );
    if (!driver) {
      return yield* Effect.fail(DriverNotFoundError.create(input.id));
    }

    if (!driver.isActive) {
      // Idempotente — não emite evento, retorna o estado atual
      return noEvents(driver);
    }

    const updated = yield* userRepo.updatePartial(input.id, input.companyId, {
      isActive: false,
    });

    const occurredAt = new Date(yield* Clock.currentTimeMillis).toISOString();

    return withEvents(updated, [
      {
        type: 'auth.driver_deactivated',
        data: { driverId: updated.id, companyId: input.companyId },
        occurredAt,
      },
    ]);
  });
