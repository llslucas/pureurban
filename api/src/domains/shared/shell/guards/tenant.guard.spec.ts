import { describe, it, expect } from 'vitest'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { TenantGuard } from './tenant.guard.js'

function createCtx(user?: Record<string, unknown>) {
  const request: Record<string, unknown> = { user }
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext & { _req: typeof request }
}

describe('TenantGuard', () => {
  const guard = new TenantGuard()

  it('deve injetar tenantId quando JWT contém companyId', () => {
    const ctx = createCtx({ companyId: 'company-123' })
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>

    const result = guard.canActivate(ctx)

    expect(result).toBe(true)
    expect(req.tenantId).toBe('company-123')
  })

  it('deve lançar UnauthorizedException quando JWT não contém companyId', () => {
    const ctx = createCtx({ id: 'user-1', role: 'driver' })

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException)
  })

  it('deve lançar UnauthorizedException quando não há user no request', () => {
    const ctx = createCtx(undefined)

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException)
  })
})
