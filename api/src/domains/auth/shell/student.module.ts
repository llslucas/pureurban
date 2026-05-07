import { Module } from '@nestjs/common';
import { Layer, ManagedRuntime } from 'effect';
import { StudentService, STUDENT_RUNTIME } from './student.service.js';
import { StudentController } from './http/student.controller.js';
import { PrismaUserAdapter } from './adapters/prisma-user.adapter.js';
import { BcryptPasswordHasherAdapter } from './adapters/bcrypt-password-hasher.adapter.js';
import { UserRepository } from '../core/ports/user-repository.port.js';
import { PasswordHasher } from '../core/ports/password-hasher.port.js';
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { AuthModule } from './auth.module.js';

@Module({
  imports: [SharedKernelModule, AuthModule],
  controllers: [StudentController],
  providers: [
    PrismaUserAdapter,
    BcryptPasswordHasherAdapter,
    StudentService,
    EffectEventDispatcher,
    {
      provide: STUDENT_RUNTIME,
      useFactory: (
        userAdapter: PrismaUserAdapter,
        hasherAdapter: BcryptPasswordHasherAdapter,
      ) => {
        const StudentLayer = Layer.mergeAll(
          Layer.succeed(UserRepository, userAdapter),
          Layer.succeed(PasswordHasher, hasherAdapter),
        );
        return ManagedRuntime.make(StudentLayer);
      },
      inject: [PrismaUserAdapter, BcryptPasswordHasherAdapter],
    },
  ],
})
export class StudentModule {}
