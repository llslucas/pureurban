import { Module } from '@nestjs/common';
import { Layer, ManagedRuntime } from 'effect';
import { TripController } from './http/trip.controller.js';
import { TripService, TRIP_RUNTIME } from './trip.service.js';
import { PrismaTripAdapter } from './adapters/prisma-trip.adapter.js';
import { PrismaTripRosterAdapter } from './adapters/prisma-trip-roster.adapter.js';
import { PrismaBoardingStatusAdapter } from './adapters/prisma-boarding-status.adapter.js';
import { PrismaRouteAccessAdapter } from './adapters/prisma-route-access.adapter.js';
import { TripRepository } from '../core/ports/trip-repository.port.js';
import { TripRoster } from '../core/ports/trip-roster.port.js';
import { BoardingStatus } from '../core/ports/boarding-status.port.js';
import { RouteAccess } from '../core/ports/route-access.port.js';
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';

@Module({
  imports: [SharedKernelModule],
  controllers: [TripController],
  providers: [
    PrismaTripAdapter,
    PrismaTripRosterAdapter,
    PrismaBoardingStatusAdapter,
    PrismaRouteAccessAdapter,
    TripService,
    EffectEventDispatcher,
    {
      provide: TRIP_RUNTIME,
      // Runtime específico do domínio Trip: TripRepository + TripRoster +
      // BoardingStatus + RouteAccess
      // Mais de dois layers ⇒ Layer.mergeAll (Layer.merge só aceita dois)
      useFactory: (
        tripAdapter: PrismaTripAdapter,
        tripRosterAdapter: PrismaTripRosterAdapter,
        boardingStatusAdapter: PrismaBoardingStatusAdapter,
        routeAccessAdapter: PrismaRouteAccessAdapter,
      ) => {
        const TripRepoLayer = Layer.succeed(TripRepository, tripAdapter);
        const TripRosterLayer = Layer.succeed(TripRoster, tripRosterAdapter);
        const BoardingStatusLayer = Layer.succeed(
          BoardingStatus,
          boardingStatusAdapter,
        );
        const RouteAccessLayer = Layer.succeed(RouteAccess, routeAccessAdapter);
        const MergedLayer = Layer.mergeAll(
          TripRepoLayer,
          TripRosterLayer,
          BoardingStatusLayer,
          RouteAccessLayer,
        );
        return ManagedRuntime.make(MergedLayer);
      },
      inject: [
        PrismaTripAdapter,
        PrismaTripRosterAdapter,
        PrismaBoardingStatusAdapter,
        PrismaRouteAccessAdapter,
      ],
    },
  ],
})
export class TripModule {}
