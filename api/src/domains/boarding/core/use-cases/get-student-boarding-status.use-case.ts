import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { AbsenceRepository } from '../ports/absence-repository.port.js';
import { BoardingRepository } from '../ports/boarding-repository.port.js';
import { TripAccess } from '../ports/trip-access.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';

export type StudentBoardingStatus =
  | 'CHECKED_IN'
  | 'NOT_RETURNING'
  | 'NOT_CHECKED_IN';

export interface StudentAbsenceView {
  id: string;
  notifiedAt: Date;
  cancellableUntil: Date;
}

export interface StudentBoardingStatusView {
  tripId: string;
  status: StudentBoardingStatus;
  absence: StudentAbsenceView | null;
}

export interface GetStudentBoardingStatusInput {
  studentId: string;
  companyId: string;
  // Student's ACTIVE return trip, resolved BEFORE by the shell via
  // TripService.getActiveStudentTrip.
  tripId: string;
}

// Server-side source of truth for the student home. Same precedence as the
// roster: a check-in beats an active absence (the driver who saw the student
// board has authority over the notice).
export const getStudentBoardingStatus = (
  input: GetStudentBoardingStatusInput,
): Effect.Effect<
  WithEvents<StudentBoardingStatusView | null>,
  never,
  BoardingRepository | AbsenceRepository | TripAccess
> =>
  Effect.gen(function* () {
    const tripAccess = yield* TripAccess;
    const boardingRepo = yield* BoardingRepository;
    const absenceRepo = yield* AbsenceRepository;

    // The trip can end between the shell resolving it and this read.
    const trip = yield* tripAccess.findActiveReturnTripById(
      input.tripId,
      input.companyId,
    );
    if (!trip) {
      return noEvents(null);
    }

    const checkedIn = yield* boardingRepo.findCheckInByTripAndStudent(
      input.tripId,
      input.studentId,
      input.companyId,
    );
    if (checkedIn) {
      return noEvents({
        tripId: input.tripId,
        status: 'CHECKED_IN' as const,
        absence: null,
      });
    }

    const activeAbsence = yield* absenceRepo.findActiveByTripAndStudent(
      input.tripId,
      input.studentId,
      input.companyId,
    );
    if (activeAbsence) {
      return noEvents({
        tripId: input.tripId,
        status: 'NOT_RETURNING' as const,
        absence: {
          id: activeAbsence.id,
          notifiedAt: activeAbsence.notifiedAt,
          cancellableUntil: activeAbsence.cancellableUntil,
        },
      });
    }

    return noEvents({
      tripId: input.tripId,
      status: 'NOT_CHECKED_IN' as const,
      absence: null,
    });
  });
