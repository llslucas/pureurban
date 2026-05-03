import { Schema } from '@effect/schema'

export const CreateDriverInput = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(2)),
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  password: Schema.String.pipe(Schema.minLength(8)),
})

export type CreateDriverInput = typeof CreateDriverInput.Type
