import { Effect } from 'effect';
import { TripRepository } from '../ports/trip-repository.port.js';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { TripNotFound, InvalidTripTransition } from '../errors/trip.errors.js';
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
  TripNotFound | InvalidTripTransition,
  TripRepository
> =>
  Effect.gen(function* () {
    const repo = yield* TripRepository;

    // Buscar viagem e validar que pertence ao driver e está ACTIVE
    const trip = yield* repo.findById(input.tripId, input.tenantId);

    // Viagem de outro motorista responde como inexistente: um 404 não revela a
    // um motorista que a viagem existe, e "não é sua" não é uma transição de
    // estado inválida (era 400 antes) — é falta de autorização.
    if (trip.driverId !== input.driverId) {
      return yield* Effect.fail(
        new TripNotFound({
          code: 'TRIP_NOT_FOUND',
          message: `Viagem com id ${input.tripId} não encontrada`,
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
