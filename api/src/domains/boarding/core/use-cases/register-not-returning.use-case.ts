import { Effect } from 'effect';
import {
  noEvents,
  withEvents,
} from '../../../shared/core/events/with-events.js';
import { AbsenceRepository } from '../ports/absence-repository.port.js';
import { BoardingRepository } from '../ports/boarding-repository.port.js';
import { TripAccess } from '../ports/trip-access.port.js';
import { StudentEligibility } from '../ports/student-eligibility.port.js';
import {
  TripNotActiveError,
  StudentNotOnTripError,
  StudentAlreadyCheckedInError,
  AbsenceAlreadyRegisteredError,
  IdempotencyKeyConflictError,
} from '../errors/boarding.errors.js';
import type { BoardingAbsenceData } from '../ports/absence-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';

// Janela de cancelamento (Épico 4): o aluno pode desfazer a ausência até
// notifiedAt + 2 min. Calculada AQUI, no servidor — o cliente nunca recalcula,
// só exibe o countdown com o cancellableUntil que a resposta traz.
export const CANCELLABLE_WINDOW_MS = 2 * 60 * 1000;

export const registerNotReturning = (input: {
  studentId: string;
  tripId: string;
  companyId: string;
  idempotencyKey: string;
}): Effect.Effect<
  WithEvents<BoardingAbsenceData>,
  | TripNotActiveError
  | StudentNotOnTripError
  | StudentAlreadyCheckedInError
  | AbsenceAlreadyRegisteredError
  | IdempotencyKeyConflictError,
  AbsenceRepository | BoardingRepository | TripAccess | StudentEligibility
> =>
  Effect.gen(function* () {
    const absenceRepo = yield* AbsenceRepository;
    const boardingRepo = yield* BoardingRepository;
    const tripAccess = yield* TripAccess;
    const studentEligibility = yield* StudentEligibility;

    // Uma única leitura de relógio: notifiedAt, cancellableUntil e o occurredAt
    // do evento saem do mesmo instante, sem chance de discordarem.
    const now = new Date();

    // Replay antes de qualquer regra de negócio: a fila offline reenvia com a
    // MESMA key, e uma viagem encerrada entre o envio e o reenvio não pode
    // transformar um sucesso já registrado em erro — o item ficaria preso.
    const existing = yield* absenceRepo.findByIdempotencyKey(
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

    // O check-in do motorista presente tem autoridade sobre a ausência
    // (last-write-wins do épico): quem já embarcou não "não vai voltar".
    const checkedIn = yield* boardingRepo.findCheckInByTripAndStudent(
      input.tripId,
      input.studentId,
      input.companyId,
    );
    if (checkedIn) {
      return yield* Effect.fail(StudentAlreadyCheckedInError.create());
    }

    const activeAbsence = yield* absenceRepo.findActiveByTripAndStudent(
      input.tripId,
      input.studentId,
      input.companyId,
    );
    if (activeAbsence) {
      return yield* Effect.fail(AbsenceAlreadyRegisteredError.create());
    }

    const { created, record } = yield* absenceRepo.create({
      companyId: input.companyId,
      tripId: input.tripId,
      studentId: input.studentId,
      idempotencyKey: input.idempotencyKey,
      notifiedAt: now,
      cancellableUntil: new Date(now.getTime() + CANCELLABLE_WINDOW_MS),
    });

    // created === false ⇒ corrida de replay: outro request com a mesma key
    // inseriu entre o findByIdempotencyKey e este create. Vale a mesma checagem
    // de payload do fast-path, e nenhum evento — boarding.not_returning já foi
    // emitido por quem inseriu.
    if (!created) {
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
        type: 'boarding.not_returning',
        data: {
          tripId: record.tripId,
          studentId: record.studentId,
          notifiedAt: record.notifiedAt.toISOString(),
        },
        occurredAt: now.toISOString(),
      },
    ]);
  });
