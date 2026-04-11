import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './domains/auth/shell/auth.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaGlobalModule } from './domains/shared/shell/infra/prisma-global.module.js';
import { EffectRuntimeModule } from './domains/shared/shell/effect-runtime/effect-runtime.module.js';
import { SharedKernelModule } from './domains/shared/shell/shared-kernel.module.js';
import { EffectExceptionFilter } from './domains/shared/shell/filters/effect-exception.filter.js';
import { ResponseWrapperInterceptor } from './domains/shared/shell/interceptors/response-wrapper.interceptor.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
    PrismaGlobalModule,
    EffectRuntimeModule,
    SharedKernelModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: EffectExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseWrapperInterceptor },
  ],
})
export class AppModule {}

