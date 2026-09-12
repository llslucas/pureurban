import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/shell/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../../shared/shell/guards/tenant.guard.js';
import { RolesGuard } from '../../../shared/shell/guards/roles.guard.js';
import { Roles } from '../../../shared/shell/decorators/roles.decorator.js';
import { TenantId } from '../../../shared/shell/decorators/tenant-id.decorator.js';
import { ApiDataResponse } from '../../../shared/shell/decorators/api-data-response.decorator.js';
import { EffectSchemaPipe } from '../../../shared/shell/pipes/effect-schema.pipe.js';
import { ErrorResponseDto } from '../../../shared/shell/http/error-response.dto.js';
import {
  LastKnownLocationDto,
  LocationIngestRequestDto,
  LocationIngestResponseDto,
} from './dtos/index.js';
import { LocationUpdatedEventDto } from './dtos/tracking-events.dto.js';
import {
  LocationIngestInput,
  TripIdParam,
} from '../../core/schemas/location-ingest.schema.js';
import { TrackingService } from '../tracking.service.js';

// Story 5.1 wired POST /location and GET /trips/:id/location to the real core
// (Effect use cases + Redis behind LocationBus). The stream stays @Get (NOT
// @Sse) and 501 on purpose: with the global ResponseWrapperInterceptor, an
// error thrown inside a @Sse handler never reaches the EffectExceptionFilter
// and comes back as 200 `event: error`. 5.2 flips it to @Sse in the same commit
// as the real stream (precedent: boarding 4.0 -> 4.2). Swagger decorators are
// the frozen 5.0 contract — openapi.json must not drift.
@ApiTags('tracking')
@ApiBearerAuth()
@Controller('api/v1/tracking')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['STUDENT'])
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('location')
  @Roles(['DRIVER'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transmitir a posição GPS do ônibus na viagem ativa',
    description:
      'Recepção da posição capturada pelo device do motorista (envio automático enquanto a viagem está ativa). ' +
      'Last-write-wins: cada posição substitui a anterior e posições velhas são descartáveis — por isso NÃO usa ' +
      'X-Idempotency-Key (divergência consciente dos POSTs do boarding, que protegem operações na fila offline).',
  })
  @ApiBody({ type: LocationIngestRequestDto })
  @ApiDataResponse(
    LocationIngestResponseDto,
    200,
    'Posição recebida — ack com o instante de recebimento do servidor',
  )
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR — body malformado (tripId ausente ou não é UUID, coordenadas ausentes ou não numéricas, capturedAt não ISO 8601).',
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
      'DRIVER_NOT_ON_TRIP — motorista autenticado não é o atribuído à viagem (espelho do STUDENT_NOT_ON_TRIP do boarding). ' +
      'FORBIDDEN — role DRIVER exigida: somente o motorista transmite GPS.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'TRIP_NOT_ACTIVE — viagem inexistente, de outra empresa ou não ativa (posição só é aceita em viagem ativa).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 501,
    description:
      'NOT_IMPLEMENTED — contrato declarado na Story 5.0; implementação na Story 5.1.',
    type: ErrorResponseDto,
  })
  async ingestLocation(
    @TenantId() companyId: string,
    @Req() req: Request & { user: { userId: string } },
    @Body(new EffectSchemaPipe(LocationIngestInput, 'VALIDATION_ERROR'))
    body: LocationIngestInput,
  ) {
    // O motorista vem do token, nunca do body: é ele que autoriza a transmissão
    // (mesmo padrão do driverId no check-in do boarding).
    return this.trackingService.ingestLocation({
      ...body,
      companyId,
      driverId: req.user.userId,
    });
  }

  @Get('trips/:id/location')
  @ApiOperation({
    summary: 'Última posição conhecida do ônibus na viagem',
    description:
      'Estado inicial da tela de acompanhamento antes do primeiro evento do stream e o que permanece visível ' +
      'quando o sinal GPS cai. Sem replay/Last-Event-ID no stream — o resync do aluno é este endpoint. ' +
      'A posição não é persistida em PostgreSQL: vive em cache com TTL curto, e a expiração é 404, nunca ponto stale.',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'ID da viagem',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiDataResponse(
    LastKnownLocationDto,
    200,
    'Último ponto conhecido da viagem',
  )
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — id da viagem ausente ou não é UUID.',
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
      'STUDENT_NOT_ON_TRIP — aluno não vinculado à rota da viagem (mesmo código/semântica do boarding). ' +
      'FORBIDDEN — role STUDENT exigida: o acompanhamento é do aluno.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'NO_LOCATION_AVAILABLE — nenhuma posição armazenada para a viagem (cache vazio ou TTL expirado).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'TRIP_NOT_ACTIVE — viagem inexistente, de outra empresa ou não ativa.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 501,
    description:
      'NOT_IMPLEMENTED — contrato declarado na Story 5.0; implementação na Story 5.1.',
    type: ErrorResponseDto,
  })
  lastKnownLocation(
    @TenantId() companyId: string,
    @Req() req: Request & { user: { userId: string } },
    @Param('id', new EffectSchemaPipe(TripIdParam, 'VALIDATION_ERROR'))
    tripId: string,
  ) {
    // O aluno vem do token, nunca da URL — quem consulta é a identidade
    // autenticada (mesmo padrão do studentId nos POSTs do boarding).
    return this.trackingService.getLastKnownLocation({
      tripId,
      companyId,
      studentId: req.user.userId,
    });
  }

  @Get('trips/:id/stream')
  @ApiOperation({
    summary: 'Stream SSE do acompanhamento do ônibus em tempo real',
    description:
      'Canal em tempo real do aluno para a viagem: cada mensagem traz a linha `event:` com `location.updated` ' +
      'e a linha `data:` com a posição publicada. Sem replay/Last-Event-ID — após queda de rede, o resync é o ' +
      'GET .../location e a reconexão é responsabilidade do cliente (EventSource com backoff). ' +
      'A conexão é encerrada elegantemente quando a viagem termina. Auth via header Authorization (o token nunca vai na URL).',
  })
  @ApiParam({
    name: 'id',
    required: true,
    description: 'ID da viagem',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiExtraModels(LocationUpdatedEventDto)
  @ApiResponse({
    status: 200,
    description:
      'Stream `text/event-stream` — uma mensagem por posição publicada, com `event:` carregando `location.updated` e `data:` o payload JSON.',
    content: {
      'text/event-stream': {
        schema: {
          oneOf: [{ $ref: getSchemaPath(LocationUpdatedEventDto) }],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — id da viagem ausente ou não é UUID.',
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
      'STUDENT_NOT_ON_TRIP — aluno não vinculado à rota da viagem (mesmo código/semântica do boarding). ' +
      'FORBIDDEN — role STUDENT exigida: o acompanhamento é do aluno.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'TRIP_NOT_ACTIVE — viagem inexistente, de outra empresa ou não ativa.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 501,
    description:
      'NOT_IMPLEMENTED — contrato declarado na Story 5.0; implementação na Story 5.2.',
    type: ErrorResponseDto,
  })
  tripLocationStream() {
    throw new NotImplementedException({
      code: 'NOT_IMPLEMENTED',
      message: 'Contrato declarado na Story 5.0 — implementação na Story 5.2',
    });
  }
}
