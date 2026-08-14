import { Injectable, Inject } from '@nestjs/common';
import type { ManagedRuntime } from 'effect';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { checkIn } from '../core/use-cases/check-in.use-case.js';
import { BoardingRepository } from '../core/ports/boarding-repository.port.js';
import { TripAccess } from '../core/ports/trip-access.port.js';
import { StudentEligibility } from '../core/ports/student-eligibility.port.js';

export const BOARDING_RUNTIME = 'BOARDING_RUNTIME';

type BoardingRuntimeContext =
  | BoardingRepository
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
}
