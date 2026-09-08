import { Clock, Effect } from 'effect';
import {
  noEvents,
  withEvents,
} from '../../../shared/core/events/with-events.js';
import { AbsenceRepository } from '../ports/absence-repository.port.js';
import { TripAccess } from '../ports/trip-access.port.js';
import { StudentEligibility } from '../ports/student-eligibility.port.js';
import {
  TripNotActiveError,
  StudentNotOnTripError,
  AbsenceNotFoundError,
  CancellationPeriodExpiredError,
  IdempotencyKeyConflictError,
} from '../errors/boarding.errors.js';
import type { BoardingAbsenceData } from '../ports/absence-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';

export const cancelAbsence = (input: {
  studentId: string;
  tripId: string;
  companyId: string;
  idempotencyKey: string;
}): Effect.Effect<
  WithEvents<BoardingAbsenceData>,
  | TripNotActiveError
  | StudentNotOnTripError
  | AbsenceNotFoundError
  | CancellationPeriodExpiredError
  | IdempotencyKeyConflictError,
  AbsenceRepository | TripAccess | StudentEligibility
> =>
  Effect.gen(function* () {
    const absenceRepo = yield* AbsenceRepository;
    const tripAccess = yield* TripAccess;
    const studentEligibility = yield* StudentEligibility;

    // Uma única leitura de relógio — INJETADO via Clock do Effect (TestClock
    // fixa o now na suíte): cancelledAt e o occurredAt do evento saem do
    // mesmo instante, sem chance de discordarem.
    const now = new Date(yield* Clock.currentTimeMillis);

    // Replay antes de qualquer regra de negócio: o reenvio com a MESMA key
    // devolve o resultado ORIGINAL — a viagem encerrar entre o envio e o
    // reenvio não pode transformar um cancelamento já feito em erro.
    const existing = yield* absenceRepo.findByCancelIdempotencyKey(
      input.idempotencyKey,
      input.companyId,
    );
    if (existing) {
      if (
        existing.studentId !== input.studentId ||
        existing.tripId !== input.tripId
      ) {
        return yield* Effect.fail(IdempotencyKeyConflictError.create());
      }
      return noEvents(existing);
    }

    const trip = yield* tripAccess.findActiveTrip(
      input.tripId,
      input.companyId,
    );
    if (!trip) {
      return yield* Effect.fail(TripNotActiveError.create());
    }

    const allowed = yield* studentEligibility.isAllowedOnRoute(
      input.studentId,
      trip.routeId,
      input.companyId,
    );
    if (!allowed) {
      return yield* Effect.fail(StudentNotOnTripError.create());
    }

    const activeAbsence = yield* absenceRepo.findActiveByTripAndStudent(
      input.tripId,
      input.studentId,
      input.companyId,
    );
    if (!activeAbsence) {
      return yield* Effect.fail(AbsenceNotFoundError.create());
    }

    // Janela INCLUSIVA, fronteira fixada na spec 4.3: cancela enquanto
    // now <= cancellableUntil. Comparação contra a COLUNA — nunca
    // notifiedAt + 2min recalculado (o cliente só exibe o countdown).
    if (now.getTime() > activeAbsence.cancellableUntil.getTime()) {
      return yield* Effect.fail(CancellationPeriodExpiredError.create());
    }

    const { cancelled, record } = yield* absenceRepo.cancel({
      absenceId: activeAbsence.id,
      companyId: input.companyId,
      cancelledAt: now,
      cancelIdempotencyKey: input.idempotencyKey,
    });

    // cancelled === false ⇒ corrida: a key já estava gravada em outra leitura
    // (unique [companyId, cancelIdempotencyKey]). Vale a mesma checagem de
    // payload do fast-path, e nenhum evento — boarding.absence_cancelled já
    // foi emitido por quem anulou.
    if (!cancelled) {
      if (
        record.studentId !== input.studentId ||
        record.tripId !== input.tripId
      ) {
        return yield* Effect.fail(IdempotencyKeyConflictError.create());
      }
      return noEvents(record);
    }

    return withEvents(record, [
      {
        type: 'boarding.absence_cancelled',
        data: {
          tripId: record.tripId,
          studentId: record.studentId,
          // É o cancelledAt que a escrita acabou de gravar — do mesmo relógio.
          cancelledAt: now.toISOString(),
        },
        occurredAt: now.toISOString(),
      },
    ]);
  });
