import { describe, it, expect, vi } from 'vitest'
import { Effect, Layer } from 'effect'
import { registerCompany } from './register-company.use-case.js'
import { UserRepository } from '../ports/user-repository.port.js'
import { PasswordHasher } from '../ports/password-hasher.port.js'
import { TokenService } from '../ports/token-service.port.js'
import { EmailAlreadyExistsError } from '../errors/auth.errors.js'
import type { UserData } from '../ports/user-repository.port.js'

const mockUser: UserData = {
  id: 'user-1',
  email: 'admin@empresa.com',
  password: 'hashed_password',
  name: 'Admin Empresa',
  role: 'ADMIN',
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

describe('registerCompany', () => {
  it('deve registrar empresa e admin com sucesso, retornando user, tokens e evento', async () => {
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(null)),
      create: vi.fn().mockReturnValue(Effect.succeed(mockUser)),
    }
    const hasher: Partial<PasswordHasher> = {
      hash: vi.fn().mockReturnValue(Effect.succeed('hashed_password')),
    }
    const tokenSvc: Partial<TokenService> = {
      generateTokens: vi.fn().mockReturnValue(
        Effect.succeed({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
      ),
    }

    const layer = makeLayer(userRepo, hasher, tokenSvc)
    const program = registerCompany({ name: 'Empresa', email: 'admin@empresa.com', password: 'senha123' })
    const [result, events] = await Effect.runPromise(program.pipe(Effect.provide(layer)))

    expect(result.user).toMatchObject({ id: 'user-1', role: 'ADMIN' })
    expect(result.tokens.accessToken).toBe('access-token')
    expect(result.tokens.refreshToken).toBe('refresh-token')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('auth.company_registered')
  })

  it('deve falhar com EmailAlreadyExistsError quando email já existe', async () => {
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(mockUser)),
    }
    const layer = makeLayer(userRepo, {}, {})
    const program = registerCompany({ name: 'Empresa', email: 'admin@empresa.com', password: 'senha123' })

    const result = await Effect.runPromise(Effect.either(program.pipe(Effect.provide(layer))))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(EmailAlreadyExistsError)
      expect((result.left as EmailAlreadyExistsError).code).toBe('EMAIL_ALREADY_EXISTS')
      expect((result.left as EmailAlreadyExistsError).httpStatus).toBe(409)
    }
  })

  it('deve garantir que a senha é hasheada (nunca plaintext)', async () => {
    const hashSpy = vi.fn().mockReturnValue(Effect.succeed('hashed!'))
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(null)),
      create: vi.fn().mockImplementation((data) => {
        expect(data.password).toBe('hashed!')
        expect(data.password).not.toBe('senha123')
        return Effect.succeed(mockUser)
      }),
    }
    const layer = makeLayer(userRepo, { hash: hashSpy }, {
      generateTokens: vi.fn().mockReturnValue(Effect.succeed({ accessToken: 'a', refreshToken: 'r' })),
    })
    await Effect.runPromise(
      registerCompany({ name: 'E', email: 'a@e.com', password: 'senha123' }).pipe(Effect.provide(layer)),
    )
  })

  it('deve incluir userId, companyId, role no payload do token', async () => {
    const generateTokensSpy = vi.fn().mockImplementation((payload) => {
      expect(payload.userId).toBe('user-1')
      expect(payload.companyId).toBe('company-1')
      expect(payload.role).toBe('ADMIN')
      return Effect.succeed({ accessToken: 'access', refreshToken: 'refresh' })
    })
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(null)),
      create: vi.fn().mockReturnValue(Effect.succeed(mockUser)),
    }
    const layer = makeLayer(userRepo, { hash: vi.fn().mockReturnValue(Effect.succeed('h')) }, {
      generateTokens: generateTokensSpy,
    })
    await Effect.runPromise(
      registerCompany({ name: 'E', email: 'a@e.com', password: 'senha123' }).pipe(Effect.provide(layer)),
    )
  })
})
