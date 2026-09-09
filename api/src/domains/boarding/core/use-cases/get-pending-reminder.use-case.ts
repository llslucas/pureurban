import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { AbsenceRepository } from '../ports/absence-repository.port.js';
import { BoardingRepository } from '../ports/boarding-repository.port.js';
import { ReminderRepository } from '../ports/reminder-repository.port.js';
import { TripAccess } from '../ports/trip-access.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';

export interface PendingReminderView {
  tripId: string;
  remindedAt: Date;
}

export interface GetPendingReminderInput {
  studentId: string;
  companyId: string;
  // Student's ACTIVE return trip, resolved BEFORE by the shell via
  // TripService.getActiveStudentTrip — without a trip, the GET returns null
  // before ever touching boarding.
  tripId: string;
}

// Derived at app open (for those not connected to the stream): the
// BoardingReminder row is the source of truth shared with the event, but it
// only counts as "pending" if the student has not resolved it yet — no
// check-in on the current trip and no active absence. Answering from the
// banner clears the state on both sides with the same write
// (check-in/absence), without deleting the row.
export const getPendingReminder = (
  input: GetPendingReminderInput,
): Effect.Effect<
  WithEvents<PendingReminderView | null>,
  never,
  ReminderRepository | BoardingRepository | AbsenceRepository | TripAccess
> =>
  Effect.gen(function* () {
    const tripAccess = yield* TripAccess;
    const reminderRepo = yield* ReminderRepository;
    const boardingRepo = yield* BoardingRepository;
    const absenceRepo = yield* AbsenceRepository;

    // Defensive re-validation: the shell resolved the trip before this call,
    // but it can end in between — a pending reminder of an ended trip is null.
    const trip = yield* tripAccess.findActiveReturnTripById(
      input.tripId,
      input.companyId,
    );
    if (!trip) {
      return noEvents(null);
    }

    const reminder = yield* reminderRepo.findByTripAndStudent(
      input.tripId,
      input.studentId,
      input.companyId,
    );
    if (!reminder) {
      return noEvents(null);
    }

    const checkedIn = yield* boardingRepo.findCheckInByTripAndStudent(
      input.tripId,
      input.studentId,
      input.companyId,
    );
    if (checkedIn) {
      return noEvents(null);
    }

    const activeAbsence = yield* absenceRepo.findActiveByTripAndStudent(
      input.tripId,
      input.studentId,
      input.companyId,
    );
    if (activeAbsence) {
      return noEvents(null);
    }

    return noEvents({
      tripId: reminder.tripId,
      remindedAt: reminder.remindedAt,
    });
  });
