import { Context, Effect } from 'effect';

export interface RouteAccessApi {
  // O motorista está vinculado a esta rota (routing.route_drivers), na mesma
  // empresa? `false` também quando a rota não existe — para o core as duas
  // situações têm a mesma resposta: não pode iniciar viagem nela.
  isDriverAssignedToRoute(
    routeId: string,
    driverId: string,
    companyId: string,
  ): Effect.Effect<boolean>;
}

export class RouteAccess extends Context.Tag('RouteAccess')<
  RouteAccess,
  RouteAccessApi
>() {}
