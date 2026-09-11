import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LocationIngestRequestDto {
  @ApiProperty({
    description: 'ID da viagem ativa em que a posição foi capturada',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    type: 'number',
    description: 'Latitude da posição em graus WGS84',
    example: -20.755549,
  })
  latitude!: number;

  @ApiProperty({
    type: 'number',
    description: 'Longitude da posição em graus WGS84',
    example: -42.881728,
  })
  longitude!: number;

  @ApiPropertyOptional({
    type: 'number',
    description:
      'Precisão da leitura em metros (accuracy da Geolocation API). Opcional: o browser pode não fornecer o valor.',
    example: 12.5,
  })
  accuracy?: number;

  @ApiProperty({
    type: 'string',
    description:
      'Instante da captura da posição pelo device (ISO 8601 UTC). Não volta em nenhuma resposta do servidor: o ack carrega o receivedAt e o evento do stream carrega o timestamp de publicação.',
    example: '2026-09-11T12:00:00.000Z',
  })
  capturedAt!: string;
}

export class LocationIngestResponseDto {
  @ApiProperty({
    description: 'ID da viagem cuja posição foi recebida',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    type: 'string',
    description:
      'Instante do recebimento da posição pelo servidor (ISO 8601 UTC) — last-write-wins: cada posição recebida substitui a anterior, sem acumular histórico',
    example: '2026-09-11T12:00:00.100Z',
  })
  receivedAt!: string;
}
