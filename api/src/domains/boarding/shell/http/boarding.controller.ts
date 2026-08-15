import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiHeader,
  ApiBody,
  ApiResponse,
  ApiExtraModels,
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
import { CheckInInput } from '../../core/schemas/check-in.schema.js';
import { BoardingService } from '../boarding.service.js';

@ApiTags('boarding')
@ApiBearerAuth()
@Controller('api/v1/boarding')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['DRIVER'])
@ApiExtraModels(QrCodePayloadDto)
export class BoardingController {
  constructor(private readonly boardingService: BoardingService) {}

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
}
