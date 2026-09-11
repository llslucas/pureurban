import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  TripData,
  CreateTripData,
  TripRepositoryApi,
} from '../../core/ports/trip-repository.port.js';
import { TripNotFound } from '../../core/errors/trip.errors.js';
import { toInfraError as makeInfraError } from '../../../shared/shell/infra/to-infra-error.js';

const toInfraError = (msg: string) =>
  makeInfraError(
    msg,
    (m) => new TripNotFound({ code: 'INFRA_ERROR', message: m }),
  );

@Injectable()
export class PrismaTripAdapter implements TripRepositoryApi {
  // PrismaService injetado via NestJS DI — sem Effect-level requirement (R = never)
  // Toda query filtrada por companyId (multi-tenancy obrigatório)

  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateTripData): Effect.Effect<TripData, never, never> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.trip.create({
            data: {
              companyId: data.companyId,
              routeId: data.routeId,
              driverId: data.driverId,
              type: data.type,
              status: data.status,
              startedAt: data.startedAt,
              relatedTripId: data.relatedTripId ?? null,
            },
          }),
        catch: toInfraError('Falha ao criar viagem'),
      }),
      Effect.map((trip) => trip as TripData),
      Effect.orDie,
    );
  }

  findById(
    id: string,
    tenantId: string,
  ): Effect.Effect<TripData, TripNotFound, never> {
    const prisma = this.prisma;
    return Effect.gen(function* () {
      const trip = yield* pipe(
        Effect.tryPromise({
          try: () =>
            prisma.trip.findFirst({ where: { id, companyId: tenantId } }),
          catch: toInfraError(`Erro ao buscar viagem ${id}`),
        }),
        Effect.orDie,
      );
      if (!trip) {
        return yield* Effect.fail(
          // Sem `details`: o tripId já está no path e na mensagem, e o corpo
          // precisa ser `{ error: { code, message } }` puro para bater com o
          // mock MSW na comparação corpo-a-corpo da 3.6 — o tipo gerado do
          // mobile declara `details` como `Record<string, never>`, então o mock
          // é estruturalmente incapaz de reproduzir o campo.
          new TripNotFound({
            code: 'TRIP_NOT_FOUND',
            message: `Viagem com id ${id} não encontrada`,
          }),
        );
      }
      return trip as unknown as TripData;
    });
  }

  update(
    id: string,
    data: Partial<TripData>,
    tenantId: string,
  ): Effect.Effect<TripData, TripNotFound, never> {
    const prisma = this.prisma;
    return Effect.gen(function* () {
      // $transaction (findFirst tenant-scoped + update por id) — mesmo padrão do
      // prisma-route.adapter. `trip.update` só aceita campo único no `where`,
      // então o companyId entra na leitura dentro da transação; fora dela havia
      // janela TOCTOU e a escrita não era isolada por tenant.
      const updated = yield* pipe(
        Effect.tryPromise({
          try: () =>
            prisma.$transaction(async (tx) => {
              const existing = await tx.trip.findFirst({
                where: { id, companyId: tenantId },
              });
              if (!existing) return null;
              return tx.trip.update({
                where: { id },
                data: {
                  ...(data.status !== undefined && { status: data.status }),
                  ...(data.endedAt !== undefined && { endedAt: data.endedAt }),
                },
              });
            }),
          catch: toInfraError(`Erro ao atualizar viagem ${id}`),
        }),
        Effect.orDie,
      );
      if (!updated) {
        return yield* Effect.fail(
          // Sem `details`: o tripId já está no path e na mensagem, e o corpo
          // precisa ser `{ error: { code, message } }` puro para bater com o
          // mock MSW na comparação corpo-a-corpo da 3.6 — o tipo gerado do
          // mobile declara `details` como `Record<string, never>`, então o mock
          // é estruturalmente incapaz de reproduzir o campo.
          new TripNotFound({
            code: 'TRIP_NOT_FOUND',
            message: `Viagem com id ${id} não encontrada`,
          }),
        );
      }
      return updated as TripData;
    });
  }

  findActiveByDriver(
    driverId: string,
    tenantId: string,
  ): Effect.Effect<TripData | null, never, never> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.trip.findFirst({
            where: { driverId, companyId: tenantId, status: 'ACTIVE' },
          }),
        catch: toInfraError('Erro ao buscar viagem ativa'),
      }),
      Effect.map((trip) => (trip as TripData) ?? null),
      Effect.orDie,
    );
  }

  findActiveReturnByStudent(
    studentId: string,
    tenantId: string,
  ): Effect.Effect<TripData | null, never, never> {
    const prisma = this.prisma;
    return pipe(
      Effect.tryPromise({
        // Duas queries, sem JOIN cross-schema (trip lê routing.route_students —
        // mesmo precedente da elegibilidade de check-in na 3.3a).
        try: async () => {
          const links = await prisma.routeStudent.findMany({
            where: { studentId, companyId: tenantId },
            select: { routeId: true },
          });
          if (links.length === 0) return null;
          return prisma.trip.findFirst({
            where: {
              companyId: tenantId,
              status: 'ACTIVE',
              type: 'RETURN',
              routeId: { in: links.map((l) => l.routeId) },
            },
            // Duas viagens de retorno ativas (resquício de seed/corrige-dado)
            // não podem deixar a escolha ao findFirst: a mais recente é a que
            // o aluno está vivendo.
            orderBy: { startedAt: 'desc' },
          });
        },
        catch: toInfraError('Erro ao buscar viagem de retorno ativa do aluno'),
      }),
      Effect.map((trip) => (trip as TripData) ?? null),
      Effect.orDie,
    );
  }
}
