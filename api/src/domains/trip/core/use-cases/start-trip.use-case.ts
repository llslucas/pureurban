import { Effect } from 'effect';
import { TripRepository } from '../ports/trip-repository.port.js';
import { RouteAccess } from '../ports/route-access.port.js';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { TripAlreadyActive, DriverNotAssigned } from '../errors/trip.errors.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { TripData } from '../ports/trip-repository.port.js';

export interface StartTripInput {
  driverId: string;
  routeId: string;
  tenantId: string;
  type: 'OUTBOUND' | 'RETURN';
  relatedTripId?: string;
}

export const startTrip = (
  input: StartTripInput,
): Effect.Effect<
  WithEvents<TripData>,
  TripAlreadyActive | DriverNotAssigned,
  TripRepository | RouteAccess
> =>
  Effect.gen(function* () {
    const repo = yield* TripRepository;
    const routeAccess = yield* RouteAccess;

    // Autorização antes de regra de estado: o routeId vem do cliente e a coluna
    // não tem FK, então sem esta checagem qualquer motorista poderia iniciar
    // viagem numa rota alheia e, por consequência, ler o roster dela pelo
    // GET /trips/:id/students, que autoriza por trip.driverId.
    const isAssigned = yield* routeAccess.isDriverAssignedToRoute(
      input.routeId,
      input.driverId,
      input.tenantId,
    );
    if (!isAssigned) {
      return yield* Effect.fail(
        new DriverNotAssigned({
          code: 'DRIVER_NOT_ASSIGNED',
          message: 'Motorista não está vinculado a esta rota',
        }),
      );
    }

    // Verificar se driver já tem viagem ativa
    const activeTrip = yield* repo.findActiveByDriver(
      input.driverId,
      input.tenantId,
    );
    if (activeTrip) {
      return yield* Effect.fail(
        new TripAlreadyActive({
          code: 'TRIP_ALREADY_ACTIVE',
          message: 'Motorista já possui uma viagem ativa',
          details: { activeTripId: activeTrip.id },
        }),
      );
    }

    const trip = yield* repo.create({
      companyId: input.tenantId,
      routeId: input.routeId,
      driverId: input.driverId,
      type: input.type,
      status: 'ACTIVE',
      startedAt: new Date(),
      relatedTripId: input.relatedTripId,
    });

    return withEvents(trip, [
      {
        type: 'trip.started',
        data: {
          tripId: trip.id,
          routeId: trip.routeId,
          driverId: trip.driverId,
          tripType: trip.type,
        },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
