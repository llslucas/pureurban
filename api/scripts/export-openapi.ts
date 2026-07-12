import { config as loadEnv } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';

// Tudo é resolvido a partir da raiz de api/, nunca do cwd: rodado de outro
// diretório (um job de CI na raiz do monorepo), um path relativo gravaria o
// documento em outro lugar e o drift check `git diff --exit-code api/openapi.json`
// passaria sem nunca ter comparado nada. O mesmo vale para o .env — o
// `import 'dotenv/config'` padrão procura o arquivo no cwd.
const API_ROOT = resolve(__dirname, '..', '..');
const OUTPUT_PATH = resolve(API_ROOT, 'openapi.json');

loadEnv({ path: resolve(API_ROOT, '.env') });

async function exportOpenApi() {
  // Importados dinamicamente: o AppModule lê DATABASE_URL na construção do
  // PrismaService, então o .env precisa estar carregado ANTES deste import.
  const { AppModule } = await import('../src/app.module.js');
  const { createOpenApiDocument } = await import('../src/swagger.js');

  const app = await NestFactory.create(AppModule, { logger: false });
  const document = createOpenApiDocument(app);
  writeFileSync(OUTPUT_PATH, JSON.stringify(document, null, 2));
  await app.close();

  console.log(`OpenAPI exportado para ${OUTPUT_PATH}`);
}

exportOpenApi().catch((error: unknown) => {
  console.error('Falha ao exportar o OpenAPI:', error);
  // exitCode em vez de process.exit(): com stderr num pipe, a escrita é
  // assíncrona e process.exit() trunca a mensagem de erro antes do flush.
  process.exitCode = 1;
});
