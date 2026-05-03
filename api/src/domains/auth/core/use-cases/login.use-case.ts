import { Clock, Effect } from 'effect'
import { withEvents } from '../../../shared/core/events/with-events.js'
import { UserRepository } from '../ports/user-repository.port.js'
import { PasswordHasher } from '../ports/password-hasher.port.js'
import { TokenService } from '../ports/token-service.port.js'
import { InvalidCredentialsError } from '../errors/auth.errors.js'
import type { LoginInput } from '../schemas/login.schema.js'

export const login = (input: LoginInput) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const hasher = yield* PasswordHasher
    const tokenSvc = yield* TokenService

    // Normalize email to lowercase to avoid case-sensitivity issues
    const normalizedEmail = input.email.toLowerCase().trim()

    // Reject whitespace-only passwords early
    if (!input.password.trim()) {
      // Still run dummy hash to normalize timing — prevents email enumeration via timing
      yield* hasher.compare('dummy', '$2b$12$invalidhashfortimingattackprevention')
      return yield* Effect.fail(InvalidCredentialsError.create())
    }

    // 1. Buscar usuário pelo email
    const user = yield* userRepo.findByEmail(normalizedEmail)
    if (!user) {
      // Compute dummy hash to normalize response time — prevents timing attack / email enumeration
      yield* hasher.compare(input.password, '$2b$12$invalidhashfortimingattackpreventionfill')
      return yield* Effect.fail(InvalidCredentialsError.create())
    }

    // 2. Comparar senha — mesma mensagem de erro para impedir enumeração
    const passwordValid = yield* hasher.compare(input.password, user.password)
    if (!passwordValid) {
      return yield* Effect.fail(InvalidCredentialsError.create())
    }

    // 3. Gerar tokens JWT
    const tokens = yield* tokenSvc.generateTokens({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    })

    // Use Effect Clock for pure functional timestamp (deterministic in tests)
    const occurredAt = new Date(yield* Clock.currentTimeMillis).toISOString()

    return withEvents(
      { user, tokens },
      [{ type: 'auth.user_logged_in', data: { userId: user.id }, occurredAt }],
    )
  })

