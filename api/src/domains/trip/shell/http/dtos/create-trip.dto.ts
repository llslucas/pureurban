import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TripTypeDto {
  OUTBOUND = 'OUTBOUND',
  RETURN = 'RETURN',
}

export class CreateTripDto {
  @ApiProperty({
    description: 'ID da rota',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  routeId!: string;

  @ApiProperty({
    enum: TripTypeDto,
    description: 'Tipo de viagem: ida (OUTBOUND) ou volta (RETURN)',
  })
  @IsEnum(TripTypeDto)
  type!: TripTypeDto;

  @ApiPropertyOptional({
    description: 'ID da viagem de ida (obrigatório para RETURN)',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  relatedTripId?: string;
}

export class EndTripDto {
  // DTO vazio — encerrar viagem não requer body payload.
  // Mantido para extensibilidade futura (ex: motorista confirmar destino).
}
