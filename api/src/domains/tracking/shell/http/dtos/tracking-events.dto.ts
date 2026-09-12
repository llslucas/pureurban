import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

// On the wire the stream carries `event: location.updated` and `data:` with
// this class as JSON. It never appears in an HTTP request/response body: it
// reaches openapi.json via @ApiExtraModels + oneOf on the stream endpoint
// (same pattern as the boarding events).

@ApiSchema({
  description:
    'Evento SSE `location.updated`: a linha `event:` do stream carrega este nome e a linha `data:` o payload JSON abaixo. Emitido aos alunos da rota a cada posição publicada pelo motorista da viagem ativa (Story 5.1). `timestamp` é o instante de publicação pelo servidor — o `capturedAt` do device só aparece no POST de ingestão e no last-known. Frame no wire:\n' +
    'event: location.updated\n' +
    'data: {"tripId":"550e8400-e29b-41d4-a716-446655440001","latitude":-20.755549,"longitude":-42.881728,"accuracy":12.5,"timestamp":"2026-09-11T12:00:00.150Z"}',
})
export class LocationUpdatedEventDto {
  @ApiProperty({
    description: 'ID da viagem em que a posição foi publicada',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    type: 'number',
    description: 'Latitude da posição em graus WGS84',
    example: -20.755549,
    minimum: -90,
    maximum: 90,
  })
  latitude!: number;

  @ApiProperty({
    type: 'number',
    description: 'Longitude da posição em graus WGS84',
    example: -42.881728,
    minimum: -180,
    maximum: 180,
  })
  longitude!: number;

  @ApiPropertyOptional({
    type: 'number',
    description:
      'Precisão da leitura em metros (accuracy da Geolocation API). Opcional: o browser pode não fornecer o valor.',
    example: 12.5,
    minimum: 0,
  })
  accuracy?: number;

  @ApiProperty({
    type: 'string',
    description:
      'Instante da publicação do evento pelo servidor (ISO 8601 UTC) — nunca o capturedAt do device',
    example: '2026-09-11T12:00:00.150Z',
  })
  timestamp!: string;
}
