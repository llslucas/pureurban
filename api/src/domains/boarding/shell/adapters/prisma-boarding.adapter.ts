import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  BoardingRepositoryApi,
  BoardingRecordData,
  CheckInSummary,
  RecordCheckInResult,
} from '../../core/ports/boarding-repository.port.js';
import { DuplicateCheckInError } from '../../core/errors/boarding.errors.js';
import { toInfraError } from '../../../shared/shell/infra/to-infra-error.js';

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

type CreateOutcome =
  | { kind: 'ok'; record: BoardingRecordData }
  | { kind: 'unique_violation' };

@Injectable()
export class PrismaBoardingAdapter implements BoardingRepositoryApi {
  constructor(private readonly prisma: PrismaService) {}

  findByIdempotencyKey(
    idempotencyKey: string,
    companyId: string,
  ): Effect.Effect<BoardingRecordData | null> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.boardingRecord.findFirst({
            // companyId sempre presente — isolamento multi-tenant é absoluto.
            where: { idempotencyKey, companyId },
          }),
        catch: toInfraError('Falha ao buscar check-in por idempotency key'),
      }),
      Effect.orDie,
    );
  }

  findCheckInByTripAndStudent(
    tripId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<BoardingRecordData | null> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.boardingRecord.findFirst({
            where: { tripId, studentId, companyId },
          }),
        catch: toInfraError('Falha ao buscar check-in do aluno na viagem'),
      }),
      Effect.orDie,
    );
  }

  recordCheckIn(data: {
    companyId: string;
    tripId: string;
    studentId: string;
    recordedBy: string;
    idempotencyKey: string;
    checkedInAt: Date;
  }): Effect.Effect<RecordCheckInResult, DuplicateCheckInError> {
    const findExisting = () =>
      this.findByIdempotencyKey(data.idempotencyKey, data.companyId);

    return Effect.gen(this, function* (this: PrismaBoardingAdapter) {
      const outcome = yield* pipe(
        Effect.tryPromise<CreateOutcome, Error>({
          try: async () => {
            try {
              const record = await this.prisma.boardingRecord.create({ data });
              return { kind: 'ok', record };
            } catch (e) {
              if (isUniqueViolation(e)) {
                return { kind: 'unique_violation' };
              }
              throw e;
            }
          },
          catch: toInfraError('Falha ao registrar check-in'),
        }),
        Effect.orDie,
      );

      if (outcome.kind === 'ok') {
        return { created: true, record: outcome.record };
      }

      // A tabela tem exatamente dois constraints únicos, então uma releitura
      // pela idempotency key decide qual deles estourou — sem depender do
      // formato de P2002.meta.target, que nesta stack (Prisma 7 +
      // @prisma/adapter-pg) vem vazio e cujos campos só existem em
      // meta.driverAdapterError.cause.constraint.fields, um detalhe interno do
      // driver. Também elimina a ambiguidade quando a MESMA key é reenviada
      // para o MESMO par [tripId, studentId]: aí os dois constraints são
      // violados de uma vez e o Postgres reporta apenas um, à sua escolha.
      //
      //   achou  ⇒ foi o constraint de idempotência: corrida de replay, e quem
      //            venceu já registrou o embarque. Sucesso, sem duplicar.
      //   não achou ⇒ só pode ter sido [tripId, studentId]: check-in duplicado
      //            do mesmo aluno com key diferente.
      const existing = yield* findExisting();
      if (existing) {
        return { created: false, record: existing };
      }
      return yield* Effect.fail(DuplicateCheckInError.create());
    });
  }

  findCheckInsByTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<CheckInSummary[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.boardingRecord.findMany({
            where: { tripId, companyId },
            select: { studentId: true, checkedInAt: true },
          }),
        catch: toInfraError('Falha ao buscar check-ins da viagem'),
      }),
      Effect.orDie,
    );
  }
}
