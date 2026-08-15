import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  TripAccessApi,
  ActiveTripView,
} from '../../core/ports/trip-access.port.js';

const toInfraError = (msg: string) => (e: unknown) =>
  new Error(`${msg}: ${String(e)}`);

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
}
