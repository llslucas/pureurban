import { Effect } from 'effect';
import { TripAccess } from '../ports/trip-access.port.js';
import { LocationBus } from '../ports/location-bus.port.js';
import {
  TripNotActiveError,
  StudentNotOnTripError,
  NoLocationAvailableError,
} from '../errors/tracking.errors.js';
import type { LocationSample } from '../ports/location-bus.port.js';

export type LastKnownLocation = LocationSample & { tripId: string };

// Ordem fixada pela I/O Matrix da 5.0: viagem ativa (409) → aluno na rota
// (403) → última posição (404 no miss). Espelha a ordem do ingest.
export const getLastKnownLocation = (input: {
  tripId: string;
  companyId: string;
  studentId: string;
}): Effect.Effect<
  LastKnownLocation,
  TripNotActiveError | StudentNotOnTripError | NoLocationAvailableError,
  TripAccess | LocationBus
> =>
  Effect.gen(function* () {
    const tripAccess = yield* TripAccess;
    const locationBus = yield* LocationBus;

    const trip = yield* tripAccess.findActiveTrip(
      input.tripId,
      input.companyId,
    );
    if (!trip) {
      return yield* Effect.fail(TripNotActiveError.create());
    }

    const onRoute = yield* tripAccess.isStudentOnRoute(
      input.studentId,
      trip.routeId,
      input.companyId,
    );
    if (!onRoute) {
      return yield* Effect.fail(StudentNotOnTripError.create());
    }

    const location = yield* locationBus.latest(input.tripId);
    if (!location) {
      return yield* Effect.fail(NoLocationAvailableError.create());
    }

    return { tripId: input.tripId, ...location };
  });
