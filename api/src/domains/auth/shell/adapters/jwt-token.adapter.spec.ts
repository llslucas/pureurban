import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'

// Mock modules before importing the adapter
vi.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}))

vi.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    signAsync = vi.fn()
    verifyAsync = vi.fn()
  },
}))

vi.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = vi.fn().mockReturnValue('15m')
  },
}))

const { JwtTokenAdapter } = await import('./jwt-token.adapter.js')
const { InvalidRefreshTokenError } = await import('../../core/errors/auth.errors.js')

function makeAdapter(jwtMock: Record<string, unknown>, configMock?: Record<string, unknown>) {
  const config = configMock ?? { get: vi.fn().mockReturnValue('15m') }
  return new (JwtTokenAdapter as any)(jwtMock, config)
}

describe('JwtTokenAdapter.verifyToken', () => {
  it('deve decodificar um token válido e retornar TokenPayload', async () => {
    const jwtMock = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: 'user-1',
        companyId: 'company-1',
        role: 'DRIVER',
      }),
    }
    const adapter = makeAdapter(jwtMock)
    const result = await Effect.runPromise(adapter.verifyToken('valid.jwt.token'))

    expect(result).toEqual({
      userId: 'user-1',
      companyId: 'company-1',
      role: 'DRIVER',
    })
  })

  it('deve falhar com InvalidRefreshTokenError quando token é inválido ou expirado', async () => {
    const jwtMock = {
      verifyAsync: vi.fn().mockRejectedValue(new Error('jwt expired')),
    }
    const adapter = makeAdapter(jwtMock)
    const result = await Effect.runPromise(
      Effect.either(adapter.verifyToken('expired.jwt.token')),
    )

    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(InvalidRefreshTokenError)
      expect((result.left as InstanceType<typeof InvalidRefreshTokenError>).code).toBe('INVALID_REFRESH_TOKEN')
    }
  })
})
