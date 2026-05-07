import { Context, Effect } from 'effect';
import type { InvalidRefreshTokenError } from '../errors/auth.errors.js';

export interface TokenPayload {
  userId: string;
  companyId: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenService {
  readonly generateTokens: (payload: TokenPayload) => Effect.Effect<TokenPair>;
  readonly verifyToken: (
    token: string,
  ) => Effect.Effect<TokenPayload, InvalidRefreshTokenError>;
}

export const TokenService = Context.GenericTag<TokenService>('TokenService');
