import { Schema } from '@effect/schema';

// Formato do fio: ISO 8601. A validação aqui é só de parseabilidade — a
// sanidade temporal (não no futuro, não velho demais) depende do "agora" e
// vive no use case, onde é testável sem infraestrutura.
const IsoDateString = Schema.String.pipe(
  Schema.filter((s) => !Number.isNaN(Date.parse(s)), {
    message: () => 'occurredAt deve ser uma data ISO 8601 válida',
  }),
);

export const CheckInInput = Schema.Struct({
  studentId: Schema.UUID,
  tripId: Schema.UUID,
  // Momento real do embarque, informado pela fila offline quando o check-in
  // ocorreu sem sinal. Ausente ⇒ o servidor carimba o horário de processamento,
  // que é o comportamento correto para check-in online.
  occurredAt: Schema.optional(IsoDateString),
});
export type CheckInInput = typeof CheckInInput.Type;
