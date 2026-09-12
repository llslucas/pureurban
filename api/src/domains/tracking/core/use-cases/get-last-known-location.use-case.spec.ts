import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { getLastKnownLocation } from './get-last-known-location.use-case.js';
import {
  TripAccess,
  TripAccessApi,
  ActiveTripView,
} from '../ports/trip-access.port.js';
import {
  LocationBus,
  LocationBusApi,
  LocationSample,
} from '../ports/location-bus.port.js';
import {
  TripNotActiveError,
  StudentNotOnTripError,
  NoLocationAvailableError,
} from '../errors/tracking.errors.js';

const activeTrip: ActiveTripView = {
  id: 'trip-1',
  routeId: 'route-1',
  driverId: 'driver-1',
};

const storedSample: LocationSample = {
  latitude: -20.755549,
  longitude: -42.881728,
  accuracy: 12.5,
  capturedAt: '2026-01-01T11:59:55.000Z',
};

const baseInput = {
  tripId: 'trip-1',
  companyId: 'company-1',
  studentId: 'student-1',
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

const run = (
  input: typeof baseInput,
  ports: Parameters<typeof makeLayer>[0] & Parameters<typeof makeLayer>[1],
) =>
  Effect.runPromise(
    getLastKnownLocation(input).pipe(Effect.provide(makeLayer(ports, ports))),
  );

const runEither = (
  input: typeof baseInput,
  ports: Parameters<typeof makeLayer>[0] & Parameters<typeof makeLayer>[1],
) =>
  Effect.runPromise(
    Effect.either(
      getLastKnownLocation(input).pipe(Effect.provide(makeLayer(ports, ports))),
    ),
  );

// Portas satisfeitas para o caminho feliz — cada teste sobrescreve só o que precisa.
const happyPorts = (
  sample: LocationSample | null = storedSample,
): Parameters<typeof makeLayer>[0] & Parameters<typeof makeLayer>[1] => ({
  findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(activeTrip)),
  isStudentOnRoute: vi.fn().mockReturnValue(Effect.succeed(true)),
  store: vi.fn(),
  latest: vi.fn().mockReturnValue(Effect.succeed(sample)),
  publish: vi.fn(),
});

describe('getLastKnownLocation', () => {
  it('deve devolver a última posição com tripId, coordenadas, accuracy e capturedAt ecoado', async () => {
    const ports = happyPorts();

    const result = await run(baseInput, ports);

    expect(result).toEqual({
      tripId: 'trip-1',
      latitude: storedSample.latitude,
      longitude: storedSample.longitude,
      accuracy: storedSample.accuracy,
      capturedAt: storedSample.capturedAt,
    });
    expect(ports.latest).toHaveBeenCalledWith('trip-1');
  });

  it('accuracy ausente na amostra: a resposta também não traz accuracy', async () => {
    const sample: LocationSample = {
      latitude: storedSample.latitude,
      longitude: storedSample.longitude,
      capturedAt: storedSample.capturedAt,
    };

    const result = await run(baseInput, happyPorts(sample));

    expect(result).toEqual({
      tripId: 'trip-1',
      latitude: storedSample.latitude,
      longitude: storedSample.longitude,
      capturedAt: storedSample.capturedAt,
    });
    expect('accuracy' in result).toBe(false);
  });

  it('deve falhar com NoLocationAvailableError (404) no miss — cache vazio ou TTL expirado', async () => {
    const ports = happyPorts(null);

    const result = await runEither(baseInput, ports);

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(NoLocationAvailableError);
      expect(result.left.code).toBe('NO_LOCATION_AVAILABLE');
      expect(result.left.httpStatus).toBe(404);
    }
  });

  it('deve falhar com TripNotActiveError (409) e NEM checar o aluno nem o cache', async () => {
    const ports = happyPorts();
    ports.findActiveTrip = vi.fn().mockReturnValue(Effect.succeed(null));

    const result = await runEither(baseInput, ports);

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotActiveError);
      expect(result.left.httpStatus).toBe(409);
    }
    expect(ports.isStudentOnRoute).not.toHaveBeenCalled();
    expect(ports.latest).not.toHaveBeenCalled();
  });

  it('deve falhar com StudentNotOnTripError (403) para aluno fora da rota e NÃO tocar o cache', async () => {
    const ports = happyPorts();
    ports.isStudentOnRoute = vi.fn().mockReturnValue(Effect.succeed(false));

    const result = await runEither(baseInput, ports);

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(StudentNotOnTripError);
      expect(result.left.code).toBe('STUDENT_NOT_ON_TRIP');
      expect(result.left.httpStatus).toBe(403);
    }
    expect(ports.latest).not.toHaveBeenCalled();
  });

  it('isStudentOnRoute recebe o routeId vindo da viagem, não do input', async () => {
    const ports = happyPorts();
    ports.findActiveTrip = vi
      .fn()
      .mockReturnValue(
        Effect.succeed({ ...activeTrip, routeId: 'route-da-viagem' }),
      );

    await run(baseInput, ports);

    expect(ports.isStudentOnRoute).toHaveBeenCalledWith(
      'student-1',
      'route-da-viagem',
      'company-1',
    );
  });

  it('ordem: viagem inativa vence aluno fora da rota ⇒ TripNotActiveError', async () => {
    const ports = happyPorts();
    ports.findActiveTrip = vi.fn().mockReturnValue(Effect.succeed(null));
    ports.isStudentOnRoute = vi.fn().mockReturnValue(Effect.succeed(false));

    const result = await runEither(baseInput, ports);

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(TripNotActiveError);
    }
  });
});
