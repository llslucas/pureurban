import { ApiProperty, ApiSchema } from '@nestjs/swagger';

// No wire do GET /api/v1/boarding/events a linha `event:` carrega o tipo do
// evento e a linha `data:` o payload desta classe em JSON. O nome do aluno
// NUNCA trafega no evento: o cliente resolve a partir do roster da viagem —
// os eventos só carregam IDs. Essas classes não aparecem em nenhum
// request/response HTTP: entram no openapi.json via @ApiExtraModels + oneOf.

@ApiSchema({
  description:
    'Evento SSE `boarding.not_returning`: a linha `event:` do stream carrega este nome e a linha `data:` o payload JSON abaixo. Emitido ao motorista da viagem quando um aluno registra ausência (POST /not-returning, Story 4.1) — o status na lista muda para "NÃO VAI VOLTAR" e a contagem resumida se ajusta. O nome do aluno é resolvido pelo cliente a partir do roster.',
})
export class BoardingNotReturningEventDto {
  @ApiProperty({
    description: 'ID da viagem em que a ausência foi registrada',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    description: 'ID do aluno que registrou a ausência',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  studentId!: string;

  @ApiProperty({
    type: 'string',
    description:
      'Momento do registro da ausência (ISO 8601 UTC) — eco do notifiedAt da ausência',
    example: '2026-09-07T21:10:00.000Z',
  })
  notifiedAt!: string;
}

@ApiSchema({
  description:
    'Evento SSE `boarding.absence_cancelled`: a linha `event:` do stream carrega este nome e a linha `data:` o payload JSON abaixo. Emitido ao motorista da viagem quando o aluno cancela a ausência dentro da janela (POST /cancel-absence, Story 4.3) — status e contagem resumida voltam ao estado anterior. O nome do aluno é resolvido pelo cliente a partir do roster.',
})
export class BoardingAbsenceCancelledEventDto {
  @ApiProperty({
    description: 'ID da viagem em que a ausência foi cancelada',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    description: 'ID do aluno que cancelou a ausência',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  studentId!: string;

  @ApiProperty({
    type: 'string',
    description:
      'Momento do cancelamento (ISO 8601 UTC) — eco do cancelledAt do cancelamento',
    example: '2026-09-07T21:11:00.000Z',
  })
  cancelledAt!: string;
}

@ApiSchema({
  description:
    'Evento SSE `boarding.checkin_reminder`: a linha `event:` do stream carrega este nome e a linha `data:` o payload JSON abaixo. Lembrete in-app ao aluno que embarcou na ida e, após 15 minutos do início da viagem de retorno, não fez check-in nem registrou ausência (Story 4.4) — emitido no máximo uma vez por aluno por viagem. O nome do aluno é resolvido pelo cliente a partir do roster. A entrega ao aluno é derivada do estado na abertura do app (Story 4.4) — este stream é o canal do motorista.',
})
export class BoardingCheckinReminderEventDto {
  @ApiProperty({
    description: 'ID da viagem de retorno em curso',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    description: 'ID do aluno que deve ser lembrado do check-in',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  studentId!: string;

  @ApiProperty({
    type: 'string',
    description: 'Momento do disparo do lembrete (ISO 8601 UTC)',
    example: '2026-09-07T22:15:00.000Z',
  })
  remindedAt!: string;
}
