import { Data } from 'effect';

// Erros tagueados do domínio Trip — Effect TS puro, zero imports @nestjs/*

export class TripNotFound extends Data.TaggedError('TripNotFound')<{
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {
  readonly httpStatus = 404;
}

export class TripAlreadyActive extends Data.TaggedError('TripAlreadyActive')<{
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {
  readonly httpStatus = 409;
}

export class InvalidTripTransition extends Data.TaggedError(
  'InvalidTripTransition',
)<{
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {
  readonly httpStatus = 400;
}

export class DriverNotAssigned extends Data.TaggedError('DriverNotAssigned')<{
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {
  readonly httpStatus = 403;
}
