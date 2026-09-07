import { Schema } from '@effect/schema';

// studentId vem do JWT, nunca do body — o schema só precisa do tripId.
export const NotReturningInput = Schema.Struct({
  tripId: Schema.UUID,
});
export type NotReturningInput = typeof NotReturningInput.Type;
