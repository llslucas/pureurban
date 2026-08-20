import { Context, Effect } from 'effect';

export interface CheckedInStudent {
  studentId: string;
  name: string;
  checkedInAt: Date;
}

export interface BoardingStatusApi {
  // Check-ins registrados nesta viagem. A EXISTÊNCIA do registro é o
  // CHECKED_IN — não há coluna status em boarding_records (3.3a, Task 1.4).
  //
  // Traz o `name` porque quem embarcou tem de aparecer na lista mesmo depois de
  // ser desativado ou desvinculado da rota — nesse caso o roster não fornece o
  // nome. Sem filtro de `isActive` aqui, de propósito.
  findCheckedInByTrip(
    tripId: string,
    companyId: string,
  ): Effect.Effect<CheckedInStudent[]>;
}

export class BoardingStatus extends Context.Tag('BoardingStatus')<
  BoardingStatus,
  BoardingStatusApi
>() {}
