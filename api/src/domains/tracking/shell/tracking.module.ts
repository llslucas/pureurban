import { Module } from '@nestjs/common';
import { TrackingController } from './http/tracking.controller.js';
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js';

// Story 5.0 is contract-only: no providers, no core, no adapters. The Effect
// runtime and Prisma/Redis adapters arrive with the 5.1/5.2 vertical slices.
@Module({
  imports: [SharedKernelModule],
  controllers: [TrackingController],
})
export class TrackingModule {}
