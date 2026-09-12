import { Data } from 'effect';

// Erros tagueados do domínio Tracking — Effect TS puro, zero imports @nestjs/*.
// Códigos e statuses verbatim da I/O Matrix da Story 5.0 (contrato congelado).

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

// Distinto de DRIVER_NOT_ASSIGNED (boarding): aqui o POST carrega o driverId do
// token e a comparação é com o responsável pela viagem — mesmo shape de regra,
// código próprio porque o contrato do tracking congelou DRIVER_NOT_ON_TRIP.
export class DriverNotOnTripError extends Data.TaggedError(
  'DriverNotOnTripError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new DriverNotOnTripError({
      code: 'DRIVER_NOT_ON_TRIP',
      message: 'Motorista autenticado não é o atribuído a esta viagem',
      httpStatus: 403,
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

// Cache vazio ou TTL expirado: 404, nunca um ponto stale (contrato 5.0).
export class NoLocationAvailableError extends Data.TaggedError(
  'NoLocationAvailableError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new NoLocationAvailableError({
      code: 'NO_LOCATION_AVAILABLE',
      message: 'Nenhuma posição armazenada para esta viagem',
      httpStatus: 404,
    });
}
