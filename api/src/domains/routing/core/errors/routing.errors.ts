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
