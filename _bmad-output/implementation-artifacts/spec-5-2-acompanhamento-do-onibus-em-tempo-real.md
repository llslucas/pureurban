---
title: 'Story 5.2: Acompanhamento do Ônibus em Tempo Real (Fatia Vertical)'
type: 'feature'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ee2d3075d93c588df36c906029db6d3cfae7a894'
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O stream SSE (`GET /tracking/trips/:id/stream`) é stub 501 e o aluno não tem
tela: a posição que a 5.1 transmite não chega a ninguém (FR32/FR34/FR35). Sem a 5.2, a
Jornada 1 ("a 3 pontos, chegando em ~8 min") não é demonstrável e a 5.3 não tem o que provar.

**Approach:** Flipar o stream para SSE real — `@Sse` + serviço de eventos espelhando o
boarding (subscriber Redis compartilhado com ref-count, heartbeat, sentinela de fim de
viagem via `@OnEvent('trip.ended')`), autorização em guard antes do routing. No mobile,
`(student)/track-bus.tsx` carrega o último ponto conhecido, atualiza via SSE e apresenta
distância/ETA em texto, com o degradado "Sem sinal GPS" após ~15s sem eventos.

**Decisions (checkpoint 2026-09-12):**
- **OQ-1 → GPS do device:** não há coordenada de parada no modelo (sem Stop; `Route` só
  cidades; DTOs carregam só a posição do ônibus). A tela captura a posição do device do
  aluno (expo-location em foreground) e calcula localmente haversine ônibus→aluno;
  ETA = distância ÷ velocidade média constante (~25 km/h). Zero mudança de contrato/schema.
- **OQ-2 → novo endpoint de descoberta:** a branch STUDENT de `GET /trips/active` só
  retorna a viagem de RETORNO (semântica do "Não vou voltar", Épico 4). Criar
  `GET /api/v1/tracking/trips/active` (JWT STUDENT) → `{ data: { tripId, type } | null }`
  — viagem ativa de qualquer perna na rota do aluno. Evolução consciente de contrato
  NESTE PR: `openapi:export` + `openapi:types` regenerados e commitados juntos.

## Boundaries & Constraints

**Always:**
- Contrato da 5.0 nos 3 endpoints de tracking é fonte: paths, DTOs, códigos e roles
  congelados; Swagger decorators verbatim (inclusive o doc 501 do stream — precedente
  5.1). O ÚNICO acréscimo de contrato é `GET /tracking/trips/active` (decisão OQ-2),
  declarado + regenerado (`openapi:export` + `openapi:types`) no mesmo PR;
  `openapi:check` verde ao final.
- SSE via Nest `@Sse` com autorização em **guard** (exceção de guard chega ao
  EffectExceptionFilter como envelope; erro lançado dentro do handler `@Sse` vira 200
  `event: error`). Ordem do guard: tripId UUID (400 `VALIDATION_ERROR`, mesmo envelope do
  `EffectSchemaPipe`) → trip ativa (409 `TRIP_NOT_ACTIVE`) → aluno na rota (403
  `STUDENT_NOT_ON_TRIP`). Classe já é `@Roles(['STUDENT'])`.
- Serviço de eventos do tracking espelha `boarding-events.service.ts`: um
  `redis.duplicate()` dedicado; canais ref-counted (múltiplos alunos = mesmo subscribe);
  heartbeat 30s `{type:'ping', data:''}`; `@OnEvent('trip.ended')` publica sentinela
  interna no canal → completa os subjects (stream encerra elegantemente; reconexão toma
  409 do guard); `onModuleDestroy` → `subscriber.disconnect()`.
- O evento entregue ao cliente é verbatim o envelope publicado pela 5.1:
  `event: location.updated` + `data:` JSON `LocationUpdatedEventDto`. Pings e sentinelas
  nunca chegam ao cliente como `location.updated`.
- Mobile: cliente SSE espelhando `boarding-events.service.ts` (Bearer relido a cada open,
  backoff 1s→30s, refresh single-flight no 401, 3 refreshes falhos → `onUnrecoverable`,
  **409 = fechamento definitivo sem retry**). A tela: carrega last-known (404
  `NO_LOCATION_AVAILABLE` = estado "aguardando primeira posição", não erro), depois
  atualiza via SSE; sem `location.updated` por ~15s mantém o último ponto + indicador
  "Sem sinal GPS" (ping NÃO reseta esse timer); eventos de volta → indicador some.
  Sem viagem ativa ou stream fechado por 409 → "Nenhuma viagem ativa no momento" e
  conexão fechada; quando uma viagem começa, a tela se reengaja sozinha.
- Apresentação é texto/status (RN Paper, Card/Chip), sem biblioteca de mapas; utilizável
  em 5"/720p.

**Never:**
- Não mudar contrato dos 3 endpoints existentes nem dos DTOs de evento.
- Sem mapa cartográfico, sem persistir posições, sem mudança em `prisma/schema.prisma`,
  sem tocar na captura GPS da 5.1 nem nos domains `boarding`/`trip`/`auth`.
- Não reusar nem alterar a branch STUDENT de `GET /trips/active` (decisão OQ-2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Descoberta da viagem | JWT STUDENT na rota, viagem ativa (ida OU volta) | 200 `{ data: { tripId, type } }` | sem viagem → 200 `{ data: null }`; 403 role/fora-da-rota implícito (null por company/rota); 401 |
| Stream feliz | JWT STUDENT na rota, trip ACTIVE, driver POSTa a cada 5s | `location.updated` entregue < 5s (NFR2); 2+ alunos no mesmo trip recebem o mesmo evento via um só subscribe | — |
| Autorização do stream | id não-UUID / trip inexistente, encerrada ou de outra company / aluno fora da rota / DRIVER | envelope de erro ANTES de qualquer byte de stream | 400 `VALIDATION_ERROR` · 409 `TRIP_NOT_ACTIVE` · 403 `STUDENT_NOT_ON_TRIP` · 403 FORBIDDEN (role) · 401 |
| Fim de viagem com ouvintes | `trip.ended` com streams abertos | conexões encerradas elegantemente; reconexão recebe 409 | — |
| Tela: viagem ativa | last-known 200 + eventos fluindo | posição + distância/ETA atualizam em texto | 404 last-known → "aguardando primeira posição" |
| Tela: sinal cai | sem `location.updated` por ~15s | mantém último ponto + "Sem sinal GPS"; volta → indicador some | — |
| Tela: sem viagem / viagem encerra | active-trip null, ou stream fecha com 409 | "Nenhuma viagem ativa no momento"; SSE fechado; reengaja sozinho quando viagem começa | — |
| Tela: queda de rede | stream derrubado | reconexão automática com backoff; "dado velho" visível durante o gap | 3 refreshes falhos → banner de staleness |

</frozen-after-approval>

## Code Map

**Backend — modelo a copiar: boarding 4.2**
- `api/src/domains/boarding/shell/boarding-events.service.ts` -- o blueprint: duplicate()
  ref-counted por canal (24-46, 86-137), heartbeat `interval(30_000)` (105-107), sentinela
  `__trip_ended__` no `@OnEvent('trip.ended')` (66-84) → completa subject (178-190),
  `onModuleDestroy` (139-141).
- `api/src/domains/boarding/shell/http/boarding-events.guard.ts` + uso no controller
  (`@Sse('events')` boarding.controller.ts:345-398) -- guard antes do routing; comentário
  10-13 explica o porquê. O guard do tracking lê o id do `@Param` em vez do active-trip.
- `api/src/domains/tracking/` (estado 5.1): `shell/http/tracking.controller.ts` stream
  stub 189-251 + comentário 44-50 (mandato do flip); `core/ports/location-bus.port.ts`
  (envelope do evento), `trip-access.port.ts` (`findActiveTrip`, `isStudentOnRoute`),
  `shell/adapters/*` (canal `tracking:trip:{id}`, key TTL 60s), `core/errors/` (4 tagged),
  `shell/tracking.service.ts`/`tracking.module.ts` (runtime, providers),
  `core/schemas/location-ingest.schema.ts:5` (`TripIdParam = Schema.UUID`).
- `api/src/domains/shared/shell/interceptors/response-wrapper.interceptor.ts:19-25` --
  skip SSE via metadata `__sse__` (o `@Sse` resolve).
- `api/test/tracking.e2e-spec.ts` -- locks 501 do stream (300-310) a substituir; helpers
  de fixture (register/login/rota/aluno/trip) e `nextMessage` (27-43);
  `api/test/boarding.e2e-spec.ts:663-758` -- parser SSE `openStream` + workaround
  `server.listen(0)` + abort() a reusar; teste de trip-end 851-871.

**Mobile**
- `mobile/src/services/boarding-events.service.ts` -- blueprint do cliente SSE (backoff
  44-45/174-183, 409 permanente 145-150, refresh single-flight 152-172, token por open
  101-104); teste com MockEventSource + fake timers em `boarding-events.service.test.ts`.
- `mobile/src/app/(student)/track-bus.tsx` -- placeholder de 9 linhas a reescrever;
  `(student)/_layout.tsx:8` já registra a rota "Acompanhar ônibus"; entrada na home ao
  lado do QR (`(student)/home.tsx:247-255`).
- `mobile/src/services/tracking.service.ts` (5.1: `ingestLocation`) -- estender com
  last-known; `mobile/src/lib/trip-queries.ts` -- padrão queryOptions/keys;
  `(student)/home.tsx:49-51` -- tripId ativo por react-query.
- `mobile/src/types/api.d.ts` -- `LocationUpdatedEventDto` (~:889),
  `LastKnownLocationDto` (~:856) já gerados; staleness banner:
  `(driver)/student-list.tsx:274-296`.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/domains/tracking/shell/tracking-events.service.ts` -- NEW: serviço SSE
      (subscribe ref-counted, heartbeat 30s, sentinela em `trip.ended`).
- [x] `api/src/domains/tracking/shell/http/tracking-stream.guard.ts` -- NEW: 400→409→403
      antes do routing; anexa tripId ao request.
- [x] `api/src/domains/tracking/core/ports/trip-access.port.ts` +
      `shell/adapters/prisma-trip-access.adapter.ts` -- UPDATE:
      `findActiveTripForStudent` (RouteStudent → Trip ACTIVE, duas queries, qualquer perna).
- [x] `api/src/domains/tracking/core/use-cases/get-active-tracking-trip.use-case.ts` +
      `.spec.ts` + DTO `ActiveTrackingTripDto` -- NEW: `{tripId, type} | null` (Layers
      falsos no spec).
- [x] `api/src/domains/tracking/shell/http/tracking.controller.ts` -- UPDATE: stream real
      (`@Sse` + guard, decorators verbatim) + `@Get('trips/active')` STUDENT com
      `ApiDataResponse` + docs de erro.
- [x] `api/src/domains/tracking/shell/tracking.module.ts` -- UPDATE: providers.
- [x] `api/openapi.json` + `mobile/src/types/api.d.ts` -- REGEN
      (`npm run openapi:export` → `npm run openapi:types`).
- [x] `api/test/tracking.e2e-spec.ts` -- UPDATE: locks 501 → matriz do stream (feliz <5s,
      400/401/403/409, 2 alunos, trip-end + reconnect) + e2e do active-tracking-trip.
- [x] `mobile/src/services/tracking-stream.service.ts` + `.test.ts` -- NEW: cliente SSE
      (backoff/409/refresh) com MockEventSource e fake timers.
- [x] `mobile/src/services/tracking.service.ts` -- UPDATE: `getLastKnownLocation` +
      `getActiveTrackingTrip`.
- [x] `mobile/src/lib/geo.ts` + `.test.ts` -- NEW: haversine + ETA texto.
- [x] `mobile/src/lib/track-bus-queries.ts` -- NEW: queryOptions (active-trip com
      refetchInterval enquanto null; last-known).
- [x] `mobile/src/app/(student)/track-bus.tsx` -- REWRITE: estados da matriz.
- [x] `mobile/src/app/(student)/home.tsx` -- UPDATE: botão "Acompanhar ônibus".
- [x] `mobile/src/track-bus-screen.test.tsx` -- NEW: matriz da tela (mocks do serviço/hook).

**Acceptance Criteria:**
- Given driver POSTando a cada 5s e dois alunos conectados, when uma posição chega, then
  ambos recebem `location.updated` em < 5s servidos por um só subscribe Redis (e2e).
- Given a matriz de autorização, when cada cenário, then envelope de erro antes de
  qualquer byte de stream (e2e).
- Given viagem encerrada com ouvintes, when `trip.ended` dispara, then streams encerram
  elegantemente e a reconexão recebe 409 (e2e).
- Given a tela do aluno, when 15s sem `location.updated`, then "Sem sinal GPS" com último
  ponto mantido; o retorno do evento limpa o indicador; pings não contam como sinal
  (teste de tela, fake timers).
- Given queda de rede no stream, when reconecta, then backoff 1s→30s, 409 encerra sem
  retry e 401 faz refresh single-flight (teste do serviço).
- Given unit do core/serviços, when `npm test` / `npm test` (mobile), then verdes sem
  infra (core < 100ms).
- Given o contrato, when `openapi:check`, then verde com o novo endpoint declarado e
  regenerado no mesmo PR.
- Given lint/build, then zero arquivos da story na saída do lint (baseline ~148) e builds
  0 erros.

## Implementation Notes

## Spec Change Log

- **2026-09-12 (implementação):** a task pedia `ApiDataResponse` no
  `GET /tracking/trips/active`; o decorator compartilhado não expressa
  `nullable: true` no `data` (geraria tipo não-nulo no mobile, contrariando a
  decisão OQ-2). Usado `@ApiResponse` com schema inline `nullable` — mesma
  estrutura do envelope, precedente do boarding-reminder; `openapi.json` e
  `api.d.ts` saem exatamente com `{ data: ActiveTrackingTripDto | null, meta }`.

## Review Triage Log

- BH-1/ECH-5 — track-bus.tsx banner "Atualizar" só refaz a descoberta; tripId igual ⇒ efeito do
  stream não reabre a conexão morta após `onUnrecoverable`. **medium** — verificado: deps do
  efeito são `[tripId, tripEnded, …]`, refetch com mesmo tripId não reexecuta; banner promete
  atualização que não reconecta. → **patch**
- BH-2 — onOpen sem refetch de last-known. **false** — o código documenta o invariant
  seed-once ("refetch pode trazer ponto mais velho que um evento já recebido"); lacuna de sinal
  é coberta pelo chip de 15s; evento seguinte chega em ~5s.
- BH-3/ECH-1/ECH-11 — timer de 15s só arma em `onLocationUpdated`: tela semeada por last-known
  sem nenhum evento mostra "Em tempo real" indefinidamente. **medium** — verificado: viola o AC
  congelado literalmente ("when 15s sem location.updated, then 'Sem sinal GPS'"). → **patch**
- BH-4/ECH-3 — 400/403 determinísticos caem na escada infinita (teto 30s). **low** rejeitado —
  raro no dia a dia; o spec congelado designa SOMENTE 409 como fechamento definitivo; mudar isso
  é renegociação de contrato congelado, não correção direta.
- BH-5 — sem unit spec do serviço de eventos. Duplicado de VGR-1. → **patch**
- BH-6 — formatDistance: [999.5, 1000) vira "1000 m". **low** — verificado (Math.round após o
  branch). Correção direta. → **patch**
- BH-7 — parser SSE do e2e: heartbeat `data:` vazio ⇒ JSON.parse('') lança em testes ≥30s.
  **low** — latente (nenhum teste vive 30s hoje). Correção direta no helper. → **patch**
- BH-8 — meta.timestamp sem `required` no schema inline. **false** — o decorator compartilhado
  ApiDataResponse tem exatamente o mesmo shape (sem required no meta); tipo gerado idêntico ao
  de todos os outros endpoints.
- BH-9 — describe do e2e ainda diz "Story 5.1" só. **low** — nome agora incompleto; renomear é
  correção direta. → **patch**
- BH-10 — sprint-status in-progress vs spec in-review. **false** — sequência do próprio
  workflow: status vira done após a review (precedente 5.1).
- BH-11 — redação da célula "Descoberta da viagem" conflagra 403/null. **false** — leitura é
  inequívoca em contexto (role→403, fora-da-rota→null) e a correção editaria bloco congelado.
- BH-12 — comentários novos em português vs AGENTS.md ("comentários de código em inglês").
  **low** — prática repo-wide (boarding, 5.1, e2e todos em português); resolver exige editar o
  AGENTS.md. → **defer**
- BH-13 — heading "Implementation Notes" vazio. Rejeitado — correção editaria este spec.
- BH-14 — `type` (ida/volta) não exibido na UI. **low** rejeitado — apresentação congelada é
  distância/ETA em texto; expor a perna adiciona superfície além do intent.
- BH-15 — permissão negada sem botão de configurações. **low** rejeitado — decisão OQ-1
  congelada é hint + posição do ônibus visível; deep-link de settings é superfície nova.
- BH-16 — teste "aluno sem rota" duplicado. **false** — fixa faceta distinta (autorização
  implícita: outsider recebe null do port, não erro) com argumento asserido.
- BH-17 — comentário do adapter subestima dual-active (volta sem encerrar ida). **low** —
  comentário impreciso; mesma raiz do ECH-8. → **patch**
- ECH-2 — sentinela publicada antes do subscribe aterrissar ⇒ stream zumbi. **low** rejeitado —
  janela de ms entre guard e subscribe; correção adiciona re-check por conexão (complexidade);
  mesmo shape aceito no blueprint do boarding.
- ECH-4 — segundo erro durante handleError (await do refresh) ⇒ reconexão dupla. **maybe-false**
  — exigiria ler o comportamento pós-close do react-native-sse; boarding tem o mesmo shape. →
  **defer** (não verificado; se real, medium)
- ECH-6 — subscribe() rejeitado deixa stream sem eventos, só pings. **low** rejeitado — raro
  (offline queue do ioredis); catch-e-log idêntico ao boarding; chip de 15s cobre a honestidade.
- ECH-7 — payload sem latitude/longitude derruba a render. **false** — único publicador do canal
  é o ingest 5.1 schema-validado; tipos desconhecidos seguem com o PRÓPRIO type (o cliente só
  escuta 'location.updated').
- ECH-8 — tie-break de startedAt idêntico é não-determinístico. **low** — real porém de efeito
  mínimo; correção direta (`{ id: 'desc' }`). → **patch**
- ECH-9 — handle SSE vaza se expectativa falha antes do abort. **low** rejeitado — só em testes
  já falhando; correção é scaffolding de cleanup.
- ECH-10 — desvio do ApiDataResponse. **false** — divulgado no Spec Change Log com racional
  (decorator não expressa nullable); saída do contrato casa com a decisão OQ-2.
- VGR-1 — TrackingEventsService sem unit spec (heartbeat, ref-count, malformed, sentinela);
  blueprint boarding tem spec equivalente; demonstração: apagar o heartbeat mantém suítes verdes.
  Pré-verificado. → **patch**
- VGR-2 — polling de 10s da descoberta sem assertion (mudar refetchInterval para false mantém
  tudo verde). Pré-verificado. → **patch**

## Design Notes

- **Wire format do stream** (Nest `@Sse`; `event:` do contrato é o `type` do MessageEvent):
  ```ts
  subject.next({ type: 'location.updated', data: JSON.stringify(event.data) });
  subject.next({ type: 'ping', data: '' }); // interval(30_000), interno
  // mensagem `__trip_ended__` no canal → completa o subject, nunca é encaminhada
  ```
- **15s de sinal GPS ≠ 15s de conexão:** ping prova conexão, não GPS — só
  `location.updated` reseta o timer do indicador (o valor do produto é honestidade do
  dado, não saúde do socket).
- **Descoberta da viagem:** query `activeTrackingTrip` com refetchInterval (~10s)
  enquanto `null` — a tela se reengaja sozinha quando o motorista inicia a viagem.
- **ETA:** velocidade média constante (~25 km/h) documentada como heurística; < 100 m
  vira "chegando". Sem promise de precisão — é texto de conforto, não navegação.

## Verification

**Commands:**
- `cd api && npm run build` -- expected: 0 erros
- `cd api && npm test` -- expected: unit verde sem regressão (core < 100ms)
- `docker compose up -d` + `cd api && npx vitest run --config vitest.config.e2e.ts
  test/tracking.e2e-spec.ts` -- expected: spec verde
- `cd api && npm run openapi:check` -- expected: verde (novo endpoint regenerado no PR)
- `cd api && npm run lint` -- expected: nenhum arquivo da story na saída (baseline ~148)
- `cd mobile && npm test && npx tsc --noEmit` -- expected: verdes
- `git status --porcelain mobile/src/mocks/ api/prisma/` -- expected: vazio

**Manual checks:**
- Smoke web (fecha o smoke pendente da 5.1): duas janelas do Expo Web — motorista inicia
  viagem → Network mostra POSTs a cada ~5s; aluno abre "Acompanhar ônibus" → vê posição e
  distância/ETA atualizando; encerrar a viagem → POSTs cessam e a tela do aluno mostra
  "Nenhuma viagem ativa no momento".
