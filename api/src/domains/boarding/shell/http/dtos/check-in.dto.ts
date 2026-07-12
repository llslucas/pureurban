import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckInRequestDto {
  @ApiProperty({
    description: 'ID do aluno decodificado do QR code',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  studentId!: string;

  @ApiProperty({
    description: 'ID da viagem ativa em que o check-in ocorre',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  tripId!: string;
}

export class CheckInResponseDto {
  @ApiProperty({
    description: 'ID do registro de check-in',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  id!: string;

  @ApiProperty({
    description: 'ID do aluno que fez check-in',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  studentId!: string;

  @ApiProperty({
    description: 'ID da viagem em que o check-in ocorreu',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    description: 'Data e hora do check-in (ISO 8601 UTC)',
    example: '2026-07-12T21:10:00.000Z',
  })
  checkedInAt!: string;

  @ApiProperty({
    description: 'Status do check-in',
    enum: ['CHECKED_IN'],
    example: 'CHECKED_IN',
  })
  status!: 'CHECKED_IN';
}
