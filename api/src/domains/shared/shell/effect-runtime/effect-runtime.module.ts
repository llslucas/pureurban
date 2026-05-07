import {
  Module,
  Global,
  OnModuleDestroy,
  Inject,
  Logger,
} from '@nestjs/common';
import { ManagedRuntime, Layer } from 'effect';
import { PrismaService } from '../infra/prisma.service.js';
import { PrismaServiceTag } from '../../core/ports/prisma-service.tag.js';
import { EffectEventDispatcher } from './event-dispatcher.service.js';

export const EFFECT_RUNTIME = 'EFFECT_RUNTIME';

@Global()
@Module({
  providers: [
    {
      provide: EFFECT_RUNTIME,
      useFactory: (prisma: PrismaService) => {
        const PrismaLayer = Layer.succeed(PrismaServiceTag, prisma);
        // Layer.merge com outros Layers futuros (ex: RedisLayer na story 1.4+)
        const AppLayer = PrismaLayer;
        return ManagedRuntime.make(AppLayer);
      },
      inject: [PrismaService],
    },
    EffectEventDispatcher,
  ],
  exports: [EFFECT_RUNTIME, EffectEventDispatcher],
})
export class EffectRuntimeModule implements OnModuleDestroy {
  private readonly logger = new Logger(EffectRuntimeModule.name);

  constructor(
    @Inject(EFFECT_RUNTIME)
    private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
  ) {}

  async onModuleDestroy() {
    try {
      await this.runtime.dispose();
    } catch (error) {
      this.logger.error(
        'Failed to dispose Effect runtime during shutdown',
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
