import { Injectable, Inject } from '@nestjs/common'
import type { ManagedRuntime } from 'effect'
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js'
import { registerCompany } from '../core/use-cases/register-company.use-case.js'
import { login } from '../core/use-cases/login.use-case.js'
import { refreshToken } from '../core/use-cases/refresh-token.use-case.js'
import type { RegisterInput } from '../core/schemas/register.schema.js'
import type { LoginInput } from '../core/schemas/login.schema.js'

export const AUTH_RUNTIME = 'AUTH_RUNTIME'

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_RUNTIME) private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
    private readonly eventDispatcher: EffectEventDispatcher,
  ) {}

  async register(input: RegisterInput) {
    const result = await this.eventDispatcher.runAndDispatch(this.runtime, registerCompany(input))

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

  async login(input: LoginInput) {
    const result = await this.eventDispatcher.runAndDispatch(this.runtime, login(input))

    return {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
    }
  }

  async refresh(refreshTokenValue: string) {
    const result = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      refreshToken({ refreshToken: refreshTokenValue }),
    )

    return {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
    }
  }
}
