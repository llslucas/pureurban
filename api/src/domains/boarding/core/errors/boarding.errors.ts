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
