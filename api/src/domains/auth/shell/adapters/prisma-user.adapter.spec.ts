import { describe, it, expect, vi } from 'vitest';
import { Effect, Exit, Cause, Chunk } from 'effect';

// Mock PrismaService module before importing the adapter
vi.mock('../../../shared/shell/infra/prisma.service.js', () => ({
  PrismaService: class MockPrismaService {},
}));

import { PrismaUserAdapter } from './prisma-user.adapter.js';
import { EmailAlreadyExistsError } from '../../core/errors/auth.errors.js';

const mockUser = {
  id: 'user-1',
  email: 'test@test.com',
  password: 'hashed',
  name: 'Test User',
  role: 'ADMIN',
  companyId: 'company-1',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PrismaUserAdapter', () => {
  function makeAdapter(prismaMock: Record<string, unknown>) {
    const adapter = new (PrismaUserAdapter as any)(prismaMock);
    return adapter;
  }

  it('findByEmail deve retornar user existente', async () => {
    const prismaMock = {
      user: { findUnique: vi.fn().mockResolvedValue(mockUser) },
    };
    const adapter = makeAdapter(prismaMock);

    const result = await Effect.runPromise(
      adapter.findByEmail('test@test.com'),
    );
    expect(result).toMatchObject({ id: 'user-1', email: 'test@test.com' });
  });

  it('findByEmail deve retornar null para email inexistente', async () => {
    const prismaMock = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const adapter = makeAdapter(prismaMock);

    const result = await Effect.runPromise(
      adapter.findByEmail('nonexistent@test.com'),
    );
    expect(result).toBeNull();
  });

  it('findById deve retornar user existente pelo id', async () => {
    const prismaMock = {
      user: { findUnique: vi.fn().mockResolvedValue(mockUser) },
    };
    const adapter = makeAdapter(prismaMock);

    const result = await Effect.runPromise(adapter.findById('user-1'));
    expect(result).toMatchObject({ id: 'user-1', companyId: 'company-1' });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });

  it('findById deve retornar null quando id não encontrado', async () => {
    const prismaMock = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const adapter = makeAdapter(prismaMock);

    const result = await Effect.runPromise(adapter.findById('nonexistent-id'));
    expect(result).toBeNull();
  });

  it('create deve criar Company + User em transação e retornar UserData', async () => {
    const mockCompany = { id: 'company-1' };
    const prismaMock = {
      $transaction: vi.fn().mockImplementation(async (fn: any) => {
        const tx = {
          company: { create: vi.fn().mockResolvedValue(mockCompany) },
          user: { create: vi.fn().mockResolvedValue(mockUser) },
        };
        return fn(tx);
      }),
    };
    const adapter = makeAdapter(prismaMock);

    const result = await Effect.runPromise(
      adapter.create({
        email: 'test@test.com',
        password: 'hashed',
        name: 'Test User',
        role: 'ADMIN',
        companyName: 'Test Company',
      }),
    );
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'test@test.com',
      companyId: 'company-1',
    });
  });

  it('createStudent deve criar user com role STUDENT e isActive true', async () => {
    const studentUser = { ...mockUser, role: 'STUDENT' };
    const prismaMock = {
      user: { create: vi.fn().mockResolvedValue(studentUser) },
    };
    const adapter = makeAdapter(prismaMock);

    const result = await Effect.runPromise(
      adapter.createStudent({
        email: 'aluno@empresa.com',
        password: 'hashed',
        name: 'Maria Aluna',
        companyId: 'company-1',
      }),
    );

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'STUDENT', isActive: true }),
    });
    expect(result).toMatchObject({ role: 'STUDENT', isActive: true });
  });

  it('createStudent deve lançar EmailAlreadyExistsError quando email duplicado (P2002)', async () => {
    const { Prisma: PrismaModule } =
      await import('../../../../generated/prisma/client.js');
    const p2002Error = new PrismaModule.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.0.0',
      },
    );
    const prismaMock = {
      user: { create: vi.fn().mockRejectedValue(p2002Error) },
    };
    const adapter = makeAdapter(prismaMock);

    // Effect.promise com throw wraps o erro num FiberFailure (defect) — verificamos via Exit
    const exit = await Effect.runPromiseExit(
      adapter.createStudent({
        email: 'duplicado@empresa.com',
        password: 'hashed',
        name: 'Aluno',
        companyId: 'company-1',
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const defect = Chunk.toArray(Cause.defects(exit.cause))[0];
      expect(defect).toBeInstanceOf(EmailAlreadyExistsError);
    }
  });
});
