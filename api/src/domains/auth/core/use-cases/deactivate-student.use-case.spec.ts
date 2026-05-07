import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { deactivateStudent } from './deactivate-student.use-case.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { StudentNotFoundError } from '../errors/auth.errors.js';
import type { UserData } from '../ports/user-repository.port.js';

const activeStudent: UserData = {
  id: 'student-1',
  email: 'aluno@empresa.com',
  password: 'hashed',
  name: 'Maria Aluna',
  role: 'STUDENT',
  companyId: 'company-1',
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const inactiveStudent: UserData = { ...activeStudent, isActive: false };

function makeLayer(userRepo: Partial<UserRepository>) {
  return Layer.succeed(UserRepository, userRepo as UserRepository);
}

describe('deactivateStudent', () => {
  it('deve desativar aluno ativo e emitir evento auth.student_deactivated', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(activeStudent)),
      updatePartial: vi.fn().mockReturnValue(Effect.succeed(inactiveStudent)),
    };

    const [result, events] = await Effect.runPromise(
      deactivateStudent({ id: 'student-1', companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(userRepo)),
      ),
    );

    expect(result.isActive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('auth.student_deactivated');
    expect((events[0].data as { studentId: string }).studentId).toBe(
      'student-1',
    );
  });

  it('deve ser idempotente — aluno já inativo retorna noEvents SEM emitir evento', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(inactiveStudent)),
      updatePartial: vi.fn(),
    };

    const [result, events] = await Effect.runPromise(
      deactivateStudent({ id: 'student-1', companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(userRepo)),
      ),
    );

    expect(result.isActive).toBe(false);
    expect(events).toHaveLength(0);
    expect(userRepo.updatePartial).not.toHaveBeenCalled();
  });

  it('deve falhar com StudentNotFoundError quando aluno não encontrado', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi.fn().mockReturnValue(Effect.succeed(null)),
    };

    const result = await Effect.runPromise(
      Effect.either(
        deactivateStudent({ id: 'inexistente', companyId: 'company-1' }).pipe(
          Effect.provide(makeLayer(userRepo)),
        ),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotFoundError);
      expect(result.left.code).toBe('STUDENT_NOT_FOUND');
    }
  });
});
