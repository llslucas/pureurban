import { Context, Effect } from 'effect';

export interface ActiveTripView {
  id: string;
  routeId: string;
  // driverId volta como dado, não como filtro: quem compara é o core do use
  // case, para distinguir DRIVER_NOT_ON_TRIP (403) de TRIP_NOT_ACTIVE (409).
  // Filtrar por driverId na query colapsaria os dois.
  driverId: string;
}

export interface TripAccessApi {
  // null quando: não existe | outra empresa | status != ACTIVE
  findActiveTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<ActiveTripView | null>;

  // true somente se: user existe, role STUDENT, isActive, mesma company e
  // vinculado à rota via RouteStudent — duas queries, sem JOIN cross-schema
  // (precedente boarding StudentEligibility; o leitor é o tracking, então o
  // método vive no port próprio deste domínio).
  isStudentOnRoute(
    studentId: string,
    routeId: string,
    companyId: string,
  ): Effect.Effect<boolean>;
}

export class TripAccess extends Context.Tag('tracking.TripAccess')<
  TripAccess,
  TripAccessApi
>() {}
