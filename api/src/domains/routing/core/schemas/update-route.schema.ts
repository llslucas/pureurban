import { Schema } from '@effect/schema';

// Schema de input para atualização de rota — Effect TS puro, zero imports @nestjs/*
// Refinement: exige ao menos 1 campo (body vazio {} → 400 VALIDATION_ERROR)
// trimmed() normaliza whitespace; maxLength protege contra payloads abusivos
// description aceita null explícito para permitir limpeza do campo

export const UpdateRouteInput = Schema.Struct({
  name: Schema.optional(Schema.String.pipe(Schema.trimmed(), Schema.minLength(2), Schema.maxLength(255))),
  description: Schema.optional(Schema.NullOr(Schema.String.pipe(Schema.maxLength(1000)))),
  originCity: Schema.optional(Schema.String.pipe(Schema.trimmed(), Schema.minLength(2), Schema.maxLength(255))),
  destinationCity: Schema.optional(Schema.String.pipe(Schema.trimmed(), Schema.minLength(2), Schema.maxLength(255))),
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
