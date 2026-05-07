import { Schema } from '@effect/schema';

export const UpdateDriverInput = Schema.Struct({
  name: Schema.optional(Schema.String.pipe(Schema.minLength(2))),
  email: Schema.optional(
    Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  ),
  password: Schema.optional(Schema.String.pipe(Schema.minLength(8))),
  isActive: Schema.optional(Schema.Boolean),
}).pipe(
  Schema.filter(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.password !== undefined ||
      data.isActive !== undefined,
    {
      message: () => 'Pelo menos um campo deve ser fornecido para atualização',
    },
  ),
);

export type UpdateDriverInput = typeof UpdateDriverInput.Type;
