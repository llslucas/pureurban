import { Schema } from '@effect/schema';

// studentId vem do JWT, nunca do body — o schema só precisa do tripId.
export const CancelAbsenceInput = Schema.Struct({
  tripId: Schema.UUID,
});
export type CancelAbsenceInput = typeof CancelAbsenceInput.Type;
