import { Effect } from 'effect'
import { noEvents } from '../../../shared/core/events/with-events.js'
import { UserRepository } from '../ports/user-repository.port.js'
import { TokenService } from '../ports/token-service.port.js'
import { InvalidRefreshTokenError } from '../errors/auth.errors.js'

export const refreshToken = (input: { refreshToken: string }) =>
  Effect.gen(function* () {
    const tokenSvc = yield* TokenService
    const userRepo = yield* UserRepository

    // 1. Verificar e decodificar o refresh token — erro se inválido ou expirado
    const payload = yield* tokenSvc.verifyToken(input.refreshToken)

    // 2. Verificar que o user ainda existe no banco
    const user = yield* userRepo.findById(payload.userId)
    if (!user || !user.isActive) {
      return yield* Effect.fail(InvalidRefreshTokenError.create())
    }

    // 3. Gerar novos tokens
    const tokens = yield* tokenSvc.generateTokens({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    })

    return noEvents({ user, tokens })
  })
