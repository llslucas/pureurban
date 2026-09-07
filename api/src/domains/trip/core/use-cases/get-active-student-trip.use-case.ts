import { Effect } from 'effect';
import { TripRepository } from '../ports/trip-repository.port.js';
import { noEvents } from '../../../shared/core/events/with-events.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { TripData } from '../ports/trip-repository.port.js';

export interface GetActiveStudentTripInput {
  studentId: string;
  tenantId: string;
}

// Branch STUDENT de GET /trips/active: a viagem de retorno ativa na rota do
// aluno — é ela que o botão "Não vou voltar" da home alimentará. null quando
// não há retorno em andamento (ou o aluno não está em nenhuma rota).
export const getActiveStudentTrip = (
  input: GetActiveStudentTripInput,
): Effect.Effect<WithEvents<TripData | null>, never, TripRepository> =>
  Effect.gen(function* () {
    const repo = yield* TripRepository;
    const trip = yield* repo.findActiveReturnByStudent(
      input.studentId,
      input.tenantId,
    );
    return noEvents(trip);
  });
