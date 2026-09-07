import { Effect } from 'effect';
import { TripRepository } from '../ports/trip-repository.port.js';
import { RouteAccess } from '../ports/route-access.port.js';
import { withEvents } from '../../../shared/core/events/with-events.js';
import {
  TripAlreadyActive,
  DriverNotAssigned,
  InvalidTripTransition,
} from '../errors/trip.errors.js';
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
  TripAlreadyActive | DriverNotAssigned | InvalidTripTransition,
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

    // AC3: uma viagem de retorno só existe atrelada à viagem de ida. Sem o
    // vínculo, uma RETURN vira uma OUTBOUND disfarçada — o campo `relatedTripId`
    // é o único mecanismo que liga ida ↔ volta. `relatedTripId` num OUTBOUND é
    // descartado: não há a que atrelar.
    const relatedTripId =
      input.type === 'RETURN' ? input.relatedTripId : undefined;
    if (input.type === 'RETURN' && !relatedTripId) {
      return yield* Effect.fail(
        new InvalidTripTransition({
          code: 'RETURN_REQUIRES_RELATED_TRIP',
          message: 'Viagem de retorno exige o id da viagem de ida',
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
      relatedTripId,
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
