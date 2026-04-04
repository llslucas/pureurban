import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    try {
      if (app) await app.close();
    } catch {
      // Suppress errors during teardown to prevent masking test failures
    }
  });

  it('/ (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    expect(response.text).toBe('Hello World!');
  });

  it('/api/v1/health/effect (GET) — should return 200 with Effect TS health check', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/effect')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'connected',
    });
    expect(typeof response.body.timestamp).toBe('string');
  });
});
