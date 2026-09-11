import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  ReminderRepositoryApi,
  BoardingReminderData,
  CreateReminderResult,
} from '../../core/ports/reminder-repository.port.js';
import { toInfraError } from '../../../shared/shell/infra/to-infra-error.js';


const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

type CreateOutcome =
  | { kind: 'ok'; record: BoardingReminderData }
  | { kind: 'unique_violation' };

@Injectable()
export class PrismaReminderAdapter implements ReminderRepositoryApi {
  constructor(private readonly prisma: PrismaService) {}

  findByTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<BoardingReminderData[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.boardingReminder.findMany({
            // companyId always present — multi-tenant isolation is absolute.
            where: { tripId, companyId },
          }),
        catch: toInfraError('Falha ao buscar lembretes da viagem'),
      }),
      Effect.orDie,
    );
  }

  findByTripAndStudent(
    tripId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<BoardingReminderData | null> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.boardingReminder.findFirst({
            where: { tripId, studentId, companyId },
          }),
        catch: toInfraError('Falha ao buscar lembrete do aluno na viagem'),
      }),
      Effect.orDie,
    );
  }

  create(data: {
    companyId: string;
    tripId: string;
    studentId: string;
    remindedAt: Date;
  }): Effect.Effect<CreateReminderResult> {
    const findExisting = () =>
      this.findByTripAndStudent(data.tripId, data.studentId, data.companyId);

    return Effect.gen(this, function* (this: PrismaReminderAdapter) {
      const outcome = yield* pipe(
        Effect.tryPromise<CreateOutcome, Error>({
          try: async () => {
            try {
              const record = await this.prisma.boardingReminder.create({
                data,
              });
              return { kind: 'ok', record };
            } catch (e) {
              if (isUniqueViolation(e)) {
                return { kind: 'unique_violation' };
              }
              throw e;
            }
          },
          catch: toInfraError('Falha ao registrar lembrete'),
        }),
        Effect.orDie,
      );

      if (outcome.kind === 'ok') {
        return { created: true, record: outcome.record };
      }

      // The table has ONE unique constraint ([tripId, studentId]) — violating
      // it can only be a race between scan executions (another tick/instance
      // created first and already emitted the event). The re-read returns the
      // original row with created: false and the use case emits nothing — once
      // per student per trip, without depending on P2002.meta.target's format
      // (empty in this stack, see prisma-boarding.adapter.ts).
      const existing = yield* findExisting();
      if (!existing) {
        return yield* Effect.die(
          new Error(
            'Violação de unique sem registro correspondente em boarding_reminders',
          ),
        );
      }
      return { created: false, record: existing };
    });
  }
}
