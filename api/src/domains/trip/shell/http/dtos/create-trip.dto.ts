import { IsEnum, IsUUID, ValidateIf } from 'class-validator';
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
  // Obrigatório num RETURN; num OUTBOUND só é validado se algum valor vier no
  // payload (senão seria ignorado silenciosamente). O core reforça a mesma regra.
  @ValidateIf(
    (o: CreateTripDto) =>
      o.type === TripTypeDto.RETURN || o.relatedTripId !== undefined,
  )
  @IsUUID()
  relatedTripId?: string;
}
