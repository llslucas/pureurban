import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { getActiveTrackingTrip } from './get-active-tracking-trip.use-case.js';
import {
  TripAccess,
  TripAccessApi,
  ActiveTripView,
  ActiveTrackingTripView,
} from '../ports/trip-access.port.js';

const activeTrip: ActiveTripView = {
  id: 'trip-1',
  routeId: 'route-1',
  driverId: 'driver-1',
};

function makeLayer(tripAccess: Partial<TripAccessApi>) {
  return Layer.succeed(TripAccess, tripAccess as TripAccessApi);
}

const run = (
  input: { studentId: string; companyId: string },
  ports: Partial<TripAccessApi>,
) =>
  Effect.runPromise(
    getActiveTrackingTrip(input).pipe(Effect.provide(makeLayer(ports))),
  );

// Porta satisfeita para o caminho feliz — cada teste sobrescreve só o que precisa.
const happyPorts = (
  found: ActiveTrackingTripView | null = {
    tripId: 'trip-1',
    type: 'OUTBOUND',
  },
): Partial<TripAccessApi> => ({
  findActiveTrip: vi.fn().mockReturnValue(Effect.succeed(activeTrip)),
  findActiveTripForStudent: vi.fn().mockReturnValue(Effect.succeed(found)),
  isStudentOnRoute: vi.fn().mockReturnValue(Effect.succeed(true)),
});

describe('getActiveTrackingTrip', () => {
  it('deve devolver a viagem ativa (ida) da rota do aluno com { tripId, type }', async () => {
    const ports = happyPorts({ tripId: 'trip-1', type: 'OUTBOUND' });

    const result = await run(
      { studentId: 'student-1', companyId: 'company-1' },
      ports,
    );

    expect(result).toEqual({ tripId: 'trip-1', type: 'OUTBOUND' });
    expect(ports.findActiveTripForStudent).toHaveBeenCalledWith(
      'student-1',
      'company-1',
    );
  });

  it('deve devolver a viagem de retorno ativa — qualquer perna serve ao acompanhamento', async () => {
    const ports = happyPorts({ tripId: 'trip-2', type: 'RETURN' });

    const result = await run(
      { studentId: 'student-1', companyId: 'company-1' },
      ports,
    );

    expect(result).toEqual({ tripId: 'trip-2', type: 'RETURN' });
  });

  it('sem viagem ativa: null resolvido (200 { data: null }), não erro', async () => {
    const ports = happyPorts(null);

    const result = await run(
      { studentId: 'student-1', companyId: 'company-1' },
      ports,
    );

    expect(result).toBeNull();
  });

  it('aluno sem rota: o null vem do port, sem erro tagueado no core', async () => {
    // A autorização implícita é a própria query (RouteStudent → Trip): o core
    // não tem o que falhar — fora de rota é indistinguível de sem viagem.
    const ports = happyPorts(null);

    const result = await run(
      { studentId: 'outsider', companyId: 'company-1' },
      ports,
    );

    expect(result).toBeNull();
    expect(ports.findActiveTripForStudent).toHaveBeenCalledWith(
      'outsider',
      'company-1',
    );
  });
});
