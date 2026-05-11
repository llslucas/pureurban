import { Schema } from '@effect/schema';

// Schema de input para vincular motorista a rota — Effect TS puro, zero imports @nestjs/*

// UUID v4 strict: alinhado com ParseUUIDPipe (default version '4') usado nos params da URL.
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AssignDriverInput = Schema.Struct({
  driverId: Schema.String.pipe(Schema.pattern(UUID_V4)),
});

export type AssignDriverInput = typeof AssignDriverInput.Type;
