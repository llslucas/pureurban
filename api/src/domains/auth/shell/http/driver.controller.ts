import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
  UseGuards, BadRequestException, ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { DriverService } from '../driver.service.js'
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js'
import { TenantGuard } from '../../../shared/shell/guards/tenant.guard.js'
import { RolesGuard } from '../../../shared/shell/guards/roles.guard.js'
import { Roles } from '../../../shared/shell/decorators/roles.decorator.js'
import { TenantId } from '../../../shared/shell/decorators/tenant-id.decorator.js'
import { EffectSchemaPipe } from '../../../shared/shell/pipes/effect-schema.pipe.js'
import { CreateDriverInput } from '../../core/schemas/create-driver.schema.js'
import { UpdateDriverInput } from '../../core/schemas/update-driver.schema.js'

@ApiTags('drivers')
@ApiBearerAuth()
@Controller('api/v1/drivers')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['ADMIN'])
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastrar motorista' })
  @ApiResponse({ status: 201, description: 'Motorista criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (VALIDATION_ERROR)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({ status: 409, description: 'Email já cadastrado (EMAIL_ALREADY_EXISTS)' })
  async create(
    @TenantId() companyId: string,
    @Body(new EffectSchemaPipe(CreateDriverInput)) body: CreateDriverInput,
  ) {
    return this.driverService.create(body, companyId)
  }

  @Get()
  @ApiOperation({ summary: 'Listar motoristas da empresa' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filtrar por status ativo/inativo' })
  @ApiResponse({ status: 200, description: 'Lista de motoristas' })
  @ApiResponse({ status: 400, description: 'Valor inválido para isActive' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  async list(
    @TenantId() companyId: string,
    @Query('isActive') isActive?: string,
  ) {
    let filterIsActive: boolean | undefined
    if (isActive !== undefined) {
      if (isActive === 'true') filterIsActive = true
      else if (isActive === 'false') filterIsActive = false
      else throw new BadRequestException({ code: 'VALIDATION_ERROR', message: "Parâmetro 'isActive' deve ser 'true' ou 'false'" })
    }
    return this.driverService.list(companyId, filterIsActive)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar motorista' })
  @ApiResponse({ status: 200, description: 'Dados do motorista' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado (DRIVER_NOT_FOUND)' })
  async getById(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.driverService.getById(id, companyId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar motorista' })
  @ApiResponse({ status: 200, description: 'Motorista atualizado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (VALIDATION_ERROR)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado (DRIVER_NOT_FOUND)' })
  @ApiResponse({ status: 409, description: 'Email já cadastrado (EMAIL_ALREADY_EXISTS)' })
  async update(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new EffectSchemaPipe(UpdateDriverInput)) body: UpdateDriverInput,
  ) {
    return this.driverService.update(id, companyId, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar motorista (soft delete)' })
  @ApiResponse({ status: 204, description: 'Motorista desativado' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({ status: 404, description: 'Motorista não encontrado (DRIVER_NOT_FOUND)' })
  async deactivate(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.driverService.deactivate(id, companyId)
  }
}
