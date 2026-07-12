import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  NotImplementedException,
} from '@nestjs/common';
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
import { ApiDataResponse } from '../../../shared/shell/decorators/api-data-response.decorator.js';
import { ErrorResponseDto } from '../../../shared/shell/http/error-response.dto.js';
import { CheckInRequestDto, CheckInResponseDto } from './dtos/check-in.dto.js';
import { QrCodePayloadDto } from './dtos/qr-code-payload.dto.js';

@ApiTags('boarding')
@ApiBearerAuth()
@Controller('api/v1/boarding')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['DRIVER'])
@ApiExtraModels(QrCodePayloadDto)
export class BoardingController {
  @Post('check-in')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar check-in de embarque de um aluno',
    description:
      'Contrato declarado — implementação na Story 3.3a. Idempotência: mesma X-Idempotency-Key retorna o resultado anterior com 201, sem duplicar.',
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
      'INVALID_QR_CODE — studentId ou tripId ausente/malformado. O QR bruto nunca trafega (o app do motorista decodifica e envia campos estruturados), então este erro é validação de shape do body, não do QR em si. ' +
      'MISSING_IDEMPOTENCY_KEY — header X-Idempotency-Key ausente ou vazio (é required).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Não autenticado',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'STUDENT_NOT_ALLOWED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'TRIP_NOT_ACTIVE | DUPLICATE_CHECK_IN',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 501,
    description:
      'NOT_IMPLEMENTED — contrato declarado, implementação na Story 3.3a',
    type: ErrorResponseDto,
  })
  checkIn(): never {
    throw new NotImplementedException({
      code: 'NOT_IMPLEMENTED',
      message: 'Contrato declarado na Story 3.0 — implementação na Story 3.3a',
    });
  }
}
