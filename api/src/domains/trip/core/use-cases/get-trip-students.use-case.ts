import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { TripRepository } from '../ports/trip-repository.port.js';
import { TripRoster } from '../ports/trip-roster.port.js';
import { BoardingStatus } from '../ports/boarding-status.port.js';
import { TripNotFound, DriverNotAssigned } from '../errors/trip.errors.js';
import type { WithEvents } from '../../../shared/core/events/index.js';

export type TripBoardingStatus = 'CHECKED_IN' | 'NOT_CHECKED_IN';

export interface TripStudentView {
  studentId: string;
  name: string;
  status: TripBoardingStatus;
  checkedInAt: Date | null;
}

export interface TripStudentsView {
  students: TripStudentView[];
  summary: { boarded: number; total: number };
}

export const getTripStudents = (input: {
  tripId: string;
  driverId: string;
  tenantId: string;
}): Effect.Effect<
  WithEvents<TripStudentsView>,
  TripNotFound | DriverNotAssigned,
  TripRepository | TripRoster | BoardingStatus
> =>
  Effect.gen(function* () {
    const repo = yield* TripRepository;
    const tripRoster = yield* TripRoster;
    const boardingStatus = yield* BoardingStatus;

    const trip = yield* repo.findById(input.tripId, input.tenantId);

    if (trip.driverId !== input.driverId) {
      return yield* Effect.fail(
        new DriverNotAssigned({
          code: 'DRIVER_NOT_ASSIGNED',
          message: 'Motorista não é o responsável por esta viagem',
        }),
      );
    }

    const [roster, checkedIn] = yield* Effect.all(
      [
        tripRoster.findRouteStudents(trip.routeId, input.tenantId),
        boardingStatus.findCheckedInByTrip(trip.id, input.tenantId),
      ],
      { concurrency: 2 },
    );

    const checkedInBy = new Map(checkedIn.map((c) => [c.studentId, c]));

    const fromRoster: TripStudentView[] = roster.map((student) => {
      const record = checkedInBy.get(student.studentId);
      return {
        studentId: student.studentId,
        name: student.name,
        status: (record
          ? 'CHECKED_IN'
          : 'NOT_CHECKED_IN') as TripBoardingStatus,
        checkedInAt: record?.checkedInAt ?? null,
      };
    });

    // Quem embarcou sai do roster ao ser desativado ou desvinculado da rota,
    // mas continua fisicamente no veículo — some da tela seria a pior direção
    // de falha possível. Entra na lista e conta nos dois lados do summary, então
    // `boarded <= total` continua válido (nada de "5 de 4 embarcados").
    const inRoster = new Set(roster.map((s) => s.studentId));
    const orphanCheckIns: TripStudentView[] = checkedIn
      .filter((c) => !inRoster.has(c.studentId))
      .map((c) => ({
        studentId: c.studentId,
        name: c.name,
        status: 'CHECKED_IN' as TripBoardingStatus,
        checkedInAt: c.checkedInAt,
      }));

    const students: TripStudentView[] = [...fromRoster, ...orphanCheckIns].sort(
      (a, b) => {
        const byName = a.name.localeCompare(b.name, 'pt-BR');
        return byName !== 0 ? byName : a.studentId.localeCompare(b.studentId);
      },
    );

    const summary = {
      boarded: students.filter((s) => s.status === 'CHECKED_IN').length,
      total: students.length,
    };

    return noEvents({ students, summary });
  });
