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
  cancelIdempotencyKey: string | null;
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

// Mesmo discriminador do create: cancelled distingue "anulei agora" de "a key
// já estava gravada" (corrida da unique nova). Sem ele o use case emite
// boarding.absence_cancelled duas vezes para o mesmo cancelamento.
export interface CancelAbsenceResult {
  cancelled: boolean;
  record: BoardingAbsenceData;
}

export interface AbsenceRepositoryApi {
  findByIdempotencyKey(
    idempotencyKey: string,
    companyId: string,
  ): Effect.Effect<BoardingAbsenceData | null>;

  // Lookup do replay do cancelamento: a key vive na própria linha anulada.
  findByCancelIdempotencyKey(
    cancelIdempotencyKey: string,
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

  // Grava cancelledAt + cancelIdempotencyKey na linha ativa (append-only:
  // nunca delete). cancelled === false sinaliza corrida da unique
  // [companyId, cancelIdempotencyKey] — o record é a re-leitura pela key e
  // julgar o payload é papel do use case.
  cancel(data: {
    absenceId: string;
    companyId: string;
    cancelledAt: Date;
    cancelIdempotencyKey: string;
  }): Effect.Effect<CancelAbsenceResult>;
}

export class AbsenceRepository extends Context.Tag('AbsenceRepository')<
  AbsenceRepository,
  AbsenceRepositoryApi
>() {}
