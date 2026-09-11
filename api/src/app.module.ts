import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './domains/auth/shell/auth.module.js';
import { DriverModule } from './domains/auth/shell/driver.module.js';
import { StudentModule } from './domains/auth/shell/student.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaGlobalModule } from './domains/shared/shell/infra/prisma-global.module.js';
import { EffectRuntimeModule } from './domains/shared/shell/effect-runtime/effect-runtime.module.js';
import { SharedKernelModule } from './domains/shared/shell/shared-kernel.module.js';
import { EffectExceptionFilter } from './domains/shared/shell/filters/effect-exception.filter.js';
import { ResponseWrapperInterceptor } from './domains/shared/shell/interceptors/response-wrapper.interceptor.js';
import { TripModule } from './domains/trip/shell/trip.module.js';
import { RoutingModule } from './domains/routing/shell/routing.module.js';
import { BoardingModule } from './domains/boarding/shell/boarding.module.js';
import { TrackingModule } from './domains/tracking/shell/tracking.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
    PrismaGlobalModule,
    EffectRuntimeModule,
    SharedKernelModule,
    AuthModule,
    DriverModule,
    StudentModule,
    TripModule,
    RoutingModule,
    BoardingModule,
    TrackingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registrado como APP_PIPE (e não em main.ts) para valer também nos e2e,
    // que montam a app a partir do AppModule e nunca executam o bootstrap.
    //
    // ATENÇÃO: sem `whitelist` e sem `transform` de propósito. Cinco controllers
    // decodificam o @Body com EffectSchemaPipe, e essas classes não têm metadata
    // do class-validator — `whitelist: true` apagaria todas as propriedades delas
    // (login, register, refresh, rotas, check-in) antes do schema ver o payload.
    // Assim o pipe valida só os DTOs que declaram decorators e ignora o resto.
    {
      provide: APP_PIPE,
      useFactory: () => new ValidationPipe({ whitelist: false }),
    },
    { provide: APP_FILTER, useClass: EffectExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseWrapperInterceptor },
  ],
})
export class AppModule {}
