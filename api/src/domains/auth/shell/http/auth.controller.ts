import { Controller, Post, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { AuthService } from '../auth.service.js'
import { RegisterInput } from '../../core/schemas/register.schema.js'
import { EffectSchemaPipe } from '../../../shared/shell/pipes/effect-schema.pipe.js'

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar empresa e admin' })
  @ApiResponse({ status: 201, description: 'Empresa e admin criados com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (VALIDATION_ERROR)' })
  @ApiResponse({ status: 409, description: 'Email já cadastrado (EMAIL_ALREADY_EXISTS)' })
  async register(
    @Body(new EffectSchemaPipe(RegisterInput))
    dto: RegisterInput,
  ) {
    return this.authService.register(dto)
  }
}
