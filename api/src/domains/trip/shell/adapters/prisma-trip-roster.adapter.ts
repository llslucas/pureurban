import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  TripRosterApi,
  RosterStudent,
} from '../../core/ports/trip-roster.port.js';

const toInfraError = (msg: string) => (e: unknown) =>
  new Error(`${msg}: ${String(e)}`);

@Injectable()
export class PrismaTripRosterAdapter implements TripRosterApi {
  constructor(private readonly prisma: PrismaService) {}

  // Duas queries separadas, sem JOIN cross-schema (trip lê routing.route_students
  // e auth.users diretamente — permitido, ver Dev Notes da story)
  findRouteStudents(
    routeId: string,
    companyId: string,
  ): Effect.Effect<RosterStudent[]> {
    const prisma = this.prisma;
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const links = await prisma.routeStudent.findMany({
            where: { routeId, companyId },
            select: { studentId: true },
          });
          if (links.length === 0) return [];

          const students = await prisma.user.findMany({
            where: {
              id: { in: links.map((l) => l.studentId) },
              companyId,
              role: 'STUDENT',
              isActive: true,
            },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          });

          return students.map((s) => ({ studentId: s.id, name: s.name }));
        },
        catch: toInfraError('Falha ao buscar alunos da rota'),
      }),
      Effect.orDie,
    );
  }
}
