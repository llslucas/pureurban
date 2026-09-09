---
title: 'Story 4.4: Lembrete Automático de Check-in Pendente (Fatia Vertical)'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 90e3f3dd15445463eedfe57ec42c43fce914515e
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O aluno que embarcou na ida mas não fez check-in na volta é esquecido — o
motorista espera sem necessidade e ninguém avisa o aluno de que falta confirmar o retorno
(jornada da Ana, FR30). Falta a fatia que, 15 minutos após o início da viagem de retorno,
lembra in-app esse aluno a registrar "não vou voltar".

**Approach:** Use case Effect no core decide quem deve ser lembrado (check-in na ida via
`relatedTripId`, sem check-in na volta, sem ausência ativa, sem lembrete anterior) com
**relógio injetado**; um scheduler bobo no shell dispara o scan periodicamente, persiste
`BoardingReminder` (uma vez por aluno por viagem) e emite `boarding.checkin_reminder` no
stream da 4.2; novo `GET /api/v1/boarding/reminder` (STUDENT) deriva o lembrete pendente na
abertura do app; banner em `(student)/home.tsx` responde com a exata mutação da 4.1.

## Boundaries & Constraints

**Always:**
- Novo modelo `BoardingReminder` (`@@schema("boarding")`): `id, companyId, tripId,
  studentId, remindedAt, createdAt, updatedAt` + `@@unique([tripId, studentId])` — no máximo
  um lembrete por aluno por viagem. Migração via `npx prisma migrate dev` + `npx prisma
  generate`.
- O período de 15 min é const do core (`CHECKIN_REMINDER_DELAY_MS`), fronteira **inclusiva**
  (`now - startedAt >= delay`), consumida com `Clock.currentTimeMillis` (precedente
  cancel-absence/login; TestClock fixa a fronteira na suíte).
- Elegibilidade é decisão do core: aluno com `BoardingRecord` na viagem de IDA
  (`relatedTripId` da RETURN ativa), SEM `BoardingRecord` na RETURN, SEM ausência ativa
  (`cancelledAt: null`) na RETURN e SEM `BoardingReminder` prévio. `relatedTripId` nulo →
  viagem sem candidatos (skip). Ausência cancelada → elegível de novo.
- Scan no core: lista as viagens RETURN ativas (varredura de sistema, sem filtro de company
  — cada passo subsequente usa o `companyId` da viagem), filtra as due com o relógio, cria
  as linhas (P2002 → `created: false` → sem evento, padrão de re-leitura da 4.1) e retorna
  `withEvents` com um `boarding.checkin_reminder` `{ tripId, studentId, remindedAt ISO }`
  por linha criada. O forward Redis/SSE da 4.2 (`@OnEvent` já whitelisted) entrega ao
  motorista sem mudanças.
- Scheduler é lógica do shell: `setInterval` com const do shell (60s), `OnModuleInit`/
  `OnModuleDestroy`, `runOnce()` público (usado pelo e2e), tolerante a erro (log e o
  intervalo continua). Sem `@nestjs/schedule` — nenhuma dependência nova.
- Novo `GET /api/v1/boarding/reminder`, roles `['STUDENT']`, 200 sempre no envelope
  `{ data, meta }`: `data = { tripId, remindedAt } | null`. Viagem ativa do aluno resolvida
  por `TripService.getActiveStudentTrip` (composição shell-to-shell, precedente do guard da
  4.2); sem viagem → `{ data: null }` antes de tocar o boarding. Pendente = linha existe E
  sem check-in na viagem atual E sem ausência ativa. `openapi.json` +
  `mobile/src/types/api.d.ts` regenerados e commitados no mesmo PR (`openapi:check` verde
  pós-commit).
- Toda query request-scoped filtrada por `companyId`; imports relativos com `.js`; o GET
  não tem erro de negócio (200 sempre para o aluno autenticado).

**Never:**
- Não tocar nos use cases de check-in/ausência, no serviço de eventos SSE, no core do
  domínio trip, na lista do motorista (sem status "REMINDED" no roster, sem UI nova do
  motorista — o evento no stream deles é apenas emitido), na fila offline (o aluno chama a
  API direto, como 4.1/4.3), em `mobile/src/mocks/`, nos guards de `_layout.tsx`, nas keys
  `['activeTrip']` / `['trip', tripId, 'students']` / `['studentAbsence', tripId]`.
- Sem push notification, sem broadcast, sem mudar os schemas dos eventos SSE ou a whitelist
  do stream, sem endpoint de trigger manual no contrato, sem polling (`refetchInterval`) no
  mobile, sem nova tabela genérica de idempotência.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path (scan) | RETURN ativa, `startedAt` há ≥15 min, aluno com check-in na ida, nada na volta | Linha `BoardingReminder` criada; `boarding.checkin_reminder` com payload exato no stream do motorista | N/A |
| Fronteira do período | `now - startedAt == 15min` | Emite (inclusiva — TestClock fixa a fronteira) | `< 15min` → sem linha, sem evento |
| Re-scan (tick seguinte) | Lembrete já existe para `(tripId, studentId)` | Nada novo: sem linha, sem evento | N/A |
| Corrida de criação | Duas criações simultâneas da mesma `(tripId, studentId)` | 1ª cria e emite; P2002 na 2ª → `created: false`, sem evento | N/A |
| Check-in na volta existe | `BoardingRecord` na RETURN | Sem lembrete; GET → `{ data: null }` | N/A |
| Ausência ativa | Ausência `cancelledAt: null` na RETURN | Sem lembrete; GET → `{ data: null }` | N/A |
| Ausência cancelada | Ausência com `cancelledAt` preenchido | Elegível de novo; GET → pendente | N/A |
| RETURN sem `relatedTripId` | Viagem órfã | Skip — nenhum candidato | N/A |
| Viagem fora do scan | RETURN inativa/encerrada, OUTBOUND, outra company | Ignorada pelo scan | N/A |
| GET sem viagem ativa | Aluno sem RETURN ativa na rota | `{ data: null }` (resolvido antes do boarding) | N/A |
| GET sem lembrete | RETURN ativa, sem linha para o aluno | `{ data: null }` | N/A |
| GET com papel errada | DRIVER no `GET /reminder` | 403 (override de papel no handler) | N/A |
| Mobile: banner | GET retorna pendente | Banner com ação "Não vou voltar" → mesmo dialog/mutação da 4.1; pós-sucesso banner some (cache `['studentReminder', tripId]` removido) | Falha do GET → banner ausente (query retry; tela não trava) |
| Mobile: responder pelo banner | Confirmar no dialog | Mesma chamada `notifyNotReturning(tripId, key)` com a mesma key por tentativa, mesmo estado "Ausência registrada", ≤ 2 toques (NFR19) | Erros tipados da 4.1 com as mesmas mensagens |

</frozen-after-approval>

## Code Map

**Backend — modelo a copiar: ausência (4.1/4.3)**
- `api/prisma/schema.prisma` -- `BoardingAbsence` :182-205 é o modelo a copiar (tenant,
  uniques); `BoardingRecord` :156-175 já tem `@@unique([tripId, studentId])`; `Trip` :75-96
  (`type`, `relatedTripId @unique`, `startedAt`). Adicionar `BoardingReminder` junto ao
  bloco boarding + `npx prisma format`.
- `api/src/domains/boarding/core/ports/` -- hoje 4 ports. `boarding-repository.port.ts`
  (adicionar `findCheckInsByTrip(tripId, companyId)` → `[{ studentId, checkedInAt }]`);
  `trip-access.port.ts` (adicionar `findActiveReturnTrips()` e
  `findActiveReturnTripById(tripId, companyId)`, view nova `{ id, companyId, routeId,
  driverId, relatedTripId, startedAt }`); NEW `reminder-repository.port.ts` (`findByTrip`,
  `create` com discriminador `{ created, record }` — padrão `CreateAbsenceResult` :19-22).
- `api/src/domains/boarding/core/use-cases/register-not-returning.use-case.ts` -- padrão do
  use case (consts de módulo :23, `withEvents` :126-136). `cancel-absence.use-case.ts` --
  precedente Clock + TestClock da 4.3. NEW `scan-checkin-reminders.use-case.ts` (due →
  elegíveis → cria + eventos, `Effect.forEach` sequencial) e NEW
  `get-pending-reminder.use-case.ts` (padrão `noEvents` de
  `get-active-student-trip.use-case.ts` no domínio trip).
- `api/src/domains/boarding/shell/adapters/` -- `prisma-trip-access.adapter.ts` :16-33
  (padrão `Effect.tryPromise` + `orDie`; `findFirst` com select); `prisma-boarding.adapter.ts`
  :60-113 (P2002 → re-leitura é o modelo do `create` do reminder); NEW
  `prisma-reminder.adapter.ts`; leitura cross-schema direta é sancionada
  (`prisma-student-eligibility.adapter.ts:13-14`).
- `api/src/domains/boarding/shell/boarding.service.ts` -- `BOARDING_RUNTIME` :12-18
  (extender o type com `ReminderRepository`), chamada canônica `runAndDispatch` :39-42.
  Métodos novos: `runReminderScan()` e `getPendingReminder(input)`.
- `api/src/domains/boarding/shell/boarding.module.ts` -- providers :24-72; adicionar o
  adapter novo na layer do runtime e `ReminderSchedulerService` como provider. NEW
  `shell/reminder-scheduler.service.ts` (`setInterval`/`clearInterval`, `runOnce()`).
- `api/src/domains/boarding/shell/http/boarding.controller.ts` -- override de papel no
  handler (`notReturning` :127-130), identidade por `req.user.userId` :186-193. Novo
  handler `@Get('reminder')` com `@Roles(['STUDENT'])`. NEW `dtos/pending-reminder.dto.ts`
  (`{ tripId, remindedAt }`, 200 com schema nullable).
- `api/src/domains/boarding/shell/events/boarding-events.service.ts` --
  `@OnEvent('boarding.checkin_reminder')` :61-64 JÁ existe e publica no canal da viagem.
  NÃO tocar.
- `api/src/domains/trip/shell/trip.service.ts` -- `getActiveStudentTrip` :60-65 (reuso no
  controller; `null` quando não há RETURN ativa na rota do aluno).
- `api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.ts` --
  `runAndDispatch` :12-29.
- Specs: `cancel-absence.use-case.spec.ts` -- padrão TestClock (runtime capturado em
  módulo, `setTime` condicional); `prisma-absence.adapter.spec.ts` -- spec real-DB (:8-11);
  `boarding-events.service.spec.ts` :343-376 -- fake timers para o spec do scheduler.
- `api/test/boarding.e2e-spec.ts` -- helpers :68-109 (`checkIn`, `login`, `createUser`),
  `seedActiveTrip` :87-92 (sem `relatedTripId` — o bloco do lembrete semeia a RETURN via
  prisma com `relatedTripId` + `startedAt` retrocedido, padrão da ausência :1246-1254),
  `openStream` :659-737, `server.listen(0)` :744-753, `endAllActiveTrips` :619-623, matriz
  de roles.

**Mobile**
- `mobile/src/app/(student)/home.tsx` -- banner entre o QR (:231-239) e o ramo
  `registered` (:241); `handleConfirm` :194-197 + dialog :289-309 reusados pelo banner
  (mesma mutação, mesma key por tentativa); `notifyMutation.onSuccess` :87-96 ganha
  `removeQueries(['studentReminder', currentTripId])`; modelo de query :61-67.
- `mobile/src/services/boarding.service.ts` -- padrão dos métodos :22-46; adicionar
  `getPendingReminder(): Promise<{ tripId, remindedAt } | null>` (GET; envelope tratado
  pelo apiClient :176-177).
- `mobile/src/types/api.d.ts` -- regenerar (`openapi:types`); o DTO do evento
  :703-721 já existe (sem consumo novo); o tipo do GET novo aparece aqui.
- `mobile/src/student-home.test.tsx` -- harness :102-130, mocks :24-45, fixtures :51-80,
  padrão de mutação :134-206; mockar `getPendingReminder` no `jest.mock` do serviço.
- `mobile/src/services/boarding-events.service.ts` (`onCheckinReminder` :27-28, sem
  consumidor) e `mobile/src/app/(driver)/student-list.tsx` -- NÃO tocar.

## Tasks & Acceptance

**Execution:**
- [x] `api/prisma/schema.prisma` + migração -- modelo `BoardingReminder` com a unique
  `[tripId, studentId]`; `npx prisma migrate dev` + `npx prisma generate` + `prisma format`.
- [x] `api/src/domains/boarding/core/ports/reminder-repository.port.ts` -- NEW;
  `boarding-repository.port.ts` + `trip-access.port.ts` -- métodos novos (views tipadas).
- [x] `api/src/domains/boarding/core/use-cases/scan-checkin-reminders.use-case.ts` -- NEW
  (const de 15 min, Clock, elegibilidade, P2002 → sem evento, `withEvents`).
- [x] `api/src/domains/boarding/core/use-cases/get-pending-reminder.use-case.ts` -- NEW
  (viagem ativa RETURN + linha + filtros de pendência → `{ tripId, remindedAt } | null`).
- [x] `api/src/domains/boarding/shell/adapters/` -- NEW `prisma-reminder.adapter.ts`;
  update `prisma-boarding.adapter.ts` (`findCheckInsByTrip`) e `prisma-trip-access.adapter.ts`
  (2 métodos de RETURN ativa).
- [x] `api/src/domains/boarding/shell/reminder-scheduler.service.ts` -- NEW (interval +
  `runOnce`, tolerante a erro); `boarding.module.ts` -- provider + runtime layer;
  `boarding.service.ts` -- `runReminderScan` + `getPendingReminder`.
- [x] `api/src/domains/boarding/shell/http/boarding.controller.ts` + NEW
  `dtos/pending-reminder.dto.ts` -- `@Get('reminder')` STUDENT, resolução da viagem via
  `TripService`, `{ data: ... | null }`.
- [x] Specs unitárias -- NEW `scan-checkin-reminders.use-case.spec.ts` (matriz I/O do core
  com TestClock: fronteira inclusiva, filtros, corrida, `relatedTripId` nulo, payload do
  evento) e `get-pending-reminder.use-case.spec.ts`; NEW `prisma-reminder.adapter.spec.ts`
  (tenant, P2002, findByTrip); NEW `reminder-scheduler.service.spec.ts` (fake timers:
  tick → scan, destroy limpa).
- [x] `api/test/boarding.e2e-spec.ts` -- UPDATE: bloco do lembrete (semeia ida concluída
  com check-ins reais + RETURN com `relatedTripId` e `startedAt` há 16 min; `runOnce` →
  evento no stream com payload exato; 2º `runOnce` → nada novo; GET pendente/`null` nos
  sabores; role DRIVER → 403) + linha nova na matriz de roles.
- [x] `api/openapi.json` + `mobile/src/types/api.d.ts` -- `openapi:export` (2x) +
  `openapi:types`.
- [x] `mobile/src/services/boarding.service.ts` + `mobile/src/app/(student)/home.tsx` --
  serviço + query `['studentReminder', tripId]` + banner com ação que abre o dialog
  existente; remoção do cache pós-sucesso da mutação.
- [x] `mobile/src/student-home.test.tsx` -- UPDATE: banner aparece com lembrete pendente,
  responder pelo banner dispara a mesma mutação/key e vira "Ausência registrada", banner
  some pós-sucesso e quando GET é `null`.

**Acceptance Criteria:**
- Given RETURN ativa com `startedAt` há ≥15 min e aluno elegível, when o scan roda (tick ou
  `runOnce`), then `boarding.checkin_reminder` chega no stream do motorista com payload
  `{ tripId, studentId, remindedAt }`, uma única linha persistida e nada novo em
  re-execuções.
- Given aluno com check-in na volta OU ausência ativa, when o scan roda e o aluno consulta
  `GET /reminder`, then nenhum lembrete (sem linha, sem evento) e `{ data: null }`.
- Given o core do scan, when `npm test`, then suíte sem infraestrutura com TestClock
  (< 100ms) cobrindo a fronteira inclusiva de 15 min, os filtros e a corrida P2002.
- Given aluno autenticado que abre o app depois do disparo, when `GET /reminder`, then
  `{ data: { tripId, remindedAt } }` sem nunca ter estado conectado ao stream.
- Given aluno na home com lembrete pendente, when responde pelo banner, then mesma chamada
  e mesmo estado do botão da 4.1 em ≤ 2 toques, e o banner some após o sucesso.
- Given contrato alterado, when `openapi:export` 2x, then `git diff --exit-code --
  openapi.json` vazio, `openapi:check` verde pós-commit e `tsc --noEmit` do mobile sem
  erros novos.

## Implementation Notes

## Implementation Notes

- **Branch `feat/4-4-lembrete-automatico-de-check-in-pendente`** (a partir de `main` @
  90e3f3dd), 9 commits atômicos: modelo+migração (`ed59a1c`); core do scan (`c93a79c`);
  shell scheduler + GET (5e347a1); contrato (d13d3a0); mobile (c888324); e2e da matriz
  "fora do scan" (e6d1992); patches do review: revalidação da RETURN no GET (42039d5),
  kill-switch `REMINDER_SCAN_ENABLED` (5b61a14), cache do lembrete no cancelamento +
  comentário honesto (e65692d).
- **Revalidação no use case do GET (patch do review):** o controller resolve a viagem via
  `TripService.getActiveStudentTrip` (congelado), e o use case revalida com
  `findActiveReturnTripById` — fecha a corrida "viagem encerrou entre as duas chamadas" e
  deu chamador ao método que nasceu órfão. Unit novo: "trip no longer ACTIVE RETURN ⇒
  null sem consultar o port de lembrete".
- **`REMINDER_SCAN_ENABLED=false` no e2e (patch do review):** todo arquivo e2e bootava o
  AppModule com o tick de 60s system-wide; um tick de app alheio na janela seed→runOnce
  podia roubar a criação e flakear as assertions exatas. O env (setado em
  `vitest.config.e2e.ts`) desliga só o interval — `runOnce()` segue sendo o gatilho do
  bloco 4.4, e o unit do scheduler (sem env) continua provando o tick/destroy.
- **Comentário da home corrigido (patch do review):** React Native não tem window focus e
  o app não tem wiring de focusManager/AppState — o banner refresca em mount/remount
  (pós-staleTime) e pelas remoções de cache pós-ação; live-refresh é Fase 2 (push). O
  wiring focusManager→AppState virou defer (limitação app-wide, cf. defer NetInfo da
  student-list e action item epic-3-retro-item-5).
- **Cancelamento restaura a pendência (patch do review):** `cancelMutation.onSuccess`
  também remove `['studentReminder', currentTripId]` — espelhando o notifyMutation — e o
  teste novo prova que o banner volta sem remount (o refetch pós-remoção responde o
  lembrete de novo; o cache ficou com o objeto REMINDER, não com null).
- **Desvio de letra consciente no port:** `findByTripAndStudent` foi adicionado ao
  `ReminderRepository` além de `findByTrip`/`create` previstos na Code Map — é o caminho
  de leitura do GET (o scan usa o batch). Superconjunto da spec, sem mudança de contrato.
- **Verificação executada (2026-09-09, pós-patches, re-executada pelo orquestrador):**
  `npm run build` 0 erros; `npm test` 293/293 (suítes do core 33–44ms); e2e boarding
  68/68 (o `route-assignment` falha 1 login na baseline pré-existente, action item
  `epic-3-retro-item-2`); `openapi:export` 2x idênticos + `openapi:check` verde pós-commit;
  `tsc --noEmit` mobile limpo; mobile `npm test` 150/150; lint api 147 erros = baseline
  (nenhum arquivo da story), mobile lint 0 erros; `git status mobile/src/mocks/` vazio.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Linha vs. derivação live no GET:** a linha `BoardingReminder` é a fonte de verdade
  compartilhada com o evento — motorista (stream) e aluno (GET) veem o mesmo desfecho; a
  pendência filtra check-in/ausência na leitura, então responder pelo banner limpa o
  estado nos dois lados sem escrita extra.
- **Scheduler bobo, decisão no core:** todo o "quem e quando" (due, elegibilidade, dedupe)
  vive no use case; o shell só ticka e despacha. Mudar o período é mudar um const do core
  (testável com TestClock); mudar a cadência é mudar um const do shell.
- **Por que o GET resolve a viagem via `TripService`:** reusa a resolução
  rota→RETURN ativa já usada por `/trips/active` (mesma semântica de `{ data: null }`) e é
  o padrão shell-to-shell do guard da 4.2 — sem duplicar a query no boarding.
- **Fronteira inclusiva** consistente com a janela de cancelamento da 4.3.
- **Banner sem polling:** refetch on mount/focus + remoção de cache pós-ação bastam para o
  MVP; push é Fase 2 e o stream segue sendo canal do motorista.

## Verification

**Commands:**
- `cd api && npm run build` -- 0 erros
- `cd api && npx prisma migrate dev` -- migração aplicada sem erro (requer docker compose up)
- `cd api && npm test` -- unit verde, suítes do core < 100ms, sem regressão (267+)
- `cd api && npm run test:e2e` -- boarding.e2e-spec verde (lembrete no stream + GET +
  once-only + roles)
- `cd api && npm run openapi:export` (2x) + `git diff --exit-code -- openapi.json` +
  `npm run openapi:check` -- vazio/verde (o check fica vermelho até o commit — padrão 4.3)
- `cd mobile && npm run openapi:types && npx tsc --noEmit` -- sem erros novos
- `cd mobile && npm test` -- suíte do home verde
- `cd api && npm run lint` -- nenhum arquivo da story na saída (baseline ~147 erros)
- `git status --porcelain mobile/src/mocks/` -- vazio

**Manual checks:**
- Smoke web: com RETURN ativa semeada há 16 min, aluno abre a home → banner aparece;
  responde pelo banner → "Ausência registrada" e banner some; motorista na student-list
  segue funcional (sem mudança de UI).

| # | Achado (camada) | Veredito | Evidência |
|---|-----------------|----------|-----------|
| 1 | BH: `findActiveReturnTripById` (port + adapter) é código morto, sem chamadores nem testes | low | Verdadeiro (confirmado por busca repo-wide da camada VG): zero chamadores — o controller resolve via `TripService`; semântica do filtro `type RETURN` sem pino. Fix direto: ligar o método na revalidação do use case do GET → patch (raiz A) |
| 2 | BH: scheduler de 60s system-wide armado em todos os apps de e2e paralelos; só o bloco 4.4 desarma a própria instância | medium | Verdadeiro (VG traçou as direções de falso-falha): um tick de app alheio na janela entre seed e `runOnce` rouba a criação e quebra as assertions de contagem exata/stream — flake nos testes que pinam a feature → patch: kill-switch por env no `onModuleInit` + env no `vitest.config.e2e.ts` (raiz B) |
| 3 | BH: entrega do evento é at-most-once (create → dispatch; queda entre eles perde o evento e o re-scan não reemite) | low | Verdadeiro mecanicamente, mas o motorista NÃO tem consumidor do evento nesta story (UI intocada por contrato), o aluno se auto-corrige via GET, e persiste→dispatch é o padrão aceito da 4.1/4.3; fix (outbox) é mecanismo novo → rejeitado |
| 4 | BH: motorista que conecta tarde ao stream nunca vê o lembrete (sem backfill) | low | Nenhum AC do épico pede estado de lembrete no motorista; o evento é informativo no stream e hoje não tem consumidor; backfill seria superfície nova de produto → rejeitado |
| 5 | BH: "refetch on mount/focus" não se sustenta no RN — sem wiring de focusManager/AppState | low | Verificado (grep): nenhum `focusManager`/AppState ligado ao TanStack em `mobile/src`; refetch real só em mount/remount pós-staleTime (1 min). Comportamento conforme intenção congelada (sem polling; AC cobre abertura do app), mas o comentário da home supera-afirma → patch no comentário (raiz C); wiring app-wide → defer |
| 6 | BH: `cancelMutation.onSuccess` não remove o cache do lembrete | low | Verdadeiro: pós-cancelamento o servidor voltaria a responder pendente e o cache `null` só sai no remount; fix espelha o `notifyMutation` (1 linha) → patch (raiz D) |
| 7 | BH: faltam e2e "linha criada e DEPOIS resolvida" (check-in/ausência → GET null) | low | A resolução em leitura com linha pré-existente é provada no unit do use case (2 testes); e2e extra é defesa-em-profundidade (precedente triage #14 da 4.1) → rejeitado |
| 8 | BH: falta teste mobile do guard `!registered` do banner | low | Irmãos cobertos (banner aparece, GET null, GET falha, pós-sucesso some); guard de 1 condição; precedente triage #13 da 4.3 → rejeitado |
| 9 | BH: `@@index([companyId])` sem query que o use | low | Sem dano nomeável (overhead de escrita desprezível); precedente `Trip` carrega o mesmo índice; remoção = churn de migração (espírito triage #11 da 4.3) → rejeitado |
| 10 | BH: teste "fronteira INCLUSIVA" repete o happy path | low | O teste NOMEIA a decisão congelada da fronteira (valor de pino); o fixture do suite já fixa a igualdade por construção → rejeitado (redundância cosmética) |
| 11 | BH: títulos mistos PT/EN no spec do scan | low | Mistura pré-existente no repo (suíte da 4.3 tem títulos em PT); sem dano; churn → rejeitado |
| 12 | BH: helper `reminder` duplicado no e2e (matriz de roles + bloco 4.4) | low | Duas closures pequenas; sem fonte de verdade compartilhada com risco nomeável de divergência (precedente triage #11 da 4.3) → rejeitado |
| 13 | BH: semântica de `scannedTrips` enganosa | low | Campo informativo do summary; os e2e já o tratam como não-exato em paralelo (comentários); nenhum chamador depende da semântica → rejeitado |
| 14 | BH: invariante "nada semeia RETURN com relatedTripId antes do bloco 4.4" só vive em comentário | low | Subsumido pela raiz B: com o scheduler desarmado no e2e, nenhum tick roda em bloco algum e a invariante fica vazia de risco → patch (mesma raiz de #2) |
| 15 | ECH: defeito de UMA viagem aborta a varredura das demais | low | `orDie` cobre só erro de infra (banco), que derruba todas as viagens igualmente; `runOnce` loga e o tick seguinte retry (dano ≤ 60s); falha parcial por viagem não é alcançável → rejeitado |
| 16 | ECH: dispatch falha após creates → linha sem evento (re-scan não reemite) | low | Mesma raiz/evidência da #3 → rejeitado |
| 17 | ECH: corrida leitura→create lembreta quem acabou de embarcar | low | Corrida de ms; consequência benigna e auto-corrigida (GET re-deriva e filtra check-in; roster não consome o evento); precedente de corrida residual aceita (triages #7/#8 da 4.3) → rejeitado |
| 18 | ECH: viagem encerra entre `getActiveStudentTrip` e o use case → pendente de viagem morta | low | Verdadeiro: janela de ms com desfecho auto-corrigido pelo refetch do `activeTrip`; fix direto sem superfície nova (revalidar com o método já existente) → patch (raiz A) |
| 19 | ECH: `onModuleInit` duplo vazaria o primeiro interval | low | Nest chama `onModuleInit` uma vez por app; nenhum caminho real de dupla chamada (o spec unit instancia objetos novos) → rejeitado (guarda para estado não demonstrado) |
| 20 | ECH: `runOnce` pode retornar undefined e o e2e lê `scan.remindersCreated` direto | false | O `TypeError` TAMBÉM falha o teste (nunca falso-positivo) — só piora a mensagem num cenário que já exige banco quebrado; sem desfecho ruim → rejeitado |
| 21 | ECH claim: use case do GET não revalida "viagem ativa RETURN" prometido na task; `findActiveReturnTripById` sem chamadores | low | Verdadeiro (confirmado no diff: o use case consulta direto o port de lembrete); o mesmo fix das raízes A fecha o desvio do texto da task → patch (raiz A) |
| 22 | ECH claim: comentário da home alega "mount/focus" sem wiring | low | Verificado por grep (idem #5) → patch no comentário (raiz C); wiring → defer |
| 23 | VG: código morto `findActiveReturnTripById` (pré-verificado, com buscas) | low | Pré-verificado pela camada: zero chamadores em `api/src`, `api/test`, `mobile/src`; sem spec do adapter para piná-lo → patch (raiz A) |
| 24 | VG: flake — tick de app e2e alheio rouba a criação semeada (pré-verificado, com trace) | medium | Pré-verificado pela camada: janelas de interferência existem por design (arquivos em paralelo, sweep sem filtro de company); só direções de falso-falha → patch (raiz B) |
