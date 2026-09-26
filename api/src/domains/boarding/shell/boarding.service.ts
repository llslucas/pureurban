import { Injectable, Inject } from '@nestjs/common';
import type { ManagedRuntime } from 'effect';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { checkIn } from '../core/use-cases/check-in.use-case.js';
import { registerNotReturning } from '../core/use-cases/register-not-returning.use-case.js';
import { cancelAbsence } from '../core/use-cases/cancel-absence.use-case.js';
import { scanCheckinReminders } from '../core/use-cases/scan-checkin-reminders.use-case.js';
import { getPendingReminder } from '../core/use-cases/get-pending-reminder.use-case.js';
import { getStudentBoardingStatus } from '../core/use-cases/get-student-boarding-status.use-case.js';
import { BoardingRepository } from '../core/ports/boarding-repository.port.js';
import { AbsenceRepository } from '../core/ports/absence-repository.port.js';
import { TripAccess } from '../core/ports/trip-access.port.js';
import { StudentEligibility } from '../core/ports/student-eligibility.port.js';
import { ReminderRepository } from '../core/ports/reminder-repository.port.js';

export const BOARDING_RUNTIME = 'BOARDING_RUNTIME';

type BoardingRuntimeContext =
  | BoardingRepository
  | AbsenceRepository
  | TripAccess
  | StudentEligibility
  | ReminderRepository;

@Injectable()
export class BoardingService {
  constructor(
    @Inject(BOARDING_RUNTIME)
    private readonly runtime: ManagedRuntime.ManagedRuntime<
      BoardingRuntimeContext,
      never
    >,
    private readonly eventDispatcher: EffectEventDispatcher,
  ) {}

  async processCheckIn(input: {
    studentId: string;
    tripId: string;
    companyId: string;
    driverId: string;
    idempotencyKey: string;
    occurredAt?: string;
  }) {
    const record = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      checkIn(input),
    );

    return {
      id: record.id,
      studentId: record.studentId,
      tripId: record.tripId,
      checkedInAt: record.checkedInAt.toISOString(),
      status: 'CHECKED_IN' as const,
    };
  }

  async registerNotReturning(input: {
    studentId: string;
    tripId: string;
    companyId: string;
    idempotencyKey: string;
  }) {
    const absence = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      registerNotReturning(input),
    );

    return {
      id: absence.id,
      studentId: absence.studentId,
      tripId: absence.tripId,
      status: 'NOT_RETURNING' as const,
      notifiedAt: absence.notifiedAt.toISOString(),
      cancellableUntil: absence.cancellableUntil.toISOString(),
    };
  }

  async cancelAbsence(input: {
    studentId: string;
    tripId: string;
    companyId: string;
    idempotencyKey: string;
  }) {
    const absence = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      cancelAbsence(input),
    );

    return {
      studentId: absence.studentId,
      tripId: absence.tripId,
      status: 'NOT_CHECKED_IN' as const,
      // Invariante do use case: cancelamento e replay só devolvem linha
      // anulada — cancelledAt nunca é null aqui.
      cancelledAt: absence.cancelledAt!.toISOString(),
    };
  }

  // Scheduler tick (4.4): the use case decides who to remind; every created
  // row leaves here as boarding.checkin_reminder through the 4.2 channel.
  async runReminderScan() {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      scanCheckinReminders(),
    );
  }

  async getPendingReminder(input: {
    studentId: string;
    tripId: string;
    companyId: string;
  }) {
    // No events by construction (noEvents) — pure read derivation.
    const [pending] = await this.runtime.runPromise(getPendingReminder(input));

    return pending
      ? { tripId: pending.tripId, remindedAt: pending.remindedAt.toISOString() }
      : null;
  }

  async getStudentStatus(input: {
    studentId: string;
    tripId: string;
    companyId: string;
  }) {
    const [view] = await this.runtime.runPromise(
      getStudentBoardingStatus(input),
    );

    return view
      ? {
          tripId: view.tripId,
          status: view.status,
          absence: view.absence
            ? {
                id: view.absence.id,
                notifiedAt: view.absence.notifiedAt.toISOString(),
                cancellableUntil: view.absence.cancellableUntil.toISOString(),
              }
            : null,
        }
      : null;
  }
}
