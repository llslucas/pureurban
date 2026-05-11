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
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RoutingService } from '../routing.service.js';
import { JwtAuthGuard } from '../../../auth/shell/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../../shared/shell/guards/tenant.guard.js';
import { RolesGuard } from '../../../shared/shell/guards/roles.guard.js';
import { Roles } from '../../../shared/shell/decorators/roles.decorator.js';
import { TenantId } from '../../../shared/shell/decorators/tenant-id.decorator.js';
import { EffectSchemaPipe } from '../../../shared/shell/pipes/effect-schema.pipe.js';
import { CreateRouteInput } from '../../core/schemas/create-route.schema.js';
import { UpdateRouteInput } from '../../core/schemas/update-route.schema.js';
import { AssignStudentInput } from '../../core/schemas/assign-student.schema.js';
import { AssignDriverInput } from '../../core/schemas/assign-driver.schema.js';

type AuthenticatedRequest = Request & {
  user: { userId: string; role: 'ADMIN' | 'DRIVER' | 'STUDENT' };
};

@ApiTags('routes')
@ApiBearerAuth()
@Controller('api/v1/routes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['ADMIN'])
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  // ─── CRUD de Rotas ───────────────────────────────────────────

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

  // ATENÇÃO: @Get('mine') DEVE vir ANTES de @Get(':id')
  // Caso contrário, NestJS interpreta "mine" como UUID e falha no ParseUUIDPipe
  @Get('mine')
  @Roles(['DRIVER', 'STUDENT']) // Override do @Roles(['ADMIN']) da classe
  @ApiOperation({ summary: 'Listar minhas rotas (motorista ou aluno)' })
  @ApiResponse({ status: 200, description: 'Rotas do usuário autenticado' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado — somente DRIVER ou STUDENT',
  })
  async getMyRoutes(
    @TenantId() companyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    const role = req.user.role as 'DRIVER' | 'STUDENT';
    return this.routingService.getMyRoutes(userId, role, companyId);
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

  // ─── Vínculos Aluno-Rota ─────────────────────────────────────

  @Post(':routeId/students')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Vincular aluno a rota' })
  @ApiResponse({ status: 201, description: 'Aluno vinculado com sucesso' })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos (VALIDATION_ERROR)',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  @ApiResponse({ status: 404, description: 'Rota ou aluno não encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Vínculo já existe (ASSIGNMENT_ALREADY_EXISTS)',
  })
  async assignStudent(
    @TenantId() companyId: string,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body(new EffectSchemaPipe(AssignStudentInput)) body: AssignStudentInput,
  ) {
    return this.routingService.assignStudent(
      routeId,
      body.studentId,
      companyId,
    );
  }

  @Delete(':routeId/students/:studentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desvincular aluno da rota' })
  @ApiResponse({ status: 204, description: 'Vínculo removido' })
  @ApiResponse({ status: 400, description: 'ID inválido (não-UUID)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  @ApiResponse({
    status: 404,
    description: 'Vínculo não encontrado (ASSIGNMENT_NOT_FOUND)',
  })
  async unassignStudent(
    @TenantId() companyId: string,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    await this.routingService.unassignStudent(routeId, studentId, companyId);
  }

  @Get(':routeId/students')
  @ApiOperation({ summary: 'Listar alunos vinculados à rota' })
  @ApiResponse({ status: 200, description: 'Lista de alunos da rota' })
  @ApiResponse({ status: 400, description: 'ID inválido (não-UUID)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  async listRouteStudents(
    @TenantId() companyId: string,
    @Param('routeId', ParseUUIDPipe) routeId: string,
  ) {
    return this.routingService.listRouteStudents(routeId, companyId);
  }

  // ─── Vínculos Motorista-Rota ─────────────────────────────────

  @Post(':routeId/drivers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Vincular motorista a rota' })
  @ApiResponse({ status: 201, description: 'Motorista vinculado com sucesso' })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos (VALIDATION_ERROR)',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  @ApiResponse({ status: 404, description: 'Rota ou motorista não encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Vínculo já existe (ASSIGNMENT_ALREADY_EXISTS)',
  })
  async assignDriver(
    @TenantId() companyId: string,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body(new EffectSchemaPipe(AssignDriverInput)) body: AssignDriverInput,
  ) {
    return this.routingService.assignDriver(routeId, body.driverId, companyId);
  }

  @Delete(':routeId/drivers/:driverId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desvincular motorista da rota' })
  @ApiResponse({ status: 204, description: 'Vínculo removido' })
  @ApiResponse({ status: 400, description: 'ID inválido (não-UUID)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  @ApiResponse({
    status: 404,
    description: 'Vínculo não encontrado (ASSIGNMENT_NOT_FOUND)',
  })
  async unassignDriver(
    @TenantId() companyId: string,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Param('driverId', ParseUUIDPipe) driverId: string,
  ) {
    await this.routingService.unassignDriver(routeId, driverId, companyId);
  }

  @Get(':routeId/drivers')
  @ApiOperation({ summary: 'Listar motoristas vinculados à rota' })
  @ApiResponse({ status: 200, description: 'Lista de motoristas da rota' })
  @ApiResponse({ status: 400, description: 'ID inválido (não-UUID)' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado — somente ADMIN' })
  async listRouteDrivers(
    @TenantId() companyId: string,
    @Param('routeId', ParseUUIDPipe) routeId: string,
  ) {
    return this.routingService.listRouteDrivers(routeId, companyId);
  }
}
