import { Schema } from '@effect/schema';

// Schema de input para atualização de rota — Effect TS puro, zero imports @nestjs/*
// Refinement: exige ao menos 1 campo (body vazio {} → 400 VALIDATION_ERROR)

export const UpdateRouteInput = Schema.Struct({
  name: Schema.optional(Schema.String.pipe(Schema.minLength(2))),
  description: Schema.optional(Schema.String),
  originCity: Schema.optional(Schema.String.pipe(Schema.minLength(2))),
  destinationCity: Schema.optional(Schema.String.pipe(Schema.minLength(2))),
}).pipe(
  Schema.filter(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.originCity !== undefined ||
      data.destinationCity !== undefined,
    {
      message: () => 'Pelo menos um campo deve ser fornecido para atualização',
    },
  ),
);

export type UpdateRouteInput = typeof UpdateRouteInput.Type;
