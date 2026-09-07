import { Module } from '@nestjs/common';
import { Layer, ManagedRuntime } from 'effect';
import { BoardingController } from './http/boarding.controller.js';
import { BoardingService, BOARDING_RUNTIME } from './boarding.service.js';
import { BoardingEventsService } from './events/boarding-events.service.js';
import { BoardingEventsGuard } from './http/boarding-events.guard.js';
import { PrismaBoardingAdapter } from './adapters/prisma-boarding.adapter.js';
import { PrismaAbsenceAdapter } from './adapters/prisma-absence.adapter.js';
import { PrismaTripAccessAdapter } from './adapters/prisma-trip-access.adapter.js';
import { PrismaStudentEligibilityAdapter } from './adapters/prisma-student-eligibility.adapter.js';
import { BoardingRepository } from '../core/ports/boarding-repository.port.js';
import { AbsenceRepository } from '../core/ports/absence-repository.port.js';
import { TripAccess } from '../core/ports/trip-access.port.js';
import { StudentEligibility } from '../core/ports/student-eligibility.port.js';
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { TripModule } from '../../trip/shell/trip.module.js';

@Module({
  // TripModule: o guard do stream resolve a viagem ativa via TripService
  // (composição shell-to-shell). RedisService vem do SharedKernelModule.
  imports: [SharedKernelModule, TripModule],
  controllers: [BoardingController],
  providers: [
    PrismaBoardingAdapter,
    PrismaAbsenceAdapter,
    PrismaTripAccessAdapter,
    PrismaStudentEligibilityAdapter,
    BoardingService,
    BoardingEventsService,
    BoardingEventsGuard,
    EffectEventDispatcher,
    {
      provide: BOARDING_RUNTIME,
      // Runtime específico do domínio Boarding: prové BoardingRepository +
      // AbsenceRepository + TripAccess + StudentEligibility
      // Quatro layers ⇒ Layer.mergeAll (Layer.merge só aceita dois)
      useFactory: (
        boardingAdapter: PrismaBoardingAdapter,
        absenceAdapter: PrismaAbsenceAdapter,
        tripAccessAdapter: PrismaTripAccessAdapter,
        studentEligibilityAdapter: PrismaStudentEligibilityAdapter,
      ) => {
        const BoardingRepoLayer = Layer.succeed(
          BoardingRepository,
          boardingAdapter,
        );
        const AbsenceRepoLayer = Layer.succeed(
          AbsenceRepository,
          absenceAdapter,
        );
        const TripAccessLayer = Layer.succeed(TripAccess, tripAccessAdapter);
        const StudentEligibilityLayer = Layer.succeed(
          StudentEligibility,
          studentEligibilityAdapter,
        );
        const MergedLayer = Layer.mergeAll(
          BoardingRepoLayer,
          AbsenceRepoLayer,
          TripAccessLayer,
          StudentEligibilityLayer,
        );
        return ManagedRuntime.make(MergedLayer);
      },
      inject: [
        PrismaBoardingAdapter,
        PrismaAbsenceAdapter,
        PrismaTripAccessAdapter,
        PrismaStudentEligibilityAdapter,
      ],
    },
  ],
})
export class BoardingModule {}
