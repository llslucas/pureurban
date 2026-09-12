import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './swagger.js';
import {
  CORS_ALLOWED_HEADERS,
  resolveCorsOrigins,
} from './shared/shell/http/cors-config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Origem restrita por CORS_ORIGIN (lista separada por vírgula); em produção
  // sem origem válida o boot falha aqui mesmo — comentários e allowlist vivem
  // em shared/shell/http/cors-config.ts, junto dos testes de preflight.
  const corsOrigins = resolveCorsOrigins();
  console.log(`[cors] origens permitidas: ${corsOrigins.join(', ')}`);

  app.enableCors({
    origin: corsOrigins,
    allowedHeaders: CORS_ALLOWED_HEADERS,
  });

  SwaggerModule.setup('api', app, () => createOpenApiDocument(app));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
