import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { RoutingService } from '../routing.service.js';
import { JwtAuthGuard } from '../../../auth/shell/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../../shared/shell/guards/tenant.guard.js';
import { RolesGuard } from '../../../shared/shell/guards/roles.guard.js';
import { Roles } from '../../../shared/shell/decorators/roles.decorator.js';
import { TenantId } from '../../../shared/shell/decorators/tenant-id.decorator.js';
import { EffectSchemaPipe } from '../../../shared/shell/pipes/effect-schema.pipe.js';
import { CreateRouteInput } from '../../core/schemas/create-route.schema.js';
import { UpdateRouteInput } from '../../core/schemas/update-route.schema.js';

@ApiTags('routes')
@ApiBearerAuth()
@Controller('api/v1/routes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['ADMIN'])
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar rota de transporte' })
  @ApiResponse({ status: 201, description: 'Rota criada com sucesso' })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos (VALIDATION_ERROR)',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  async create(
    @TenantId() companyId: string,
    @Body(new EffectSchemaPipe(CreateRouteInput)) body: CreateRouteInput,
  ) {
    return this.routingService.create(body, companyId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar rotas da empresa' })
  @ApiResponse({ status: 200, description: 'Lista de rotas' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  async list(@TenantId() companyId: string) {
    return this.routingService.list(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar rota' })
  @ApiResponse({ status: 200, description: 'Dados da rota' })
  @ApiResponse({ status: 400, description: 'ID inválido (não-UUID)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  @ApiResponse({
    status: 404,
    description: 'Rota não encontrada (ROUTE_NOT_FOUND)',
  })
  async getById(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routingService.getById(id, companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar rota (parcial)' })
  @ApiResponse({ status: 200, description: 'Rota atualizada' })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou body vazio (VALIDATION_ERROR)',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  @ApiResponse({
    status: 404,
    description: 'Rota não encontrada (ROUTE_NOT_FOUND)',
  })
  async update(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new EffectSchemaPipe(UpdateRouteInput)) body: UpdateRouteInput,
  ) {
    return this.routingService.update(id, companyId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar rota (hard delete)' })
  @ApiResponse({ status: 204, description: 'Rota deletada' })
  @ApiResponse({ status: 400, description: 'ID inválido (não-UUID)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  @ApiResponse({
    status: 404,
    description: 'Rota não encontrada (ROUTE_NOT_FOUND)',
  })
  async remove(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.routingService.remove(id, companyId);
  }
}
