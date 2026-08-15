import { Context, Effect } from 'effect';

export interface RosterStudent {
  studentId: string;
  name: string;
}

export interface TripRosterApi {
  // Alunos ATIVOS vinculados à rota, da mesma empresa. Lista vazia quando
  // a rota não tem vínculos — nunca erro.
  findRouteStudents(
    routeId: string,
    companyId: string,
  ): Effect.Effect<RosterStudent[]>;
}

export class TripRoster extends Context.Tag('TripRoster')<
  TripRoster,
  TripRosterApi
>() {}
