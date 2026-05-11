import { Data } from 'effect';

// Erros tagueados do domínio Routing — Effect TS puro, zero imports @nestjs/*

export class RouteNotFoundError extends Data.TaggedError('RouteNotFoundError')<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = (id?: string) =>
    new RouteNotFoundError({
      code: 'ROUTE_NOT_FOUND',
      message: id ? `Rota ${id} não encontrada` : 'Rota não encontrada',
      httpStatus: 404,
    });
}

export class AssignmentAlreadyExistsError extends Data.TaggedError(
  'AssignmentAlreadyExistsError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new AssignmentAlreadyExistsError({
      code: 'ASSIGNMENT_ALREADY_EXISTS',
      message: 'Vínculo já existe',
      httpStatus: 409,
    });
}

export class AssignmentNotFoundError extends Data.TaggedError(
  'AssignmentNotFoundError',
)<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = () =>
    new AssignmentNotFoundError({
      code: 'ASSIGNMENT_NOT_FOUND',
      message: 'Vínculo não encontrado',
      httpStatus: 404,
    });
}

// Erro local no bounded context routing — NÃO importar de auth/core/
// Razão: bounded contexts separados; sem dependência cross-domain no core
export class UserNotFoundError extends Data.TaggedError('UserNotFoundError')<{
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
}> {
  static readonly create = (id?: string) =>
    new UserNotFoundError({
      code: 'USER_NOT_FOUND',
      message: id ? `Usuário ${id} não encontrado` : 'Usuário não encontrado',
      httpStatus: 404,
    });
}
