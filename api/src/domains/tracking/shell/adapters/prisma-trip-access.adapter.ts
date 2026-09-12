import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  TripAccessApi,
  ActiveTripView,
  ActiveTrackingTripView,
} from '../../core/ports/trip-access.port.js';
import { toInfraError } from '../../../shared/shell/infra/to-infra-error.js';

@Injectable()
export class PrismaTripAccessAdapter implements TripAccessApi {
  constructor(private readonly prisma: PrismaService) {}

  findActiveTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<ActiveTripView | null> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.trip.findFirst({
            where: { id: tripId, companyId, status: 'ACTIVE' },
            select: { id: true, routeId: true, driverId: true },
          }),
        catch: toInfraError('Falha ao verificar viagem ativa'),
      }),
      Effect.orDie,
    );
  }

  // Duas queries, sem JOIN cross-schema (tracking lê routing.route_students e
  // trip.trips diretamente — mesmo padrão do isStudentOnRoute abaixo).
  findActiveTripForStudent(
    studentId: string,
    companyId: string,
  ): Effect.Effect<ActiveTrackingTripView | null> {
    const prisma = this.prisma;
    return pipe(
      Effect.tryPromise({
        try: async () => {
          const links = await prisma.routeStudent.findMany({
            where: { studentId, companyId },
            select: { routeId: true },
          });
          if (links.length === 0) return null;

          const trip = await prisma.trip.findFirst({
            // Mais recente vence: duas ativas na mesma rota acontecem no fluxo
            // normal (iniciar a volta sem encerrar a ida), e a "agora" é a que
            // o aluno acompanharia. startedAt empatado (mesmo segundo) cai no
            // tiebreak por id — escolha determinística.
            where: {
              routeId: { in: links.map((link) => link.routeId) },
              companyId,
              status: 'ACTIVE',
            },
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            select: { id: true, type: true },
          });
          if (!trip) return null;

          return { tripId: trip.id, type: trip.type };
        },
        catch: toInfraError('Falha ao buscar viagem ativa do aluno'),
      }),
      Effect.orDie,
    );
  }

  // Duas queries separadas, sem JOIN cross-schema (tracking lê auth.users e
  // routing.route_students diretamente — mesmo padrão do boarding).
  isStudentOnRoute(
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
        catch: toInfraError('Falha ao verificar aluno na rota'),
      }),
      Effect.orDie,
    );
  }
}
