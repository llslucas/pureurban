import request from 'supertest';
import type { IncomingMessage } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';

// Shared SSE stream reader for the supertest e2e specs (single extraction of
// the openStream helper that used to be pasted per god-spec). `path` is built
// by the caller — the boarding stream has no tripId in the URL, the tracking
// stream does.

export interface StreamMessage {
  event: string;
  data: Record<string, unknown>;
}

export interface StreamHandle {
  ready: Promise<void>;
  status: () => number | undefined;
  headers: () => Record<string, unknown>;
  messages: StreamMessage[];
  firstMessage: Promise<StreamMessage>;
  closed: Promise<void>;
  abort: () => void;
}

// O Response do superagent não resolve tipos sob o eslint-type-checked —
// o shape mínimo que o teste usa vem daqui.
const responseOf = (
  r: unknown,
): {
  statusCode?: number;
  headers?: Record<string, unknown>;
  on: (event: string, listener: () => void) => unknown;
} =>
  (
    r as {
      response: {
        statusCode?: number;
        headers?: Record<string, unknown>;
        on: (event: string, listener: () => void) => unknown;
      };
    }
  ).response;

export const openStream = (
  app: INestApplication<App>,
  path: string,
  token: string,
): StreamHandle => {
  const messages: StreamMessage[] = [];
  let resolveReady!: () => void;
  let resolveFirst: (message: StreamMessage) => void = () => {};
  let resolveClosed: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const firstMessage = new Promise<StreamMessage>((resolve) => {
    resolveFirst = resolve;
  });
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const req = request(app.getHttpServer())
    .get(path)
    .set('Authorization', `Bearer ${token}`)
    // Streaming sem buffer: o superagent não resolve a promessa do request
    // em respostas não terminadas — `ready`, `firstMessage` e `closed`
    // são resolvidos pelos eventos do parser.
    .buffer(false)
    .parse((res: IncomingMessage) => {
      resolveReady();
      res.on('error', () => resolveClosed());
      res.on('end', () => resolveClosed());
      res.on('close', () => resolveClosed());
      let raw = '';
      res.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
        let boundary = raw.indexOf('\n\n');
        while (boundary >= 0) {
          const block = raw.slice(0, boundary);
          raw = raw.slice(boundary + 2);
          boundary = raw.indexOf('\n\n');
          const lines = block.split('\n');
          const eventLine = lines.find((line) => line.startsWith('event:'));
          const dataLine = lines.find((line) => line.startsWith('data:'));
          if (!eventLine) continue;
          // Frames sem payload (heartbeat `data: ` vazio) não passam por
          // JSON.parse — só os eventos de contrato carregam JSON.
          const rawData = dataLine ? dataLine.slice('data:'.length).trim() : '';
          const message: StreamMessage = {
            event: eventLine.slice('event:'.length).trim(),
            data: rawData
              ? (JSON.parse(rawData) as Record<string, unknown>)
              : {},
          };
          messages.push(message);
          resolveFirst(message);
        }
      });
    });

  // O request fica pendente até o abort; sem isso o worker quebra com
  // unhandled rejection ('Aborted') quando o teste encerra a conexão.
  void Promise.resolve(req).catch(() => undefined);

  return {
    // Parser anexado ⇒ headers do stream chegaram ⇒ guard passou e o Nest
    // já subscreveu o canal Redis (subscrição síncrona, mesmo tick do pipe).
    ready: ready.then(() => {
      // O Response do superagent reemite o ECONNRESET do socket no abort —
      // sem listener vira uncaught exception e derruba o worker do vitest.
      responseOf(req).on('error', () => resolveClosed());
    }),
    headers: () => responseOf(req).headers ?? {},
    status: () => responseOf(req).statusCode,
    messages,
    firstMessage,
    closed,
    abort: () => {
      try {
        req.abort();
      } catch {
        // Stream já fechado — nada a abortar.
      }
    },
  };
};
