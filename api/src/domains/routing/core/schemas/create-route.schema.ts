import { Schema } from '@effect/schema';

// Schema de input para criação de rota — Effect TS puro, zero imports @nestjs/*

export const CreateRouteInput = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(2)),
  description: Schema.optional(Schema.String),
  originCity: Schema.String.pipe(Schema.minLength(2)),
  destinationCity: Schema.String.pipe(Schema.minLength(2)),
});

export type CreateRouteInput = typeof CreateRouteInput.Type;
