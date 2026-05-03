import { Schema } from '@effect/schema'

export const LoginInput = Schema.Struct({
  // Email is lowercased before processing — see login.use-case.ts
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  // minLength(1) ensures non-empty; maxLength(72) prevents bcrypt silent truncation
  // whitespace-only passwords are rejected by the trimmed empty check in login.use-case
  password: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(72)),
})

export type LoginInput = typeof LoginInput.Type
