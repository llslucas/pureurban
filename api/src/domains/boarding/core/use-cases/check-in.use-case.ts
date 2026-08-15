import { Effect } from 'effect';
import {
  noEvents,
  withEvents,
} from '../../../shared/core/events/with-events.js';
import { BoardingRepository } from '../ports/boarding-repository.port.js';
import { TripAccess } from '../ports/trip-access.port.js';
import { StudentEligibility } from '../ports/student-eligibility.port.js';
import {
  TripNotActiveError,
  StudentNotAllowedError,
  DriverNotAssignedError,
  IdempotencyKeyConflictError,
  InvalidQrCodeError,
} from '../errors/boarding.errors.js';
import type { DuplicateCheckInError } from '../errors/boarding.errors.js';
import type { BoardingRecordData } from '../ports/boarding-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';

// Tolerância de relógio para timestamps vindos do cliente. Um embarque no
// futuro nunca é legítimo; um pequeno adiantamento é só o relógio do celular.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
// Transporte escolar é operação do mesmo dia — um embarque de mais de 24h atrás
// não é um item de fila atrasado, é dado falsificado ou corrompido.
const MAX_OCCURRED_AT_AGE_MS = 24 * 60 * 60 * 1000;

export const checkIn = (input: {
  studentId: string;
  tripId: string;
  companyId: string;
  driverId: string;
  idempotencyKey: string;
  occurredAt?: string;
}): Effect.Effect<
  WithEvents<BoardingRecordData>,
  | TripNotActiveError
  | StudentNotAllowedError
  | DriverNotAssignedError
  | IdempotencyKeyConflictError
  | InvalidQrCodeError
  | DuplicateCheckInError,
  BoardingRepository | TripAccess | StudentEligibility
> =>
  Effect.gen(function* () {
    const boardingRepo = yield* BoardingRepository;
    const tripAccess = yield* TripAccess;
    const studentEligibility = yield* StudentEligibility;

    // Uma única leitura de relógio para todo o use case: sem isso, checkedInAt e
    // o occurredAt do evento são chamadas separadas a new Date() e podem cair em
    // segundos diferentes, fazendo registro e evento discordarem.
    const now = new Date();

    // O replay vem antes de qualquer regra de negócio: a fila offline reenvia com
    // a MESMA key, e uma viagem encerrada entre o envio e o reenvio não pode
    // transformar um sucesso já registrado em erro — o item ficaria preso para
    // sempre. Vale inclusive para a sanidade de occurredAt logo abaixo.
    const existing = yield* boardingRepo.findByIdempotencyKey(
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

    const checkedInAt = yield* resolveCheckedInAt(input.occurredAt, now);

    const trip = yield* tripAccess.findActiveTrip(
      input.tripId,
      input.companyId,
    );
    if (!trip) {
      return yield* Effect.fail(TripNotActiveError.create());
    }

    if (trip.driverId !== input.driverId) {
      return yield* Effect.fail(DriverNotAssignedError.create());
    }

    const allowed = yield* studentEligibility.isAllowedOnRoute(
      input.studentId,
      trip.routeId,
      input.companyId,
    );
    if (!allowed) {
      return yield* Effect.fail(StudentNotAllowedError.create());
    }

    const { created, record } = yield* boardingRepo.recordCheckIn({
      companyId: input.companyId,
      tripId: input.tripId,
      studentId: input.studentId,
      recordedBy: input.driverId,
      idempotencyKey: input.idempotencyKey,
      checkedInAt,
    });

    // created === false ⇒ corrida de replay: outro request com a mesma key
    // inseriu entre o findByIdempotencyKey acima e este create. O registro é de
    // outra requisição, então vale a mesma checagem de payload do fast-path...
    if (!created) {
      if (
        record.studentId !== input.studentId ||
        record.tripId !== input.tripId
      ) {
        return yield* Effect.fail(IdempotencyKeyConflictError.create());
      }
      // ...e nenhum evento: boarding.checked_in já foi emitido por quem inseriu.
      return noEvents(record);
    }

    return withEvents(record, [
      {
        type: 'boarding.checked_in',
        data: {
          boardingRecordId: record.id,
          // companyId no payload: o consumidor do Épico 4 precisa escopar por
          // tenant sem ter que reconsultar o boarding, que é justamente o
          // acoplamento que o evento existe para quebrar.
          companyId: record.companyId,
          studentId: record.studentId,
          tripId: record.tripId,
          recordedBy: record.recordedBy,
          checkedInAt: record.checkedInAt.toISOString(),
        },
        occurredAt: now.toISOString(),
      },
    ]);
  });

// Timestamp vindo do cliente é dado não-confiável. O schema já garantiu que é
// uma data ISO parseável; aqui vale a sanidade temporal, que depende do "agora".
const resolveCheckedInAt = (
  occurredAt: string | undefined,
  now: Date,
): Effect.Effect<Date, InvalidQrCodeError> => {
  if (occurredAt === undefined) {
    return Effect.succeed(now);
  }
  const parsed = new Date(occurredAt);
  const age = now.getTime() - parsed.getTime();
  if (age < -MAX_CLOCK_SKEW_MS || age > MAX_OCCURRED_AT_AGE_MS) {
    return Effect.fail(InvalidQrCodeError.create());
  }
  return Effect.succeed(parsed);
};
