import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './swagger.js';

const DEFAULT_CORS_ORIGIN = 'http://localhost:8081';

// O header `Origin` que o browser manda nunca tem barra final e sempre vem com
// host em minúsculas; o pacote `cors` compara por igualdade estrita. Sem
// normalizar, um CORS_ORIGIN=http://LocalHost:8081/ nunca casa e todas as
// requisições são bloqueadas sem nenhum erro do lado do servidor.
function normalizeOrigin(entry: string): string | null {
  try {
    return new URL(entry).origin.toLowerCase();
  } catch {
    return null;
  }
}

function resolveCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter((entry): entry is string => entry !== null);

  // `??` não cobre CORS_ORIGIN='' nem uma lista só de vírgulas: a variável está
  // definida, o split devolve [], e `origin: []` faz o `cors` nunca emitir
  // Access-Control-Allow-Origin — todo browser bloqueado, servidor silencioso.
  if (configured.length === 0) {
    if (process.env.CORS_ORIGIN) {
      console.warn(
        `[cors] CORS_ORIGIN="${process.env.CORS_ORIGIN}" não produziu nenhuma origem válida — usando o default ${DEFAULT_CORS_ORIGIN}`,
      );
    }
    return [DEFAULT_CORS_ORIGIN];
  }

  return configured;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // O alvo web do app mobile (Story 1.6) roda no dev server do Expo em
  // http://localhost:8081 e chama esta API em http://localhost:3000 — origem
  // diferente, logo preflight. Origem restrita por CORS_ORIGIN (lista separada por
  // vírgula) em vez de liberar '*'. Ver api/.env.example.
  // A porta 8081 do default é a que `npm run web` fixa no mobile; se o dev server
  // subir noutra porta, é CORS_ORIGIN que precisa mudar — não a URL da API.
  // X-Idempotency-Key é obrigatório no allowedHeaders: sem ele o preflight do
  // check-in de embarque falha e a requisição volta 400 MISSING_IDEMPOTENCY_KEY.
  // A lista é explícita e fechada: um header novo em api-client.ts (extraHeaders)
  // passa nos testes — que montam o AppModule e nunca executam este bootstrap — e
  // só falha no browser. Header novo no cliente ⇒ acrescente-o aqui na mesma PR.
  const corsOrigins = resolveCorsOrigins();
  console.log(`[cors] origens permitidas: ${corsOrigins.join(', ')}`);

  app.enableCors({
    origin: corsOrigins,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  });

  SwaggerModule.setup('api', app, () => createOpenApiDocument(app));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
