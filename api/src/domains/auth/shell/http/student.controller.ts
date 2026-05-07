import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { StudentService } from '../student.service.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { TenantGuard } from '../../../shared/shell/guards/tenant.guard.js';
import { RolesGuard } from '../../../shared/shell/guards/roles.guard.js';
import { Roles } from '../../../shared/shell/decorators/roles.decorator.js';
import { TenantId } from '../../../shared/shell/decorators/tenant-id.decorator.js';
import { EffectSchemaPipe } from '../../../shared/shell/pipes/effect-schema.pipe.js';
import { CreateStudentInput } from '../../core/schemas/create-student.schema.js';
import { UpdateStudentInput } from '../../core/schemas/update-student.schema.js';

@ApiTags('students')
@ApiBearerAuth()
@Controller('api/v1/students')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['ADMIN'])
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastrar aluno' })
  @ApiResponse({ status: 201, description: 'Aluno criado com sucesso' })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos (VALIDATION_ERROR)',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({
    status: 409,
    description: 'Email já cadastrado (EMAIL_ALREADY_EXISTS)',
  })
  async create(
    @TenantId() companyId: string,
    @Body(new EffectSchemaPipe(CreateStudentInput)) body: CreateStudentInput,
  ) {
    return this.studentService.create(body, companyId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar alunos da empresa' })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filtrar por status ativo/inativo',
  })
  @ApiResponse({ status: 200, description: 'Lista de alunos' })
  @ApiResponse({ status: 400, description: 'Valor inválido para isActive' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  async list(
    @TenantId() companyId: string,
    @Query('isActive') isActive?: string,
  ) {
    let filterIsActive: boolean | undefined;
    if (isActive !== undefined) {
      if (isActive === 'true') filterIsActive = true;
      else if (isActive === 'false') filterIsActive = false;
      else
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: "Parâmetro 'isActive' deve ser 'true' ou 'false'",
        });
    }
    return this.studentService.list(companyId, filterIsActive);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar aluno' })
  @ApiResponse({ status: 200, description: 'Dados do aluno' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({
    status: 404,
    description: 'Aluno não encontrado (STUDENT_NOT_FOUND)',
  })
  async getById(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentService.getById(id, companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar aluno' })
  @ApiResponse({ status: 200, description: 'Aluno atualizado' })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos (VALIDATION_ERROR)',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({
    status: 404,
    description: 'Aluno não encontrado (STUDENT_NOT_FOUND)',
  })
  @ApiResponse({
    status: 409,
    description: 'Email já cadastrado (EMAIL_ALREADY_EXISTS)',
  })
  async update(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new EffectSchemaPipe(UpdateStudentInput)) body: UpdateStudentInput,
  ) {
    return this.studentService.update(id, companyId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar aluno (soft delete)' })
  @ApiResponse({ status: 204, description: 'Aluno desativado' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({
    status: 404,
    description: 'Aluno não encontrado (STUDENT_NOT_FOUND)',
  })
  async deactivate(
    @TenantId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.studentService.deactivate(id, companyId);
  }
}
