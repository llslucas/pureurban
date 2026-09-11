import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  TripAccessApi,
  ActiveTripView,
  ActiveReturnTripView,
} from '../../core/ports/trip-access.port.js';
import { toInfraError } from '../../../shared/shell/infra/to-infra-error.js';


// Select shared by both reminder-scan reads (4.4).
const returnTripSelect = {
  id: true,
  companyId: true,
  routeId: true,
  driverId: true,
  relatedTripId: true,
  startedAt: true,
} as const;

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
            // driverId volta como dado, não como filtro: quem compara é o core,
            // para poder distinguir DRIVER_NOT_ASSIGNED de TRIP_NOT_ACTIVE.
            select: { id: true, routeId: true, driverId: true },
          }),
        catch: toInfraError('Falha ao verificar viagem ativa'),
      }),
      Effect.orDie,
    );
  }

  // Direct cross-schema read (trip ← boarding), sanctioned by the
  // PrismaStudentEligibilityAdapter pattern — no JOIN, separate query per schema.
  findActiveReturnTrips(): Effect.Effect<ActiveReturnTripView[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.trip.findMany({
            // System-wide sweep: NO company filter — each trip's own companyId
            // feeds the scan's next steps.
            where: { type: 'RETURN', status: 'ACTIVE' },
            select: returnTripSelect,
          }),
        catch: toInfraError('Falha ao listar viagens de retorno ativas'),
      }),
      Effect.orDie,
    );
  }

  findActiveReturnTripById(
    tripId: string,
    companyId: string,
  ): Effect.Effect<ActiveReturnTripView | null> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.trip.findFirst({
            where: { id: tripId, companyId, type: 'RETURN', status: 'ACTIVE' },
            select: returnTripSelect,
          }),
        catch: toInfraError('Falha ao buscar viagem de retorno ativa'),
      }),
      Effect.orDie,
    );
  }
}
