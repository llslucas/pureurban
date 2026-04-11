import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'

// Mock PrismaService module before importing the adapter
vi.mock('../../../shared/shell/infra/prisma.service.js', () => ({
  PrismaService: class MockPrismaService {},
}))

const { PrismaUserAdapter } = await import('./prisma-user.adapter.js')

const mockUser = {
  id: 'user-1',
  email: 'test@test.com',
  password: 'hashed',
  name: 'Test User',
  role: 'ADMIN',
  companyId: 'company-1',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('PrismaUserAdapter', () => {
  function makeAdapter(prismaMock: Record<string, unknown>) {
    const adapter = new (PrismaUserAdapter as any)(prismaMock)
    return adapter
  }

  it('findByEmail deve retornar user existente', async () => {
    const prismaMock = {
      user: { findUnique: vi.fn().mockResolvedValue(mockUser) },
    }
    const adapter = makeAdapter(prismaMock)

    const result = await Effect.runPromise(adapter.findByEmail('test@test.com'))
    expect(result).toMatchObject({ id: 'user-1', email: 'test@test.com' })
  })

  it('findByEmail deve retornar null para email inexistente', async () => {
    const prismaMock = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    }
    const adapter = makeAdapter(prismaMock)

    const result = await Effect.runPromise(adapter.findByEmail('nonexistent@test.com'))
    expect(result).toBeNull()
  })

  it('create deve criar Company + User em transação e retornar UserData', async () => {
    const mockCompany = { id: 'company-1' }
    const prismaMock = {
      $transaction: vi.fn().mockImplementation(async (fn: any) => {
        const tx = {
          company: { create: vi.fn().mockResolvedValue(mockCompany) },
          user: { create: vi.fn().mockResolvedValue(mockUser) },
        }
        return fn(tx)
      }),
    }
    const adapter = makeAdapter(prismaMock)

    const result = await Effect.runPromise(
      adapter.create({
        email: 'test@test.com',
        password: 'hashed',
        name: 'Test User',
        role: 'ADMIN',
        companyName: 'Test Company',
      }),
    )
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'test@test.com',
      companyId: 'company-1',
    })
  })
})

