import { Module } from '@nestjs/common';
import { Layer, ManagedRuntime } from 'effect';
import { RoutingController } from './http/routing.controller.js';
import { RoutingService, ROUTING_RUNTIME } from './routing.service.js';
import { PrismaRouteAdapter } from './adapters/prisma-route.adapter.js';
import { PrismaRouteAssignmentAdapter } from './adapters/prisma-route-assignment.adapter.js';
import { RouteRepository } from '../core/ports/route-repository.port.js';
import { RouteAssignmentRepository } from '../core/ports/route-assignment-repository.port.js';
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js';
import { AuthModule } from '../../auth/shell/auth.module.js';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';

@Module({
  imports: [SharedKernelModule, AuthModule],
  controllers: [RoutingController],
  providers: [
    PrismaRouteAdapter,
    PrismaRouteAssignmentAdapter,
    RoutingService,
    EffectEventDispatcher,
    {
      provide: ROUTING_RUNTIME,
      // Runtime específico do domínio Routing: provê RouteRepository + RouteAssignmentRepository
      // Layers mesclados via Layer.merge para um único runtime (ver Dev Notes Story 2.6)
      useFactory: (
        routeAdapter: PrismaRouteAdapter,
        assignAdapter: PrismaRouteAssignmentAdapter,
      ) => {
        const RouteLayer = Layer.succeed(RouteRepository, routeAdapter);
        const AssignLayer = Layer.succeed(
          RouteAssignmentRepository,
          assignAdapter,
        );
        const MergedLayer = Layer.merge(RouteLayer, AssignLayer);
        return ManagedRuntime.make(MergedLayer);
      },
      inject: [PrismaRouteAdapter, PrismaRouteAssignmentAdapter],
    },
  ],
})
export class RoutingModule {}
