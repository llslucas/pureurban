import { ApiProperty } from '@nestjs/swagger';

// Body of the pending reminder inside the { data, meta } envelope of
// GET /api/v1/boarding/reminder — data is null when there is no reminder
// (no active trip, no row, check-in on the return or active absence).
// Same payload as the boarding.checkin_reminder event minus studentId,
// which here comes from the JWT.
export class PendingReminderResponseDto {
  @ApiProperty({
    description: 'ID da viagem de retorno com lembrete pendente',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tripId!: string;

  @ApiProperty({
    type: 'string',
    description:
      'Momento do disparo do lembrete (ISO 8601 UTC) — o mesmo remindedAt do evento boarding.checkin_reminder',
    example: '2026-09-07T22:15:00.000Z',
  })
  remindedAt!: string;
}
