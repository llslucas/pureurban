import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer, Runtime } from 'effect';
import { ingestLocation } from './ingest-location.use-case.js';
import { createTestClock } from '../../../shared/testing/test-clock.js';
import {
  TripAccess,
  TripAccessApi,
  ActiveTripView,
} from '../ports/trip-access.port.js';
import {
  LocationBus,
  LocationBusApi,
  LocationSample,
  LocationUpdatedEvent,
} from '../ports/location-bus.port.js';
import {
  TripNotActiveError,
  DriverNotOnTripError,
} from '../errors/tracking.errors.js';

// now pinned by the TestClock: receivedAt e o timestamp do evento saem do
// MESMO instante, então a igualdade exata é assertável.
const NOW = new Date('2026-01-01T12:00:00.000Z');

const activeTrip: ActiveTripView = {
  id: 'trip-1',
  routeId: 'route-1',
  driverId: 'driver-1',
};

const baseInput = {
  tripId: 'trip-1',
  latitude: -20.755549,
  longitude: -42.881728,
  accuracy: 12.5,
  capturedAt: '2026-01-01T11:59:55.000Z',
  companyId: 'company-1',
  driverId: 'driver-1',
};

const storedSample: LocationSample = {
  latitude: baseInput.latitude,
  longitude: baseInput.longitude,
  accuracy: baseInput.accuracy,
  capturedAt: baseInput.capturedAt,
};

function makeLayer(
  tripAccess: Partial<TripAccessApi>,
  locationBus: Partial<LocationBusApi>,
) {
  return Layer.mergeAll(
    Layer.succeed(TripAccess, tripAccess as TripAccessApi),
    Layer.succeed(LocationBus, locationBus as LocationBusApi),
  );
}

// O Runtime do TestClock (shared/testing) já carrega o Clock injetado — é ele
// que satisfaz o requisito `Clock.Clock` do use case.
const { runtime: getRuntime, setClock } = createTestClock();

type Ports = {
  tripAccess: Partial<TripAccessApi>;
  locationBus: Partial<LocationBusApi>;
};

// O tipo do use case: accuracy é opcional nele, então testes sem o campo são
// válidos (o objeto base completo só é o caminho feliz).
type IngestInput = Parameters<typeof ingestLocation>[0];

const run = async (input: IngestInput, ports: Ports) => {
  await setClock(NOW);
  const runtime = await getRuntime();
  return Runtime.runPromise(runtime)(
    ingestLocation(input).pipe(
      Effect.provide(makeLayer(ports.tripAccess, ports.locationBus)),
    ),
  );
};

const runEither = async (input: IngestInput, ports: Ports) =>
  Runtime.runPromise(await getRuntime())(
    Effect.either(
      ingestLocation(input).pipe(
        Effect.provide(makeLayer(ports.tripAccess, ports.locationBus)),
      ),
    ),
  );

// Portas satisfeitas para o caminho feliz — cada teste sobrescreve só o que precisa.
const happyTrip = (): Partial<TripAccessApi> => ({
  findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(activeTrip)),
});

const happyBus = (): Partial<LocationBusApi> => ({
  store: vi.fn().mockReturnValue(Effect.succeed(undefined)),
  publish: vi.fn().mockReturnValue(Effect.succeed(undefined)),
  latest: vi.fn(),
});

describe('ingestLocation', () => {
  it('deve armazenar a posição, publicar o evento e ackar com receivedAt do servidor', async () => {
    const locationBus = happyBus();

    const result = await run(baseInput, {
      tripAccess: happyTrip(),
      locationBus,
    });

    expect(result).toEqual({
      tripId: 'trip-1',
      receivedAt: NOW.toISOString(),
    });
    expect(locationBus.store).toHaveBeenCalledOnce();
    expect(locationBus.store).toHaveBeenCalledWith('trip-1', storedSample);
  });

  it('o evento publicado carrega o envelope {type, data} com o MESMO instante do receivedAt', async () => {
    const locationBus = happyBus();

    const result = await run(baseInput, {
      tripAccess: happyTrip(),
      locationBus,
    });

    const expectedEvent: LocationUpdatedEvent = {
      type: 'location.updated',
      data: {
        tripId: 'trip-1',
        latitude: baseInput.latitude,
        longitude: baseInput.longitude,
        accuracy: baseInput.accuracy,
        timestamp: NOW.toISOString(),
      },
    };
    expect(locationBus.publish).toHaveBeenCalledOnce();
    expect(locationBus.publish).toHaveBeenCalledWith('trip-1', expectedEvent);
    // O ack e o evento compartilham a única leitura de relógio da ingestão.
    expect(result.receivedAt).toBe(
      vi.mocked(locationBus.publish!).mock.calls[0][1].data.timestamp,
    );
  });

  it('accuracy ausente: não entra como undefined no cache nem no evento', async () => {
    const locationBus = happyBus();
    const input: IngestInput = {
      tripId: baseInput.tripId,
      latitude: baseInput.latitude,
      longitude: baseInput.longitude,
      capturedAt: baseInput.capturedAt,
      companyId: baseInput.companyId,
      driverId: baseInput.driverId,
    };

    await run(input, { tripAccess: happyTrip(), locationBus });

    expect(vi.mocked(locationBus.store!).mock.calls[0][1]).toEqual({
      latitude: baseInput.latitude,
      longitude: baseInput.longitude,
      capturedAt: baseInput.capturedAt,
    });
    const event = vi.mocked(locationBus.publish!).mock.calls[0][1];
    expect('accuracy' in event.data).toBe(false);
  });

  it('o capturedAt do device é ecoado intacto — o servidor não o sobrescreve', async () => {
    const locationBus = happyBus();
    const staleCapturedAt = '2026-01-01T09:00:00.000Z';

    await run(
      { ...baseInput, capturedAt: staleCapturedAt },
      { tripAccess: happyTrip(), locationBus },
    );

    const sample = vi.mocked(locationBus.store!).mock.calls[0][1];
    expect(sample.capturedAt).toBe(staleCapturedAt);
  });

  it('deve falhar com TripNotActiveError (409) quando a viagem não está ativa e NÃO tocar o Redis', async () => {
    const locationBus = happyBus();

    const result = await runEither(baseInput, {
      tripAccess: {
        findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)),
      },
      locationBus,
    });

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotActiveError);
      expect(result.left.code).toBe('TRIP_NOT_ACTIVE');
      expect(result.left.httpStatus).toBe(409);
    }
    expect(locationBus.store).not.toHaveBeenCalled();
    expect(locationBus.publish).not.toHaveBeenCalled();
  });

  it('deve falhar com DriverNotOnTripError (403) quando o motorista não é o atribuído e NÃO tocar o Redis', async () => {
    const locationBus = happyBus();

    const result = await runEither(
      { ...baseInput, driverId: 'outro-motorista' },
      { tripAccess: happyTrip(), locationBus },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(DriverNotOnTripError);
      expect(result.left.code).toBe('DRIVER_NOT_ON_TRIP');
      expect(result.left.httpStatus).toBe(403);
    }
    expect(locationBus.store).not.toHaveBeenCalled();
    expect(locationBus.publish).not.toHaveBeenCalled();
  });

  it('ordem: viagem inativa vence motorista errado ⇒ TripNotActiveError', async () => {
    const result = await runEither(
      { ...baseInput, driverId: 'outro-motorista' },
      {
        tripAccess: {
          findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(null)),
        },
        locationBus: happyBus(),
      },
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotActiveError);
    }
  });
});
