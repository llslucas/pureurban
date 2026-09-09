import { Module } from '@nestjs/common';
import { Layer, ManagedRuntime } from 'effect';
import { BoardingController } from './http/boarding.controller.js';
import { BoardingService, BOARDING_RUNTIME } from './boarding.service.js';
import { BoardingEventsService } from './events/boarding-events.service.js';
import { BoardingEventsGuard } from './http/boarding-events.guard.js';
import { ReminderSchedulerService } from './reminder-scheduler.service.js';
import { PrismaBoardingAdapter } from './adapters/prisma-boarding.adapter.js';
import { PrismaAbsenceAdapter } from './adapters/prisma-absence.adapter.js';
import { PrismaTripAccessAdapter } from './adapters/prisma-trip-access.adapter.js';
import { PrismaStudentEligibilityAdapter } from './adapters/prisma-student-eligibility.adapter.js';
import { PrismaReminderAdapter } from './adapters/prisma-reminder.adapter.js';
import { BoardingRepository } from '../core/ports/boarding-repository.port.js';
import { AbsenceRepository } from '../core/ports/absence-repository.port.js';
import { TripAccess } from '../core/ports/trip-access.port.js';
import { StudentEligibility } from '../core/ports/student-eligibility.port.js';
import { ReminderRepository } from '../core/ports/reminder-repository.port.js';
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
    PrismaReminderAdapter,
    BoardingService,
    BoardingEventsService,
    BoardingEventsGuard,
    ReminderSchedulerService,
    EffectEventDispatcher,
    {
      provide: BOARDING_RUNTIME,
      // Boarding domain runtime: provides BoardingRepository +
      // AbsenceRepository + TripAccess + StudentEligibility + ReminderRepository
      // Five layers ⇒ Layer.mergeAll (Layer.merge only accepts two)
      useFactory: (
        boardingAdapter: PrismaBoardingAdapter,
        absenceAdapter: PrismaAbsenceAdapter,
        tripAccessAdapter: PrismaTripAccessAdapter,
        studentEligibilityAdapter: PrismaStudentEligibilityAdapter,
        reminderAdapter: PrismaReminderAdapter,
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
        const ReminderRepoLayer = Layer.succeed(
          ReminderRepository,
          reminderAdapter,
        );
        const MergedLayer = Layer.mergeAll(
          BoardingRepoLayer,
          AbsenceRepoLayer,
          TripAccessLayer,
          StudentEligibilityLayer,
          ReminderRepoLayer,
        );
        return ManagedRuntime.make(MergedLayer);
      },
      inject: [
        PrismaBoardingAdapter,
        PrismaAbsenceAdapter,
        PrismaTripAccessAdapter,
        PrismaStudentEligibilityAdapter,
        PrismaReminderAdapter,
      ],
    },
  ],
})
export class BoardingModule {}
