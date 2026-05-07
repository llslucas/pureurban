import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Effect } from 'effect';
import type {
  TokenService,
  TokenPayload,
  TokenPair,
} from '../../core/ports/token-service.port.js';
import { InvalidRefreshTokenError } from '../../core/errors/auth.errors.js';

@Injectable()
export class JwtTokenAdapter implements TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateTokens(payload: TokenPayload): Effect.Effect<TokenPair> {
    return Effect.promise(async () => {
      const { userId, companyId, role } = payload;
      const jwtPayload = { sub: userId, companyId, role };

      const accessExpiration = this.configService.get<string>(
        'JWT_ACCESS_EXPIRATION',
        '15m',
      );
      const refreshExpiration = this.configService.get<string>(
        'JWT_REFRESH_EXPIRATION',
        '7d',
      );

      const accessToken = await this.jwtService.signAsync(jwtPayload, {
        expiresIn: accessExpiration as any,
      });

      const refreshToken = await this.jwtService.signAsync(jwtPayload, {
        expiresIn: refreshExpiration as any,
      });

      return { accessToken, refreshToken };
    });
  }

  verifyToken(
    token: string,
  ): Effect.Effect<TokenPayload, InvalidRefreshTokenError> {
    return Effect.tryPromise({
      try: async () => {
        const decoded = await this.jwtService.verifyAsync<{
          sub: string;
          companyId: string;
          role: string;
        }>(token);

        // Runtime validation of required claims — prevents undefined IDs from reaching Prisma
        if (!decoded.sub || !decoded.companyId || !decoded.role) {
          throw new Error('Missing required JWT claims');
        }

        return {
          userId: decoded.sub,
          companyId: decoded.companyId,
          role: decoded.role,
        } satisfies TokenPayload;
      },
      catch: () => InvalidRefreshTokenError.create(),
    });
  }
}
