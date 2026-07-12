import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('PureUrban')
    .setDescription('PureUrban Official API Documentation')
    .setVersion('0.2')
    // Sem isto, os @ApiBearerAuth() dos controllers emitem `security: [{ bearer: [] }]`
    // apontando para um scheme que o documento nunca declara — OpenAPI inválido.
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  return SwaggerModule.createDocument(app, config);
}
