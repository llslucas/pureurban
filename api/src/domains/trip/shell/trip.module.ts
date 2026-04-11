import { Module } from '@nestjs/common'
import { Layer, ManagedRuntime } from 'effect'
import { TripController } from './http/trip.controller.js'
import { TripService, TRIP_RUNTIME } from './trip.service.js'
import { PrismaTripAdapter } from './adapters/prisma-trip.adapter.js'
import { TripRepository } from '../core/ports/trip-repository.port.js'
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js'
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js'

@Module({
  imports: [SharedKernelModule],
  controllers: [TripController],
  providers: [
    PrismaTripAdapter,
    TripService,
    EffectEventDispatcher,
    {
      provide: TRIP_RUNTIME,
      // Runtime específico do domínio Trip: provê somente TripRepository
      // PrismaService é injetado via NestJS DI no adapter
      useFactory: (adapter: PrismaTripAdapter) => {
        const TripRepoLayer = Layer.succeed(TripRepository, adapter)
        return ManagedRuntime.make(TripRepoLayer)
      },
      inject: [PrismaTripAdapter],
    },
  ],
})
export class TripModule {}
