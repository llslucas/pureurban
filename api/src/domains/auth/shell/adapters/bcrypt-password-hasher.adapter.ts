import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { Effect } from 'effect'
import type { PasswordHasher } from '../../core/ports/password-hasher.port.js'

const SALT_ROUNDS = 12

@Injectable()
export class BcryptPasswordHasherAdapter implements PasswordHasher {
  hash(password: string): Effect.Effect<string> {
    return Effect.promise(() => bcrypt.hash(password, SALT_ROUNDS))
  }

  compare(password: string, hash: string): Effect.Effect<boolean> {
    return Effect.promise(() => bcrypt.compare(password, hash))
  }
}
