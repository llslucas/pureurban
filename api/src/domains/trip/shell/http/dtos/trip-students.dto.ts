import { ApiProperty } from '@nestjs/swagger';

export enum BoardingStatusDto {
  CHECKED_IN = 'CHECKED_IN',
  NOT_CHECKED_IN = 'NOT_CHECKED_IN',
  NOT_RETURNING = 'NOT_RETURNING',
}

export class TripStudentItemDto {
  @ApiProperty({
    description: 'ID do aluno',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  studentId!: string;

  @ApiProperty({
    description: 'Nome do aluno',
    example: 'Maria Silva',
  })
  name!: string;

  @ApiProperty({
    enum: BoardingStatusDto,
    description: 'Status de embarque do aluno na viagem',
    example: BoardingStatusDto.NOT_CHECKED_IN,
  })
  status!: BoardingStatusDto;

  @ApiProperty({
    type: 'string',
    description:
      'Data e hora do check-in (ISO 8601 UTC), null se ainda não embarcou',
    example: '2026-07-12T21:10:00.000Z',
    nullable: true,
  })
  checkedInAt!: string | null;
}

export class BoardingSummaryDto {
  @ApiProperty({
    description: 'Quantidade de alunos já embarcados',
    example: 12,
  })
  boarded!: number;

  @ApiProperty({
    description: 'Quantidade total de alunos na viagem',
    example: 20,
  })
  total!: number;
}

export class TripStudentsResponseDto {
  @ApiProperty({
    description: 'Lista de alunos da viagem com status de embarque',
    type: [TripStudentItemDto],
  })
  students!: TripStudentItemDto[];

  @ApiProperty({
    description: 'Resumo agregado de embarque — sempre calculado no servidor',
    type: BoardingSummaryDto,
  })
  summary!: BoardingSummaryDto;
}
