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

// Active RETURN trip with the fields the reminder scan needs (4.4):
// relatedTripId links the OUTBOUND (where candidate check-ins happened) and
// startedAt decides whether the 15-minute period has elapsed.
export interface ActiveReturnTripView {
  id: string;
  companyId: string;
  routeId: string;
  driverId: string;
  relatedTripId: string | null;
  startedAt: Date;
}

export interface TripAccessApi {
  // null quando: não existe | outra empresa | status != ACTIVE
  findActiveTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<ActiveTripView | null>;

  // System-wide sweep (4.4): ALL active RETURN trips, no company filter —
  // each subsequent scan step uses the trip's own companyId.
  findActiveReturnTrips(): Effect.Effect<ActiveReturnTripView[]>;

  // null when: not found | other company | status != ACTIVE | type != RETURN
  findActiveReturnTripById(
    tripId: string,
    companyId: string,
  ): Effect.Effect<ActiveReturnTripView | null>;
}

export class TripAccess extends Context.Tag('TripAccess')<
  TripAccess,
  TripAccessApi
>() {}
