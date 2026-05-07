import { Schema } from '@effect/schema';

export const RefreshInput = Schema.Struct({
  refreshToken: Schema.String.pipe(Schema.minLength(1)),
});

export type RefreshInput = typeof RefreshInput.Type;
