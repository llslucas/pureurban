import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { createStudent } from './create-student.use-case.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { PasswordHasher } from '../ports/password-hasher.port.js';
import { EmailAlreadyExistsError } from '../errors/auth.errors.js';
import type { UserData } from '../ports/user-repository.port.js';

const mockStudent: UserData = {
  id: 'student-1',
  email: 'aluno@empresa.com',
  password: 'hashed_password',
  name: 'Maria Aluna',
  role: 'STUDENT',
  companyId: 'company-1',
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makeLayer(
  userRepo: Partial<UserRepository>,
  hasher: Partial<PasswordHasher>,
) {
  return Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo as UserRepository),
    Layer.succeed(PasswordHasher, hasher as PasswordHasher),
  );
}

describe('createStudent', () => {
  it('deve criar aluno com sucesso, normalizando email e emitindo evento', async () => {
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(null)),
      createStudent: vi.fn().mockReturnValue(Effect.succeed(mockStudent)),
    };
    const hasher: Partial<PasswordHasher> = {
      hash: vi.fn().mockReturnValue(Effect.succeed('hashed_password')),
    };

    const layer = makeLayer(userRepo, hasher);
    const [result, events] = await Effect.runPromise(
      createStudent(
        {
          name: 'Maria Aluna',
          email: '  Aluno@Empresa.COM  ',
          password: 'senha123',
        },
        'company-1',
      ).pipe(Effect.provide(layer)),
    );

    expect(userRepo.findByEmail).toHaveBeenCalledWith('aluno@empresa.com');
    expect(hasher.hash).toHaveBeenCalledWith('senha123');
    expect(result).toMatchObject({ id: 'student-1', role: 'STUDENT' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('auth.student_created');
    expect((events[0].data as { studentId: string }).studentId).toBe(
      'student-1',
    );
    expect((events[0].data as { companyId: string }).companyId).toBe(
      'company-1',
    );
  });

  it('deve falhar com EmailAlreadyExistsError quando email já existe (sem emitir evento)', async () => {
    const userRepo: Partial<UserRepository> = {
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(mockStudent)),
    };
    const hasher: Partial<PasswordHasher> = {
      hash: vi.fn(),
    };

    const layer = makeLayer(userRepo, hasher);
    const result = await Effect.runPromise(
      Effect.either(
        createStudent(
          {
            name: 'Outro Aluno',
            email: 'aluno@empresa.com',
            password: 'senha123',
          },
          'company-1',
        ).pipe(Effect.provide(layer)),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(EmailAlreadyExistsError);
      expect(result.left.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(result.left.httpStatus).toBe(409);
    }
    expect(hasher.hash).not.toHaveBeenCalled();
  });
});
