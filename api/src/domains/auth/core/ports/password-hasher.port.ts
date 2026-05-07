import { Context, Effect } from 'effect';

export interface PasswordHasher {
  readonly hash: (password: string) => Effect.Effect<string>;
  readonly compare: (password: string, hash: string) => Effect.Effect<boolean>;
}

export const PasswordHasher =
  Context.GenericTag<PasswordHasher>('PasswordHasher');
