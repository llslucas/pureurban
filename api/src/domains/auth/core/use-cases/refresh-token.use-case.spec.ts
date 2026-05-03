import { describe, it, expect, vi } from 'vitest'
import { Effect, Layer } from 'effect'
import { refreshToken } from './refresh-token.use-case.js'
import { UserRepository } from '../ports/user-repository.port.js'
import { TokenService } from '../ports/token-service.port.js'
import { InvalidRefreshTokenError } from '../errors/auth.errors.js'
import type { UserData } from '../ports/user-repository.port.js'

const mockUser: UserData = {
  id: 'user-1',
  email: 'motorista@empresa.com',
  password: 'hashed_password',
  name: 'João Motorista',
  role: 'DRIVER',
  companyId: 'company-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const mockPayload = {
  userId: 'user-1',
  companyId: 'company-1',
  role: 'DRIVER',
}

function makeLayer(userRepo: Partial<UserRepository>, tokenSvc: Partial<TokenService>) {
  return Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo as UserRepository),
    Layer.succeed(TokenService, tokenSvc as TokenService),
  )
}

describe('refreshToken', () => {
  it('deve renovar tokens com sucesso quando refresh token é válido', async () => {
    const tokenSvc: Partial<TokenService> = {
      verifyToken: vi.fn().mockReturnValue(Effect.succeed(mockPayload)),
      generateTokens: vi.fn().mockReturnValue(
        Effect.succeed({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      ),
    }
    const userRepo: Partial<UserRepository> = {
      findById: vi.fn().mockReturnValue(Effect.succeed(mockUser)),
    }

    const layer = makeLayer(userRepo, tokenSvc)
    const [result] = await Effect.runPromise(
      refreshToken({ refreshToken: 'valid-refresh-token' }).pipe(Effect.provide(layer)),
    )

    expect(result.user).toMatchObject({ id: 'user-1' })
    expect(result.tokens.accessToken).toBe('new-access')
    expect(result.tokens.refreshToken).toBe('new-refresh')
  })

  it('deve falhar com InvalidRefreshTokenError quando refresh token é inválido', async () => {
    const tokenSvc: Partial<TokenService> = {
      verifyToken: vi.fn().mockReturnValue(Effect.fail(InvalidRefreshTokenError.create())),
    }
    const layer = makeLayer({}, tokenSvc)
    const program = refreshToken({ refreshToken: 'invalid-token' })

    const result = await Effect.runPromise(Effect.either(program.pipe(Effect.provide(layer))))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(InvalidRefreshTokenError)
      expect((result.left as InvalidRefreshTokenError).code).toBe('INVALID_REFRESH_TOKEN')
      expect((result.left as InvalidRefreshTokenError).httpStatus).toBe(401)
    }
  })

  it('deve falhar com InvalidRefreshTokenError quando usuário não existe mais', async () => {
    const tokenSvc: Partial<TokenService> = {
      verifyToken: vi.fn().mockReturnValue(Effect.succeed(mockPayload)),
      generateTokens: vi.fn(),
    }
    const userRepo: Partial<UserRepository> = {
      findById: vi.fn().mockReturnValue(Effect.succeed(null)),
    }

    const layer = makeLayer(userRepo, tokenSvc)
    const program = refreshToken({ refreshToken: 'valid-but-user-deleted' })

    const result = await Effect.runPromise(Effect.either(program.pipe(Effect.provide(layer))))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(InvalidRefreshTokenError)
    }
  })
})
