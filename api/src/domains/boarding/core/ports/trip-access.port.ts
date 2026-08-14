import { Context, Effect } from 'effect';

export interface ActiveTripView {
  id: string;
  routeId: string;
  // Motorista responsável pela viagem. O check-in compara com o usuário
  // autenticado — a checagem vive no core, não no filtro da query, para ser
  // testável sem infraestrutura e para distinguir DRIVER_NOT_ASSIGNED (403) de
  // TRIP_NOT_ACTIVE (409). Filtrar por driverId na query colapsaria os dois.
  driverId: string;
}

export interface TripAccessApi {
  // null quando: não existe | outra empresa | status != ACTIVE
  findActiveTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<ActiveTripView | null>;
}

export class TripAccess extends Context.Tag('TripAccess')<
  TripAccess,
  TripAccessApi
>() {}
