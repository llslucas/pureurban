---
title: 'Story 4.2: Canal SSE de Embarque e Recebimento em Tempo Real (Fatia Vertical)'
type: 'feature'
created: '2026-09-07'
status: 'done'
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

| # | Achado (camada) | Veredito | Evidência |
|---|-----------------|----------|-----------|
| 1 | BH: reconexão SSE não reconcilia o roster — refetch só acontece por evento recebido; ausência ocorrida durante a queda nunca reconcilia (matriz I/O "Queda de rede": "roster reconciliado por refetch") | medium | Real: `open` no serviço só zera `attempts`; a tela só invalida por evento. `refetchOnWindowFocus` mitiga parcialmente, mas tela focada não refetch. Desvio da linha congelada da matriz → patch |
| 2 | BH: `JSON.parse` sem guarda em `handleMessage` — mensagem malformada em canal ativo derruba o processo (listener ioredis) | medium | Real: parse sem try/catch chamado do handler `'message'`; exceção em listener de EventEmitter é uncaught. Mobile já defende o caso análogo (`parsePayload`). Publicador malicioso/buggy no canal (sem ACL no Redis) derruba a API → patch |
| 3 | ECH: mesmo achado do #2, com guard_snippet | medium | Mesma causa raiz do #2 → agrupado no patch |
| 4 | VG (pré-verificado): mesmo achado do #2, citando que o spec unit só cobre o caminho "canal sem inscritos", nunca o parse em canal ativo | medium | Mesma causa raiz do #2 → agrupado no patch (com o caso de teste faltante) |
| 5 | BH: subscribe Redis falho/pendurado deixa stream zumbi (falha só logada; `maxRetriesPerRequest: null` enfileira sem rejeitar) | low | Cenário de outage de Redis: degradação silenciosa limitada à duração do outage — o roster REST e o pull-to-refresh continuam como caminho primário. Fix exige máquina de erro/retry nova → rejeitado |
| 6 | BH: sem health handling na conexão de pub/sub; publish pendura em outage (NFR3 sem sinal) | low | Mesma família do #5: degradação só sob outage de infra, com fallback REST existente; NFR3 é medido contra API sadia no e2e → rejeitado |
| 7 | BH: shutdown gracioso pendura com streams abertos (`onModuleDestroy` não completa subjects) | false | `main.ts` não chama `enableShutdownHooks` — não existe caminho de shutdown gracioso no app; `app.close()` só roda no `afterAll` dos e2e, onde os streams são abortados/aguardados. O desfecho pendurado não é alcançável hoje |
| 8 | BH: só 409 é terminal no cliente mobile; 403/404/400 entram no backoff infinito | low | Churn limitado (≤1 req/30s), auto-curável (cada tentativa relê token/papel); 403 de papel revogado em plena viagem é cenário irreal no produto. Fix exige política de max-attempts nova, fora do contrato → rejeitado |
| 9 | BH: tela não reage a close definitivo (sem callback onClosed; roster da viagem encerrada continua renderizado) | low | Pós-fim de viagem o card é moot (mesma triagem #7 da 4.1); foco/retorno à `trip.tsx` refetcha `['activeTrip']` e a tela já tem estados de viagem inativa da 3.5b → rejeitado |
| 10 | BH: assimetria LWW — `applyNotReturningToRoster` não recusa `CHECKED_IN` (o handler de cancelamento recusa); evento atrasado vira badge/toast errados até o refetch | low | Real e alcançável na corrida ausência-em-voo → check-in (janela de ms, auto-corrigida pelo invalidate imediato, mas o toast errado confunde). Fix é guarda de 1 linha simétrica à do cancelamento → patch |
| 11 | BH: toasts sucessivos se sobrescrevem (snackbar único) | low | Badge e contagem carregam o sinal primário de cada aluno; o toast é complemento. Fila de snackbars é complexidade nova sem benefício demonstrado → rejeitado |
| 12 | BH: sem e2e de `absence_cancelled` no stream | low | O evento não tem emissor até a 4.3 (Never da spec); o caminho de forwarding está coberto no unit (fake Redis entrega `absence_cancelled`); prova wire-level chega com 4.3 e é exigida pela 4.5 (E2E do épico) → rejeitado |
| 13 | BH: guard sem unit spec + `boardingTripId` opcional no guard vs required no controller | low | O comportamento (409 + attach) é provado por e2e (409 e happy path com stream correto); a assimetria de tipo é invisível em runtime. Fix principal é um arquivo de spec novo, além de correção direta → rejeitado |
| 14 | BH: e2e NFR3 wall-clock flaky + `firstMessage` sem reject (pendura até o timeout) | low | O <3s é a própria métrica do NFR, com folga de ~75x medida (39ms); no pior caso falha no timeout de 30s configurado. Ergonomia de teste, não defeito → rejeitado |
| 15 | BH: Change Log / Triage Log vazios enquanto Implementation Notes registra mudanças pós-auditoria | false | Os logs são populados por este review (Triage) e pelo step-04 em loopbacks (Change Log); Implementation Notes é a seção correta para o ciclo de verificação do orquestrador — ownership definido no template |
| 16 | BH: scaffolding de teste frágil (`flush()` com 6 microtasks, poke no registry) + branches sem cobertura (cache ausente, troca de tripId) | low | Brittleness interna de teste com comportamento provado; branches omitidos são guardas de 2 linhas com comportamento vizinho coberto (studentId desconhecido → refetch). Adicionar suítes excede correção direta → rejeitado |
| 17 | ECH: `REDIS_URL` com fallback silencioso para localhost (fail-slow, não fail-fast) | low | Projeto sem deploy de produção (NFR/deploy diferidos; action items retro 7/8 são os donos da política fail-fast); `.env.example` documenta; o próprio `PrismaService` não tem fallback — inconsistência menor. Fix cria validação de startup nova → rejeitado |
| 18 | BH: união dos 3 tipos declarada (`TypedEventSource`) mas re-inlinada na construção | low | Real e cosmético; drift só seria possível se o contrato mudasse (congelado). Fix de 1 linha, sem superfície → patch |
| 19 | ECH: forward do stream sem whitelist (qualquer `type` publicado no canal é encaminhado) | low | Inalcançável pela aplicação: o único publicador é o próprio serviço, whitelisted nos 3 listeners; exige acesso Redis externo (mesmo pressuposto do #2, resolvido no parse). Filtro redundante no forward → rejeitado |
| 20 | ECH: rejeição de subscribe deixa entrada morta reutilizada por clientes seguintes | low | Mesma família do #5 (outage); `maxRetriesPerRequest: null` enfileira em vez de rejeitar no caso principal → rejeitado |
| 21 | ECH: sentinel publicado entre o guard e o subscribe é perdido — stream nunca completa na viagem encerrada | low | Janela de milissegundos entre `canActivate` e o subscribe no mesmo request; dano limitado (conexão idle até o unmount — o use case de ausência exige viagem ativa, sem eventos fluem) → rejeitado |
| 22 | ECH: segundo erro durante o await do refresh abre conexão duplicada | low | Requer dois erros do XHR antes do `close()` síncrono (janela rara); pior caso é conexão redundante com handlers idempotentes (replay-safe provado) → rejeitado |
| 23 | ECH: status permanentes (403) → churn infinito | low | Mesma causa raiz do #8 → agrupado/rejeitado |
| 24 | ECH: mesmo achado do #10 com guard_snippet | low | Mesma causa raiz do #10 → agrupado no patch |
| 25 | ECH: `maxRetriesPerRequest: null` → fila de comandos sem limite em outage prolongado | low | Mesma família do #6; taxa de publish é baixíssima (eventos de ausência), memória negligível em viagens de MVP → rejeitado |
| 26 | VG (outro): decorators `@OnEvent` de `absence_cancelled`/`checkin_reminder` nunca executados em teste | low | Inalcançável por design nesta fatia (sem emissor até 4.3/4.4 — observação da própria VG); um typo seria apanhado imediatamente pelos testes/e2e das stories seguintes → rejeitado |
| 27 | VG screening: sem gaps de verificação — cobertura mapeada linha a linha (e2e stream/NFR3/409/terminal, matriz de roles, tela, cliente mobile, whitelist) | — | Camada pré-verificada não acusou nenhum gap; achados "Other" viraram as linhas 4 e 26 |

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
