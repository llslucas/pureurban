import { ApiProperty } from '@nestjs/swagger';

export class CancelAbsenceRequestDto {
  @ApiProperty({
    description: 'ID da viagem em que a ausência será cancelada',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;
}

export class CancelAbsenceResponseDto {
  @ApiProperty({
    description:
      'ID do aluno que cancelou a ausência (vem do JWT, nunca do body)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  studentId!: string;

  @ApiProperty({
    description: 'ID da viagem em que a ausência foi cancelada',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    description:
      'Status do aluno após o cancelamento — volta a aguardar check-in',
    enum: ['NOT_CHECKED_IN'],
    example: 'NOT_CHECKED_IN',
  })
  status!: 'NOT_CHECKED_IN';

  @ApiProperty({
    type: 'string',
    description: 'Momento do cancelamento (ISO 8601 UTC)',
    example: '2026-09-07T21:11:00.000Z',
  })
  cancelledAt!: string;
}
