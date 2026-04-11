import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthController } from './http/auth.controller.js'
import { AuthService } from './auth.service.js'
import { JwtStrategy } from './strategies/jwt.strategy.js'
import { JwtAuthGuard } from './guards/jwt-auth.guard.js'
import { PrismaUserAdapter } from './adapters/prisma-user.adapter.js'
import { BcryptPasswordHasherAdapter } from './adapters/bcrypt-password-hasher.adapter.js'
import { JwtTokenAdapter } from './adapters/jwt-token.adapter.js'

@Module({
  imports: [
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
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    PrismaUserAdapter,
    BcryptPasswordHasherAdapter,
    JwtTokenAdapter,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
