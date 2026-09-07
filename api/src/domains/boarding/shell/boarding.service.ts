import { Injectable, Inject } from '@nestjs/common';
import type { ManagedRuntime } from 'effect';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { checkIn } from '../core/use-cases/check-in.use-case.js';
import { registerNotReturning } from '../core/use-cases/register-not-returning.use-case.js';
import { BoardingRepository } from '../core/ports/boarding-repository.port.js';
import { AbsenceRepository } from '../core/ports/absence-repository.port.js';
import { TripAccess } from '../core/ports/trip-access.port.js';
import { StudentEligibility } from '../core/ports/student-eligibility.port.js';

export const BOARDING_RUNTIME = 'BOARDING_RUNTIME';

type BoardingRuntimeContext =
  | BoardingRepository
  | AbsenceRepository
  | TripAccess
  | StudentEligibility;

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
}
