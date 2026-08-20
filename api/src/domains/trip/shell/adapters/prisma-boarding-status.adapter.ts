import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  BoardingStatusApi,
  CheckedInStudent,
} from '../../core/ports/boarding-status.port.js';

const toInfraError = (msg: string) => (e: unknown) =>
  new Error(`${msg}: ${String(e)}`);

@Injectable()
export class PrismaBoardingStatusAdapter implements BoardingStatusApi {
  constructor(private readonly prisma: PrismaService) {}

  // Adapter de trip/shell lendo boarding.boarding_records — permitido e
  // intencional, ver Dev Notes da story (fronteira na direção oposta da 3.3a)
  findCheckedInByTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<CheckedInStudent[]> {
    const prisma = this.prisma;
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const records = await prisma.boardingRecord.findMany({
            where: { tripId, companyId },
            select: { studentId: true, checkedInAt: true },
          });
          if (records.length === 0) return [];

          // Segunda query, sem JOIN cross-schema — mesma forma do roster.
          // Sem `isActive` no where: um aluno desativado depois de embarcar
          // continua a bordo e precisa continuar visível para o motorista.
          const students = await prisma.user.findMany({
            where: { id: { in: records.map((r) => r.studentId) }, companyId },
            select: { id: true, name: true },
          });
          const nameById = new Map(students.map((s) => [s.id, s.name]));

          return records.map((r) => ({
            studentId: r.studentId,
            name: nameById.get(r.studentId) ?? '',
            checkedInAt: r.checkedInAt,
          }));
        },
        catch: toInfraError('Falha ao buscar check-ins da viagem'),
      }),
      Effect.orDie,
    );
  }
}
