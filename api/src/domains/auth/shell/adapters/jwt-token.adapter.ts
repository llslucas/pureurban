import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { Effect } from 'effect'
import type { TokenService, TokenPayload, TokenPair } from '../../core/ports/token-service.port.js'

@Injectable()
export class JwtTokenAdapter implements TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateTokens(payload: TokenPayload): Effect.Effect<TokenPair> {
    return Effect.promise(async () => {
      const { userId, companyId, role } = payload
      const jwtPayload = { sub: userId, companyId, role }

      const accessExpiration = this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m')
      const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d')

      const accessToken = await this.jwtService.signAsync(jwtPayload, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiresIn: accessExpiration as any,
      })

      const refreshToken = await this.jwtService.signAsync(jwtPayload, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiresIn: refreshExpiration as any,
      })

      return { accessToken, refreshToken }
    })
  }
}
