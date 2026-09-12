import { Clock, Effect } from 'effect';
import { TripAccess } from '../ports/trip-access.port.js';
import {
  LocationBus,
  type LocationSample,
  type LocationUpdatedEvent,
} from '../ports/location-bus.port.js';
import {
  TripNotActiveError,
  DriverNotOnTripError,
} from '../errors/tracking.errors.js';
import type { LocationIngestInput } from '../schemas/location-ingest.schema.js';

export interface IngestLocationResult {
  tripId: string;
  receivedAt: string;
}

// Ordem fixada pela I/O Matrix da 5.0: viagem ativa (409) → motorista
// atribuído (403) → store + publish. Uma posição só entra no Redis em viagem
// ativa do motorista certo.
export const ingestLocation = (
  input: LocationIngestInput & {
    companyId: string;
    driverId: string;
  },
): Effect.Effect<
  IngestLocationResult,
  TripNotActiveError | DriverNotOnTripError,
  TripAccess | LocationBus | Clock.Clock
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

    if (trip.driverId !== input.driverId) {
      return yield* Effect.fail(DriverNotOnTripError.create());
    }

    // Uma única leitura de relógio por ingestão: receivedAt (ack) e o timestamp
    // do evento publicado são o MESMO instante do servidor — nunca o capturedAt
    // do device, que é só ecoado no cache.
    const now = new Date(yield* Clock.currentTimeMillis).toISOString();

    // accuracy só entra quando o device a mandou (amostra e evento carregam
    // exatamente as mesmas coordenadas — o eco da 5.0).
    const sample: LocationSample = {
      latitude: input.latitude,
      longitude: input.longitude,
      capturedAt: input.capturedAt,
    };
    const eventData: LocationUpdatedEvent['data'] = {
      tripId: input.tripId,
      latitude: input.latitude,
      longitude: input.longitude,
      timestamp: now,
    };
    if (input.accuracy !== undefined) {
      sample.accuracy = input.accuracy;
      eventData.accuracy = input.accuracy;
    }

    yield* locationBus.store(input.tripId, sample);
    yield* locationBus.publish(input.tripId, {
      type: 'location.updated',
      data: eventData,
    });

    return { tripId: input.tripId, receivedAt: now };
  });
