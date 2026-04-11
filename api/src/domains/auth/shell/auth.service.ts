import { Injectable, Inject } from '@nestjs/common'
import type { ManagedRuntime } from 'effect'
import { Layer, Effect } from 'effect'
import { EFFECT_RUNTIME } from '../../shared/shell/effect-runtime/effect-runtime.module.js'
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js'
import { registerCompany } from '../core/use-cases/register-company.use-case.js'
import { UserRepository } from '../core/ports/user-repository.port.js'
import { PasswordHasher } from '../core/ports/password-hasher.port.js'
import { TokenService } from '../core/ports/token-service.port.js'
import type { RegisterInput } from '../core/schemas/register.schema.js'
import { PrismaUserAdapter } from './adapters/prisma-user.adapter.js'
import { BcryptPasswordHasherAdapter } from './adapters/bcrypt-password-hasher.adapter.js'
import { JwtTokenAdapter } from './adapters/jwt-token.adapter.js'

@Injectable()
export class AuthService {
  constructor(
    @Inject(EFFECT_RUNTIME) private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
    private readonly eventDispatcher: EffectEventDispatcher,
    private readonly userAdapter: PrismaUserAdapter,
    private readonly passwordHasherAdapter: BcryptPasswordHasherAdapter,
    private readonly tokenAdapter: JwtTokenAdapter,
  ) {}

  async register(input: RegisterInput) {
    const authLayer = Layer.mergeAll(
      Layer.succeed(UserRepository, this.userAdapter),
      Layer.succeed(PasswordHasher, this.passwordHasherAdapter),
      Layer.succeed(TokenService, this.tokenAdapter),
    )

    const program = registerCompany(input).pipe(Effect.provide(authLayer))

    const result = await this.eventDispatcher.runAndDispatch(this.runtime, program)

    return {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
      company: {
        id: result.user.companyId,
        name: input.name,
      },
    }
  }
}
