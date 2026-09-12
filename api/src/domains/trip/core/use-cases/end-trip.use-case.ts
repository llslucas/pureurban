import { Effect } from 'effect';
import { TripRepository } from '../ports/trip-repository.port.js';
import { withEvents } from '../../../shared/core/events/with-events.js';
import {
  TripNotFound,
  InvalidTripTransition,
  DriverNotAssigned,
} from '../errors/trip.errors.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { TripData } from '../ports/trip-repository.port.js';

export interface EndTripInput {
  tripId: string;
  driverId: string;
  tenantId: string;
}

export const endTrip = (
  input: EndTripInput,
): Effect.Effect<
  WithEvents<TripData>,
  TripNotFound | InvalidTripTransition | DriverNotAssigned,
  TripRepository
> =>
  Effect.gen(function* () {
    const repo = yield* TripRepository;

    // Buscar viagem e validar que pertence ao driver e está ACTIVE
    const trip = yield* repo.findById(input.tripId, input.tenantId);

    // Mesmo disclosure do get-trip-students (DS6/AI4 da retro 3): viagem de
    // outro motorista é 403 DRIVER_NOT_ASSIGNED nos dois. O 404 não-disclosure
    // da review 3.1 dividia o mesmo domínio em dois oráculos diferentes para a
    // mesma condição — e o app mobile trata DRIVER_NOT_ASSIGNED como estado de
    // tela. 404 segue reservado a inexistente/outra empresa (findById é
    // tenant-scoped).
    if (trip.driverId !== input.driverId) {
      return yield* Effect.fail(
        new DriverNotAssigned({
          code: 'DRIVER_NOT_ASSIGNED',
          message: 'Motorista não é o responsável por esta viagem',
        }),
      );
    }

    if (trip.status !== 'ACTIVE') {
      return yield* Effect.fail(
        new InvalidTripTransition({
          code: 'TRIP_NOT_ACTIVE',
          message: 'Viagem não está ativa e não pode ser encerrada',
          details: { tripId: trip.id, currentStatus: trip.status },
        }),
      );
    }

    const updatedTrip = yield* repo.update(
      input.tripId,
      {
        status: 'COMPLETED',
        endedAt: new Date(),
      },
      input.tenantId,
    );

    return withEvents(updatedTrip, [
      {
        type: 'trip.ended',
        data: {
          tripId: updatedTrip.id,
          routeId: updatedTrip.routeId,
          driverId: updatedTrip.driverId,
        },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
