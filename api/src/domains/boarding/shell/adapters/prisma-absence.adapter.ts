import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  AbsenceRepositoryApi,
  BoardingAbsenceData,
  CreateAbsenceResult,
} from '../../core/ports/absence-repository.port.js';

const toInfraError = (msg: string) => (e: unknown) =>
  new Error(`${msg}: ${String(e)}`);

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

type CreateOutcome =
  | { kind: 'ok'; record: BoardingAbsenceData }
  | { kind: 'unique_violation' };

@Injectable()
export class PrismaAbsenceAdapter implements AbsenceRepositoryApi {
  constructor(private readonly prisma: PrismaService) {}

  findByIdempotencyKey(
    idempotencyKey: string,
    companyId: string,
  ): Effect.Effect<BoardingAbsenceData | null> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.boardingAbsence.findFirst({
            // companyId sempre presente — isolamento multi-tenant é absoluto.
            where: { idempotencyKey, companyId },
          }),
        catch: toInfraError('Falha ao buscar ausência por idempotency key'),
      }),
      Effect.orDie,
    );
  }

  findActiveByTripAndStudent(
    tripId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<BoardingAbsenceData | null> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.boardingAbsence.findFirst({
            where: { tripId, studentId, companyId, cancelledAt: null },
          }),
        catch: toInfraError('Falha ao buscar ausência ativa do aluno'),
      }),
      Effect.orDie,
    );
  }

  findActiveByTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<BoardingAbsenceData[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.boardingAbsence.findMany({
            where: { tripId, companyId, cancelledAt: null },
          }),
        catch: toInfraError('Falha ao buscar ausências ativas da viagem'),
      }),
      Effect.orDie,
    );
  }

  create(data: {
    companyId: string;
    tripId: string;
    studentId: string;
    idempotencyKey: string;
    notifiedAt: Date;
    cancellableUntil: Date;
  }): Effect.Effect<CreateAbsenceResult> {
    const findExisting = () =>
      this.findByIdempotencyKey(data.idempotencyKey, data.companyId);

    return Effect.gen(this, function* (this: PrismaAbsenceAdapter) {
      const outcome = yield* pipe(
        Effect.tryPromise<CreateOutcome, Error>({
          try: async () => {
            try {
              const record = await this.prisma.boardingAbsence.create({ data });
              return { kind: 'ok', record };
            } catch (e) {
              if (isUniqueViolation(e)) {
                return { kind: 'unique_violation' };
              }
              throw e;
            }
          },
          catch: toInfraError('Falha ao registrar ausência'),
        }),
        Effect.orDie,
      );

      if (outcome.kind === 'ok') {
        return { created: true, record: outcome.record };
      }

      // A tabela tem UM único constraint ([companyId, idempotencyKey]) — a regra
      // "uma ausência ativa por (tripId, studentId)" é aplicacional, não unique
      // (Design Notes da 4.1). Violá-lo só pode ser corrida de replay: quem
      // venceu já registrou, e a releitura pela key devolve o registro original.
      // Julgar conflito de payload é papel do use case.
      const existing = yield* findExisting();
      if (!existing) {
        return yield* Effect.die(
          new Error(
            'Violação de unique sem registro correspondente em boarding_absences',
          ),
        );
      }
      return { created: false, record: existing };
    });
  }
}
