import { describe, it, expect, vi } from 'vitest'
import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RolesGuard } from './roles.guard.js'
import { Roles } from '../decorators/roles.decorator.js'

function createMockContext(
  userRole?: string,
  requiredRoles?: string[],
): ExecutionContext {
  const mockRequest = { user: userRole ? { role: userRole } : undefined }
  const mockHandler = {}

  const reflector = new Reflector()
  vi.spyOn(reflector, 'get').mockReturnValue(requiredRoles as string[])

  const mockContext = {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => mockHandler,
  } as unknown as ExecutionContext

  return { mockContext, reflector } as unknown as ExecutionContext & {
    mockContext: ExecutionContext
    reflector: Reflector
  }
}

describe('RolesGuard', () => {
  it('deve permitir quando não há @Roles() no handler (público)', () => {
    const reflector = new Reflector()
    vi.spyOn(reflector, 'get').mockReturnValue(undefined as unknown as string[])
    const guard = new RolesGuard(reflector)

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'driver' } }) }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext

    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('deve permitir quando role do usuário está na lista de roles requeridos', () => {
    const reflector = new Reflector()
    vi.spyOn(reflector, 'get').mockReturnValue(['admin'])
    const guard = new RolesGuard(reflector)

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'admin' } }) }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext

    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('deve lançar ForbiddenException quando role não bate', () => {
    const reflector = new Reflector()
    vi.spyOn(reflector, 'get').mockReturnValue(['admin'])
    const guard = new RolesGuard(reflector)

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'driver' } }) }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext

    expect(() => guard.canActivate(ctx)).toThrow()
  })

  it('deve permitir quando um dos múltiplos roles bate', () => {
    const reflector = new Reflector()
    vi.spyOn(reflector, 'get').mockReturnValue(['admin', 'manager'])
    const guard = new RolesGuard(reflector)

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'manager' } }) }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext

    expect(guard.canActivate(ctx)).toBe(true)
  })
})
