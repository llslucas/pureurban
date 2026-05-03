import { describe, it, expect, vi } from 'vitest'
import { Effect, Layer } from 'effect'
import { login } from './login.use-case.js'
import { UserRepository } from '../ports/user-repository.port.js'
import { PasswordHasher } from '../ports/password-hasher.port.js'
import { TokenService } from '../ports/token-service.port.js'
import { InvalidCredentialsError } from '../errors/auth.errors.js'
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

function makeLayer(
  userRepo: Partial<UserRepository>,
  hasher: Partial<PasswordHasher>,
  tokenSvc: Partial<TokenService>,
) {
  return Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo as UserRepository),
    Layer.succeed(PasswordHasher, hasher as PasswordHasher),
    Layer.succeed(TokenService, tokenSvc as TokenService),
  )
}

describe('login', () => {
  it('deve realizar login com sucesso, retornando user, tokens e evento', async () => {
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(mockUser)),
    }
    const hasher: Partial<PasswordHasher> = {
      compare: vi.fn().mockReturnValue(Effect.succeed(true)),
    }
    const tokenSvc: Partial<TokenService> = {
      generateTokens: vi.fn().mockReturnValue(
        Effect.succeed({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
      ),
    }

    const layer = makeLayer(userRepo, hasher, tokenSvc)
    const [result, events] = await Effect.runPromise(
      login({ email: 'motorista@empresa.com', password: 'senha123' }).pipe(Effect.provide(layer)),
    )

    expect(result.user).toMatchObject({ id: 'user-1', role: 'DRIVER' })
    expect(result.tokens.accessToken).toBe('access-token')
    expect(result.tokens.refreshToken).toBe('refresh-token')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('auth.user_logged_in')
    expect((events[0].data as { userId: string }).userId).toBe('user-1')
  })

  it('deve falhar com InvalidCredentialsError quando email não existe', async () => {
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(null)),
    }
    // Hasher mock needs compare for the dummy-hash timing normalization path
    const hasher: Partial<PasswordHasher> = {
      compare: vi.fn().mockReturnValue(Effect.succeed(false)),
    }
    const layer = makeLayer(userRepo, hasher, {})
    const program = login({ email: 'inexistente@empresa.com', password: 'senha123' })

    const result = await Effect.runPromise(Effect.either(program.pipe(Effect.provide(layer))))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(InvalidCredentialsError)
      expect((result.left as InvalidCredentialsError).code).toBe('INVALID_CREDENTIALS')
      expect((result.left as InvalidCredentialsError).httpStatus).toBe(401)
    }
  })

  it('deve falhar com InvalidCredentialsError quando senha está errada', async () => {
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(mockUser)),
    }
    const hasher: Partial<PasswordHasher> = {
      compare: vi.fn().mockReturnValue(Effect.succeed(false)),
    }
    const layer = makeLayer(userRepo, hasher, {})
    const program = login({ email: 'motorista@empresa.com', password: 'senha_errada' })

    const result = await Effect.runPromise(Effect.either(program.pipe(Effect.provide(layer))))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(InvalidCredentialsError)
      expect((result.left as InvalidCredentialsError).code).toBe('INVALID_CREDENTIALS')
    }
  })

  it('deve usar a mesma mensagem de erro para email inexistente e senha errada (anti-enumeração)', async () => {
    // Email inexistente — hasher mock needed for dummy-hash timing normalization
    const repoNoUser: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(null)),
    }
    const hasherForNoUser: Partial<PasswordHasher> = {
      compare: vi.fn().mockReturnValue(Effect.succeed(false)),
    }
    const resultNoUser = await Effect.runPromise(
      Effect.either(login({ email: 'nao@existe.com', password: 'abc' }).pipe(Effect.provide(makeLayer(repoNoUser, hasherForNoUser, {})))),
    )

    // Senha errada
    const repoWrongPw: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(mockUser)),
    }
    const hasherWrong: Partial<PasswordHasher> = {
      compare: vi.fn().mockReturnValue(Effect.succeed(false)),
    }
    const resultWrongPw = await Effect.runPromise(
      Effect.either(login({ email: 'motorista@empresa.com', password: 'errada' }).pipe(Effect.provide(makeLayer(repoWrongPw, hasherWrong, {})))),
    )

    // Ambos devem retornar o mesmo código e mensagem de erro
    expect(resultNoUser._tag).toBe('Left')
    expect(resultWrongPw._tag).toBe('Left')
    if (resultNoUser._tag === 'Left' && resultWrongPw._tag === 'Left') {
      expect((resultNoUser.left as InvalidCredentialsError).code).toBe(
        (resultWrongPw.left as InvalidCredentialsError).code,
      )
      expect((resultNoUser.left as InvalidCredentialsError).message).toBe(
        (resultWrongPw.left as InvalidCredentialsError).message,
      )
    }
  })
})
