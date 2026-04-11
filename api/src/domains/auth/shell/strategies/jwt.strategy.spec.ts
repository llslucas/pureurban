import { describe, it, expect, vi } from 'vitest'
import { JwtStrategy } from './jwt.strategy.js'

describe('JwtStrategy', () => {
  function makeStrategy() {
    const configService = {
      get: vi.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret'
        return undefined
      }),
    }
    return new JwtStrategy(configService as any)
  }

  it('deve retornar { userId, companyId, role } com payload válido', () => {
    const strategy = makeStrategy()
    const result = strategy.validate({
      sub: 'user-123',
      companyId: 'company-456',
      role: 'ADMIN',
    })
    expect(result).toEqual({
      userId: 'user-123',
      companyId: 'company-456',
      role: 'ADMIN',
    })
  })

  it('deve mapear sub → userId corretamente', () => {
    const strategy = makeStrategy()
    const result = strategy.validate({
      sub: 'abc-def',
      companyId: 'comp-1',
      role: 'DRIVER',
    })
    expect(result.userId).toBe('abc-def')
    expect((result as any).sub).toBeUndefined()
  })
})
