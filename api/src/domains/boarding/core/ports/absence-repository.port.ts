import { Context, Effect } from 'effect';

export interface BoardingAbsenceData {
  id: string;
  companyId: string;
  tripId: string;
  studentId: string;
  idempotencyKey: string;
  notifiedAt: Date;
  cancellableUntil: Date;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Mesmo discriminador do check-in: created distingue "inseri agora" de "já
// existia e reli" (corrida de replay). Sem ele o use case emite
// boarding.not_returning duas vezes para o mesmo registro.
export interface CreateAbsenceResult {
  created: boolean;
  record: BoardingAbsenceData;
}

export interface AbsenceRepositoryApi {
  findByIdempotencyKey(
    idempotencyKey: string,
    companyId: string,
  ): Effect.Effect<BoardingAbsenceData | null>;

  // "Ativa" = cancelledAt IS NULL. Linhas são append-only; o re-registro
  // pós-cancelamento (4.3) cria outra, então o índice [tripId, studentId]
  // pode ter várias com só uma ativa.
  findActiveByTripAndStudent(
    tripId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<BoardingAbsenceData | null>;

  findActiveByTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<BoardingAbsenceData[]>;

  create(data: {
    companyId: string;
    tripId: string;
    studentId: string;
    idempotencyKey: string;
    notifiedAt: Date;
    cancellableUntil: Date;
  }): Effect.Effect<CreateAbsenceResult>;
}

export class AbsenceRepository extends Context.Tag('AbsenceRepository')<
  AbsenceRepository,
  AbsenceRepositoryApi
>() {}
