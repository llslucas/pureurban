---
title: 'Story 5.0: Contrato de API — Localização em Tempo Real'
type: 'feature'
created: '2026-09-11'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: ad02fea04d63fc60886b0fde9af2113687b9e8c5
context:
  - '_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** As fatias 5.1–5.2 do Épico 5 não podem começar sem o contrato de rastreamento versionado — endpoints de ingestão/consulta/SSE, o schema do evento `location.updated` e os erros tipados — do qual os tipos do mobile são gerados.

**Approach:** Criar o bounded context `tracking` (esqueleto de pastas já existe) com um controller que declara `POST /api/v1/tracking/location`, `GET /api/v1/tracking/trips/:id/stream` (SSE) e `GET /api/v1/tracking/trips/:id/location` como stubs 501 com DTOs e Swagger completos; regenerar e commitar `api/openapi.json` e `mobile/src/types/api.d.ts`. Declaração pura: zero core, zero Prisma, zero MSW.

## Boundaries & Constraints

**Always:**
- Envelope HTTP real no contrato: sucesso via `ApiDataResponse` (`{ data, meta }`), erro via `ErrorResponseDto` (`{ error: { code, message, details? } }`) — inclusive no 501.
- Roles por handler (`RolesGuard` usa `getAllAndOverride`): classe `['STUDENT']` (stream e last-known), override `['DRIVER']` no POST de ingestão.
- Erros tipados por endpoint conforme a I/O Matrix. `STUDENT_NOT_ON_TRIP` (403) reusa o código/semântica do boarding: aluno não vinculado à rota da viagem. `DRIVER_NOT_ON_TRIP` (403) espelha o mesmo padrão para o motorista não atribuído. `TRIP_NOT_ACTIVE` (409) reuso direto. `NO_LOCATION_AVAILABLE` (404) é novo: consulta sem posição armazenada (Redis vazio/TTL expirado).
- Evento SSE como schema nomeado `LocationUpdatedEventDto`: linha `event:` carrega `location.updated` (nome verbatim dos planning docs), `data:` o payload JSON `{ tripId, latitude, longitude, accuracy?, timestamp }` (UUID / graus WGS84 / ISO 8601 UTC); `timestamp` é o instante de publicação pelo servidor (o `capturedAt` do device só aparece no POST e no last-known). O 200 do stream documenta `text/event-stream` com `oneOf` do evento, mesmo padrão do `/events` do boarding.
- `POST /tracking/location` **sem** `X-Idempotency-Key`: posição é last-write-wins e descartável (5.1 descarta posições velhas; não há fila offline de GPS) — diverge consciente dos POSTs do boarding.
- Sem replay/`Last-Event-ID` no stream: o resync do aluno é o `GET .../location`. Auth do stream via header `Authorization` (decisão da 4.2; token nunca na URL).

**Never:**
- Zero código em `core/` dos domains, zero mudança em `prisma/schema.prisma`, zero migração, zero runtime Effect novo, zero Redis.
- Nada em `mobile/src/mocks/` é tocado; nenhum endpoint/guard existente alterado; nenhum handler novo chama service (não há service nesta story).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `POST /tracking/location` | JWT DRIVER + `{ tripId (uuid), latitude, longitude, accuracy?, capturedAt }` | 200 `{ data: { tripId, receivedAt } }` — ack com instante de recebimento do servidor | 400 `VALIDATION_ERROR` · 401 · 403 `DRIVER_NOT_ON_TRIP` · 409 `TRIP_NOT_ACTIVE` · 501 |
| `GET /tracking/trips/:id/location` | JWT STUDENT, `id` uuid da viagem | 200 `{ data: { tripId, latitude, longitude, accuracy?, capturedAt } }` — último ponto conhecido | 400 `VALIDATION_ERROR` · 401 · 403 `STUDENT_NOT_ON_TRIP` · 404 `NO_LOCATION_AVAILABLE` · 409 `TRIP_NOT_ACTIVE` · 501 |
| `GET /tracking/trips/:id/stream` | JWT STUDENT, `id` uuid da viagem | 200 stream SSE (`event:` + `data:`) com o evento `location.updated` | 400 `VALIDATION_ERROR` · 401 · 403 `STUDENT_NOT_ON_TRIP` · 409 `TRIP_NOT_ACTIVE` · 501 |

</frozen-after-approval>

## Code Map

- `api/src/domains/tracking/` — esqueleto já existe (`.gitkeep` em `shell/http`, `shell/adapters`, `core/ports`, `core/use-cases`); remover o `.gitkeep` só de `shell/http`.
- `api/src/domains/boarding/shell/boarding.module.ts` + `api/src/app.module.ts` (linha 17 e `imports` 31) — modelo de wiring; `TrackingModule` mínima (`SharedKernelModule` + controller, sem providers).
- `api/src/domains/boarding/shell/http/boarding.controller.ts` — stub 501 (throw `NotImplementedException` c/ `code`/`message`), stack de decorators, prefixo literal `@Controller('api/v1/...')` (não há global), e o `/events` pós-4.2 como referência do stream real (`@Sse` + `BoardingEventsGuard` — referência para 5.2, fora do escopo aqui).
- `api/src/domains/boarding/shell/http/dtos/` — `check-in.dto.ts` (modelo request/response), `boarding-events.dto.ts` (wire SSE na description), `index.ts` (barrel).
- `api/src/domains/shared/shell/` — `api-data-response.decorator.ts`, `roles.decorator.ts`, `http/error-response.dto.ts`, `guards/roles.guard.ts`, `guards/tenant.guard.ts`, `interceptors/response-wrapper.interceptor.ts` (skip via `__sse__`); `auth/shell/guards/jwt-auth.guard.ts`. `decorators/idempotency-key.decorator.ts` existe mas NÃO usar.
- `api/src/domains/boarding/core/errors/boarding.errors.ts:80-109` — `TripNotActiveError` (409), `StudentNotOnTripError` (403): códigos a espelhar no contrato.
- `api/package.json` (`openapi:export` funciona sem banco; `openapi:check`) · `mobile/package.json` (`openapi:types` → `mobile/src/types/api.d.ts`, gerado, nunca à mão).
- `api/test/boarding.e2e-spec.ts:543+` — bloco "matriz de roles" da 4.0 (bootstrap `Test.createTestingModule` + login real contra Postgres do docker): modelo para o spec de tracking.
- `api/prisma/schema.prisma:61-65` — `TripStatus`: `ACTIVE` \| `COMPLETED`; `TRIP_NOT_ACTIVE` cobre tudo que não é `ACTIVE`.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/domains/tracking/shell/http/dtos/{location-ingest,last-known-location,tracking-events}.dto.ts` + `index.ts` — NEW: 4 classes (`LocationIngestRequestDto`, `LocationIngestResponseDto`, `LastKnownLocationDto`, `LocationUpdatedEventDto`) com os campos da I/O Matrix (`@ApiProperty` c/ description/example, `format: 'uuid'` em ids, datas `type: 'string'`, `accuracy` opcional — Geolocation web pode não fornecer; wire `event:`/`data:` nas descriptions do evento) + barrel.
- [x] `api/src/domains/tracking/shell/http/tracking.controller.ts` — NEW: `@Controller('api/v1/tracking')`, `@ApiTags('tracking')`, `@ApiBearerAuth()`, guards, `@Roles(['STUDENT'])` na classe; 3 stubs conforme a I/O Matrix — corpo só `throw new NotImplementedException({ code: 'NOT_IMPLEMENTED', message: 'Contrato declarado na Story 5.0 — implementação na Story 5.1' })` (5.2 no stream); assinaturas sem `@Body()`/params (ESLint `no-unused-vars`), body via `@ApiBody({ type })`, `:id` documentado uuid; stream via `@Get` com 200 `text/event-stream` (`@ApiExtraModels` + `oneOf` de `getSchemaPath`); 501 tipado c/ `ErrorResponseDto`; 400/403/404/409 declarados por endpoint.
- [x] `api/src/domains/tracking/shell/tracking.module.ts` — NEW, e `api/src/app.module.ts` — UPDATE: módula mínima registrada no app module.
- [x] `api/openapi.json` — `npm run openapi:export` (em `api/`) e commit.
- [x] `mobile/src/types/api.d.ts` — `npm run openapi:types` (em `mobile/`) e commit.
- [x] `api/test/tracking.e2e-spec.ts` — NEW: matriz de roles/status contra os stubs (401 sem token, 403 role trocada nos 3 endpoints, 501 envelope `NOT_IMPLEMENTED` com role correta), espelhando o bloco da 4.0.

**Acceptance Criteria:**
- Given o contrato exportado, when `api/openapi.json` é inspecionado, then os 3 paths `/api/v1/tracking/*` com security bearer, schemas das 4 classes de DTO, stream com 200 `text/event-stream` (`oneOf`) e todos os códigos de erro da I/O Matrix declarados por endpoint.
- Given qualquer handler novo chamado por HTTP com role correta, then 501 `{ error: { code: 'NOT_IMPLEMENTED', ... } }`; com role trocada, then 403; sem token, then 401 — provado pelo e2e automatizado.
- Given o mobile, when `npm run openapi:types` + `npx tsc --noEmit`, then sem erros novos e o tipo do evento `location.updated` consumível pela 5.2.
- Given 2ª execução do export, then `git diff --exit-code -- openapi.json` vazio.
- Given `git status`, then `mobile/src/mocks/`, `core/` dos domains e `prisma/` intocados.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Revisão (iteração 0) — 23 achados das 3 camadas (blind-hunter, edge-case-hunter, verification-gap). Veredictos após verificação:

- BH-1 / EH-1 / EH-2 / EH-7 / VG-1 — DTOs sem class-validator e handlers sem `@Body()`/`@Param()` ⇒ 400 declarado inalcançável (501 no lugar) — **false**: deliberado e documentado nos Design Notes ("Stubs sem pipe de validação: o 400 fica só declarado; o EffectSchemaPipe entra na fatia 5.1/5.2 — mesmo recorte da 4.0"). A 4.0 seguiu o mesmo ciclo (declarou 400, implementou validação na 4.1+), logo não quebra padrão algum. Bônus: adicionar só `@Body()` sem pipe/decorators não produziria 400 — a sugestão do reviewer nem entregaria o efeito.
- BH-2 / EH-3 / EH-4 — sem `minimum`/`maximum` para latitude/longitude e sem `minimum: 0` para accuracy nos schemas — **low**: real, dano de desenvolvedor leve (nenhum consumidor runtime hoje; codegen TS ignora min/max). Fix (valores exatos já determinados pela semântica declarada na spec: "graus WGS84", metros) é trivial, sem nova superfície comportamental → **patch**.
- BH-3 / EH-5 — datas sem `format: 'date-time'` — **false**: a task exige explicitamente "datas `type: 'string'`"; decisão de contrato consistente em todos os DTOs novos.
- BH-4 — sem intervalo de transmissão/429 — **low, rejeitado**: exige decidir política de cadência/throttle (decisão da fatia 5.1), não é correção direta; dano improvável (endpoint não implementado).
- BH-5 — TTL do cache não quantificado — **low, rejeitado**: valor é decisão de 5.1 (Redis); o contrato já documenta o comportamento observável (404 quando expira).
- BH-6 — sem heartbeat no stream — **low, rejeitado**: desenho de stream é da 5.2 (precedente `/events` do boarding); história é declaration-only.
- BH-7 / EH-6 — sem evento terminal; cliente não distingue fim de viagem de queda — **false**: o próprio contrato fornece o mecanismo de distinção desenhado: após perda do stream o cliente faz resync via `GET .../location` e viagem encerrada responde `409 TRIP_NOT_ACTIVE` (documentado por endpoint). O design congelado troca replay/evento-terminal por resync-via-GET de propósito.
- BH-8 — clock skew do `capturedAt` envenena heurística "Sem sinal GPS" — **low, rejeitado**: concern de UI da 5.2; o contrato já distingue timestamps de servidor (`receivedAt`, `timestamp`) do `capturedAt` do device em todas as descriptions.
- BH-9 — ADMIN não exercido no e2e — **false**: a task define a matriz exata a fixar (401 sem token, 403 role trocada, 501 role correta) e ela está 100% coberta; ADMIN não é linha da I/O Matrix.
- BH-10 — rationale 404-vs-409 não explicado — **low, rejeitado**: comportamento já totalmente documentado ("viagem inexistente... 409"); falta só uma frase de justificativa, sem impacto de integração.
- BH-11 — sem exemplo concreto de frame SSE no contrato — **low**: real, ajuda direto o implementador da 5.2; fix doc-only e trivial → **patch**.
- BH-12 — ambiguity omitted vs null em `accuracy` — **false**: o schema resolve — opcional e não-nulável (`accuracy?: number`); o tipo TS gerado torna `null` erro de compilação; ausente = chave omitida.
- BH-13 — linguagem mista de comentários no spec e2e — **false**: o bloco da 4.0 que a task manda espelhar usa títulos e comentários em português (69 títulos PT; comentários PT; mesmo comentário de teardown) — a convenção da casa nos e2e specs é essa.
- BH-14 — `afterAll` engole erros de teardown — **false**: padrão idêntico, verbatim, no boarding.e2e-spec.ts:215-221 (modelo espelhado pela task).
- VG-2 — `openapi:check` não integrado a gate algum (sem CI) — **low, rejeitado**: condição pré-existente repo-wide (não introduzida por este diff, que está em sinc), e o fix é o action item já rastreado `epic-3-retro-item-1-ci-gate` no sprint-status — projeto, não correção direta.

**Grupos roteados:**
- **patch** — Grupo A (BH-2+EH-3+EH-4): declarar `minimum/maximum` de coordenadas e `minimum: 0` de accuracy nos 3 DTOs + re-export. Valores únicos derivados da semântica já congelada na spec.
- **patch** — Grupo B (BH-11): exemplo de frame SSE (`event:` + `data:`) na description do schema do evento.

## Design Notes

- **Stream stub é `@Get`, NÃO `@Sse`.** Descoberta de runtime da 4.0: com o `ResponseWrapperInterceptor` global, handler `@Sse` que lança erro responde **200 + `event: error`** (o erro nunca chega ao `EffectExceptionFilter`). O stub nasce `@Get` documentando `text/event-stream`; a 5.2 troca para `@Sse` no MESMO commit em que o stream real existir (precedente 4.0→4.2, que hoje roda `@Sse` com `BoardingEventsGuard` resolvendo a viagem antes do stream).
- Stubs sem pipe de validação: o 400 `VALIDATION_ERROR` fica só declarado no contrato; o `EffectSchemaPipe` entra na fatia (5.1/5.2) junto com o schema do core — mesmo recorte da 4.0.

## Verification

**Commands:**
- `cd api && npm run build` — expected: 0 erros
- `cd api && npm test` — expected: unit verde (~206), sem regressão
- `docker compose up -d` + `cd api && npx vitest run --config vitest.config.e2e.ts test/tracking.e2e-spec.ts` — expected: spec novo verde (rodar só o arquivo novo; a baseline tem suíte vermelha conhecida — retro item 2)
- `cd api && npm run openapi:export` (2x) + `git diff --exit-code -- openapi.json` — expected: vazio
- `cd mobile && npm run openapi:types && npx tsc --noEmit` — expected: sem erros (baseline limpa)
- `cd api && npm run lint` — expected: nenhum arquivo da story na saída (baseline 147 erros exatos)
- `git status --porcelain mobile/src/mocks/` — expected: vazio
