import { ApiProperty } from '@nestjs/swagger';

// Body do data de GET /api/v1/tracking/trips/active (Story 5.2) — o único
// acréscimo de contrato da story. data é null quando o aluno não tem viagem
// ativa em nenhuma rota dele (o endpoint documenta a nullability no schema).
export class ActiveTrackingTripDto {
  @ApiProperty({
    description:
      'ID da viagem ativa na rota do aluno — alimenta o stream e o last-known',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    enum: ['OUTBOUND', 'RETURN'],
    description:
      'Perna da viagem ativa (ida ou volta) — o acompanhamento serve às duas',
    example: 'OUTBOUND',
  })
  type!: 'OUTBOUND' | 'RETURN';
}
