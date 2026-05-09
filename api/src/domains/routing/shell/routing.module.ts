import { Module } from '@nestjs/common';
import { Layer, ManagedRuntime } from 'effect';
import { RoutingController } from './http/routing.controller.js';
import { RoutingService, ROUTING_RUNTIME } from './routing.service.js';
import { PrismaRouteAdapter } from './adapters/prisma-route.adapter.js';
import { RouteRepository } from '../core/ports/route-repository.port.js';
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js';
import { AuthModule } from '../../auth/shell/auth.module.js';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';

@Module({
  imports: [SharedKernelModule, AuthModule],
  controllers: [RoutingController],
  providers: [
    PrismaRouteAdapter,
    RoutingService,
    EffectEventDispatcher,
    {
      provide: ROUTING_RUNTIME,
      // Runtime específico do domínio Routing: provê somente RouteRepository
      // PrismaService é injetado via NestJS DI no adapter
      useFactory: (adapter: PrismaRouteAdapter) => {
        const RouteLayer = Layer.succeed(RouteRepository, adapter);
        return ManagedRuntime.make(RouteLayer);
      },
      inject: [PrismaRouteAdapter],
    },
  ],
})
export class RoutingModule {}
