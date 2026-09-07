import { ApiProperty } from '@nestjs/swagger';

export class NotReturningRequestDto {
  @ApiProperty({
    description: 'ID da viagem ativa em que o aluno registra a ausência',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;
}

export class NotReturningResponseDto {
  @ApiProperty({
    description: 'ID do registro de ausência',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440004',
  })
  id!: string;

  @ApiProperty({
    description:
      'ID do aluno que registrou a ausência (vem do JWT, nunca do body)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  studentId!: string;

  @ApiProperty({
    description: 'ID da viagem em que a ausência foi registrada',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    description: 'Status do aluno após o registro da ausência',
    enum: ['NOT_RETURNING'],
    example: 'NOT_RETURNING',
  })
  status!: 'NOT_RETURNING';

  @ApiProperty({
    type: 'string',
    description:
      'Momento do registro da ausência (ISO 8601 UTC). Base do cálculo de cancellableUntil.',
    example: '2026-09-07T21:10:00.000Z',
  })
  notifiedAt!: string;

  @ApiProperty({
    type: 'string',
    description:
      'Fim da janela de cancelamento (ISO 8601 UTC), calculado pelo servidor como notifiedAt + 2 minutos. O cliente nunca calcula a janela — só exibe o countdown e esconde o cancelamento quando expira.',
    example: '2026-09-07T21:12:00.000Z',
  })
  cancellableUntil!: string;
}
