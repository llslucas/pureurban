import { Effect } from 'effect'
import { noEvents } from '../../../shared/core/events/with-events.js'
import { UserRepository } from '../ports/user-repository.port.js'
import { DriverNotFoundError } from '../errors/auth.errors.js'

export const getDriver = (input: { id: string; companyId: string }) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository

    const user = yield* userRepo.findByIdAndCompanyAndRole(input.id, input.companyId, 'DRIVER')
    
    if (!user) {
      return yield* Effect.fail(DriverNotFoundError.create(input.id))
    }

    return noEvents(user)
  })
