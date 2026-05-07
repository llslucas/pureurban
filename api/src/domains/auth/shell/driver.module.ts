import { Module } from '@nestjs/common';
import { Layer, ManagedRuntime } from 'effect';
import { DriverService, DRIVER_RUNTIME } from './driver.service.js';
import { DriverController } from './http/driver.controller.js';
import { PrismaUserAdapter } from './adapters/prisma-user.adapter.js';
import { BcryptPasswordHasherAdapter } from './adapters/bcrypt-password-hasher.adapter.js';
import { UserRepository } from '../core/ports/user-repository.port.js';
import { PasswordHasher } from '../core/ports/password-hasher.port.js';
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { AuthModule } from './auth.module.js';

@Module({
  imports: [SharedKernelModule, AuthModule],
  controllers: [DriverController],
  providers: [
    PrismaUserAdapter,
    BcryptPasswordHasherAdapter,
    DriverService,
    EffectEventDispatcher,
    {
      provide: DRIVER_RUNTIME,
      useFactory: (
        userAdapter: PrismaUserAdapter,
        hasherAdapter: BcryptPasswordHasherAdapter,
      ) => {
        const DriverLayer = Layer.mergeAll(
          Layer.succeed(UserRepository, userAdapter),
          Layer.succeed(PasswordHasher, hasherAdapter),
        );
        return ManagedRuntime.make(DriverLayer);
      },
      inject: [PrismaUserAdapter, BcryptPasswordHasherAdapter],
    },
  ],
})
export class DriverModule {}
