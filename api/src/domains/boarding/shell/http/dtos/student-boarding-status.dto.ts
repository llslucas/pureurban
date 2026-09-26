import { ApiProperty } from '@nestjs/swagger';

export class StudentAbsenceDto {
  @ApiProperty({
    description: 'ID do registro de ausência ativa',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440004',
  })
  id!: string;

  @ApiProperty({
    type: 'string',
    description: 'Momento do registro da ausência (ISO 8601 UTC)',
    example: '2026-09-07T21:10:00.000Z',
  })
  notifiedAt!: string;

  @ApiProperty({
    type: 'string',
    description:
      'Fim da janela de cancelamento (ISO 8601 UTC), calculado pelo servidor. O cliente só exibe o countdown.',
    example: '2026-09-07T21:12:00.000Z',
  })
  cancellableUntil!: string;
}

// Body inside the { data, meta } envelope of GET /api/v1/boarding/status —
// data is null when the student has no active return trip.
export class StudentBoardingStatusResponseDto {
  @ApiProperty({
    description: 'ID da viagem de retorno ativa do aluno',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    description:
      'Estado do aluno na viagem. CHECKED_IN prevalece sobre ausência ativa (mesma regra do roster).',
    enum: ['CHECKED_IN', 'NOT_RETURNING', 'NOT_CHECKED_IN'],
    example: 'NOT_RETURNING',
  })
  status!: 'CHECKED_IN' | 'NOT_RETURNING' | 'NOT_CHECKED_IN';

  @ApiProperty({
    type: () => StudentAbsenceDto,
    nullable: true,
    description:
      'Ausência ativa — presente somente quando status é NOT_RETURNING',
  })
  absence!: StudentAbsenceDto | null;
}
