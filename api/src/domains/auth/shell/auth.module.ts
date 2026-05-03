import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Layer, ManagedRuntime } from 'effect'
import { AuthController } from './http/auth.controller.js'
import { AuthService, AUTH_RUNTIME } from './auth.service.js'
import { JwtStrategy } from './strategies/jwt.strategy.js'
import { JwtAuthGuard } from './guards/jwt-auth.guard.js'
import { PrismaUserAdapter } from './adapters/prisma-user.adapter.js'
import { BcryptPasswordHasherAdapter } from './adapters/bcrypt-password-hasher.adapter.js'
import { JwtTokenAdapter } from './adapters/jwt-token.adapter.js'
import { UserRepository } from '../core/ports/user-repository.port.js'
import { PasswordHasher } from '../core/ports/password-hasher.port.js'
import { TokenService } from '../core/ports/token-service.port.js'
import { SharedKernelModule } from '../../shared/shell/shared-kernel.module.js'
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js'

@Module({
  imports: [
    SharedKernelModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_EXPIRATION', '15m') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PrismaUserAdapter,
    BcryptPasswordHasherAdapter,
    JwtTokenAdapter,
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    EffectEventDispatcher,
    {
      provide: AUTH_RUNTIME,
      // Runtime específico do domínio Auth: provê UserRepository, PasswordHasher e TokenService
      useFactory: (
        userAdapter: PrismaUserAdapter,
        hasherAdapter: BcryptPasswordHasherAdapter,
        tokenAdapter: JwtTokenAdapter,
      ) => {
        const AuthLayer = Layer.mergeAll(
          Layer.succeed(UserRepository, userAdapter),
          Layer.succeed(PasswordHasher, hasherAdapter),
          Layer.succeed(TokenService, tokenAdapter),
        )
        return ManagedRuntime.make(AuthLayer)
      },
      inject: [PrismaUserAdapter, BcryptPasswordHasherAdapter, JwtTokenAdapter],
    },
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
