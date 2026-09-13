import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { Server as HttpServer } from 'node:http';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/domains/shared/shell/infra/prisma.service.js';

// Shared supertest harness for the e2e specs under test/ (wrap-4 slice of the
// boarding/tracking god-specs). The specs keep their own describe/it blocks;
// only the app boot, teardown and server binding live here.

export interface ApiResponse {
  data: Record<string, unknown>;
  meta: { timestamp: string };
  error?: { code: string; message: string };
}

export const bootApp = async (): Promise<{
  module: TestingModule;
  app: INestApplication<App>;
  prisma: PrismaService;
}> => {
  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication<App> = module.createNestApplication();
  await app.init();

  // Bound once so every request reuses the same port: supertest would close
  // its per-request server on end(), which hangs while an SSE stream is open
  // and blocks every later request. See the long comment on bindHttpServer.
  await bindHttpServer(app);

  return { module, app, prisma: app.get(PrismaService) };
};

export const closeApp = async (app?: INestApplication): Promise<void> => {
  try {
    if (app) await app.close();
  } catch {
    // Suprime erros no teardown
  }
};

// O supertest fecha o server após o end() de cada request que ele próprio
// bindou (serverAddress → app.listen(0) quando não há porta; end() →
// server.close()). Com um stream SSE aberto, o close() pendura esperando a
// conexão e requests seguintes não conectam. Bind explícito uma vez: os
// Test passam a reusar a porta e nunca anexam o _server que fecha o app.
export const bindHttpServer = async (
  app: INestApplication<App>,
): Promise<void> => {
  const server = app.getHttpServer() as HttpServer;
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
      server.listen(0);
    });
  }
};

export const http = (app: INestApplication<App>) =>
  request(app.getHttpServer());
