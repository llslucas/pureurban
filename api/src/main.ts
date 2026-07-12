import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  SwaggerModule.setup('api', app, () => createOpenApiDocument(app));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
