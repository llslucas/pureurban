import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { updateStudent } from './update-student.use-case.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { PasswordHasher } from '../ports/password-hasher.port.js';
import {
  EmailAlreadyExistsError,
  StudentNotFoundError,
} from '../errors/auth.errors.js';
import type { UserData } from '../ports/user-repository.port.js';
import type { UpdateStudentInput } from '../schemas/update-student.schema.js';

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

function makeLayer(
  userRepo: Partial<UserRepository>,
  hasher: Partial<PasswordHasher>,
) {
  return Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo as UserRepository),
    Layer.succeed(PasswordHasher, hasher as PasswordHasher),
  );
}

describe('updateStudent', () => {
  it('deve atualizar parcialmente — apenas name', async () => {
    const updated = { ...mockStudent, name: 'Novo Nome' };
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockStudent)),
      updatePartial: vi.fn().mockReturnValue(Effect.succeed(updated)),
    };
    const hasher: Partial<PasswordHasher> = { hash: vi.fn() };

    const [result, events] = await Effect.runPromise(
      updateStudent({
        id: 'student-1',
        companyId: 'company-1',
        data: { name: 'Novo Nome' },
      }).pipe(Effect.provide(makeLayer(userRepo, hasher))),
    );

    expect(result.name).toBe('Novo Nome');
    expect(events[0].type).toBe('auth.student_updated');
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it('deve re-hashear password quando password é fornecido', async () => {
    const updated = { ...mockStudent, password: 'nova_hash' };
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockStudent)),
      updatePartial: vi.fn().mockReturnValue(Effect.succeed(updated)),
    };
    const hasher: Partial<PasswordHasher> = {
      hash: vi.fn().mockReturnValue(Effect.succeed('nova_hash')),
    };

    await Effect.runPromise(
      updateStudent({
        id: 'student-1',
        companyId: 'company-1',
        data: { password: 'novasenha123' },
      }).pipe(Effect.provide(makeLayer(userRepo, hasher))),
    );

    expect(hasher.hash).toHaveBeenCalledWith('novasenha123');
    expect(userRepo.updatePartial).toHaveBeenCalledWith(
      'student-1',
      'company-1',
      { password: 'nova_hash' },
    );
  });

  it('deve falhar com EmailAlreadyExistsError quando email já pertence a outro usuário', async () => {
    const outroUsuario = {
      ...mockStudent,
      id: 'outro-user',
      email: 'novo@empresa.com',
    };
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockStudent)),
      findByEmail: vi.fn().mockReturnValue(Effect.succeed(outroUsuario)),
    };
    const hasher: Partial<PasswordHasher> = { hash: vi.fn() };

    const result = await Effect.runPromise(
      Effect.either(
        updateStudent({
          id: 'student-1',
          companyId: 'company-1',
          data: { email: 'novo@empresa.com' },
        }).pipe(Effect.provide(makeLayer(userRepo, hasher))),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(EmailAlreadyExistsError);
    }
  });

  it('NÃO deve falhar quando email é o mesmo do próprio aluno', async () => {
    const updated = { ...mockStudent };
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockStudent)),
      updatePartial: vi.fn().mockReturnValue(Effect.succeed(updated)),
    };
    const hasher: Partial<PasswordHasher> = { hash: vi.fn() };

    const [result] = await Effect.runPromise(
      updateStudent({
        id: 'student-1',
        companyId: 'company-1',
        data: { email: 'ALUNO@EMPRESA.COM' },
      }).pipe(Effect.provide(makeLayer(userRepo, hasher))),
    );

    expect(result.id).toBe('student-1');
    expect(userRepo.findByEmail).toBeUndefined();
  });

  it('deve falhar com StudentNotFoundError quando aluno não encontrado', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi.fn().mockReturnValue(Effect.succeed(null)),
    };
    const hasher: Partial<PasswordHasher> = { hash: vi.fn() };

    const result = await Effect.runPromise(
      Effect.either(
        updateStudent({
          id: 'inexistente',
          companyId: 'company-1',
          data: { name: 'Nome' },
        }).pipe(Effect.provide(makeLayer(userRepo, hasher))),
      ),
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotFoundError);
    }
  });

  it('deve retornar noEvents sem emitir evento quando dataToUpdate fica vazio', async () => {
    const userRepo: Partial<UserRepository> = {
      findByIdAndCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(mockStudent)),
      updatePartial: vi.fn(),
    };
    const hasher: Partial<PasswordHasher> = { hash: vi.fn() };

    // Bypass schema to test the no-op code path in the use-case directly
    const [result, events] = await Effect.runPromise(
      updateStudent({
        id: 'student-1',
        companyId: 'company-1',
        data: {} as UpdateStudentInput,
      }).pipe(Effect.provide(makeLayer(userRepo, hasher))),
    );

    expect(events).toHaveLength(0);
    expect(userRepo.updatePartial).not.toHaveBeenCalled();
    expect(result.id).toBe('student-1');
  });
});
