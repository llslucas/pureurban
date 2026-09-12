import { Context, Effect } from 'effect';

export interface ActiveTripView {
  id: string;
  routeId: string;
  // driverId volta como dado, não como filtro: quem compara é o core do use
  // case, para distinguir DRIVER_NOT_ON_TRIP (403) de TRIP_NOT_ACTIVE (409).
  // Filtrar por driverId na query colapsaria os dois.
  driverId: string;
}

// Descoberta da viagem a acompanhar (GET /tracking/trips/active, 5.2): só o
// que a resposta carrega — a posição da perna vem do próprio tripId depois.
export interface ActiveTrackingTripView {
  tripId: string;
  type: 'OUTBOUND' | 'RETURN';
}

export interface TripAccessApi {
  // null quando: não existe | outra empresa | status != ACTIVE
  findActiveTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<ActiveTripView | null>;

  // Viagem ativa de QUALQUER perna em alguma rota do aluno (a branch STUDENT
  // de GET /trips/active é só retorno — não serve para o acompanhamento).
  // null quando: aluno sem rota na empresa | nenhuma viagem ativa nelas.
  findActiveTripForStudent(
    studentId: string,
    companyId: string,
  ): Effect.Effect<ActiveTrackingTripView | null>;

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
