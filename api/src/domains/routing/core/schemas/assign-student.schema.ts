import { Schema } from '@effect/schema';

// Schema de input para vincular aluno a rota — Effect TS puro, zero imports @nestjs/*

// UUID v4 strict: alinhado com ParseUUIDPipe (default version '4') usado nos params da URL.
// 13º char = '4' (versão), 17º char ∈ {8,9,a,b} (variante).
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AssignStudentInput = Schema.Struct({
  studentId: Schema.String.pipe(Schema.pattern(UUID_V4)),
});

export type AssignStudentInput = typeof AssignStudentInput.Type;
