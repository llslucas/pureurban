import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { listStudents } from './list-students.use-case.js';
import { UserRepository } from '../ports/user-repository.port.js';
import type { UserData } from '../ports/user-repository.port.js';

const makeStudent = (overrides: Partial<UserData> = {}): UserData => ({
  id: 'student-1',
  email: 'aluno@empresa.com',
  password: 'hashed',
  name: 'Maria Aluna',
  role: 'STUDENT',
  companyId: 'company-1',
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

function makeLayer(userRepo: Partial<UserRepository>) {
  return Layer.succeed(UserRepository, userRepo as UserRepository);
}

describe('listStudents', () => {
  it('deve filtrar apenas alunos da empresa (não de outras empresas)', async () => {
    const studentsCompany1 = [
      makeStudent({ id: 'student-1', companyId: 'company-1' }),
    ];
    const userRepo: Partial<UserRepository> = {
      findManyByCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(studentsCompany1)),
    };

    const [result] = await Effect.runPromise(
      listStudents({ companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(userRepo)),
      ),
    );

    expect(userRepo.findManyByCompanyAndRole).toHaveBeenCalledWith(
      'company-1',
      'STUDENT',
      undefined,
    );
    expect(result).toHaveLength(1);
    expect(result[0].companyId).toBe('company-1');
  });

  it('deve filtrar apenas alunos ativos quando isActive=true', async () => {
    const activeStudents = [makeStudent({ id: 'student-1', isActive: true })];
    const userRepo: Partial<UserRepository> = {
      findManyByCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(activeStudents)),
    };

    const [result] = await Effect.runPromise(
      listStudents({ companyId: 'company-1', isActive: true }).pipe(
        Effect.provide(makeLayer(userRepo)),
      ),
    );

    expect(userRepo.findManyByCompanyAndRole).toHaveBeenCalledWith(
      'company-1',
      'STUDENT',
      { isActive: true },
    );
    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(true);
  });

  it('deve retornar ativos e inativos quando isActive não é informado', async () => {
    const allStudents = [
      makeStudent({ id: 'student-1', isActive: true }),
      makeStudent({ id: 'student-2', isActive: false }),
    ];
    const userRepo: Partial<UserRepository> = {
      findManyByCompanyAndRole: vi
        .fn()
        .mockReturnValue(Effect.succeed(allStudents)),
    };

    const [result] = await Effect.runPromise(
      listStudents({ companyId: 'company-1' }).pipe(
        Effect.provide(makeLayer(userRepo)),
      ),
    );

    expect(userRepo.findManyByCompanyAndRole).toHaveBeenCalledWith(
      'company-1',
      'STUDENT',
      undefined,
    );
    expect(result).toHaveLength(2);
  });
});
