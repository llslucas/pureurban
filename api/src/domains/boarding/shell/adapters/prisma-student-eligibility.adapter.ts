import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type { StudentEligibilityApi } from '../../core/ports/student-eligibility.port.js';

const toInfraError = (msg: string) => (e: unknown) =>
  new Error(`${msg}: ${String(e)}`);

@Injectable()
export class PrismaStudentEligibilityAdapter implements StudentEligibilityApi {
  constructor(private readonly prisma: PrismaService) {}

  // Duas queries separadas, sem JOIN cross-schema (boarding lê auth.users e
  // routing.route_students diretamente — permitido, ver Dev Notes da story)
  isAllowedOnRoute(
    studentId: string,
    routeId: string,
    companyId: string,
  ): Effect.Effect<boolean> {
    const prisma = this.prisma;
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const [student, link] = await Promise.all([
            prisma.user.findFirst({
              where: {
                id: studentId,
                companyId,
                role: 'STUDENT',
                isActive: true,
              },
              select: { id: true },
            }),
            prisma.routeStudent.findFirst({
              where: { routeId, studentId, companyId },
              select: { id: true },
            }),
          ]);
          return Boolean(student && link);
        },
        catch: toInfraError('Falha ao verificar elegibilidade do aluno'),
      }),
      Effect.orDie,
    );
  }
}
