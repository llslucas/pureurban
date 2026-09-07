import { Context, Effect } from 'effect';
import type { DuplicateCheckInError } from '../errors/boarding.errors.js';

export interface BoardingRecordData {
  id: string;
  companyId: string;
  tripId: string;
  studentId: string;
  recordedBy: string;
  idempotencyKey: string;
  checkedInAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// created distingue "inseri agora" de "já existia e reli" (corrida de replay).
// Sem esse discriminador o use case não consegue decidir entre withEvents e
// noEvents e acaba emitindo boarding.checked_in duas vezes para o mesmo registro.
export interface RecordCheckInResult {
  created: boolean;
  record: BoardingRecordData;
}

export interface BoardingRepositoryApi {
  findByIdempotencyKey(
    idempotencyKey: string,
    companyId: string,
  ): Effect.Effect<BoardingRecordData | null>;

  // Existência de check-in do aluno na viagem, independente da key. Usado pela
  // ausência (4.1): o check-in do motorista presente tem autoridade sobre a
  // notificação de ausência — ALREADY_CHECKED_IN.
  findCheckInByTripAndStudent(
    tripId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<BoardingRecordData | null>;

  recordCheckIn(data: {
    companyId: string;
    tripId: string;
    studentId: string;
    recordedBy: string;
    idempotencyKey: string;
    checkedInAt: Date;
  }): Effect.Effect<RecordCheckInResult, DuplicateCheckInError>;
}

export class BoardingRepository extends Context.Tag('BoardingRepository')<
  BoardingRepository,
  BoardingRepositoryApi
>() {}
