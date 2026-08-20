import { Injectable, Inject } from '@nestjs/common';
import type { ManagedRuntime } from 'effect';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { startTrip } from '../core/use-cases/start-trip.use-case.js';
import { endTrip } from '../core/use-cases/end-trip.use-case.js';
import { getActiveTrip } from '../core/use-cases/get-active-trip.use-case.js';
import { getTripStudents } from '../core/use-cases/get-trip-students.use-case.js';
import { TripRepository } from '../core/ports/trip-repository.port.js';
import { TripRoster } from '../core/ports/trip-roster.port.js';
import { BoardingStatus } from '../core/ports/boarding-status.port.js';
import { RouteAccess } from '../core/ports/route-access.port.js';

export const TRIP_RUNTIME = 'TRIP_RUNTIME';

type TripRuntimeContext =
  | TripRepository
  | TripRoster
  | BoardingStatus
  | RouteAccess;

@Injectable()
export class TripService {
  constructor(
    @Inject(TRIP_RUNTIME)
    private readonly runtime: ManagedRuntime.ManagedRuntime<
      TripRuntimeContext,
      never
    >,
    private readonly eventDispatcher: EffectEventDispatcher,
  ) {}

  async createTrip(
    driverId: string,
    routeId: string,
    tenantId: string,
    type: 'OUTBOUND' | 'RETURN',
    relatedTripId?: string,
  ) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      startTrip({ driverId, routeId, tenantId, type, relatedTripId }),
    );
  }

  async endTrip(tripId: string, driverId: string, tenantId: string) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      endTrip({ tripId, driverId, tenantId }),
    );
  }

  async getActiveTrip(driverId: string, tenantId: string) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      getActiveTrip({ driverId, tenantId }),
    );
  }

  async getTripStudents(tripId: string, driverId: string, tenantId: string) {
    const view = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      getTripStudents({ tripId, driverId, tenantId }),
    );
    return {
      students: view.students.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        status: s.status,
        checkedInAt: s.checkedInAt ? s.checkedInAt.toISOString() : null,
      })),
      summary: view.summary,
    };
  }
}
