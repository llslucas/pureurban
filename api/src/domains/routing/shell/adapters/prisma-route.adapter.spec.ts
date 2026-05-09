import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Effect } from 'effect';
import { PrismaRouteAdapter } from './prisma-route.adapter.js';
import { RouteNotFoundError } from '../../core/errors/routing.errors.js';

const mockPrismaRoute = {
  id: 'route-1',
  name: 'Rota Norte',
  description: null,
  originCity: 'Viçosa',
  destinationCity: 'BH',
  companyId: 'company-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makeMockPrisma() {
  return {
    route: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

describe('PrismaRouteAdapter', () => {
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  let adapter: PrismaRouteAdapter;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    adapter = new PrismaRouteAdapter(mockPrisma as any);
  });

  describe('create', () => {
    it('deve criar rota com companyId', async () => {
      mockPrisma.route.create.mockResolvedValue(mockPrismaRoute);

      const result = await Effect.runPromise(
        adapter.create({
          name: 'Rota Norte',
          description: undefined,
          originCity: 'Viçosa',
          destinationCity: 'BH',
          companyId: 'company-1',
        }),
      );

      expect(mockPrisma.route.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ companyId: 'company-1' }),
      });
      expect(result.id).toBe('route-1');
    });
  });

  describe('findAllByCompany', () => {
    it('deve listar rotas ordenadas por createdAt desc', async () => {
      mockPrisma.route.findMany.mockResolvedValue([mockPrismaRoute]);

      const result = await Effect.runPromise(
        adapter.findAllByCompany('company-1'),
      );

      expect(mockPrisma.route.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findByIdAndCompany', () => {
    it('deve retornar rota existente', async () => {
      mockPrisma.route.findFirst.mockResolvedValue(mockPrismaRoute);

      const result = await Effect.runPromise(
        adapter.findByIdAndCompany('route-1', 'company-1'),
      );

      expect(mockPrisma.route.findFirst).toHaveBeenCalledWith({
        where: { id: 'route-1', companyId: 'company-1' },
      });
      expect(result?.id).toBe('route-1');
    });

    it('deve retornar null para rota inexistente ou de outra empresa', async () => {
      mockPrisma.route.findFirst.mockResolvedValue(null);

      const result = await Effect.runPromise(
        adapter.findByIdAndCompany('inexistente', 'company-1'),
      );

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('deve atualizar rota existente via $transaction', async () => {
      const updated = { ...mockPrismaRoute, name: 'Rota Atualizada' };
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: any) => Promise<any>) =>
          fn({
            route: {
              findFirst: vi.fn().mockResolvedValue(mockPrismaRoute),
              update: vi.fn().mockResolvedValue(updated),
            },
          }),
      );

      const result = await Effect.runPromise(
        adapter.update('route-1', 'company-1', { name: 'Rota Atualizada' }),
      );

      expect(result.name).toBe('Rota Atualizada');
    });

    it('deve falhar com RouteNotFoundError se rota não existe ou é de outra empresa', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: any) => Promise<any>) =>
          fn({
            route: {
              findFirst: vi.fn().mockResolvedValue(null),
              update: vi.fn(),
            },
          }),
      );

      const result = await Effect.runPromise(
        Effect.either(
          adapter.update('inexistente', 'company-1', { name: 'X' }),
        ),
      );

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(RouteNotFoundError);
      }
    });
  });

  describe('remove', () => {
    it('deve deletar rota existente via $transaction (hard delete)', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: any) => Promise<any>) =>
          fn({
            route: {
              findFirst: vi.fn().mockResolvedValue(mockPrismaRoute),
              delete: vi.fn().mockResolvedValue(undefined),
            },
          }),
      );

      await Effect.runPromise(adapter.remove('route-1', 'company-1'));

      // Sucesso = sem throw
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    });

    it('deve falhar com RouteNotFoundError se rota não existe', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: any) => Promise<any>) =>
          fn({
            route: {
              findFirst: vi.fn().mockResolvedValue(null),
              delete: vi.fn(),
            },
          }),
      );

      const result = await Effect.runPromise(
        Effect.either(adapter.remove('inexistente', 'company-1')),
      );

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(RouteNotFoundError);
      }
    });
  });
});
