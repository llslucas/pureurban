import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiHeader,
  ApiBody,
  ApiResponse,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/shell/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../../shared/shell/guards/tenant.guard.js';
import { RolesGuard } from '../../../shared/shell/guards/roles.guard.js';
import { Roles } from '../../../shared/shell/decorators/roles.decorator.js';
import { TenantId } from '../../../shared/shell/decorators/tenant-id.decorator.js';
import { IdempotencyKey } from '../../../shared/shell/decorators/idempotency-key.decorator.js';
import { ApiDataResponse } from '../../../shared/shell/decorators/api-data-response.decorator.js';
import { EffectSchemaPipe } from '../../../shared/shell/pipes/effect-schema.pipe.js';
import { ErrorResponseDto } from '../../../shared/shell/http/error-response.dto.js';
import { CheckInRequestDto, CheckInResponseDto } from './dtos/check-in.dto.js';
import { QrCodePayloadDto } from './dtos/qr-code-payload.dto.js';
import {
  NotReturningRequestDto,
  NotReturningResponseDto,
} from './dtos/not-returning.dto.js';
import {
  CancelAbsenceRequestDto,
  CancelAbsenceResponseDto,
} from './dtos/cancel-absence.dto.js';
import { PendingReminderResponseDto } from './dtos/pending-reminder.dto.js';
import {
  BoardingNotReturningEventDto,
  BoardingAbsenceCancelledEventDto,
  BoardingCheckinReminderEventDto,
} from './dtos/boarding-events.dto.js';
import { CheckInInput } from '../../core/schemas/check-in.schema.js';
import { NotReturningInput } from '../../core/schemas/not-returning.schema.js';
import { CancelAbsenceInput } from '../../core/schemas/cancel-absence.schema.js';
import { BoardingService } from '../boarding.service.js';
import { BoardingEventsService } from '../events/boarding-events.service.js';
import { BoardingEventsGuard } from './boarding-events.guard.js';
import { TripService } from '../../../trip/shell/trip.service.js';

@ApiTags('boarding')
@ApiBearerAuth()
@Controller('api/v1/boarding')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['DRIVER'])
@ApiExtraModels(QrCodePayloadDto)
export class BoardingController {
  constructor(
    private readonly boardingService: BoardingService,
    private readonly boardingEventsService: BoardingEventsService,
    // Shell-to-shell composition (BoardingEventsGuard pattern): the student's
    // active trip is resolved by the trip domain, not duplicated in boarding.
    private readonly tripService: TripService,
  ) {}

  @Post('check-in')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar check-in de embarque de um aluno',
    description:
      'Idempotência: mesma X-Idempotency-Key retorna o resultado anterior com 201, sem duplicar.',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description:
      'UUID v4 gerado no cliente — chave da fila offline (Architecture §5, Tier 2). Mesma key reenviada retorna o mesmo resultado sem duplicar o check-in.',
  })
  @ApiBody({ type: CheckInRequestDto })
  @ApiDataResponse(CheckInResponseDto, 201, 'Check-in registrado com sucesso')
  @ApiResponse({
    status: 400,
    description:
      'INVALID_QR_CODE — studentId ou tripId ausente/malformado, ou occurredAt fora da janela aceita (no futuro além da tolerância de relógio, ou mais de 24h no passado). O QR bruto nunca trafega (o app do motorista decodifica e envia campos estruturados), então este erro é validação de shape do body, não do QR em si. ' +
      'MISSING_IDEMPOTENCY_KEY — header X-Idempotency-Key ausente ou vazio (é required). ' +
      'INVALID_IDEMPOTENCY_KEY — header presente mas acima do limite de tamanho.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Não autenticado',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'STUDENT_NOT_ALLOWED — aluno inexistente, inativo, de outra empresa ou não vinculado à rota da viagem. ' +
      'DRIVER_NOT_ASSIGNED — motorista autenticado não é o responsável por esta viagem.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'TRIP_NOT_ACTIVE — viagem inexistente, de outra empresa ou não ativa. ' +
      'DUPLICATE_CHECK_IN — aluno já embarcou nesta viagem (key diferente). ' +
      'IDEMPOTENCY_KEY_CONFLICT — key já usada para um aluno ou viagem diferente do enviado.',
    type: ErrorResponseDto,
  })
  async checkIn(
    @TenantId() companyId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Req() req: Request & { user: { userId: string } },
    @Body(new EffectSchemaPipe(CheckInInput, 'INVALID_QR_CODE'))
    body: CheckInInput,
  ) {
    return this.boardingService.processCheckIn({
      ...body,
      companyId,
      // O motorista vem do token, nunca do body: é ele que autoriza a operação
      // e é ele que fica gravado em recordedBy como trilha de auditoria.
      driverId: req.user.userId,
      idempotencyKey,
    });
  }

  @Post('not-returning')
  // Override do ['DRIVER'] da classe: quem avisa a ausência é o aluno
  // (RolesGuard usa getAllAndOverride — metadata do handler vence a da classe)
  @Roles(['STUDENT'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar ausência "não vou voltar"',
    description:
      'O aluno autenticado (studentId do JWT) avisa que não vai voltar na viagem ativa. ' +
      'Idempotência: mesma X-Idempotency-Key retorna o mesmo resultado com 201, sem duplicar. ' +
      'cancellableUntil (janela de cancelamento) é calculado pelo servidor — o cliente nunca calcula, só exibe o countdown.',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description:
      'UUID v4 gerado no cliente — chave da fila offline (Architecture §5, Tier 2, operação notify_not_returning). Mesma key reenviada retorna o mesmo resultado sem duplicar a ausência.',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiBody({ type: NotReturningRequestDto })
  @ApiDataResponse(
    NotReturningResponseDto,
    201,
    'Ausência registrada com sucesso',
  )
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR — body malformado (tripId ausente ou não é UUID). ' +
      'MISSING_IDEMPOTENCY_KEY — header X-Idempotency-Key ausente ou vazio (é required). ' +
      'INVALID_IDEMPOTENCY_KEY — header presente mas acima de 200 caracteres.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Não autenticado',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'STUDENT_NOT_ON_TRIP — aluno não pertence à rota da viagem.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'TRIP_NOT_ACTIVE — viagem inexistente, de outra empresa ou não ativa. ' +
      'ALREADY_NOT_RETURNING — ausência já registrada nesta viagem (key diferente). ' +
      'ALREADY_CHECKED_IN — aluno já embarcou nesta viagem: o check-in do motorista presente tem autoridade sobre a ausência, e o aluno deve falar com o motorista. ' +
      'IDEMPOTENCY_KEY_CONFLICT — key já usada para uma viagem diferente do enviado.',
    type: ErrorResponseDto,
  })
  notReturning(
    @TenantId() companyId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Req() req: Request & { user: { userId: string } },
    @Body(new EffectSchemaPipe(NotReturningInput, 'VALIDATION_ERROR'))
    body: NotReturningInput,
  ) {
    // O aluno vem do token, nunca do body: é a identidade autenticada que
    // avisa a própria ausência (mesmo padrão do driverId no check-in).
    return this.boardingService.registerNotReturning({
      ...body,
      companyId,
      studentId: req.user.userId,
      idempotencyKey,
    });
  }

  @Post('cancel-absence')
  @Roles(['STUDENT'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar ausência dentro da janela de segurança',
    description:
      'O aluno autenticado (studentId do JWT) desfaz a ausência registrada. Só é aceito dentro da janela ' +
      'cancellableUntil (notifiedAt + 2 minutos, calculada pelo servidor). Idempotência: mesma ' +
      'X-Idempotency-Key retorna o mesmo resultado com 200.',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description:
      'UUID v4 gerado no cliente — chave da fila offline (Architecture §5, Tier 2, operação cancel_absence). Mesma key reenviada retorna o mesmo resultado.',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiBody({ type: CancelAbsenceRequestDto })
  @ApiDataResponse(
    CancelAbsenceResponseDto,
    200,
    'Ausência cancelada com sucesso',
  )
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR — body malformado (tripId ausente ou não é UUID). ' +
      'MISSING_IDEMPOTENCY_KEY — header X-Idempotency-Key ausente ou vazio (é required). ' +
      'INVALID_IDEMPOTENCY_KEY — header presente mas acima de 200 caracteres.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Não autenticado',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'STUDENT_NOT_ON_TRIP — aluno não pertence à rota da viagem.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'ABSENCE_NOT_FOUND — ausência inexistente ou já cancelada, enviada com X-Idempotency-Key diferente. ' +
      'Reenvio da MESMA key da chamada original retorna o resultado original com 200.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'TRIP_NOT_ACTIVE — viagem inexistente, de outra empresa ou não ativa. ' +
      'CANCELLATION_PERIOD_EXPIRED — fora da janela cancellableUntil (notifiedAt + 2 minutos). ' +
      'IDEMPOTENCY_KEY_CONFLICT — key já usada para uma viagem diferente do enviado.',
    type: ErrorResponseDto,
  })
  cancelAbsence(
    @TenantId() companyId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Req() req: Request & { user: { userId: string } },
    @Body(new EffectSchemaPipe(CancelAbsenceInput, 'VALIDATION_ERROR'))
    body: CancelAbsenceInput,
  ) {
    // O aluno vem do token, nunca do body — mesmo padrão do notReturning.
    return this.boardingService.cancelAbsence({
      ...body,
      companyId,
      studentId: req.user.userId,
      idempotencyKey,
    });
  }

  @Get('reminder')
  // Override of the class-level ['DRIVER']: the reminder is consumed by the
  // student (same override as the absence POSTs — handler metadata beats class
  // metadata in the RolesGuard's getAllAndOverride).
  @Roles(['STUDENT'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lembrete pendente de check-in na volta',
    description:
      'Deriva na leitura o lembrete disparado pelo scan automático (Story 4.4) para o aluno ' +
      'autenticado (studentId do JWT): pendente somente se a linha BoardingReminder existe E o aluno ' +
      'ainda não fez check-in na viagem E não tem ausência ativa. 200 sempre — data null significa ' +
      '"sem lembrete" (sem viagem de retorno ativa, sem linha, ou pendência já resolvida). ' +
      'Permite quem não estava conectado ao stream ver o lembrete ao abrir o app.',
  })
  @ApiExtraModels(PendingReminderResponseDto)
  @ApiResponse({
    status: 200,
    description:
      'Envelope { data, meta } com data null ou { tripId, remindedAt }. A viagem ativa é resolvida ' +
      'pelo domínio trip ANTES do boarding — aluno sem viagem de retorno ativa já recebe data null.',
    schema: {
      properties: {
        data: {
          allOf: [{ $ref: getSchemaPath(PendingReminderResponseDto) }],
          nullable: true,
        },
        meta: {
          type: 'object',
          properties: { timestamp: { type: 'string', format: 'date-time' } },
        },
      },
      required: ['data', 'meta'],
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Não autenticado',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN — role STUDENT exigida (o lembrete é do aluno).',
    type: ErrorResponseDto,
  })
  async reminder(
    @TenantId() companyId: string,
    @Req() req: Request & { user: { userId: string } },
  ) {
    // No active return trip on the student's route ⇒ { data: null } resolved
    // BEFORE touching boarding (same semantics as GET /trips/active).
    const trip = await this.tripService.getActiveStudentTrip(
      req.user.userId,
      companyId,
    );
    if (!trip) {
      return null;
    }

    // The student comes from the token, never from the query — same pattern
    // as the absence POSTs.
    return this.boardingService.getPendingReminder({
      studentId: req.user.userId,
      tripId: trip.id,
      companyId,
    });
  }

  // O 409 de viagem inativa sai do BoardingEventsGuard, ANTES do stream: erro
  // de guard alcança o exception filter; erro dentro de handler @Sse viria
  // HTTP 200 `event: error` (a exceção é engolida pelo stream).
  @Sse('events')
  @Roles(['DRIVER'])
  @UseGuards(BoardingEventsGuard)
  @ApiOperation({
    summary: 'Stream SSE de eventos de embarque da viagem do motorista',
    description:
      'Canal em tempo real do motorista para a viagem ativa. Cada mensagem do stream traz a linha ' +
      '`event:` com o tipo (boarding.not_returning | boarding.absence_cancelled | boarding.checkin_reminder) ' +
      'e a linha `data:` com o payload JSON. A conexão é encerrada elegantemente quando a viagem termina; ' +
      'a reconexão após queda de rede é responsabilidade do cliente (EventSource), sem duplicar entradas na lista.',
  })
  @ApiExtraModels(
    BoardingNotReturningEventDto,
    BoardingAbsenceCancelledEventDto,
    BoardingCheckinReminderEventDto,
  )
  @ApiResponse({
    status: 200,
    description:
      'Stream `text/event-stream` — uma mensagem por evento, com `event:` carregando o tipo e `data:` o payload JSON (oneOf dos três schemas).',
    content: {
      'text/event-stream': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(BoardingNotReturningEventDto) },
            { $ref: getSchemaPath(BoardingAbsenceCancelledEventDto) },
            { $ref: getSchemaPath(BoardingCheckinReminderEventDto) },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Não autenticado',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'FORBIDDEN — role DRIVER exigida; somente o motorista atribuído à rota abre o stream daquela viagem.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'TRIP_NOT_ACTIVE — motorista autenticado sem viagem ativa (inexistente, encerrada ou de outra empresa).',
    type: ErrorResponseDto,
  })
  events(
    @Req() req: Request & { user: { userId: string }; boardingTripId: string },
  ): Observable<MessageEvent> {
    return this.boardingEventsService.stream(req.boardingTripId);
  }
}
