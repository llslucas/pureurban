import { Schema } from '@effect/schema';

// Path param de GET trips/:id/location — o contrato 5.0 declara 400
// VALIDATION_ERROR para id não-UUID antes de qualquer regra de negócio.
export const TripIdParam = Schema.UUID;

// Bounds idênticos aos do LocationIngestRequestDto (contrato 5.0): a validação
// vive no core (EffectSchemaPipe consome ESTE schema no controller) para o use
// case nunca ver coordenada fora do WGS84. Os bounds são filtros explícitos —
// mesmo estilo do capturedAt abaixo.
const Latitude = Schema.Number.pipe(
  Schema.filter((n) => n >= -90 && n <= 90, {
    message: () => 'latitude deve estar entre -90 e 90 graus',
  }),
);

const Longitude = Schema.Number.pipe(
  Schema.filter((n) => n >= -180 && n <= 180, {
    message: () => 'longitude deve estar entre -180 e 180 graus',
  }),
);

const Accuracy = Schema.Number.pipe(
  Schema.filter((n) => n >= 0, {
    message: () => 'accuracy não pode ser negativa',
  }),
);

// Formato do fio: ISO 8601 UTC (o device envia `toISOString()`). Um regex
// explícito e não Date.parse: o parse aceitaria "March 5, 2020" e a mensagem
// do contrato promete ISO 8601. Precisão fracionária ilimitada (wrap-3/R11):
// o ISO permite 0..N casas e o GPS nativo comum manda mais de 3 — rejeitar
// quem segue o contrato documentado era o pior dos mundos.
const IsoUtcString = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, {
    message: () => 'capturedAt deve ser uma data ISO 8601 UTC',
  }),
);

export const LocationIngestInput = Schema.Struct({
  tripId: Schema.UUID,
  latitude: Latitude,
  longitude: Longitude,
  // Opcional: o browser pode não fornecer (LocationIngestRequestDto.accuracy).
  accuracy: Schema.optional(Accuracy),
  // Só formato — eco do device, sem sanidade temporal (posições velhas são
  // descartáveis por construção, last-write-wins).
  capturedAt: IsoUtcString,
});
export type LocationIngestInput = typeof LocationIngestInput.Type;
