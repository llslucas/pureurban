import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { TripService } from '../trip.service.js'
import { CreateTripDto } from './dtos/create-trip.dto.js'
import { TenantGuard } from '../../../shared/shell/guards/tenant.guard.js'
import { RolesGuard } from '../../../shared/shell/guards/roles.guard.js'
import { Roles } from '../../../shared/shell/decorators/roles.decorator.js'
import { TenantId } from '../../../shared/shell/decorators/tenant-id.decorator.js'

// TODO: habilitar JwtAuthGuard quando Epic 2 (Auth) estiver pronto
// import { JwtAuthGuard } from '../../../shared/shell/guards/jwt-auth.guard.js'

@ApiTags('trips')
@Controller('api/v1/trips')
@UseGuards(TenantGuard, RolesGuard)
@Roles(['driver'])
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @Post()
  @ApiOperation({ summary: 'Iniciar nova viagem (OUTBOUND ou RETURN)' })
  @ApiResponse({ status: 201, description: 'Viagem criada com sucesso' })
  @ApiResponse({ status: 409, description: 'Motorista já possui viagem ativa' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente motoristas' })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateTripDto,
    @Req() req: Request & { user: { userId: string } },
  ) {
    const driverId = req.user.userId
    return this.tripService.createTrip(driverId, dto.routeId, tenantId, dto.type, dto.relatedTripId)
  }

  @Patch(':id/end')
  @ApiOperation({ summary: 'Encerrar viagem ativa' })
  @ApiResponse({ status: 200, description: 'Viagem encerrada com sucesso' })
  @ApiResponse({ status: 404, description: 'Viagem não encontrada' })
  @ApiResponse({ status: 400, description: 'Viagem não está ativa' })
  async end(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Req() req: Request & { user: { userId: string } },
  ) {
    const driverId = req.user.userId
    return this.tripService.endTrip(id, driverId, tenantId)
  }

  @Get('active')
  @ApiOperation({ summary: 'Obter viagem ativa do motorista' })
  @ApiResponse({ status: 200, description: 'Viagem ativa ou null' })
  async getActive(
    @TenantId() tenantId: string,
    @Req() req: Request & { user: { userId: string } },
  ) {
    const driverId = req.user.userId
    return this.tripService.getActiveTrip(driverId, tenantId)
  }
}
