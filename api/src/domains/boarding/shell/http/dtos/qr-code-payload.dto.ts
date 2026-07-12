import { ApiProperty, ApiSchema } from '@nestjs/swagger';

// A description vai no @ApiSchema (não no docblock): sem o plugin CLI do Swagger,
// JSDoc não é emitido, e o formato de codificação é justamente o contrato entre a
// tela do aluno (3.2b) e a validação do motorista (3.3b) — precisa chegar ao consumidor.
@ApiSchema({
  description:
    'Payload do QR code exibido na tela do aluno (Story 3.2b) e decodificado pelo app do motorista (Story 3.3b). ' +
    'Codificação: string JSON compacta em UTF-8, gravada direto no QR, SEM base64 — QR menor para leitura mais ' +
    'rápida em movimento (NFR1). Não aparece em nenhum request/response HTTP: registrado no OpenAPI via @ApiExtraModels.',
})
export class QrCodePayloadDto {
  @ApiProperty({
    description: 'ID do aluno dono do QR code',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  studentId!: string;

  @ApiProperty({
    description:
      'UUID v4 gerado no cliente a cada login e persistido em MMKV — torna o QR estático por sessão (NFR8). O backend trata como opaco no MVP.',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  sessionId!: string;
}
