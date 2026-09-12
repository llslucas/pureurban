import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LastKnownLocationDto {
  @ApiProperty({
    description: 'ID da viagem a que a posição pertence',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    type: 'number',
    description: 'Latitude do último ponto conhecido em graus WGS84',
    example: -20.755549,
    minimum: -90,
    maximum: 90,
  })
  latitude!: number;

  @ApiProperty({
    type: 'number',
    description: 'Longitude do último ponto conhecido em graus WGS84',
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
      'Instante da captura da posição pelo device (ISO 8601 UTC) — a idade deste ponto é o que a tela usa para o estado degradado "Sem sinal GPS". Se a posição foi expirada, o endpoint responde 404 NO_LOCATION_AVAILABLE, nunca um ponto stale.',
    example: '2026-09-11T12:00:00.000Z',
  })
  capturedAt!: string;
}
