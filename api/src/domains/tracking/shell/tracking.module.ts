import { Module } from '@nestjs/common';
import { Clock, Layer, ManagedRuntime } from 'effect';
import { TrackingController } from './http/tracking.controller.js';
import { TrackingService, TRACKING_RUNTIME } from './tracking.service.js';
import { PrismaTripAccessAdapter } from './adapters/prisma-trip-access.adapter.js';
import { RedisLocationBusAdapter } from './adapters/redis-location-bus.adapter.js';
import { TripAccess } from '../core/ports/trip-access.port.js';
import { LocationBus } from '../core/ports/location-bus.port.js';
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js';

@Module({
  // RedisService (LocationBus) e PrismaService (TripAccess) vêm do
  // SharedKernelModule; tracking não importa TripModule — a viagem ativa é
  // lida direto do schema trip pelo port próprio (precedente boarding).
  imports: [SharedKernelModule],
  controllers: [TrackingController],
  providers: [
    PrismaTripAccessAdapter,
    RedisLocationBusAdapter,
    TrackingService,
    {
      provide: TRACKING_RUNTIME,
      // Tracking domain runtime: provides TripAccess + LocationBus.
      useFactory: (
        tripAccessAdapter: PrismaTripAccessAdapter,
        locationBusAdapter: RedisLocationBusAdapter,
      ) => {
        const TripAccessLayer = Layer.succeed(TripAccess, tripAccessAdapter);
        const LocationBusLayer = Layer.succeed(LocationBus, locationBusAdapter);
        // O ingest lê o relógio do servidor via Effect Clock — o Clock entra
        // explícito na merge para o tipo do runtime casar com o use case
        // (o default service existe em runtime; aqui ele vira parte do R).
        const ClockLayer = Layer.succeed(Clock.Clock, Clock.make());
        return ManagedRuntime.make(
          Layer.mergeAll(TripAccessLayer, LocationBusLayer, ClockLayer),
        );
      },
      inject: [PrismaTripAccessAdapter, RedisLocationBusAdapter],
    },
  ],
})
export class TrackingModule {}
