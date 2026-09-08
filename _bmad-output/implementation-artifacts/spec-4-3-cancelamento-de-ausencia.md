---
title: 'Story 4.3: Cancelamento de Ausência (Fatia Vertical)'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: fb6d7511eb56bbfde9577bdb30b1c21c3180d5d3
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O aluno que apertou "Não vou voltar" por engano não tem como voltar atrás: o
aviso fica permanente e o motorista o exclui da contagem à toa. Falta a fatia que desfaz a
ausência dentro da janela de segurança (FR29), emitindo `boarding.absence_cancelled` — o
consumo no motorista (stream + lista) já existe desde a 4.2.

**Approach:** Use case Effect `cancelAbsence` espelhando o registro da 4.1 (replay-first por
idempotência, tagged errors, evento via `WithEvents`, **relógio injetado** via `Clock` do
Effect para a regra da janela), endpoint real no stub da 4.0, e o botão "Cancelar" com
countdown no card de ausência em `(student)/home.tsx`.

## Boundaries & Constraints

**Always:**
- Contrato da 4.0 é a fonte: 200 `{ data: { studentId, tripId, status: 'NOT_CHECKED_IN',
  cancelledAt } }`; erros 400 `VALIDATION_ERROR` / 403 `STUDENT_NOT_ON_TRIP` / 404
  `ABSENCE_NOT_FOUND` / 409 `TRIP_NOT_ACTIVE` | `CANCELLATION_PERIOD_EXPIRED` |
  `IDEMPOTENCY_KEY_CONFLICT` (+ `MISSING/INVALID_IDEMPOTENCY_KEY` do decorator) no envelope
  `{ error: { code, message, details? } }`. `studentId` vem do JWT; body é `{ tripId }`;
  roles `['STUDENT']`; `X-Idempotency-Key` required.
- Replay-first: lookup pela key ANTES de qualquer regra (viagem encerrada entre envio e
  reenvio não converte sucesso em erro). Match compara `tripId` + `studentId`; divergente →
  409 `IDEMPOTENCY_KEY_CONFLICT`. Só sucesso é cacheado. A key do CANCELAMENTO persiste na
  própria linha (coluna nova `cancelIdempotencyKey`, unique por company) — sem tabela
  genérica; o contrato manda replay da mesma key devolver o resultado original (404 é só
  para key diferente).
- Janela é decisão do servidor, **inclusiva**: cancela quando `now <= cancellableUntil`
  (fronteira exata fixada aqui, consumida com relógio injetado). O valor vem da coluna
  `cancellableUntil` — nunca recalcular de `notifiedAt`. O cliente só exibe o countdown.
- Linha append-only preservado: cancelamento grava `cancelledAt` + `cancelIdempotencyKey`
  na linha ativa; nada de delete; re-registro pós-cancelamento (nova key) cria NOVA linha.
- Evento `boarding.absence_cancelled` `{ tripId, studentId, cancelledAt }` via `WithEvents`
  (`cancelledAt` ISO); replay emite `noEvents`. O forwarding Redis/SSE da 4.2 não muda.
- Ordem das regras espelha a 4.1: replay → viagem ativa (`TripAccess`) → aluno na rota
  (`StudentEligibility`) → ausência ativa (`findActiveByTripAndStudent`) → janela → cancel.
- Toda query filtrada por `companyId`; imports relativos com `.js`.
- Remoção da documentação 501 do `cancel-absence` com `openapi.json` +
  `mobile/src/types/api.d.ts` regenerados e commitados no mesmo PR (`openapi:check` verde).

**Never:**
- Não tocar no use case de registro (4.1), no serviço de eventos SSE (4.2), na derivação de
  roster do domínio trip (o filtro `cancelledAt: null` já re-inclui o aluno), na lista do
  motorista (`absence_cancelled` já tratado na 4.2), na fila offline (sem wiring do aluno —
  cancelamento chama a API direto, como a 4.1), nos guards de `_layout.tsx`, em
  `mobile/src/mocks/`, nas keys `['activeTrip']` / `['trip', tripId, 'students']` /
  `['studentAbsence', tripId]`.
- Sem dialog de confirmação no cancelamento (AC: "ao tocar... o estado volta" — 1 toque;
  cancelamento acidental do cancelamento é recuperável re-registrando). Sem push, sem
  broadcast, sem mudar os schemas dos eventos SSE, sem nova tabela de idempotência.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | JWT STUDENT, ausência ativa, `now <= cancellableUntil`, key nova | 200 com shape do contrato; linha anula (`cancelledAt` + cancel key); evento `boarding.absence_cancelled` emitido | N/A |
| Fronteira da janela | `now == cancellableUntil` | Cancela (inclusiva — TestClock fixa a fronteira) | `now > cancellableUntil` → 409 `CANCELLATION_PERIOD_EXPIRED` |
| Replay mesma key | Mesma key, mesmo payload | 200 com o resultado ORIGINAL, sem novo evento, sem re-anular | N/A |
| Replay key divergente | Mesma key, `tripId` diferente | — | 409 `IDEMPOTENCY_KEY_CONFLICT` |
| Sem ausência ativa | Nenhuma linha ativa p/ `(tripId, studentId)` — inexistente ou já cancelada com key diferente | — | 404 `ABSENCE_NOT_FOUND` |
| Viagem não ativa | Trip inexistente/outra company/`status != 'ACTIVE'` | — | 409 `TRIP_NOT_ACTIVE` |
| Aluno fora da rota | Sem `RouteStudent` na rota da viagem | — | 403 `STUDENT_NOT_ON_TRIP` |
| Body inválido | `tripId` não-UUID/ausente | — | 400 `VALIDATION_ERROR` (EffectSchemaPipe) |
| Roster pós-cancelamento | Ausência cancelada + leitura do roster | Aluno volta a `NOT_CHECKED_IN`; `total` re-inclui o aluno | N/A |
| Motorista no stream | Cancelamento com stream aberto | `boarding.absence_cancelled` no stream com payload exato (prova wire-level deferida da 4.2) | N/A |
| Mobile: cancelar | Toque em "Cancelar" dentro da janela | Card some, volta o ramo normal ("Não vou voltar" disponível); cache `['studentAbsence', tripId]` limpo (`setQueryData` → undefined) | N/A |
| Mobile: corrida com expiração | Servidor responde 409 `CANCELLATION_PERIOD_EXPIRED` | Cache vira consolidado (`absence: null`) + mensagem clara; tela não trava | N/A |
| Mobile: 404 no cancelamento | `ABSENCE_NOT_FOUND` (estado local velho) | Cache limpo (ramo normal) + mensagem clara | N/A |
| Mobile: janela expira localmente | Countdown zera | Botão "Cancelar" some; card permanece consolidado | N/A |

</frozen-after-approval>

## Code Map

**Backend — modelo a copiar: registro de ausência (4.1)**
- `api/src/domains/boarding/core/use-cases/register-not-returning.use-case.ts` -- padrão do
  use case (replay-first :52-64, `withEvents` :126-136, consts de módulo :23). NÃO tocar —
  o replay do registro continua devolvendo a linha original mesmo se cancelada (fecha o
  defer #3 da 4.1: idempotência reporta o efeito original; cancelamento é operação própria,
  com key própria; sem caminho de replay pós-cancelamento no cliente atual).
- `api/src/domains/boarding/core/errors/boarding.errors.ts` -- tagged errors com
  `code`/`httpStatus`; adicionar `AbsenceNotFoundError` (404 `ABSENCE_NOT_FOUND`) e
  `CancellationPeriodExpiredError` (409 `CANCELLATION_PERIOD_EXPIRED`) — o Swagger do
  controller já promete ambos (:237-251). Reusar `TripNotActiveError`,
  `StudentNotOnTripError`, `IdempotencyKeyConflictError`.
- `api/src/domains/boarding/core/schemas/not-returning.schema.ts` -- modelo do schema;
  criar `cancel-absence.schema.ts` idêntico (`{ tripId: Schema.UUID }`).
- `api/src/domains/boarding/core/ports/absence-repository.port.ts` -- sem método de
  cancelamento hoje; adicionar `findByCancelIdempotencyKey(key, companyId)` e
  `cancel(...)` com discriminador `{ cancelled, record }` (padrão `CreateAbsenceResult`
  :19-22) para a corrida P2002 da unique nova.
- `api/src/domains/boarding/shell/adapters/prisma-absence.adapter.ts` -- padrão
  `Effect.tryPromise` + `orDie`, P2002 → re-leitura (:75-124), `companyId` sempre,
  `findActive*` filtra `cancelledAt: null` (:51, :67); spec é real-DB (:8-11).
- `api/src/domains/boarding/shell/http/boarding.controller.ts` -- stub `cancelAbsence`
  :196-264 (`@Post`, `@Roles(['STUDENT'])`, `@HttpCode(OK)`, 404/409 já documentados,
  comentário :258 reserva o pipe). Wiring real espelha `notReturning` :179-194
  (`@TenantId`, `@IdempotencyKey`, `@Body(new EffectSchemaPipe(...))`, `req.user.userId`);
  remover a documentação 501.
- `api/src/domains/boarding/shell/boarding.service.ts` -- método novo espelha
  `registerNotReturning` :63-70 (`runAndDispatch` + mapeio do DTO,
  `status: 'NOT_CHECKED_IN'` constante da resposta). `boarding.module.ts` :33-71 não ganha
  provider novo — o `Clock` default vem do `ManagedRuntime` de graça.
- `api/src/domains/boarding/shell/events/boarding-events.service.ts` --
  `@OnEvent('boarding.absence_cancelled')` :56-59 já publica no canal da viagem. NÃO tocar.
- `api/prisma/schema.prisma:182-200` -- `BoardingAbsence`: adicionar
  `cancelIdempotencyKey String?` + `@@unique([companyId, cancelIdempotencyKey])`
  (nullable: NULLs distintos no PG, um cancelamento por linha). Migração via
  `npx prisma migrate dev` + `npx prisma generate`.
- `api/src/domains/auth/core/use-cases/login.use-case.ts:57` -- precedente de
  `yield* Clock.currentTimeMillis` (único no repo; nenhum TestClock ainda — a spec do use
  case introduz, atendendo o "relógio injetado" do épico e abrindo caminho para a 4.4).
- `api/test/boarding.e2e-spec.ts` -- helper `cancelAbsence(token)` :554-560; teste 501
  :583-588 a substituir; fixtures :111-212 (`seedActiveTrip`, tokens, rota); ausência via
  endpoint real + cross-check prisma (:818-930, delta da janela :919-921); stream:
  `openStream` :650-728, `server.listen(0)` :735-744, `endAllActiveTrips` :746, NFR3
  :764-792 — o teste de `absence_cancelled` entra dentro do describe do stream.
  Janela expirada no e2e: inserir ausência direto no prisma com `cancellableUntil` no
  passado (padrão `seedActiveTrip`).

**Mobile**
- `mobile/src/app/(student)/home.tsx` -- card de ausência :176-192 (comentário :184-185
  reserva o botão); countdown inline :120-131 (`nowMs`, `expiryMs`, `windowExpired` —
  "consolidado" = só a linha do countdown some); cache `{ registered, absence }` :19-22 na
  key `['studentAbsence', tripId]` :58-64; `notifyMutation`/`attemptKeyRef` :72-116 é o
  modelo da `cancelMutation` (key por tentativa, `currentTripId` capturado no press,
  409 → escrita de cache especial); `ERROR_MESSAGES` :26-30 ganha
  `CANCELLATION_PERIOD_EXPIRED` e `ABSENCE_NOT_FOUND`; QR sempre visível :166-174; tripId
  de `['activeTrip']` :46-53. Sucesso do cancelamento = `setQueryData(..., undefined)`
  (volta ao ramo normal; nada de estado "Retorno confirmado" novo — o ramo normal É o
  estado confirmado).
- `mobile/src/services/boarding.service.ts` -- `notifyNotReturning` :28-33 é o modelo
  (key recebida do chamador, envelope tratado pelo apiClient); adicionar
  `cancelAbsence(tripId, key)` com `CancelAbsenceRequestDto`/`CancelAbsenceResponseDto`.
- `mobile/src/types/api.d.ts` -- tipos já gerados: `CancelAbsenceResponseDto` :629-653,
  `CancelAbsenceRequestDto` :654-661 (404/409 documentados :2221+). Só regenerar pela 501.
- `mobile/src/student-home.test.tsx` -- harness: `PaperProvider` :89-110, fixtures
  `cancellableUntil` now+90s :59-69 e now-60s :201, erros via `ApiClientError` :212-274,
  rehidratação :296-299; adicionar `cancelAbsence` ao `jest.mock` do serviço :35-37.
- `mobile/src/app/(driver)/student-list.tsx` -- `applyAbsenceCancelledToRoster` :49-66 +
  testes :183-201. NÃO tocar.
- `mobile/src/utils/offline-queue.ts` -- só check-in; não ligar a fila para o aluno.

## Tasks & Acceptance

**Execution:**
- [x] `api/prisma/schema.prisma` + migração -- `cancelIdempotencyKey` + unique; `npx
  prisma migrate dev` + `npx prisma generate`.
- [x] `api/src/domains/boarding/core/errors/boarding.errors.ts` -- 2 tagged errors novos.
- [x] `api/src/domains/boarding/core/schemas/cancel-absence.schema.ts` -- NEW.
- [x] `api/src/domains/boarding/core/ports/absence-repository.port.ts` + `api/src/domains/boarding/shell/adapters/prisma-absence.adapter.ts` -- métodos de cancelamento + adapter (P2002 → re-leitura).
- [x] `api/src/domains/boarding/core/use-cases/cancel-absence.use-case.ts` -- NEW (replay → trip → rota → ausência ativa → janela inclusiva com `Clock` → cancel + evento).
- [x] `api/src/domains/boarding/shell/boarding.service.ts` -- método `cancelAbsence`.
- [x] `api/src/domains/boarding/shell/http/boarding.controller.ts` -- stub → wiring real; remover 501.
- [x] `api/src/domains/boarding/core/use-cases/cancel-absence.use-case.spec.ts` -- NEW: matriz I/O do core com TestClock (happy, fronteira inclusiva, expirada, replay, conflito, 404, trip, rota, ordem, evento).
- [x] `api/src/domains/boarding/shell/adapters/prisma-absence.adapter.spec.ts` -- UPDATE: cancel persiste ambos os campos, replay pela cancel key, corrida P2002, tenant.
- [x] `api/test/boarding.e2e-spec.ts` -- UPDATE: 501→200 na matriz de roles; bloco de cancelamento (happy + roster reverte, replay, expirada, 404) + `absence_cancelled` no stream.
- [x] `api/openapi.json` + `mobile/src/types/api.d.ts` -- `openapi:export` + `openapi:types` (remoção da 501).
- [x] `mobile/src/services/boarding.service.ts` + `mobile/src/app/(student)/home.tsx` -- serviço + botão "Cancelar" no card (some quando expira), cancelMutation, escritas de cache por desfecho, mensagens pt-BR.
- [x] `mobile/src/student-home.test.tsx` -- UPDATE: cancelar reverte estado, corrida de expiração → consolidado, botão some pós-expiração, 404 → ramo normal, mensagens por código.

**Acceptance Criteria:**
- Given motorista com stream aberto e ausência visível, when o aluno cancela dentro da
  janela, then status reverte e a contagem re-inclui o aluno em < 3s (e2e mede o evento no
  stream com payload exato).
- Given ausência ativa, when cancelamento é solicitado fora da janela, then 409
  `CANCELLATION_PERIOD_EXPIRED` sem alterar a linha nem emitir evento.
- Given mesma key reenviada, then resultado original sem novo evento (replay-first,
  inclusive com viagem já encerrada).
- Given o core do use case, when `npm test`, then suíte sem infraestrutura com relógio
  injetado (TestClock) e < 100ms.
- Given contrato alterado, when `openapi:export` 2x, then `git diff --exit-code --
  openapi.json` vazio, `openapi:check` verde e `tsc --noEmit` do mobile sem erros novos.
- Given aluno na tela de home, when fluxo completo registrar → cancelar, then ≤ 2 toques
  por operação, nenhum estado travado e o "Não vou voltar" volta a estar disponível.

## Implementation Notes

- **Branch `feat/4-3-cancelamento-de-ausencia`** (a partir de `main` @ fb6d751), commits
  atômicos (modelo+port/adapter; core com relógio injetado; shell + contrato; e2e; mobile;
  docs). Sem PR aberto — aguardando revisão/aprovação do Lucas.
- **Desvio de letra consciente no mobile:** o congelado dizia `setQueryData(...,
  undefined)` para limpar o cache pós-cancelamento, mas no TanStack Query v5 resultado
  `undefined` é NO-OP — o card nunca saía nos testes. Usado
  `queryClient.removeQueries({ queryKey })`, honrando a intenção (cache limpo, ramo normal
  de volta, nada travado); após o refetch da query montada, `getQueryData` assenta em
  `null` e os testes fixam esse desfecho. Mesmo mecanismo no 404 (`ABSENCE_NOT_FOUND`).
- **TestClock na suíte do core (relógio injetado, AC < 100ms):** `Runtime` capturado uma
  única vez em módulo (`Effect.runtime` + `TestContext`) e `TestClock.setTime` só roda
  quando o instante pedido difere do corrente — o build do `TestContext` e o próprio
  `setTime` custam ~5ms cada, e o estado do relógio persiste entre runs no mesmo runtime.
  Suíte final: 16 testes em 66–74ms, sem infraestrutura.
- **`openapi:check` fica vermelho até o commit** — compara contra HEAD, e a remoção da 501
  é a mudança de contrato intencional desta fatia. Determinismo provado (`openapi:export`
  2x idênticos); após commitar, check verde.
- **Corrida da unique no adapter:** P2002 em `[companyId, cancelIdempotencyKey]` só acontece
  quando a key já vive em OUTRA linha (o update da própria linha não a dispara); re-leitura
  pela key devolve `cancelled: false` + a linha original, e o julgamento de payload é do use
  case (mesmo padrão do create da 4.1). Isolamento tenant reforçado no `where` da escrita.
- **Review (2026-09-08, 3 camadas — 17 achados, 3 patches):** (1) teste unit que se dizia
  de check-in era clone do happy path → retitulado para o que prova (o use case não requer
  port de check-in); (2) novo e2e "check-in → cancelamento → roster mantém CHECKED_IN"
  pinando a autoridade do check-in ponta-a-ponta; (3) novo e2e "replay do REGISTRO pós-
  cancelamento devolve 201 com a linha original" pinando o defer #3 da 4.1; (4) `npx
  prisma format` no schema (cosmético, inclui drift pré-existente de alinhamento em
  User/Trip/Route). Rejeitados com precedente: corrida de duplo cancelamento em ms
  (aceita em Design Notes, consequências benignas), persister MMKV na janela de throttle
  (~1s, autocorreção em 24h), extras de cobertura defesa-em-profundidade, textos de
  contrato pré-existentes.
- **Verificação executada (2026-09-08, re-executada pelo orquestrador):** `npm run build`
  0 erros; `npm test` 267/267 (suíte do core: 66–74ms); e2e 128 verdes (boarding 54/54 —
  inclui stream `absence_cancelled` < 3s com payload exato, roster reverte, replay pós-fim
  de viagem, expirada sem tocar a linha, 404 nos dois sabores) + 19 skips/falha do
  `route-assignment` (baseline pré-existente, action item `epic-3-retro-item-2`);
  `openapi:export` 2x idênticos; `openapi:types` + `tsc --noEmit` mobile limpos; mobile
  `npm test` 143/143; lint api 147 erros = baseline, nenhum arquivo da story; lint mobile
  exit 0; `git status mobile/src/mocks/` vazio.

## Spec Change Log

## Review Triage Log

| # | Achado (camada) | Veredito | Evidência |
|---|-----------------|----------|-----------|
| 1 | BH: congelado diz `setQueryData → undefined` mas a implementação usa `removeQueries`; Spec Change Log vazio | low | O desvio está registrado no lugar próprio (Implementation Notes + comentários no código); o bloco congelado é propriedade do humano e o Change Log é para emendas de loopback (nenhuma ocorreu). A correção apontada é editar esta spec → rejeitado por regra |
| 2 | BH: Design Notes ("cancelamento OK → undefined") contradiz Implementation Notes (removeQueries/null) | false | Mesmo padrão da triage #9 da 4.0: Implementation Notes narra explicitamente a supersessão (no-op do v5, removeQueries, assentamento em null) — o documento não é ambíguo ao leitor; corrigir seria editar a spec → rejeitado |
| 3 | BH: sprint-status `in-progress` vs spec `in-review` vs tasks [x] | false | Transição de processo: o sync do sprint-status para review acontece no fechamento da story (precedente triage #10 da 4.0). Estado transitório do fluxo |
| 4 | BH: Verification "~246+"/"~148" vs Notes "267/147" | false | Verification é o plano pré-implementação (estimativas); Implementation Notes é o registro de execução — mesmo padrão das triages #11 da 4.0 e #5/#6 da 4.1 |
| 5 | BH: teste unit "aluno já CHECKED_IN" é clone do happy path; nenhum teste faz check-in → cancelamento | low | Real: o teste não simula check-in (o use case nem tem port dele) e o nome promove comportamento não exercitado; a autoridade do check-in no roster É provada (4.1), mas o invariante ponta-a-ponta "check-in presente + cancelamento 200" ficou sem pino → patch |
| 6 | BH: `INVALID_IDEMPOTENCY_KEY` (>200 chars) sem teste no cancel | low | O decorator é compartilhado, provado no próprio nível (`idempotency-key.decorator.spec`) e no e2e do not-returning — mesma pipeline; teste extra é defesa-em-profundidade (precedente triage #14 da 4.1) → rejeitado |
| 7 | BH/ECH: 2 cancelamentos simultâneos (keys diferentes) → 2º escreve por cima e emite 2º evento | low | Alcançável só em duplo toque simultâneo na janela de ms entre leitura e escrita; o cliente mantém a key durante o pending e o 2º toque pós-erro cai no 404; 2º evento é no-op no roster do motorista (handler recusa status não-NOT_RETURNING); corrida residual aceita e documentada nas Design Notes → rejeitado (improvável + fix além de correção direta) |
| 8 | BH: mesma corrida quebra "replay devolve o resultado ORIGINAL" da 1ª key (404) | low | Mesma causa raiz do #7: cenário de ms cujo desfecho ("replay do primeiro pode 404") está explicitamente aceito nas Design Notes aprovadas → rejeitado |
| 9 | BH: `cancelledAt!` no service — invariante só em comentário; se quebrar, TypeError → 500 | false | Invariante por construção: só `cancel()` grava `cancelIdempotencyKey` (sempre junto de `cancelledAt`, no mesmo update) e `findByCancelIdempotencyKey` só casa linhas por essa key — ambos os ramos do service recebem `cancelledAt` não-nulo; estado inalcançável não é defeito |
| 10 | BH: alinhamento do bloco `BoardingAbsence` quebrado; `prisma format` não rodado | low | Real: `npx prisma format --check` reporta o schema sem formatação após a coluna nova → patch (rodar `prisma format`) |
| 11 | BH: `CancelOutcome` duplica `CreateOutcome` no adapter | false | As uniões modelam desfechos de operações distintas (create vs cancel); a coincidência estrutural não cria fonte de verdade com risco nomeável de divergência — nenhum chamador pode divergir; "mais limpo" sem dano concreto não é severidade |
| 12 | BH: matriz congelada não tem linha para divergência de `studentId` no replay | false | O "Always" congelado já fixa "Match compara `tripId` + `studentId`" — a linha da matriz é ilustrativa; exceder a matriz não produz desfecho ruim |
| 13 | BH: branch de erro genérico (não-ApiClientError) e duplo toque pendente sem teste mobile | low | Branches-irmãos cobertos (3 caminhos tipados testados); guarda de 2 linhas (key por tentativa + disabled/loading); precedente triage #16 da 4.2 → rejeitado |
| 14 | BH: descrição 403 do Swagger confunde negação de papel com `STUDENT_NOT_ON_TRIP` | low | Texto pré-existente da 4.0, intocado neste diff (só handler e remoção da 501 mudaram); fix exige regenerar contrato, além de correção direta → rejeitado |
| 15 | ECH: kill do app na janela de throttle do persister pós-cancel restaura card de ausência | low | Real em princípio (throttle ~1s do query-sync-storage-persister), mas exige cancelar e matar o app em <1s; desfecho é card consolidado falso que se autocorrige no gc (24h), sem bloqueio nem dano de dados; fix (flush de persister pós-mutation) é mecanismo novo → rejeitado |
| 16 | VG: invariante "replay do registro pós-cancelamento devolve a linha original" (defer #3 da 4.1) sem pino de teste | low | Pré-verificado: `findByIdempotencyKey` não filtra `cancelledAt`, mas nada falharia se alguém o "alinhasse" ao filtro do `findActiveByTripAndStudent`; o Code Map desta spec fixa o comportamento → patch (1 e2e: register → cancel → replay do registro com a key original → 201 com payload original) |
| 17 | VG screening: sem gaps de verificação | — | Todas as Demonstrações de regressão/adoção/quebra refutadas pelo reviewer; o achado "Other" virou a linha 16 |

## Design Notes

- **Janela e relógio:** `Clock.currentTimeMillis` do `effect` no use case; o spec usa
  `TestClock` para fixar `now` (inclusive `== cancellableUntil`). Comparação contra a
  coluna `cancellableUntil` da linha — nunca `notifiedAt + 2min` recalculado.
- **Corrida residual (aceita, padrão 4.1):** dois cancelamentos simultâneos com keys
  diferentes: o segundo sobrescreve `cancelledAt`/`cancelIdempotencyKey`; replay do
  primeiro pode 404 ("já cancelada"). Single-device na prática; a mesma key simultânea
  serializa via P2002 → re-leitura. Aluno já `CHECKED_IN`: o cancelamento NÃO checa
  check-in (o contrato não declara esse erro para cancel) — a autoridade do check-in vive
  na derivação do roster (`CHECKED_IN` vence).
- **Replay do registro de ausência cancelada (defer #3 da 4.1):** permanece 201 com a
  linha original — ver decisão no Code Map (use case de registro).
- **Mobile:** o card consolidado (pós-expiração) e o estado pós-cancelamento são escritas
  de cache distintas: expiração/corrida → `{ registered: true, absence: null }`;
  cancelamento OK → `undefined`. Mensagens: expirada orienta avisar o motorista
  pessoalmente; 404 informa que não há registro a cancelar.

## Verification

**Commands:**
- `cd api && npm run build` -- 0 erros
- `cd api && npx prisma migrate dev` -- migração aplicada sem erro (requer docker compose up)
- `cd api && npm test` -- unit verde, suíte do core < 100ms, sem regressão (~246+)
- `cd api && npm run test:e2e` -- boarding.e2e-spec verde (cancelamento + stream + roster)
- `cd api && npm run openapi:export` (2x) + `git diff --exit-code -- openapi.json` +
  `npm run openapi:check` -- vazio/verde
- `cd mobile && npm run openapi:types && npx tsc --noEmit` -- sem erros novos
- `cd mobile && npm test` -- suíte do home verde
- `cd api && npm run lint` -- nenhum arquivo da story na saída (baseline ~148 erros)
- `git status --porcelain mobile/src/mocks/` -- vazio

**Manual checks:**
- Smoke web: aluno registra ausência → "Cancelar" → card some e botão volta; motorista na
  student-list vê status reverter e contagem re-incluir em < 3s.
