import { Schema } from '@effect/schema';

// Schema de input para criação de rota — Effect TS puro, zero imports @nestjs/*
// trimmed() normaliza whitespace; maxLength protege contra payloads abusivos

export const CreateRouteInput = Schema.Struct({
  name: Schema.String.pipe(Schema.trimmed(), Schema.minLength(2), Schema.maxLength(255)),
  description: Schema.optional(Schema.String.pipe(Schema.maxLength(1000))),
  originCity: Schema.String.pipe(Schema.trimmed(), Schema.minLength(2), Schema.maxLength(255)),
  destinationCity: Schema.String.pipe(Schema.trimmed(), Schema.minLength(2), Schema.maxLength(255)),
});

export type CreateRouteInput = typeof CreateRouteInput.Type;
