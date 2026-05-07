import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  it('deve permitir quando não há @Roles() no handler (público)', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue(
      undefined as unknown as string[],
    );
    const guard = new RolesGuard(reflector);

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'driver' } }),
      }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('deve permitir quando role do usuário está na lista de roles requeridos', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue(['admin']);
    const guard = new RolesGuard(reflector);

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'admin' } }) }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('deve lançar ForbiddenException quando role não bate', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue(['admin']);
    const guard = new RolesGuard(reflector);

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'driver' } }),
      }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('deve permitir quando um dos múltiplos roles bate', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue(['admin', 'manager']);
    const guard = new RolesGuard(reflector);

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'manager' } }),
      }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('deve lançar ForbiddenException quando user não existe', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue(['admin']);
    const guard = new RolesGuard(reflector);

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('deve lançar ForbiddenException quando role não é string', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue(['admin']);
    const guard = new RolesGuard(reflector);

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 123 } }) }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
