import { Effect } from 'effect';
import { TripAccess } from '../ports/trip-access.port.js';
import type { ActiveTrackingTripView } from '../ports/trip-access.port.js';

export type ActiveTrackingTrip = ActiveTrackingTripView;

// Descoberta da viagem a acompanhar (5.2): a viagem ativa de qualquer perna
// na rota do aluno, sem regra de autorização própria — aluno fora de rota é
// simplesmente sem viagem (null), porque a query já nasce do vínculo dele.
export const getActiveTrackingTrip = (input: {
  studentId: string;
  companyId: string;
}): Effect.Effect<ActiveTrackingTrip | null, never, TripAccess> =>
  Effect.gen(function* () {
    const tripAccess = yield* TripAccess;
    return yield* tripAccess.findActiveTripForStudent(
      input.studentId,
      input.companyId,
    );
  });
