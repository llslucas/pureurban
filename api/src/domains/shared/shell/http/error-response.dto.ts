import { ApiProperty } from '@nestjs/swagger';

class ErrorBodyDto {
  @ApiProperty({
    description: 'Código de erro tipado',
    example: 'TRIP_NOT_ACTIVE',
  })
  code!: string;

  @ApiProperty({
    description: 'Mensagem legível descrevendo o erro',
    example: 'A viagem não está ativa',
  })
  message!: string;

  @ApiProperty({
    description: 'Detalhes adicionais do erro (opcional)',
    required: false,
  })
  details?: Record<string, unknown>;
}

/**
 * Documenta o envelope de erro { error: { code, message, details? } }
 * produzido pelo EffectExceptionFilter global.
 */
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
