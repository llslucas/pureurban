---
title: 'Story 5.1: Ingestão e Transmissão de GPS (Fatia Vertical)'
type: 'feature'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 09dca28772178d098d7e59ac9db438764541963b
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O contrato de tracking (5.0) existe, mas os endpoints são stubs 501: nenhuma
posição flui. Sem a fatia 5.1, o motorista não transmite GPS durante a viagem (FR31/FR33)
e as stories 5.2/5.3 não têm posições reais para consumir (FR35).

**Approach:** Implementar `POST /tracking/location` e `GET /tracking/trips/:id/location`
para real: use cases Effect no core do `tracking` com o Redis atrás de um port (gravação
com TTL + publish no Pub/Sub), validação de viagem ativa/motorista atribuído/aluno na rota
via port próprio de leitura cross-schema, e no mobile a captura `expo-location` amarrada
ao ciclo de vida da viagem — liga sozinha quando a viagem passa a `ACTIVE`, envia a cada
5s, para sozinha ao encerrar.

## Boundaries & Constraints

**Always:**
- Contrato da 5.0 é a fonte: paths, DTOs, códigos de erro e roles congelados — zero
  mudança de contrato; `openapi:check` permanece verde sem regenerar nada.
- Pipeline: POST valida → `SETEX` no Redis (TTL 60s, last-write-wins) → publica
  `location.updated` no canal `tracking:trip:{tripId}` com envelope `{type, data}`.
  Posições **nunca** no PostgreSQL — o schema `tracking` permanece sem modelos.
- Leitura cross-context via port próprio do tracking (precedente boarding
  `TripAccess`/`StudentEligibility`): viagem por `id + companyId + status ACTIVE`
  retornando `{id, routeId, driverId}`; aluno na rota = user STUDENT ativo + link
  `RouteStudent` (duas queries, sem JOIN entre schemas).
- Erros tagged novos: `TripNotActiveError` (409), `DriverNotOnTripError` (403),
  `StudentNotOnTripError` (403), `NoLocationAvailableError` (404) — códigos verbatim da
  I/O Matrix da 5.0; envelope HTTP via `EffectExceptionFilter`; 400 `VALIDATION_ERROR`
  via `EffectSchemaPipe` com o schema do core.
- `timestamp` do evento e `receivedAt` do ack são instantes do servidor (uma única leitura
  de relógio por ingestão); o `capturedAt` do device só é armazenado/ecoado.
- Core puro, testável com Layers falsos (< 100ms); e2e contra Redis + Postgres reais do
  docker compose.
- Mobile: captura gated por `activeTrip.status === 'ACTIVE'` (react-query) **e** permissão
  foreground concedida; tick de 5s com `getCurrentPositionAsync`; falha de rede/envio
  descarta a posição e mantém a cadência (sem fila, sem retry de posição velha); zero
  captura fora de viagem ativa (NFR10) — o start/stop reage ao cache de viagem, nunca a
  um toque manual.
- Permissão de localização solicitada com justificativa clara no app do motorista
  (padrão scan.tsx: card com justificativa → botão "Permitir acesso"; negado permanente →
  abrir configurações), visível antes da primeira viagem.

**Never:**
- Não implementar o stream SSE: `GET .../stream` permanece 501 stub, sem trocar para
  `@Sse`, sem subscriber no controller (5.2).
- Sem biblioteca de mapas, sem expo-notifications, sem fila offline de GPS, sem
  `X-Idempotency-Key` no POST, sem heartbeat/evento terminal no canal.
- Zero mudança em `prisma/schema.prisma`, `mobile/src/mocks/`, `api-client`
  (token/refresh), e nos domains `boarding`/`trip`/`auth`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| POST feliz | JWT DRIVER atribuído, viagem ACTIVE, body válido | 200 `{ data: { tripId, receivedAt } }`; Redis sobrescrito (TTL 60s); `location.updated` publicado no canal da viagem | 400 `VALIDATION_ERROR` · 401 · 403 `DRIVER_NOT_ON_TRIP` · 409 `TRIP_NOT_ACTIVE` |
| GET last-known hit | JWT STUDENT na rota, viagem ACTIVE, posição existe | 200 `{ data: { tripId, latitude, longitude, accuracy?, capturedAt } }` | 404 `NO_LOCATION_AVAILABLE` (miss/TTL expirado) |
| GET last-known miss | idem, sem posição armazenada | — | 404 `NO_LOCATION_AVAILABLE` · 403 `STUDENT_NOT_ON_TRIP` · 409 `TRIP_NOT_ACTIVE` · 401 · 400 |
| Motorista errado | JWT DRIVER válido mas não atribuído, viagem ACTIVE | — | 403 `DRIVER_NOT_ON_TRIP` |
| Viagem inexistente/encerrada | status ≠ ACTIVE, id inexistente ou de outra company | — | 409 `TRIP_NOT_ACTIVE` (ambos endpoints) |
| Body inválido | latitude fora de [-90,90], tripId não-UUID etc. | — | 400 `VALIDATION_ERROR` |
| Mobile: viagem → ACTIVE | permissão concedida | captura começa sozinha; POST a cada ~5s | falha de envio: descarta a posição e mantém a cadência |
| Mobile: viagem → COMPLETED | captura em curso | captura para sozinha; nenhum POST fora de viagem ativa | permissão negada: sem captura; card de justificativa |

</frozen-after-approval>

## Code Map

**Backend — modelo a copiar: fatia 4.1 (boarding)**
- `api/src/domains/boarding/core/use-cases/check-in.use-case.ts` -- padrão do use case:
  `Effect.gen`, ports via `Context.Tag`, consts de módulo, erro via `.create()`.
- `api/src/domains/boarding/core/ports/trip-access.port.ts` +
  `shell/adapters/prisma-trip-access.adapter.ts` -- par port/adapter de leitura
  cross-schema (`Effect.tryPromise` + `orDie` + `toInfraError`).
- `api/src/domains/boarding/shell/adapters/prisma-student-eligibility.adapter.ts` -- a
  query aluno-na-rota a espelhar (user STUDENT ativo + `routeStudent`, duas queries).
- `api/src/domains/boarding/shell/boarding.module.ts` + `boarding.service.ts` --
  providers + `ManagedRuntime` via `useFactory` (`Layer.mergeAll`); tracking não tem
  eventos de domínio, então o service usa `runtime.runPromise` direto.
- `api/src/domains/boarding/shell/http/boarding.controller.ts` -- wiring real de handler:
  `@Body(new EffectSchemaPipe(...))`, `@Req() req.user.userId`, `@TenantId()`,
  `@ApiDataResponse`, docs de erro.
- `api/src/domains/shared/shell/pipes/effect-schema.pipe.ts`,
  `filters/effect-exception.filter.ts`, `infra/redis.service.ts` -- pipe de validação,
  filtro global de envelope e o cliente ioredis já injetável (`SharedKernelModule`;
  `REDIS_URL` já no `.env.example`); `boarding/shell/events/boarding-events.service.ts`
  é o precedente de `publish`/`duplicate()`.
- Stubs da 5.0: `api/src/domains/tracking/shell/http/tracking.controller.ts` (POST ~:91,
  last-known ~:152, stream intocado), `shell/http/dtos/` (4 DTOs com bounds de
  coordenadas), `shell/tracking.module.ts` (só `SharedKernelModule` + controller),
  `core/{ports,use-cases}/.gitkeep`.
- `api/prisma/schema.prisma:75-96` -- `Trip` (`driverId`, `routeId`,
  `status: ACTIVE | COMPLETED`).
- `api/test/tracking.e2e-spec.ts` -- matriz 501 da 5.0 a atualizar (helpers
  `ingest`/`lastKnown`/`stream` prontos); `api/test/boarding.e2e-spec.ts` -- fixtures
  (register, login, rota com aluno, trip via prisma).

**Mobile**
- `mobile/src/app/(driver)/trip.tsx` -- `useQuery(activeTripOptions())` (~:162);
  start/end mutações com `setQueryData` (~:207-233) fazem o gate da captura reagir
  sozinho; hooks antes dos early returns (~:256+).
- `mobile/src/hooks/use-offline-sync.ts` -- padrão de timer/refs/cleanup (React Compiler
  ON: nada no corpo do render).
- `mobile/src/app/(driver)/scan.tsx:356-390` -- card de permissão com justificativa +
  `Linking.openSettings` a espelhar.
- `mobile/src/services/api-client.ts` -- `apiClient.post` (sem idempotency),
  `ApiClientError.code/status`; falha de transporte alimenta `lib/connectivity.ts`.
- `mobile/src/lib/trip-queries.ts` -- `activeTripKey` / `activeTripOptions`.
- `mobile/src/types/api.d.ts` -- `LocationIngestRequestDto` / `LocationIngestResponseDto`
  (~:815-830), gerados, nunca à mão.
- `mobile/src/utils/offline-queue.test.ts` +
  `mobile/src/services/boarding-events.service.test.ts` -- fake timers + fakes
  injetados; arquivos de teste fora de `src/app/`.
- `mobile/app.json` -- plugins (precedente expo-camera com string PT); **expo-location
  ainda não está instalado**.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/domains/tracking/core/errors/tracking.errors.ts` -- NEW: os 4 tagged
  errors da matriz (com `code`/`httpStatus`).
- [x] `api/src/domains/tracking/core/ports/trip-access.port.ts` + `location-bus.port.ts`
  -- NEW: `TripAccess.findActiveTrip(tripId, companyId) → {id, routeId, driverId} | null`
  e `LocationBus.store(tripId, location)` / `.latest(tripId) → location | null` /
  `.publish(tripId, event)`.
- [x] `api/src/domains/tracking/core/schemas/location-ingest.schema.ts` -- NEW
  `Schema.Struct` com os bounds do DTO (código de pipe `VALIDATION_ERROR`).
- [x] `api/src/domains/tracking/core/use-cases/ingest-location.use-case.ts` + `.spec.ts`
  -- NEW: trip ativa → driver atribuído → store + publish → `{tripId, receivedAt}`;
  spec cobre a matriz com Layers falsos.
- [x] `api/src/domains/tracking/core/use-cases/get-last-known-location.use-case.ts` +
  `.spec.ts` -- NEW: trip ativa → aluno na rota → `latest` → 404 se miss; spec idem.
- [x] `api/src/domains/tracking/shell/adapters/prisma-trip-access.adapter.ts` +
  `redis-location-bus.adapter.ts` -- NEW: sobre `PrismaService`/`RedisService`.
- [x] `api/src/domains/tracking/shell/tracking.service.ts` + `tracking.module.ts` -- NEW
  service (`TRACKING_RUNTIME`) + providers/layers no módulo.
- [x] `api/src/domains/tracking/shell/http/tracking.controller.ts` -- UPDATE: POST e
  last-known reais (pipe, `@Req`, `@TenantId`, `@ApiDataResponse`); stream permanece 501.
- [x] `api/test/tracking.e2e-spec.ts` -- UPDATE: 501→real no POST/last-known; cenários da
  matriz; um subscriber `duplicate()` prova a publicação; stream segue 501.
- [x] `mobile/` deps -- `npx expo install expo-location` + entrada do plugin em
  `app.json` com justificativa de permissão em uso (PT).
- [x] `mobile/src/services/tracking.service.ts` -- NEW `ingestLocation(body)` com os
  tipos gerados (sem idempotency).
- [x] `mobile/src/utils/gps-capture.ts` + `.test.ts` -- NEW: controlador puro (start/
  stop/tick de 5s; erro → descarta e mantém cadência; nada fora de viagem ativa), deps
  injetadas (`getLocation`, `send`, `schedule`); teste com fake timers.
- [x] `mobile/src/hooks/use-trip-gps-capture.ts` -- NEW: hook fino injetando
  `getCurrentPositionAsync` (accuracy Balanced), o service e timers; gate
  `status === 'ACTIVE'` + permissão; cleanup no unmount (padrão use-offline-sync).
- [x] `mobile/src/app/(driver)/trip.tsx` -- UPDATE: monta o hook antes dos early returns
  + card de justificativa/permissão (request com um toque; negado permanente →
  configurações), visível no estado inicial e na viagem ativa sem permissão.

**Acceptance Criteria:**
- Given motorista atribuído com viagem ativa, when posições são enviadas por ~15s, then
  o Redis mantém só a última (TTL ≤ 60s), um subscriber de `tracking:trip:{id}` recebe
  um `location.updated` por POST e `GET .../location` devolve a última posição (e2e).
- Given viagem encerrada ou permissão negada, when o hook re-renderiza, then a captura
  não roda e nenhum POST é feito (NFR10) — provado no teste do gps-capture.
- Given falha de rede num envio, when o próximo tick chega, then a posição perdida é
  descartada e a cadência segue — provado no teste do gps-capture.
- Given os use cases do core, when `npm test`, then verdes sem Redis/Postgres (< 100ms).
- Given o contrato da 5.0, when `openapi:check`, then sem drift (nenhuma mudança de
  contrato nesta story).
- Given lint/build, then nenhum arquivo da story na saída do lint (baseline ~147) e
  build 0 erros.

## Implementation Notes

- **Branch `feat/5-1-ingestao-e-transmissao-de-gps`** a partir de `main` @ 09dca28.
  25 arquivos (~2.3k linhas). Sem PR aberto ainda.
- **Clock explícito no runtime do tracking:** o ingest lê `Clock.Clock`; a
  `TrackingModule` faz `Layer.succeed(Clock.Clock, Clock.make())` na merge para o tipo
  do runtime casar com o use case (os testes usam o TestClock do harness compartilhado).
- **`EffectSchemaPipe` usado em `@Param` pela primeira vez** (`TripIdParam = Schema.UUID`
  no path do last-known): 400 `VALIDATION_ERROR` para id não-UUID antes de qualquer
  regra, coberto por e2e dedicado.
- **Decorators Swagger 501 mantidos nos handlers agora reais** (POST/last-known): remover
  as entradas `NOT_IMPLEMENTED` driftaria o `openapi.json`; o contrato congelado vence o
  texto de doc obsoleto — `openapi:check` verde, zero regeneração.
- **gps-capture mede a cadência tick-a-tick** (próximo tick agendado ANTES da captura):
  getLocation/send lento não estica o intervalo e um POST em voo por vez é garantido.
  O `send` do hook lê o tripId por ref — corrida de encerramento não envia para viagem
  nenhuma.
- **Aviso `worker-exit` do jest mobile pré-existe na baseline** (verificado via stash);
  suíte 174/174.
- **Verificação executada (2026-09-12):** api build 0 erros; unit 307/307 (specs do core
  ~58ms, sem infra); e2e tracking 17/17 contra Docker; `openapi:check` sem drift; lint
  148 erros = baseline, zero arquivos da story; mobile 174/174 + `tsc --noEmit` limpo;
  `git status --porcelain mobile/src/mocks/ api/prisma/` vazio.
- **Smoke manual web pendente** (Verification → Manual checks): exige dev servers +
  browser; toda a lógica por trás está coberta por unit/e2e. Fica para o Lucas ou para
  a validação da 5.2.
- **Review (iteração 0) aplicado:** 23 achados triados (ver Triage Log), 9 patches
  aplicados pelo mesmo implementador (asserts de gate do hook no screen test; 403
  DRIVER×stream re-adicionado; assert não-tautológico; try/finally do subscriber;
  e2e sem `accuracy` e sem campo obrigatório; `capturedAt` ISO por `Schema.pattern`;
  e2e de aluno desativado ⇒ 403; `.gitkeep` removidos; card extraído em variável),
  13 rejeitados com evidência, 1 defer (EH-8, timeout do getCurrentPositionAsync) em
  deferred-work.md. Verificação final re-executada: build 0 erros; unit 307/307; e2e
  tracking 21/21; openapi sem drift; lint 148 = baseline (0 arquivos da story); mobile
  174/174 + tsc limpo; mocks/ e prisma/ intocados. Hora real no sprint-status.

## Spec Change Log

## Review Triage Log

Revisão (iteração 0) — 23 achados das 3 camadas (blind-hunter ×15, edge-case-hunter ×12,
verification-gap ×2, com 2 duplicações). Veredictos após verificação:

- BH-1 — `.gitkeep` de `core/ports`, `core/use-cases` e `shell/adapters` continuam
  versionados com os diretórios agora povoados — **low**: real (confirmado em disco);
  housekeeping trivial, sem superfície → **patch**.
- BH-2 — comentários em PT contradizem AGENTS.md ("comentários de código em inglês") —
  **false**: a convenção de facto do repositório é PT (boarding/trip/auth inteiros, já
  triada na 5.0 BH-13 como convenção da casa); a divergência AGENTS.md×código é
  pré-existente e repo-wide, não causada por este diff — **rejeitado**.
- BH-3 / EH-12 — assert de 403 DRIVER×stream da matriz da 5.0 foi dropado no rewrite do
  e2e — **low**: real (a matriz nova cobre DRIVER×last-known e stream×STUDENT 501, mas
  não DRIVER×stream); o comentário do próprio spec diz que essa perda seria silenciosa;
  fix de 1 linha → **patch**.
- BH-4 / VG-1 — wiring do gate (hook + tela) sem teste que falhe se regredir —
  **medium** (VG pré-verificado, demonstração por mutação: `status === 'ACTIVE'` removido
  continua postando pós-fim com suítes verdes — NFR10 é privacidade) → **patch**
  (asserts de argumentos no mock de `useTripGpsCapture` no screen test).
- BH-5 — assert tautológico `receivedAt: body.data!.receivedAt` no happy path do e2e —
  **low**: real; a linha seguinte (`Date.parse`) é quem guarda, mas o `toEqual` não
  prova nada; fix direto → **patch**.
- BH-6 / EH-9 — subscriber Redis vaza se um assert falhar (`disconnect()` após os
  expects) e o handler `once('message')` não é removido no timeout — **low**: real
  (higiene de teste; o timeout de 10s É alcançável — testTimeout do e2e é 30s, refutando
  o "inalcançável" do BH); fix com try/finally → **patch**.
- BH-7 / EH-1 — filtro do `capturedAt` aceita qualquer `Date.parse`-ável ("March 5,
  2020") com mensagem afirmando ISO 8601 — **low**: real; contrato declara ISO; fix
  direto com `Schema.pattern` → **patch**.
- BH-8 — ausência de e2e HTTP para `accuracy` omitida e campos obrigatórios ausentes —
  **low**: real (coberto só em unit do core); dois casos baratos no spec existente →
  **patch**.
- BH-9 — story de 25 arquivos viola guarda-corpo de ~15 do sprint-status — **false**:
  o split foi apresentado ao humano no checkpoint (token count + guarda-corpo) e a
  decisão explícita foi manter a fatia vertical única (modelo 4.1) — **rejeitado**.
- BH-10 — números de baseline de lint inconsistentes no spec (147 vs 148) — **low**:
  verdade cosmético em `_bmad-output`; a correção editaria ESTA spec — **rejeitado**.
- BH-11 — Swagger ainda documenta 501 nos handlers reais, sem cleanup planejado —
  **low**: estado real, decisão deliberada registrada nas Implementation Notes; o fix
  (planejar cleanup na 5.2) editaria esta spec — **rejeitado**.
- BH-12 — `last_updated: "09-12-2026 00:00"` com hora-placeholder no sprint-status —
  **low**: real, metadata de tracking; fix de 1 campo → **patch**.
- BH-13 — JSX do card de permissão duplicado nos dois branches de render — **low**:
  real, risco de drift de desenvolvedor; extrair variável é correção direta → **patch**.
- BH-14 — smoke manual só web, fluxos nativos diferentes — **false**: decisão do épico
  (epic-5-context.md): toda story do Épico 5 é verificável no alvo web; validação nativa
  é a Story 1.7 (development build), explicitamente adiada — **rejeitado**.
- BH-15 / EH-2 — publish falha após store ⇒ 500 com posição em cache sem evento —
  **low**: real mas auto-cura (o próximo tick do driver, 5s depois, repete store+publish;
  store falha primeiro se o Redis caiu); fix adicionaria swallow de defeito —
  **rejeitado**.
- EH-3 — POSTs concorrentes intercalam store/publish ⇒ evento velho depois do novo —
  **low**: alcançável só com 2 dispositivos do mesmo motorista; o próximo evento (≤5s)
  corrige; o fix sugerido (seq no evento) violaria o contrato congelado da 5.0 —
  **rejeitado**.
- EH-4 — JSON corrompido no Redis ⇒ 500 em vez de 404 — **false**: a única writer da key
  é o próprio adapter (JSON do shape certo) e o TTL de 60s limita a exposição; situação
  não alcançável pelo programa — **rejeitado**.
- EH-5 — TOCTOU: viagem encerra entre findActiveTrip e store/publish — **low**: janela de
  ms, consequência inerte (um evento pós-fim; stream da 5.2 fecha graciosamente; TTL
  limpa); mesmo veredicto da triage #15 da 4.1 para o mesmo padrão — **rejeitado**.
- EH-6 — stop() em voo + start() antes de assentar pula o primeiro envio — **low**:
  atraso de ≤1 cadência (5s), cenário dev (StrictMode remount); limpar `inFlight` no
  stop permitiria 2 capturas concorrentes — o comportamento atual é o seguro —
  **rejeitado**.
- EH-7 — posição capturada na viagem A enviada para a viagem B (troca mid-flight) —
  **low**: exigiria encerrar A e iniciar B dentro da latência de um getLocation;
  inalcançável na prática; fix adicionaria estado para caminho nunca demonstrado —
  **rejeitado**.
- EH-8 — `getCurrentPositionAsync` sem timeout pode nunca resolver ⇒ `inFlight` preso e
  captura morta pelo resto da viagem — **maybe-false**: mecanismo plausível (web delega
  à Geolocation API, cujo default de timeout é Infinity), mas o comportamento real do
  expo-location não está decidido no diff; se verdadeiro, **medium** (feature morre em
  silêncio). Assentaria: testar Expo Web com GPS sem fix / ler o source do expo-location
  quanto a timeout default → **defer**.
- EH-10 — card de permissão ausente nos branches de loading/erro — **low**: loading é
  transiente (<1s) e o branch de erro já exige retry; adicionar o card a estados
  transientes adiciona complexidade sem benefício — **rejeitado**.
- EH-11 — `void refreshLocationPermission()` sem catch no listener AppState — **false**:
  padrão verbatim do scan.tsx em produção (linha 124, `void getPermission()`); as APIs
  de permissão da expo resolvem (granted:false) em vez de rejeitar — **rejeitado**.
- VG-2 — filtro `isActive: true` da elegibilidade sem teste (desativar o aluno manteria
  200) — **medium** (VG pré-verificado por demonstração; controle de acesso sem defesa)
  → **patch** (caso e2e desativando o aluno via Prisma).

**Grupos roteados:**
- **patch** — Grupo A (VG-1): asserts de argumentos do hook no `trip-screen.test.tsx`
  (trip id só não-nulo com ACTIVE; flag de permissão; null pós-COMPLETED).
- **patch** — Grupo B (VG-2): caso e2e `isActive: false` ⇒ 403 `STUDENT_NOT_ON_TRIP`.
- **patch** — Grupo C (BH-3+EH-12): re-adicionar `stream(driverToken).expect(403)`.
- **patch** — Grupo D (BH-5 + BH-6/EH-9): higiene do e2e (assert não-tautológico;
  try/finally do subscriber com cleanup no timeout).
- **patch** — Grupo E (BH-7+EH-1): `capturedAt` com `Schema.pattern` ISO 8601.
- **patch** — Grupo F (BH-8): e2e sem `accuracy` (200 + GET sem a chave) e sem campo
  obrigatório (400).
- **patch** — Grupo G (BH-1): remover os 3 `.gitkeep` povoados.
- **patch** — Grupo H (BH-13 + BH-12): extrair JSX do card em variável; hora real no
  sprint-status.
- **defer** — EH-8 (maybe-false, medium não verificado) para deferred-work.md.

## Design Notes

- **Shapes no Redis:** key `tracking:trip:{tripId}:location` = JSON de
  `LastKnownLocationDto` (`SETEX` 60s); canal `tracking:trip:{tripId}` = JSON
  `{type:'location.updated', data: LocationUpdatedEventDto}` com `timestamp` do servidor
  no instante do publish (mesmo envelope `{type, data}` do boarding, consumível pela 5.2).
  TTL 60s = bem acima da janela de 15s de "Sem sinal GPS" da 5.2 (evita 404 durante
  indisponibilidade transitória) e curto o bastante para `NO_LOCATION_AVAILABLE` após
  ~1min sem GPS.
- **Ordem das checagens:** ingest = trip ativa (409) → driver atribuído (403) →
  store+publish; last-known = trip ativa (409) → aluno na rota (403) → latest (404).
  Ordem fixada pelos specs de use case e espelhada no e2e.
- **Relógio:** instantes do servidor via Effect Clock (TestClock nos testes — harness
  compartilhado `shared/testing/test-clock.ts`), uma leitura por ingestão para
  `receivedAt` e `timestamp`.
- **gps-capture:** factory/classe com deps injetadas; o hook é só adaptação (expo-location
  + react-query + timers). No alvo web, `expo-location` usa a Geolocation API — sem
  código platform-specific.

## Verification

**Commands:**
- `cd api && npm run build` -- expected: 0 erros
- `cd api && npm test` -- expected: unit verde sem regressão; specs novos do core < 100ms
- `docker compose up -d` + `cd api && npx vitest run --config vitest.config.e2e.ts
  test/tracking.e2e-spec.ts` -- expected: spec verde (baseline tem suíte vermelha
  conhecida fora deste arquivo)
- `cd api && npm run openapi:check` -- expected: sem drift
- `cd api && npm run lint` -- expected: nenhum arquivo da story na saída (baseline ~147)
- `cd mobile && npm test && npx tsc --noEmit` -- expected: verdes
- `git status --porcelain mobile/src/mocks/ api/prisma/` -- expected: vazio

**Manual checks:**
- Smoke web: motorista inicia viagem no Expo Web → Network tab mostra
  `POST /tracking/location` a cada ~5s; encerrar a viagem → POSTs cessam; negar
  permissão → card de justificativa e nenhum POST. (A tela do aluno é a 5.2 — fora
  desta story.)
