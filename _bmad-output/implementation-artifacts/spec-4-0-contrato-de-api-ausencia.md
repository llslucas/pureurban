---
title: 'Story 4.0: Contrato de API — Ausência e Comunicação'
type: 'feature'
created: '2026-09-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: db92ca8ecb0865af5e3f7b1a3ad5b84270716448
context:
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** As fatias 4.1–4.4 do Épico 4 não podem começar sem o contrato de ausência versionado — endpoints, schemas dos eventos SSE e erros tipados — do qual os tipos do mobile são gerados.

**Approach:** Declarar no `BoardingController` `POST /not-returning`, `POST /cancel-absence` e `GET /events` (SSE) como stubs 501 com DTOs e Swagger completos e schemas nomeados dos 3 eventos SSE; regenerar e commitar `api/openapi.json` e `mobile/src/types/api.d.ts`. Declaração pura: zero core, zero Prisma, zero MSW.

## Boundaries & Constraints

**Always:**
- Envelope HTTP real no contrato: sucesso via `ApiDataResponse` (`{ data, meta }`), erro via `ErrorResponseDto` (`{ error: { code, message, details? } }`) — inclusive no 501.
- `studentId` vem do JWT (`req.user.userId`); body dos POSTs é `{ tripId }` (UUID) apenas.
- Roles por handler (`RolesGuard` usa `getAllAndOverride`): `['STUDENT']` nos POSTs (override do `['DRIVER']` da classe), `['DRIVER']` explícito em `/events`.
- `X-Idempotency-Key` required nos POSTs (fila offline já prevê `notify_not_returning` e `cancel_absence`); mesma key → mesmo resultado. `/events` sem header.
- Eventos SSE como schemas nomeados: linha `event:` carrega o tipo, `data:` o payload JSON — `boarding.not_returning` `{ tripId, studentId, notifiedAt }`, `boarding.absence_cancelled` `{ tripId, studentId, cancelledAt }`, `boarding.checkin_reminder` `{ tripId, studentId, remindedAt }` (UUIDs / ISO 8601 UTC). O 200 de `/events` documenta `text/event-stream` com `oneOf` dos três; o nome do aluno é resolvido pelo cliente a partir do roster.
- `cancellableUntil` é calculado pelo servidor (`notifiedAt` + 2 min); o contrato só declara o campo.
- `ABSENCE_NOT_FOUND` (404) é adição consciente aos 4 códigos do épico: cancelar ausência inexistente/já cancelada com key diferente.

**Never:**
- Zero código em `core/`, zero mudança em `prisma/schema.prisma`, zero migração, zero runtime Effect novo.
- Nada em `mobile/src/mocks/` é tocado; nenhum endpoint/guard existente alterado; nenhum handler novo chama `BoardingService`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `POST /not-returning` | JWT STUDENT + `{ tripId }` + `X-Idempotency-Key` | 201 `{ data: { id, studentId, tripId, status: 'NOT_RETURNING', notifiedAt, cancellableUntil } }` | 400 `VALIDATION_ERROR` · 401 · 403 `STUDENT_NOT_ON_TRIP` · 409 `TRIP_NOT_ACTIVE` \| `ALREADY_NOT_RETURNING` · 501 |
| `POST /cancel-absence` | JWT STUDENT + `{ tripId }` + `X-Idempotency-Key` | 200 `{ data: { studentId, tripId, status: 'NOT_CHECKED_IN', cancelledAt } }` | 400 `VALIDATION_ERROR` · 401 · 403 `STUDENT_NOT_ON_TRIP` · 404 `ABSENCE_NOT_FOUND` · 409 `TRIP_NOT_ACTIVE` \| `CANCELLATION_PERIOD_EXPIRED` · 501 |
| `GET /events` | JWT DRIVER com viagem ativa | 200 stream SSE (`event:` + `data:`) dos 3 eventos | 401 · 403 (role) · 409 `TRIP_NOT_ACTIVE` (sem viagem ativa) · 501 |

</frozen-after-approval>

## Code Map

- `api/src/domains/boarding/shell/http/boarding.controller.ts` — alvo dos 3 stubs; copiar o padrão stub 501 e o `@ApiHeader` de idempotência do próprio check-in.
- `api/src/domains/boarding/shell/http/dtos/` — `check-in.dto.ts` é o modelo de DTO; `index.ts` barrel a estender.
- `api/src/domains/shared/shell/` — `api-data-response.decorator.ts` e `error-response.dto.ts` prontos; `response-wrapper.interceptor.ts` já pula handlers `__sse__` (mecanismo da 4.2).
- `api/src/domains/trip/shell/http/dtos/trip-students.dto.ts` — `BoardingStatusDto` já tem `NOT_RETURNING`.
- `api/package.json` → `openapi:export` (funciona sem banco) · `mobile/package.json` → `openapi:types` → `mobile/src/types/api.d.ts` (gerado, nunca à mão).

## Tasks & Acceptance

**Execution:**
- [x] `api/src/domains/boarding/shell/http/dtos/{not-returning,cancel-absence,boarding-events}.dto.ts` — NEW: 7 classes de DTO com os campos da I/O Matrix (`@ApiProperty` com description, example, `format: 'uuid'`; nos eventos, o wire SSE `event:`/`data:` nas descriptions).
- [x] `api/src/domains/boarding/shell/http/dtos/index.ts` — UPDATE: barrel.
- [x] `api/src/domains/boarding/shell/http/boarding.controller.ts` — UPDATE: 3 stubs conforme a I/O Matrix — corpo só `throw new NotImplementedException({ code: 'NOT_IMPLEMENTED', message: 'Contrato declarado na Story 4.0 — implementação na Story 4.x' })`; 501 tipado com `ErrorResponseDto`; eventos via `@ApiExtraModels` + `oneOf` de `getSchemaPath` no 200 `text/event-stream`.
- [x] `api/openapi.json` — `npm run openapi:export` (em `api/`) e commit.
- [x] `mobile/src/types/api.d.ts` — `npm run openapi:types` (em `mobile/`) e commit.

**Acceptance Criteria:**
- Given o contrato exportado, when `api/openapi.json` é inspecionado, then os 3 paths com security bearer, `X-Idempotency-Key` required nos POSTs, schemas das 7 classes de DTO e `/events` com 200 `text/event-stream` (`oneOf`).
- Given qualquer handler novo, when chamado por HTTP, then 501 `{ error: { code: 'NOT_IMPLEMENTED', ... } }`.
- Given o mobile, when `npm run openapi:types` + `npx tsc --noEmit`, then sem erros novos.
- Given 2ª execução do export, then `git diff --exit-code -- openapi.json` vazio.
- Given `git status`, then `mobile/src/mocks/`, `core/` e `prisma/` intocados.

## Implementation Notes

- **7 classes, não 6.** O Approach pedia "6 DTOs", mas a I/O Matrix + "schemas nomeados dos 3
  eventos SSE" só fecham com 7: `NotReturningRequestDto`, `NotReturningResponseDto`,
  `CancelAbsenceRequestDto`, `CancelAbsenceResponseDto` + os 3 eventos. O contrato da matriz
  (congelado) venceu a contagem do texto.
- **`/events` é `@Get`, NÃO `@Sse` (descoberta de runtime, válida para a 4.2).** Com o
  `ResponseWrapperInterceptor` global ativo, o `InterceptorsConsumer` embrulha a chamada do
  handler num Observable lazy (`defer(...).pipe(mergeAll())` — interceptors-consumer.js:25).
  Num handler `@Sse`, o erro do handler nunca chega ao `EffectExceptionFilter`: o stream
  subscribe o Observable em erro e o `catchError` do `RouterResponseController.sse` escreve
  `event: error` com o `err.message` — **HTTP 200, não 501**. Provado em runtime: o stub
  nasceu com `@Sse` e respondia 200 + `event: error`; com `@Get` responde 501 no envelope.
  A 4.2 deve trocar por `@Sse` no MESMO commit em que o stream existir de verdade.
- **Stubs sem `@Body()` na assinatura** (o Design Note pedia `@Body()` sem pipe): o ESLint do
  repo (`no-unused-vars` do recommended-type-checked, sem `argsIgnorePattern`) rejeita o
  parâmetro parado, e o critério de verificação "nenhum arquivo da story na saída do lint"
  venceu. O body continua documentado via `@ApiBody({ type })` — o openapi.json sai
  byte-idêntico (hash sha256 conferido antes/depois). O `@Body(new EffectSchemaPipe(...))`
  entra na fatia (4.1/4.3) junto com o schema do core.
- **Verificação executada (2026-09-07):** `npm run build` 0 erros; `npm test` 206/206;
  `openapi:export` 3x com sha256 idêntico (`c03a00b9…`); `openapi:types` + `npx tsc
  --noEmit` no mobile 0 erros; lint 147 erros (baseline exata), nenhum arquivo da story na
  saída; `git status` limpo em `mobile/src/mocks/`, `core/`, `prisma/`. Smoke em runtime
  (API local, JWT assinado com o payload real `{ sub, companyId, role }`): os 3 handlers
  → 501 `{"error":{"code":"NOT_IMPLEMENTED","message":"Contrato declarado na Story 4.0 —
  implementação na Story <fatia do handler: 4.1/4.3/4.2>"}}`; DRIVER em POST → 403,
  STUDENT em `/events` → 403,
  sem token → 401 (override de role por handler confirmado no `RolesGuard`).
- `mobile/src/types/api.d.ts` gerado: o 200 `text/event-stream` com `oneOf` vira união
  tipada dos 3 schemas de evento — os tipos dos eventos já são consumíveis pela 4.2.
- **Auditoria da I/O Matrix (step-03):** as linhas da matriz declaram o contrato que as fatias
  4.1–4.4 vão implementar (201/200/stream com payloads reais) — comportamento não existente
  nesta story, cujo estado atual é 501. Cobertura nesta story: inspeção do `openapi.json`
  (todos os cenários/erros declarados) + smoke em runtime dos stubs (501/403/401). Testes
  automatizados por linha da matriz chegam com 4.1–4.4 e são exigidos na 4.5 (E2E).

## Spec Change Log

- **2026-09-07 (review loop 1 → patches #1, #3/#14/#15, #8, #24):** (a) 400/409 dos POSTs
  documentam `MISSING_IDEMPOTENCY_KEY`, `INVALID_IDEMPOTENCY_KEY` e `IDEMPOTENCY_KEY_CONFLICT`
  (espelho do check-in) e o `@ApiHeader` ganha `schema.maxLength: 200`; (b) mensagem do throw
  501 passa de "Story 4.x" (texto original do Approach) para a fatia de cada handler
  (4.1 / 4.3 / 4.2) — renegotiação pontual do texto congelado, via review; (c) description do
  `boarding.checkin_reminder` explicita que o stream é o canal do motorista (entrega ao aluno
  derivada do estado, Story 4.4); (d) bloco e2e da matriz de roles/stubs em
  `api/test/boarding.e2e-spec.ts` (6 testes, 28/28 verdes no arquivo).

## Review Triage Log

| # | Achado (camada) | Veredito | Evidência |
|---|-----------------|----------|-----------|
| 1 | BH: `checkin_reminder` sem caminho ao aluno (stream é do motorista) | low | ACs explícitos fecham a leitura: 4.2 restringe o stream ao motorista e 4.4 entrega o lembrete por derivação de estado na abertura do app. Defeito real: a description do evento não diz isso — patch de 1 frase. |
| 2 | BH: conflito check-in × ausência não declarado (aluno já `CHECKED_IN`) | low | A regra last-write-wins vive no epic-4-context; a semântica exata (erro vs aceitar) é decisão da fatia 4.1. ACs da 4.0 fechados → defer (grupo "bordas do ciclo de vida da ausência"). |
| 3 | BH/ECH: códigos de idempotência ausentes nos novos POSTs (400 `MISSING_IDEMPOTENCY_KEY`/`INVALID_IDEMPOTENCY_KEY`, 409 `IDEMPOTENCY_KEY_CONFLICT`, `maxLength` do header) | medium | Verificado: o decorator compartilhado `IdempotencyKey` lança 400 `MISSING`/`INVALID` (>200 chars) e o check-in documenta os 3 códigos (openapi.json:1325,1355); os novos POSTs usam o mesmo decorator sem documentá-los → patch (espelhar check-in). |
| 4 | BH/ECH: transporte de auth do SSE não declarado (EventSource web não envia header) | low | Mecânica de transporte (polyfill com header no nativo vs query param no web) é decisão de design da 4.2; o contrato pode ser ajustado conscientemente lá (drift discipline) → defer. |
| 5 | BH/ECH: sem replay/`Last-Event-ID` → roster do motorista fica velho para sempre | false | Refutado: o resync existe — `GET /trips/:id/students` é a fonte autoritativa do roster (query com `networkMode: 'always'` + banner de staleness da 3.5b). O épico exige apenas reconexão automática sem duplicar entradas. |
| 6 | BH: união `oneOf` sem discriminante perde o vínculo `event:`→payload | false | O cliente roteia pelo nome do evento (listener por tipo), o que torna o mismatch inalcançável em runtime; o vínculo nome→payload está documentado na description de cada schema; TS discrimina pelos campos required. |
| 7 | BH: `CancelAbsenceResponseDto` sem `id` da ausência | low | Correlação existe por `tripId`+`studentId` e o registro é anulado no cancelamento; adicionar `id` é superfície nova sem necessidade demonstrada → rejeitado. |
| 8 | BH: mensagem 501 do stub (`Story 4.x`) difere das descriptions (`4.1/4.2/4.3`) | low | Verificado no diff: `@ApiResponse` 501 nomeia a fatia, o throw usa mensagem genérica → patch (alinhar mensagem por endpoint). |
| 9 | BH: Design Notes contradiz Implementation Notes (`@Body`) | false | As Implementation Notes narram explicitamente a supersessão do Design Note (ESLint `no-unused-vars`); o documento não é ambíguo ao leitor. Corrigir seria editar spec (rejeitado por regra). |
| 10 | BH: sprint-status `in-progress` vs spec `in-review` | false | Transição de processo: o sync-sprint-status para `review` acontece no fechamento da story (precedente 1-9). Estado transitório do fluxo, não defeito do diff. |
| 11 | BH: "2x" vs "3x" e "~206" vs "206" na spec | false | `Verification` é o plano pré-implementação; `Implementation Notes` é o registro de execução (3x, 206/206). Plano vs registro, sem contradição de fato. |
| 12 | BH: semântica de replay de erros sob idempotência não especificada | low | Tema já aberto como action item `epic-3-retro-item-3` (desfecho da fila offline). Semântica de cache de erro é da implementação da 4.1/4.3 → defer. |
| 13 | BH: "15 minutos" congelado em description (épico diz configurável) | low | A description espelha verbatim o texto do AC da 4.4; "configuração do core" refere-se à implementação do scheduler, não ao texto do contrato → rejeitado. |
| 14 | ECH: 400 sem `MISSING`/`INVALID_IDEMPOTENCY_KEY` | medium | Mesma causa raiz do #3 → patch. |
| 15 | ECH: 409 sem `IDEMPOTENCY_KEY_CONFLICT` | medium | Mesma causa raiz do #3 → patch. |
| 16 | ECH: aluno já `CHECKED_IN` registra ausência — resposta não declarada | low | Mesma causa raiz do #2 → defer. |
| 17 | ECH: re-registro pós-cancelamento (nova key) não declarado | low | Mesma causa raiz do #2 (borda do ciclo de vida) → defer. |
| 18 | ECH: fronteira exata de `cancellableUntil` (inclusivo/exclusivo) | low | Mesma causa raiz do #2; relógio injetado é da 4.3 → defer. |
| 19 | ECH: reconexão pós-409 sem diretriz (loop de reconexão) | low | Comportamento de cliente é escopo da fatia mobile 4.2 (ACs próprios de reconexão); contrato de API não vincula o cliente → rejeitado. |
| 20 | ECH: `oneOf` sem `additionalProperties: false` ambíguo para validadores | low | Os 3 schemas distinguem pelo campo required próprio (timestamp com nome distinto); TS discrimina estruturalmente; nenhum validador de runtime consome o `oneOf` (SSE será serializado à mão na 4.2) → rejeitado. |
| 21 | ECH: datas sem `format: 'date-time'` | false | Verificado: `checkedInAt` do check-in (baseline do contrato) também não declara format — padrão uniforme; descriptions fixam ISO 8601 UTC e nenhum consumidor valida via format OpenAPI. |
| 22 | ECH: driver com 2 viagens ativas — seleção do stream indefinida | low | Preexistente: `get-active-trip` (3.1) já assume viagem única ativa por motorista; `/events` herda a mesma premissa → defer. |
| 23 | ECH: AC2 literal ("qualquer chamada → 501") vencido por guards (401/403) | false | Leitura em contexto: a matriz declara 401/403/501; o 501 é a resposta do handler para chamadas autorizadas — smoke confirmou os 3 comportamentos. Corrigir o AC seria editar spec (rejeitado por regra). |
| 24 | VG: matriz de roles/status sem verificação automatizada (só smoke manual) | medium | Verificado: nenhum teste referencia as novas rotas; `roles.guard.spec` mocka `getAllAndOverride`; regressão de role sairia silenciosa até a 4.1 → patch (bloco role/status no `boarding.e2e-spec.ts` existente). |
| 25 | VG: `openapi:check` sem CI/hook (freshness só manual) | low | Já rastreado como action item `epic-3-retro-item-1` (gate de CI incluindo `openapi:check`); re-registrar duplicaria item aberto → rejeitado. |

## Design Notes

- O 501 sai no envelope `{ error: ... }` (o `EffectExceptionFilter` normaliza `HttpException`) — 501 leva `type: ErrorResponseDto` (bug da 3.0 corrigido na review).
- `@ApiProperty` de datas precisa `type: 'string'` explícito; schemas fora de request/response (eventos) só entram via `@ApiExtraModels` + `getSchemaPath`.
- Stub usa `@ApiBody({ type })` + `@Body()` sem pipe — o `EffectSchemaPipe` com o schema do core é amarrado na fatia (4.1/4.3); o 400 `VALIDATION_ERROR` já fica declarado.

## Verification

**Commands:**
- `cd api && npm run build` — 0 erros
- `cd api && npm test` — unit verde (~206), sem regressão
- `cd api && npm run openapi:export` (2x) + `git diff --exit-code -- openapi.json` — vazio
- `cd mobile && npm run openapi:types && npx tsc --noEmit` — sem erros novos (conferir baseline via `git stash` se surgir erro)
- `cd api && npm run lint` — nenhum arquivo da story na saída (baseline ~147 erros preexistentes)
- `git status --porcelain mobile/src/mocks/` — vazio
