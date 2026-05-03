import { Effect, Clock } from 'effect'
import { withEvents, noEvents } from '../../../shared/core/events/with-events.js'
import { UserRepository } from '../ports/user-repository.port.js'
import { PasswordHasher } from '../ports/password-hasher.port.js'
import { EmailAlreadyExistsError, DriverNotFoundError } from '../errors/auth.errors.js'
import type { UpdateDriverInput } from '../schemas/update-driver.schema.js'

export const updateDriver = (input: { id: string; companyId: string; data: UpdateDriverInput }) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const hasher = yield* PasswordHasher

    const driver = yield* userRepo.findByIdAndCompanyAndRole(input.id, input.companyId, 'DRIVER')
    if (!driver) {
      return yield* Effect.fail(DriverNotFoundError.create(input.id))
    }

    const dataToUpdate: Partial<{ email: string; password: string; name: string; isActive: boolean }> = {}

    if (input.data.email !== undefined) {
      const normalizedEmail = input.data.email.toLowerCase().trim()
      if (normalizedEmail !== driver.email) {
        const existing = yield* userRepo.findByEmail(normalizedEmail)
        if (existing && existing.id !== input.id) {
          return yield* Effect.fail(EmailAlreadyExistsError.create(normalizedEmail))
        }
      }
      dataToUpdate.email = normalizedEmail
    }

    if (input.data.name !== undefined) {
      dataToUpdate.name = input.data.name
    }

    if (input.data.password !== undefined) {
      dataToUpdate.password = yield* hasher.hash(input.data.password)
    }

    if (input.data.isActive !== undefined) {
      dataToUpdate.isActive = input.data.isActive
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return noEvents(driver)
    }

    const updated = yield* userRepo.updatePartial(input.id, input.companyId, dataToUpdate)

    const occurredAt = new Date(yield* Clock.currentTimeMillis).toISOString()

    return withEvents(updated, [
      {
        type: 'auth.driver_updated',
        data: { driverId: updated.id, companyId: input.companyId },
        occurredAt,
      },
    ])
  })
