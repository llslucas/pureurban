import { Clock, Effect } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { AbsenceRepository } from '../ports/absence-repository.port.js';
import { BoardingRepository } from '../ports/boarding-repository.port.js';
import { ReminderRepository } from '../ports/reminder-repository.port.js';
import { TripAccess } from '../ports/trip-access.port.js';
import type {
  DomainEvent,
  WithEvents,
} from '../../../shared/core/events/index.js';

// Reminder period (Epic 4, FR30): 15 minutes after the RETURN trip starts.
// INCLUSIVE boundary (now - startedAt >= delay), precedent of the 4.3
// cancellation window — TestClock pins the boundary in the suite.
export const CHECKIN_REMINDER_DELAY_MS = 15 * 60 * 1000;

export interface ReminderScanResult {
  scannedTrips: number;
  remindersCreated: number;
}

// Who should be reminded is a core decision — the shell scheduler only ticks.
// Eligible: boarded the OUTBOUND (via relatedTripId), has NOT boarded the
// RETURN, no active absence on the RETURN and no previous reminder (once per
// student per trip, guaranteed by the unique + created discriminator). Null
// relatedTripId ⇒ trip with no candidates (skip). A cancelled absence makes
// the student eligible again — findActiveByTrip only returns cancelledAt IS
// NULL rows.
export const scanCheckinReminders = (): Effect.Effect<
  WithEvents<ReminderScanResult>,
  never,
  TripAccess | BoardingRepository | AbsenceRepository | ReminderRepository
> =>
  Effect.gen(function* () {
    const tripAccess = yield* TripAccess;
    const boardingRepo = yield* BoardingRepository;
    const absenceRepo = yield* AbsenceRepository;
    const reminderRepo = yield* ReminderRepository;

    // Single clock read — INJECTED via Effect Clock (TestClock pins now in
    // the suite): the due check, the remindedAt of every row and the
    // occurredAt of every event come from the same instant.
    const now = new Date(yield* Clock.currentTimeMillis);

    const returnTrips = yield* tripAccess.findActiveReturnTrips();

    const events: DomainEvent[] = [];

    // Sequential (not parallel forEach): trips and students share the same
    // now, and the deterministic creation order keeps diagnosis simple — the
    // volume (dozens of students on a few active trips) needs no parallelism.
    yield* Effect.forEach(
      returnTrips,
      (trip) =>
        Effect.gen(function* () {
          // Orphan RETURN (no OUTBOUND) has no way to know who boarded the way in.
          if (trip.relatedTripId === null) return;

          const elapsed = now.getTime() - trip.startedAt.getTime();
          if (elapsed < CHECKIN_REMINDER_DELAY_MS) return;

          const [outboundCheckIns, returnCheckIns, activeAbsences, reminders] =
            yield* Effect.all([
              boardingRepo.findCheckInsByTrip(
                trip.relatedTripId,
                trip.companyId,
              ),
              boardingRepo.findCheckInsByTrip(trip.id, trip.companyId),
              absenceRepo.findActiveByTrip(trip.id, trip.companyId),
              reminderRepo.findByTrip(trip.id, trip.companyId),
            ]);

          const alreadyCheckedIn = new Set(
            returnCheckIns.map((c) => c.studentId),
          );
          const alreadyAbsent = new Set(activeAbsences.map((a) => a.studentId));
          const alreadyReminded = new Set(reminders.map((r) => r.studentId));

          for (const checkIn of outboundCheckIns) {
            if (
              alreadyCheckedIn.has(checkIn.studentId) ||
              alreadyAbsent.has(checkIn.studentId) ||
              alreadyReminded.has(checkIn.studentId)
            ) {
              continue;
            }

            const { created, record } = yield* reminderRepo.create({
              companyId: trip.companyId,
              tripId: trip.id,
              studentId: checkIn.studentId,
              remindedAt: now,
            });

            // created === false ⇒ race on the [tripId, studentId] unique:
            // another run (other tick/instance) inserted first and already
            // emitted the event — nothing here, a re-scan must not re-remind.
            if (!created) continue;

            events.push({
              type: 'boarding.checkin_reminder',
              data: {
                tripId: record.tripId,
                studentId: record.studentId,
                remindedAt: record.remindedAt.toISOString(),
              },
              occurredAt: now.toISOString(),
            });
          }
        }),
      { concurrency: 1 },
    );

    return withEvents(
      { scannedTrips: returnTrips.length, remindersCreated: events.length },
      events,
    );
  });
