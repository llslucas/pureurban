import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaGlobalModule } from './domains/shared/shell/infra/prisma-global.module.js';
import { EffectRuntimeModule } from './domains/shared/shell/effect-runtime/effect-runtime.module.js';

@Module({
  imports: [
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
    PrismaGlobalModule,
    EffectRuntimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
