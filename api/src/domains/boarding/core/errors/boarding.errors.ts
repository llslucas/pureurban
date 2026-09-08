import { Data } from 'effect';

// Erros tagueados do domínio Boarding — Effect TS puro, zero imports @nestjs/*

export class InvalidQrCodeError extends Data.TaggedError('InvalidQrCodeError')<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new InvalidQrCodeError({
      code: 'INVALID_QR_CODE',
      message: 'QR code inválido ou dados de check-in malformados',
      httpStatus: 400,
    });
}

export class StudentNotAllowedError extends Data.TaggedError(
  'StudentNotAllowedError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new StudentNotAllowedError({
      code: 'STUDENT_NOT_ALLOWED',
      message: 'Aluno não autorizado a embarcar nesta viagem',
      httpStatus: 403,
    });
}

export class DriverNotAssignedError extends Data.TaggedError(
  'DriverNotAssignedError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new DriverNotAssignedError({
      code: 'DRIVER_NOT_ASSIGNED',
      message: 'Motorista não é o responsável por esta viagem',
      httpStatus: 403,
    });
}

// Mesma idempotency key reaproveitada para um par [aluno, viagem] diferente do
// que foi armazenado. Distinto de DuplicateCheckInError (mesmo aluno e viagem,
// key diferente): aqui o cliente reusou a key, e devolver o registro anterior
// reportaria embarque de OUTRO aluno como sucesso.
export class IdempotencyKeyConflictError extends Data.TaggedError(
  'IdempotencyKeyConflictError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new IdempotencyKeyConflictError({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      message:
        'X-Idempotency-Key já usada para um aluno ou viagem diferente do enviado',
      httpStatus: 409,
    });
}

export class TripNotActiveError extends Data.TaggedError('TripNotActiveError')<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new TripNotActiveError({
      code: 'TRIP_NOT_ACTIVE',
      message: 'Viagem inexistente, de outra empresa ou não ativa',
      httpStatus: 409,
    });
}

export class DuplicateCheckInError extends Data.TaggedError(
  'DuplicateCheckInError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new DuplicateCheckInError({
      code: 'DUPLICATE_CHECK_IN',
      message: 'Aluno já possui check-in registrado nesta viagem',
      httpStatus: 409,
    });
}

export class StudentNotOnTripError extends Data.TaggedError(
  'StudentNotOnTripError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new StudentNotOnTripError({
      code: 'STUDENT_NOT_ON_TRIP',
      message: 'Aluno não pertence à rota desta viagem',
      httpStatus: 403,
    });
}

export class AbsenceAlreadyRegisteredError extends Data.TaggedError(
  'AbsenceAlreadyRegisteredError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new AbsenceAlreadyRegisteredError({
      code: 'ALREADY_NOT_RETURNING',
      message: 'Ausência já registrada nesta viagem',
      httpStatus: 409,
    });
}

// Check-in do motorista presente tem autoridade sobre a ausência do aluno
// (decisão do Lucas, fecha o defer da 4.0): se ele já embarcou, avisar que não
// vai voltar é conflito — o aluno precisa resolver com o motorista.
export class StudentAlreadyCheckedInError extends Data.TaggedError(
  'StudentAlreadyCheckedInError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new StudentAlreadyCheckedInError({
      code: 'ALREADY_CHECKED_IN',
      message: 'Aluno já embarcou nesta viagem — falar com o motorista',
      httpStatus: 409,
    });
}

// Nenhuma ausência ativa para (tripId, studentId): inexistente ou já cancelada
// com key diferente. Replay do CANCELAMENTO não cai aqui — a cancel key fica
// gravada na linha anulada e o replay devolve o resultado original.
export class AbsenceNotFoundError extends Data.TaggedError(
  'AbsenceNotFoundError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new AbsenceNotFoundError({
      code: 'ABSENCE_NOT_FOUND',
      message: 'Nenhuma ausência ativa nesta viagem para cancelar',
      httpStatus: 404,
    });
}

export class CancellationPeriodExpiredError extends Data.TaggedError(
  'CancellationPeriodExpiredError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new CancellationPeriodExpiredError({
      code: 'CANCELLATION_PERIOD_EXPIRED',
      message: 'Janela de cancelamento (cancellableUntil) já expirou',
      httpStatus: 409,
    });
}
