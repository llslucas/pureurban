import { Context, Effect } from 'effect'

export interface TokenPayload {
  userId: string
  companyId: string
  role: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface TokenService {
  readonly generateTokens: (payload: TokenPayload) => Effect.Effect<TokenPair>
}

export const TokenService = Context.GenericTag<TokenService>('TokenService')
