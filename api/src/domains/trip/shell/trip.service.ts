import { Injectable, Inject } from '@nestjs/common';
import type { ManagedRuntime } from 'effect';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { startTrip } from '../core/use-cases/start-trip.use-case.js';
import { endTrip } from '../core/use-cases/end-trip.use-case.js';
import { getActiveTrip } from '../core/use-cases/get-active-trip.use-case.js';

export const TRIP_RUNTIME = 'TRIP_RUNTIME';

@Injectable()
export class TripService {
  constructor(
    @Inject(TRIP_RUNTIME)
    private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
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
}
