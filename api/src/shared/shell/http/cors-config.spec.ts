import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { describe, it, expect } from 'vitest';

import {
  CORS_ALLOWED_HEADERS,
  DEFAULT_CORS_ORIGIN,
  normalizeOrigin,
  resolveCorsOrigins,
} from './cors-config.js';

// O bootstrap (main.ts) nunca roda nos testes — os módulos de teste montam o
// AppModule direto. Estas suítes pinam aqui o que antes só podia falhar no
// browser: o fail-fast de produção (AI7/DS11) e o preflight dos headers
// não-safelisted dos clientes (X-Idempotency-Key do check-in; cache-control e
// X-Requested-With do cliente SSE).

describe('resolveCorsOrigins', () => {
  it('dev sem CORS_ORIGIN: default do Expo Web (comportamento de dev preservado)', () => {
    expect(resolveCorsOrigins({ NODE_ENV: 'development' })).toEqual([
      DEFAULT_CORS_ORIGIN,
    ]);
  });

  it('sem NODE_ENV (dev por omissão): default', () => {
    expect(resolveCorsOrigins({})).toEqual([DEFAULT_CORS_ORIGIN]);
  });

  it('CORS_ORIGIN definida: lista normalizada (trim, minúsculas, sem barra final)', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'development',
        CORS_ORIGIN: ' http://LocalHost:8081/,https://app.exemplo.com ',
      }),
    ).toEqual(['http://localhost:8081', 'https://app.exemplo.com']);
  });

  it('CORS_ORIGIN definida mas sem origem válida em dev: default (com warn)', () => {
    expect(
      resolveCorsOrigins({ NODE_ENV: 'development', CORS_ORIGIN: ',,,' }),
    ).toEqual([DEFAULT_CORS_ORIGIN]);
  });

  it('PRODUÇÃO sem CORS_ORIGIN: fail-fast com erro legível (AC13) — nunca cai no default de dev', () => {
    expect(() => resolveCorsOrigins({ NODE_ENV: 'production' })).toThrowError(
      /CORS_ORIGIN ausente ou sem origem válida/,
    );
  });

  it('PRODUÇÃO com CORS_ORIGIN vazia ou inválida: mesmo fail-fast', () => {
    expect(() =>
      resolveCorsOrigins({ NODE_ENV: 'production', CORS_ORIGIN: ' , ,' }),
    ).toThrowError(/CORS_ORIGIN ausente ou sem origem válida/);
  });

  it('PRODUÇÃO com CORS_ORIGIN válida: sobe com a lista configurada', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://app.exemplo.com',
      }),
    ).toEqual(['https://app.exemplo.com']);
  });

  it('normalizeOrigin: URL inválida vira null (entrada descartada)', () => {
    expect(normalizeOrigin('não é url')).toBeNull();
    expect(normalizeOrigin('https://Ok.Exemplo.com:8443/')).toBe(
      'https://ok.exemplo.com:8443',
    );
  });
});

// Preflight real via express + o MESMO pacote `cors` que o enableCors do Nest
// usa por baixo — não uma réplica da configuração.
const buildApp = () => {
  const app = express();
  app.use(
    cors({
      origin: resolveCorsOrigins({ NODE_ENV: 'test' }),
      allowedHeaders: CORS_ALLOWED_HEADERS,
    }),
  );
  return app;
};

describe('preflight CORS (AC14)', () => {
  it('X-Idempotency-Key, cache-control e X-Requested-With são permitidos no preflight', async () => {
    const response = await request(buildApp())
      .options('/api/v1/boarding/check-in')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'X-Idempotency-Key, cache-control, X-Requested-With',
      )
      .expect(204);

    const allowed: string = response.headers['access-control-allow-headers'];
    const lowered = allowed.toLowerCase();
    expect(lowered).toContain('x-idempotency-key');
    expect(lowered).toContain('cache-control');
    expect(lowered).toContain('x-requested-with');
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:8081',
    );
  });

  it('header fora da allowlist não é permitido', async () => {
    const response = await request(buildApp())
      .options('/api/v1/tracking/trips/x/stream')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'X-Debug-Backdoor')
      .expect(204);

    const allowed: string = response.headers['access-control-allow-headers'];
    expect(allowed.toLowerCase()).not.toContain('x-debug-backdoor');
  });

  it('origem fora da lista não recebe Access-Control-Allow-Origin', async () => {
    const response = await request(buildApp())
      .options('/api/v1/boarding/check-in')
      .set('Origin', 'https://site.alheio.com')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
