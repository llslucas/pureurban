import { Data } from 'effect';

// Base domain error — Effect TS puro, zero imports @nestjs/*
export class DomainError extends Data.TaggedError('DomainError')<{
  readonly code: string; // SCREAMING_SNAKE — ex: "STUDENT_NOT_FOUND"
  readonly message: string;
  readonly httpStatus: number; // ex: 404, 400, 409
  readonly details?: Record<string, unknown>;
}> {}

// Erros derivados reutilizáveis
export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {
  readonly httpStatus = 404;
}

export class ForbiddenError extends Data.TaggedError('ForbiddenError')<{
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {
  readonly httpStatus = 403;
}

export class ConflictError extends Data.TaggedError('ConflictError')<{
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {
  readonly httpStatus = 409;
}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {
  readonly httpStatus = 400;
}
