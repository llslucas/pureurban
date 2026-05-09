import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  RouteData,
  CreateRouteData,
  RouteRepositoryApi,
} from '../../core/ports/route-repository.port.js';
import { RouteNotFoundError } from '../../core/errors/routing.errors.js';

// Helper: mapeia erro desconhecido para string (adapter de infra)
const toInfraError = (msg: string) => (e: unknown) =>
  new Error(`${msg}: ${String(e)}`);

@Injectable()
export class PrismaRouteAdapter implements RouteRepositoryApi {
  // PrismaService injetado via NestJS DI — sem Effect-level requirement (R = never)
  // Toda query filtrada por companyId (multi-tenancy obrigatório)

  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateRouteData): Effect.Effect<RouteData> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.route.create({
            data: {
              name: data.name,
              description: data.description ?? null,
              originCity: data.originCity,
              destinationCity: data.destinationCity,
              companyId: data.companyId,
            },
          }),
        catch: toInfraError('Falha ao criar rota'),
      }),
      Effect.map((route) => route as RouteData),
      Effect.orDie,
    );
  }

  findAllByCompany(companyId: string): Effect.Effect<RouteData[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.route.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' },
          }),
        catch: toInfraError('Falha ao listar rotas'),
      }),
      Effect.map((routes) => routes as RouteData[]),
      Effect.orDie,
    );
  }

  findByIdAndCompany(
    id: string,
    companyId: string,
  ): Effect.Effect<RouteData | null> {
    return pipe(
      Effect.tryPromise({
        try: () => this.prisma.route.findFirst({ where: { id, companyId } }),
        catch: toInfraError(`Erro ao buscar rota ${id}`),
      }),
      Effect.map((route) => (route as RouteData) ?? null),
      Effect.orDie,
    );
  }

  update(
    id: string,
    companyId: string,
    data: Partial<
      Omit<RouteData, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>
    >,
  ): Effect.Effect<RouteData, RouteNotFoundError> {
    const prisma = this.prisma;
    return Effect.gen(function* () {
      // $transaction: findFirst + update para garantir multi-tenancy
      const result = yield* pipe(
        Effect.tryPromise({
          try: () =>
            prisma.$transaction(async (tx) => {
              const existing = await tx.route.findFirst({
                where: { id, companyId },
              });
              if (!existing) return null;
              return tx.route.update({
                where: { id },
                data: {
                  ...(data.name !== undefined && { name: data.name }),
                  ...(data.description !== undefined && {
                    description: data.description,
                  }),
                  ...(data.originCity !== undefined && {
                    originCity: data.originCity,
                  }),
                  ...(data.destinationCity !== undefined && {
                    destinationCity: data.destinationCity,
                  }),
                },
              });
            }),
          catch: toInfraError(`Erro ao atualizar rota ${id}`),
        }),
        Effect.orDie,
      );

      if (!result) {
        return yield* Effect.fail(RouteNotFoundError.create(id));
      }
      return result as unknown as RouteData;
    });
  }

  remove(
    id: string,
    companyId: string,
  ): Effect.Effect<void, RouteNotFoundError> {
    const prisma = this.prisma;
    return Effect.gen(function* () {
      // $transaction: findFirst + delete para garantir multi-tenancy (hard delete)
      const deleted = yield* pipe(
        Effect.tryPromise({
          try: () =>
            prisma.$transaction(async (tx) => {
              const existing = await tx.route.findFirst({
                where: { id, companyId },
              });
              if (!existing) return null;
              await tx.route.delete({ where: { id } });
              return true;
            }),
          catch: toInfraError(`Erro ao deletar rota ${id}`),
        }),
        Effect.orDie,
      );

      if (!deleted) {
        return yield* Effect.fail(RouteNotFoundError.create(id));
      }
    });
  }
}
