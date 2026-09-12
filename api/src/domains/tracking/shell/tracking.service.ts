import { Injectable, Inject } from '@nestjs/common';
import type { Clock, ManagedRuntime } from 'effect';
import { ingestLocation } from '../core/use-cases/ingest-location.use-case.js';
import { getLastKnownLocation } from '../core/use-cases/get-last-known-location.use-case.js';
import type { IngestLocationResult } from '../core/use-cases/ingest-location.use-case.js';
import type { LastKnownLocation } from '../core/use-cases/get-last-known-location.use-case.js';
import type { LocationIngestInput } from '../core/schemas/location-ingest.schema.js';
import { TripAccess } from '../core/ports/trip-access.port.js';
import { LocationBus } from '../core/ports/location-bus.port.js';

export const TRACKING_RUNTIME = 'TRACKING_RUNTIME';

type TrackingRuntimeContext = TripAccess | LocationBus | Clock.Clock;

@Injectable()
export class TrackingService {
  constructor(
    @Inject(TRACKING_RUNTIME)
    private readonly runtime: ManagedRuntime.ManagedRuntime<
      TrackingRuntimeContext,
      never
    >,
  ) {}

  // Tracking não tem eventos de domínio: store + publish já aconteceram dentro
  // do use case via LocationBus, então o service é runPromise direto.
  ingestLocation(
    input: LocationIngestInput & {
      companyId: string;
      driverId: string;
    },
  ): Promise<IngestLocationResult> {
    return this.runtime.runPromise(ingestLocation(input));
  }

  getLastKnownLocation(input: {
    tripId: string;
    companyId: string;
    studentId: string;
  }): Promise<LastKnownLocation> {
    return this.runtime.runPromise(getLastKnownLocation(input));
  }
}
