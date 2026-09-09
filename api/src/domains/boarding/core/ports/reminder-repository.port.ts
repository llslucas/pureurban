import { Context, Effect } from 'effect';

export interface BoardingReminderData {
  id: string;
  companyId: string;
  tripId: string;
  studentId: string;
  remindedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Same discriminator as check-in and absence: created tells "just inserted"
// apart from "already existed and re-read" (race on the [tripId, studentId]
// unique). Without it the scan would re-emit boarding.checkin_reminder on
// every tick.
export interface CreateReminderResult {
  created: boolean;
  record: BoardingReminderData;
}

export interface ReminderRepositoryApi {
  findByTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<BoardingReminderData[]>;

  findByTripAndStudent(
    tripId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<BoardingReminderData | null>;

  create(data: {
    companyId: string;
    tripId: string;
    studentId: string;
    remindedAt: Date;
  }): Effect.Effect<CreateReminderResult>;
}

export class ReminderRepository extends Context.Tag('ReminderRepository')<
  ReminderRepository,
  ReminderRepositoryApi
>() {}
