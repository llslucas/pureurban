import { Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard.js';
import { TenantGuard } from './guards/tenant.guard.js';
import { RedisService } from './infra/redis.service.js';

/**
 * SharedKernelModule — centraliza as exportações de guards, decorators e
 * componentes reutilizáveis do shared kernel para uso em bounded contexts.
 *
 * Guards exportados aqui NÃO são registrados globalmente (APP_GUARD).
 * São aplicados por controller via @UseGuards().
 *
 * O EffectExceptionFilter e ResponseWrapperInterceptor são registrados
 * globalmente via APP_FILTER/APP_INTERCEPTOR no AppModule.
 */
@Module({
  providers: [RolesGuard, TenantGuard, RedisService],
  exports: [RolesGuard, TenantGuard, RedisService],
})
export class SharedKernelModule {}
