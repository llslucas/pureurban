---
title: 'Story 4.2: Canal SSE de Embarque e Recebimento em Tempo Real (Fatia Vertical)'
type: 'feature'
created: '2026-09-07'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 14f34d04ad1713299ea2aa1e53d7a2e013eec697
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O evento `boarding.not_returning` já nasce do core (4.1) mas não tem consumidor:
o motorista só fica sabendo da ausência refrescando a lista. Sem canal em tempo real, o NFR3
(entrega < 3s) é inatingível e a 4.4 fica sem o canal de lembretes que depende desta story.

**Approach:** Pipeline shell-only: listener `@OnEvent` → publicação em canal Redis Pub/Sub por
viagem → stream `@Sse` real em `GET /api/v1/boarding/events` (substitui o stub 501 da 4.0) →
cliente SSE na lista do motorista, que aplica `boarding.not_returning` /
`boarding.absence_cancelled` ao cache do roster com toast. O 409 de viagem inativa é resolvido
em guard (antes do stream) e a conexão é encerrada elegantemente quando a viagem termina.

## Boundaries & Constraints

**Always:**
- Contrato da 4.0 é a fonte: o stream entrega exatamente os 3 eventos declarados
  (`boarding.not_returning` `{tripId, studentId, notifiedAt}`, `boarding.absence_cancelled`
  `{tripId, studentId, cancelledAt}`, `boarding.checkin_reminder` `{tripId, studentId,
  remindedAt}`), com `event:` carregando o tipo e `data:` o payload JSON. `/events` segue sem
  parâmetros — a viagem do stream é a viagem ativa do driver, resolvida server-side. Única
  mudança de contrato consciente: remover a documentação 501 do `/events`; `openapi.json` +
  `mobile/src/types/api.d.ts` regenerados no mesmo PR (`openapi:check` verde).
- O 409 `TRIP_NOT_ACTIVE` (driver sem viagem ativa) sai de um **guard** antes do handler:
  exceção de guard propaga pelo exception filter com o envelope `{ error: {...} }`; erro lançado
  dentro de handler `@Sse` vira HTTP 200 `event: error` (descoberta de runtime da 4.0).
- Redis Pub/Sub é shell-only — nada de port/use case no core. O listener `@OnEvent` recebe o
  DomainEvent inteiro (payload em `.data`); `EventEmitterModule` é `wildcard: false` (nomes
  exatos). Canal por viagem `boarding:trip:{tripId}`; clientes da mesma viagem compartilham UM
  subscribe Redis (refcount, provado por teste unitário).
- Publicação em whitelist dos 3 tipos de contrato; `boarding.checked_in` e `trip.started` nunca
  vão ao canal. `trip.ended` (já emitido pelo end-trip) publica sinal terminal interno no canal
  → o stream completa; reconnect pós-fim recebe 409 e o cliente encerra definitivamente.
- Mobile contra a API local (zero handlers MSW): o cliente SSE lê o token do storage a cada
  conexão e reconecta com backoff; access token expira em 15m — em 401 no stream, refresh via
  api-client e reconstrução do cliente. Eventos aplicados ao cache do roster como novo array +
  novos objetos (`StudentCard` é `React.memo`), ajustando `summary` no próprio cache e
  invalidando `['trip', tripId, 'students']` para reconciliar (o total que exclui ausentes é
  regra do servidor). Keys `['activeTrip']` e `['trip', tripId, 'students']` intactas.
- NFR3 medido no e2e: POST `/not-returning` → primeira mensagem do stream em < 3s.
- **Auth do SSE (decisão do Lucas, resolve o defer da 4.0):** cliente `react-native-sse`
  (XHR) com header `Authorization` no mobile — funciona igual no web e no nativo, sem token
  em URL; `jwt.strategy` e contrato de auth intocados.

**Never:**
- Não implementar 4.3/4.4: `cancel-absence` segue stub e não há scheduler; listeners de
  `absence_cancelled`/`checkin_reminder` só fazem forwarding (os eventos ainda não são emitidos).
- Sem replay/Last-Event-ID — reconciliação pós-reconexão é refetch do roster (review da 4.0).
  Sem push, sem broadcast, sem alterar os schemas dos 3 eventos.
- Não tocar na fila offline, nos guards de `_layout.tsx`, em `mobile/src/mocks/`, nem no fluxo
  de refresh do api-client além de exportar a função de refresh que já existe.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stream happy path | JWT DRIVER com viagem ativa | 200 `text/event-stream`; eventos no formato do contrato | 401 · 403 (role) |
| Ausência durante stream | POST /not-returning 201 | `boarding.not_returning` no stream em < 3s (NFR3) | N/A |
| Driver sem viagem ativa | JWT DRIVER, nenhuma viagem ativa | — | 409 `TRIP_NOT_ACTIVE` no envelope |
| Viagem encerra com stream aberto | end-trip 200 | stream completa; reconnect → 409 → cliente encerra | N/A |
| 2+ clientes, mesma viagem | 2 conexões simultâneas | 1 subscribe Redis compartilhado; ambos recebem | N/A |
| Mobile aplica not_returning | student-list aberta, evento chega | badge "Não vai voltar" (destaque âmbar existente); contagem 28/32→28/31; toast não bloqueante | studentId fora do cache → só refetch |
| Mobile aplica absence_cancelled | evento chega | status reverte de "Não vai voltar"; contagem volta | status CHECKED_IN no cache → check-in prevalece; refetch reconcilia |
| Queda de rede | stream cai | reconexão automática com backoff, sem duplicar entradas; roster reconciliado por refetch | token expirado (15m) → refresh + reconstrução do cliente |

</frozen-after-approval>

## Code Map

**Backend**
- `api/src/domains/boarding/core/use-cases/register-not-returning.use-case.ts:126-136` -- fonte
  do evento (replay emite `noEvents`). NÃO tocar.
- `api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.ts:12-29` -- emite
  `event.type` com o DomainEvent inteiro; `api/src/app.module.ts:22` -- wildcard OFF.
- `api/src/domains/boarding/shell/http/boarding.controller.ts:259-323` -- stub `@Get('events')`
  com 501 documentado e comentário mandando trocar por `@Sse` junto com o stream real.
- `api/src/domains/shared/shell/interceptors/response-wrapper.interceptor.ts:18-25` -- skip via
  metadata `__sse__` que o `@Sse` do Nest seta sozinho. NÃO tocar.
- `api/src/domains/shared/shell/infra/` (`prisma.service.ts`, `prisma-global.module.ts`) --
  padrão para o novo `RedisService` (ioredis, `REDIS_URL`, `OnModuleDestroy`, `duplicate()` para
  pub/sub). `api/.env.example` não tem Redis; `docker-compose.yml:13-15` já sobe redis:7 :6379.
- `api/src/domains/trip/core/use-cases/end-trip.use-case.ts:58-68` -- emite `trip.ended`
  `{tripId, routeId, driverId}` (sinal de fechamento).
- `api/src/domains/trip/shell/trip.service.ts:47-51` -- `getActiveTrip(driverId, tenantId)` →
  `TripData | null`; o guard injeta isto (composição shell-to-shell) em vez de duplicar port.
- `api/src/domains/boarding/core/errors/boarding.errors.ts:68` -- `TripNotActiveError` → 409.
- `api/src/domains/boarding/shell/boarding.module.ts:16-66` -- providers + `BOARDING_RUNTIME`;
  novo serviço de eventos entra aqui.
- `api/src/domains/auth/shell/strategies/jwt.strategy.ts:10-22` -- bearer header only (fica
  como está: decisão = header via react-native-sse). CORS de `main.ts` já aceita `Authorization`.
- `api/test/boarding.e2e-spec.ts:561,589-608` -- helper `events(token)` assegura 501/403/401;
  vira teste de stream (supertest `.parse()` coletando chunks) + 409.

**Mobile**
- `mobile/src/app/(driver)/student-list.tsx` -- keys `['activeTrip']` (:27) e
  `['trip', tripId, 'students']` (:37, `networkMode: 'always'` :54); resumo server-authored
  (:180-182); sem Snackbar hoje (precedente: `(student)/home.tsx:236-242`).
- `mobile/src/components/student-card.tsx:21-25` -- `STATUS_PRESENTATION` já tem `NOT_RETURNING`
  âmbar ("Não vai voltar"); `React.memo` (:74-75) exige novos objetos no cache.
- `mobile/src/lib/storage.ts:13` -- `tokenStorage.getAccessToken()` sync (MMKV).
- `mobile/src/services/api-client.ts:24-63` -- refresh single-flight interno a exportar.
- `mobile/src/types/api.d.ts:663-719` -- os 3 DTOs de evento já gerados.
- `mobile/src/student-list.test.tsx` (NEW, na raiz `src/`, nunca em `src/app/`) -- modelo
  `trip-screen.test.tsx` (service mockado, QueryClient fresco); EventSource via `jest.mock`
  do serviço de eventos.

## Tasks & Acceptance

**Execution:**
- [x] `api/package.json` + `api/.env.example` -- ioredis + `REDIS_URL` (redis://localhost:6379).
- [x] `api/src/domains/shared/shell/infra/redis.service.ts` -- NEW, padrão PrismaService; export
  pelo módulo shared.
- [x] `api/src/domains/boarding/shell/events/boarding-events.service.ts` -- NEW: `@OnEvent` dos
  3 tipos → publish no canal da viagem; `@OnEvent('trip.ended')` → sinal terminal;
  `stream(tripId)` → Observable de `MessageEvent` com subscribe refcount + heartbeat 30s.
- [x] `api/src/domains/boarding/shell/events/boarding-events.service.spec.ts` -- NEW: fake Redis
  (map evento→canal, refcount, complete no terminal, heartbeat com fake timers).
- [x] `api/src/domains/boarding/shell/http/boarding-events.guard.ts` -- NEW: resolve viagem
  ativa via `TripService`; null → 409 `TRIP_NOT_ACTIVE`; anexa tripId ao request.
- [x] `api/src/domains/boarding/shell/http/boarding.controller.ts` -- `@Get` stub → `@Sse` +
  guard; remover 501; manter 200/401/403/409 e o oneOf.
- [x] `api/src/domains/boarding/shell/boarding.module.ts` -- wiring (RedisService, serviço de
  eventos, guard).
- [x] `api/test/boarding.e2e-spec.ts` -- UPDATE: stream real (happy + NFR3 < 3s, 409), 401/403
  mantidos, 501 removido.
- [x] `api/openapi.json` + `mobile/src/types/api.d.ts` -- `openapi:export` + `openapi:types`.
- [x] `mobile/package.json` -- `react-native-sse` (cliente SSE com header).
- [x] `mobile/src/services/api-client.ts` -- exportar wrapper do refresh single-flight.
- [x] `mobile/src/services/boarding-events.service.ts` -- NEW: conexão com token por tentativa,
  listeners dos 3 eventos, backoff, 401 → refresh → rebuild, close definitivo em fim de viagem.
- [x] `mobile/src/app/(driver)/student-list.tsx` -- abrir/fechar por tripId ativo; aplicar
  eventos ao roster cache (novo array/objetos + `summary` + invalidação); Snackbar de ausência.
- [x] `mobile/src/student-list.test.tsx` -- NEW: status flip, contagem, toast, revert, sem
  duplicata na reconexão, studentId desconhecido → refetch.

**Acceptance Criteria:**
- Given driver com viagem ativa e stream aberto, when aluno registra ausência, then
  `boarding.not_returning` chega no stream em < 3s com o schema exato do contrato (e2e mede).
- Given driver autenticado sem viagem ativa, when abre o stream, then 409 `TRIP_NOT_ACTIVE` no
  envelope `{ error: { code, message } }`.
- Given viagem encerrada com stream aberto, when o end-trip emite `trip.ended`, then o stream
  completa e uma reconexão recebe 409 (cliente encerra sem loop).
- Given duas conexões na mesma viagem, then um único subscribe Redis serve ambas (unit).
- Given student-list aberta, when chega `not_returning`, then badge "Não vai voltar", contagem
  ajustada (28/32→28/31) e toast sem bloquear a tela; `absence_cancelled` reverte; reconexão
  não duplica entradas.
- Given contrato alterado, when `openapi:export` 2x, then `git diff --exit-code -- openapi.json`
  vazio e `openapi:check` verde.
- Given o core da boarding, when `npm test`, then intocado e suítes < 100ms.

## Implementation Notes

- **Branch `feat/4-2-canal-sse-e-recebimento-em-tempo-real`** (a partir de `main` @ 14f34d0),
  commits atômicos (docs; Redis infra; publish no canal; stream ao vivo + contrato + e2e;
  cliente mobile; tela). Sem PR aberto — aguardando revisão/aprovação.
- **`RedisService` usa `disconnect()` no destroy, não `quit()`:** o encerramento gracioso
  aguarda resposta do socket e pendurava o `app.close()` dos testes quando a conexão nunca
  chegou a estabelecer. `maxRetriesPerRequest: null` mantém publishes enfileirados vivos
  durante reconexão.
- **`TripModule` agora exporta `TripService`** (única mudança fora da boarding): o guard
  resolve a viagem ativa por composição shell-to-shell, em vez de duplicar um port no core.
- **e2e de stream exige bind explícito do server** (`server.listen(0)` no `beforeAll`): o
  supertest fecha o server no `end()` de cada request que ele próprio bindou, e com um stream
  aberto o `close()` pendura e os requests seguintes não conectam. Listeners de `error` no
  Response do superagent evitam `ECONNRESET` não tratado no `abort()`. Boarding e2e caiu de
  ~435s para ~5s com o bind.
- **Dependência lixo removida (achado da verificação):** o install do `react-native-sse`
  arrastou acidentalmente o pacote `mobile@0.0.1` (squatted, license TBD) para
  `mobile/package.json`; `npm uninstall mobile` reverteu package.json + lockfile.
- **Cobertura extra pós-auditoria da matriz:** `mobile/src/services/boarding-events.service.test.ts`
  (7 testes — 409 fecha definitivo; 401 → refresh → reabre com header novo; refresh falho cai
  no backoff; escada 1s→30s com reset no `open`; forwarding; sem token). O `jest.mock` factory
  do react-native-sse tem que ser JS puro (babel hoist roda antes do strip de tipos).
- **Latência de fechamento mobile:** após `trip.ended`, a lib reabre ~5s (polling interno) e o
  409 do guard fecha definitivamente — sem loop, apenas atrasado.
- **Verificação executada (2026-09-07, re-executada pelo orquestrador):** `npm run build` 0
  erros; `npm test` 246/246; e2e boarding 42/42 (arquivo ~5s); `openapi:export` 2x idêntico ao
  staged (`openapi:check` fica verde após o commit — o diff vs HEAD é a remoção intencional da
  501); lint 148 erros baseline, nenhum arquivo da story; mobile `npm test` 137/137, `tsc
  --noEmit` limpo, lint 0 erros; core boarding/trip, `mobile/src/mocks/`, fila offline,
  `jwt.strategy` e keys de query: diff vazio. Falha e2e pré-existente
  (`route-assignment.e2e-spec`, login 200 vs 201) segue no action item `epic-3-retro-item-2`.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Guard antes do `@Sse`:** a exceção do handler `@Sse` é engolida pelo stream (HTTP 200
  `event: error`); a do guard roda antes do routing do stream e chega ao exception filter.
  Por isso a resolução da viagem ativa vive no guard, e o handler só monta o Observable.
- **Shape da mensagem:** o serviço traduz o envelope interno para
  `MessageEvent { type: 'boarding.not_returning', data: JSON.stringify({tripId, studentId,
  notifiedAt}) }`. Heartbeat a cada 30s como `MessageEvent { type: 'ping', data: '' }` —
  listeners nomeados o ignoram; é keep-alive de transporte, não evento de contrato.
- **Fechamento elegante:** o listener de `trip.ended` publica um sentinel interno no canal
  (ex.: `{ type: '__trip_ended__' }`); o serviço completa o Subject, o Nest finaliza a resposta
  e o EventSource tenta reconnect → guard responde 409 → cliente encerra. Sem ponto de sync
  adicional entre trip e boarding.
- **Token de 15m:** o cliente SSE lê o token do storage a cada tentativa de conexão; em 401 ele
  usa o refresh single-flight exportado do api-client e reconstrói a conexão. Não há refresh
  dedicado no meio de uma conexão saudável.

## Verification

**Commands:**
- `cd api && npm run build` -- 0 erros
- `cd api && npm test` -- unit verde, core intocado, suítes < 100ms
- `cd api && npm run test:e2e` -- boarding.e2e-spec verde (stream + 409; requer docker compose up
  com Postgres E Redis)
- `cd api && npm run openapi:export` (2x) + `git diff --exit-code -- openapi.json` + `npm run openapi:check` -- vazio/verde
- `cd mobile && npm run openapi:types && npx tsc --noEmit` -- sem erros novos
- `cd mobile && npm test` -- suíte student-list verde
- `cd api && npm run lint` -- nenhum arquivo da story na saída (baseline ~148 erros)
- `git status --porcelain mobile/src/mocks/` -- vazio

**Manual checks:**
- Smoke web com 2 browsers: motorista na student-list; aluno confirma "Não vou voltar" → badge,
  contagem e toast aparecem no motorista em < 3s.
