import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { getStudent } from './get-student.use-case.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { StudentNotFoundError } from '../errors/auth.errors.js';
import type { UserData } from '../ports/user-repository.port.js';

const mockStudent: UserData = {
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

function makeLayer(userRepo: Partial<UserRepository>) {
  return Layer.succeed(UserRepository, userRepo as UserRepository);
}

describe('getStudent', () => {
  it('deve retornar aluno encontrado', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockStudent)),
    };

    const [result] = await Effect.runPromise(
      getStudent({ id: 'student-1', companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(userRepo)),
      ),
    );

    expect(result).toMatchObject({ id: 'student-1', role: 'STUDENT' });
    expect(userRepo.findByIdAndCompanyAndRole).toHaveBeenCalledWith(
      'student-1',
      'company-1',
      'STUDENT',
    );
  });

  it('deve falhar com StudentNotFoundError quando aluno não encontrado', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi.fn().mockReturnValue(Effect.succeed(null)),
    };

    const result = await Effect.runPromise(
      Effect.either(
        getStudent({ id: 'inexistente', companyId: 'company-1' }).pipe(
          Effect.provide(makeLayer(userRepo)),
        ),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotFoundError);
      expect(result.left.code).toBe('STUDENT_NOT_FOUND');
      expect(result.left.httpStatus).toBe(404);
    }
  });

  it('deve falhar com StudentNotFoundError quando aluno pertence a outra empresa', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi.fn().mockReturnValue(Effect.succeed(null)),
    };

    const result = await Effect.runPromise(
      Effect.either(
        getStudent({ id: 'student-1', companyId: 'outra-empresa' }).pipe(
          Effect.provide(makeLayer(userRepo)),
        ),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotFoundError);
    }
  });

  it('deve falhar com StudentNotFoundError quando user tem role DRIVER (cross-role)', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi.fn().mockReturnValue(Effect.succeed(null)),
    };

    const result = await Effect.runPromise(
      Effect.either(
        getStudent({ id: 'driver-1', companyId: 'company-1' }).pipe(
          Effect.provide(makeLayer(userRepo)),
        ),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotFoundError);
    }
    expect(userRepo.findByIdAndCompanyAndRole).toHaveBeenCalledWith(
      'driver-1',
      'company-1',
      'STUDENT',
    );
  });
});
