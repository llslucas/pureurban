---
title: 'Story 4.1: Registro de Ausência "Não Vou Voltar" (Fatia Vertical)'
type: 'feature'
created: '2026-09-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 8e1ce51a17519bde0e02ac6a70b190713934475b
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O aluno que não vai retornar não tem como avisar o motorista, que espera em vão
no ponto. Falta a primeira fatia vertical do Épico 4: persistir a ausência, refletir o status
`NOT_RETURNING` no roster e dar ao aluno o botão de até 2 toques em `(student)/home.tsx`
(FR26/NFR19), contra a API local (sem MSW).

**Approach:** Novo modelo `BoardingAbsence` (schema `boarding`) + use case Effect
`registerNotReturning` espelhando o check-in da 3.3a (replay-first por idempotência, tagged
errors, evento `boarding.not_returning` via `WithEvents`), endpoint real no stub da 4.0,
roster do domínio trip derivando `NOT_RETURNING` (com `CHECKED_IN` prevalecendo), resolução
da viagem de retorno ativa para o aluno via `GET /trips/active`, e a tela do aluno com
confirmação, estado "Ausência registrada" e countdown alimentado por `cancellableUntil`.

## Boundaries & Constraints

**Always:**
- Contrato da 4.0 é a fonte: 201 `{ data: { id, studentId, tripId, status: 'NOT_RETURNING',
  notifiedAt, cancellableUntil } }`; erros 400/401/403 `STUDENT_NOT_ON_TRIP` /
  409 `TRIP_NOT_ACTIVE` | `ALREADY_NOT_RETURNING` | `IDEMPOTENCY_KEY_CONFLICT` no envelope
  `{ error: { code, message, details? } }`. `studentId` vem do JWT; body é `{ tripId }`.
- Replay-first: lookup por `X-Idempotency-Key` ANTES de qualquer regra de negócio (viagem
  encerrada entre envio e reenvio não converte sucesso em erro). Match de payload compara
  `tripId` + `studentId`; divergente → 409 `IDEMPOTENCY_KEY_CONFLICT`. Só sucesso é cacheado.
- `cancellableUntil = notifiedAt + 2 min` calculado no core (`CANCELLABLE_WINDOW_MS` como
  constante do módulo do use case); o cliente só exibe o countdown. Janela inclusiva até
  `cancellableUntil` (fronteira consumida pela 4.3 com relógio injetado).
- Re-registro pós-cancelamento (4.3, nova key) cria NOVA linha (rows append-only,
  `cancelledAt` marca a antiga) — `ALREADY_NOT_RETURNING` é derivado da existência de linha
  ativa (`cancelledAt IS NULL`) para `(tripId, studentId)` via findFirst pré-create.
- Roster (`GET /trips/:id/students`): status = check-in existe → `CHECKED_IN`; senão ausência
  ativa → `NOT_RETURNING`; senão `NOT_CHECKED_IN`. Resumo `{ boarded, total }`: `total` EXCLUI
  alunos com ausência ativa (ex.: "28/32" → "28/31") — a fonte da verdade do ajuste da 4.2.
- Aluno já CHECKED_IN registra ausência → **409 `ALREADY_CHECKED_IN`** (código novo) — o
  check-in do motorista presente tem autoridade sobre a ausência (decisão do Lucas, fecha o
  defer da 4.0). Mensagem ao aluno orienta falar com o motorista.
- `GET /api/v1/trips/active` passa a aceitar STUDENT (decisão do Lucas): para aluno retorna
  a viagem RETURN ativa na rota dele, `{ data: null }` se não houver; shape inalterado;
  description/roles atualizados no contrato.
- Toda query filtrada por `companyId` (TenantGuard); roles por handler preservados
  (`@Roles(['STUDENT'])` no POST); imports relativos com `.js` (nodenext).
- Ajustes de contrato por drift discipline no MESMO PR (409 `ALREADY_CHECKED_IN` no POST;
  roles/description do `GET /trips/active`), com `openapi.json` e
  `mobile/src/types/api.d.ts` regenerados e commitados.

**Never:**
- Zero mudança em `mobile/src/mocks/`, zero handlers MSW para os novos endpoints — tela
  desenvolvida contra a API local (`docker compose up` + `npm run start:dev`).
- Não tocar nos stubs `cancel-absence` (4.3) e `events` (4.2), no `api-client` (token/refresh),
  na fila offline (`notify_not_returning`/`cancel_absence` seguem sem wiring — offline do
  aluno fica para depois), nos guardas de papel de `_layout.tsx` e nas keys
  `['activeTrip']` / `['trip', tripId, 'students']`.
- Sem validação de tipo de viagem (RETURN vs OUTBOUND) no POST — o contrato da 4.0 não
  declara esse erro; a tela do aluno só oferece a viagem de retorno ativa.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | JWT STUDENT na rota, viagem ativa, `{ tripId }`, key nova | 201 com ausência persistida (`notifiedAt`, `cancellableUntil`), evento `boarding.not_returning` `{ tripId, studentId, notifiedAt }` emitido | N/A |
| Replay mesma key | Mesma key, mesmo payload | 201 com o registro ORIGINAL, sem duplicar linha, sem novo evento | N/A |
| Replay key com payload divergente | Mesma key, `tripId` diferente | — | 409 `IDEMPOTENCY_KEY_CONFLICT` |
| Aluno fora da rota | JWT STUDENT sem `RouteStudent` na rota da viagem | — | 403 `STUDENT_NOT_ON_TRIP` |
| Viagem não ativa | `trip.status != 'ACTIVE'` ou inexistente/outra company | — | 409 `TRIP_NOT_ACTIVE` |
| Ausência duplicada | Ausência ativa já existe para `(tripId, studentId)`, key nova | — | 409 `ALREADY_NOT_RETURNING` |
| Aluno já CHECKED_IN | Check-in existe para `(tripId, studentId)` | — | 409 `ALREADY_CHECKED_IN` (código novo; contrato ajustado neste PR) |
| Body inválido | `tripId` não-UUID / ausente | — | 400 `VALIDATION_ERROR` (EffectSchemaPipe) |
| Header ausente/longo | `X-Idempotency-Key` vazio ou >200 chars | — | 400 `MISSING_IDEMPOTENCY_KEY` / `INVALID_IDEMPOTENCY_KEY` (decorator) |
| `GET /trips/active` (STUDENT) | JWT STUDENT com rota | 200 `{ data: viagem RETURN ativa na rota }` ou `{ data: null }` | 401 · 403 (role) |
| Roster pós-ausência | Ausência ativa + leitura do roster | Status `NOT_RETURNING` do aluno; sem check-in dele; `total` exclui o aluno | N/A |

</frozen-after-approval>

## Code Map

**Backend — modelo a copiar: check-in (3.3a)**
- `api/src/domains/boarding/core/use-cases/check-in.use-case.ts` -- padrão do use case:
  `Effect.gen`, replay-first (linhas 54–70), `const now` único, `withEvents`, consts de
  módulo. Novo `register-not-returning.use-case.ts` espelha isso.
- `api/src/domains/boarding/core/ports/boarding-repository.port.ts` -- `Context.Tag` + Api
  interface; novo `AbsenceRepository` port (`findByIdempotencyKey`,
  `findActiveByTripAndStudent`, `findActiveByTrip`, `create`).
- `api/src/domains/boarding/shell/adapters/prisma-boarding.adapter.ts` -- adapter modelo:
  `Effect.tryPromise` + `orDie`, `toInfraError`, discriminador `{ created, record }`.
- `api/src/domains/boarding/core/errors/boarding.errors.ts` -- tagged errors com
  `code`/`httpStatus`; adicionar `StudentNotOnTripError` (403 `STUDENT_NOT_ON_TRIP`),
  `AbsenceAlreadyRegisteredError` (409 `ALREADY_NOT_RETURNING`) e
  `StudentAlreadyCheckedInError` (409 `ALREADY_CHECKED_IN`). Reusar `TripNotActiveError`,
  `IdempotencyKeyConflictError`.
- `api/src/domains/boarding/shell/http/boarding.controller.ts:122,179-184` -- stub
  `notReturning`: trocar throw 501 por wiring real (`@Body(new EffectSchemaPipe(...))`,
  `@IdempotencyKey()`, `studentId` de `req.user.userId` como no check-in :112-115). Não
  tocar em `cancelAbsence` (:249) nem `events` (:314).
- `api/src/domains/boarding/shell/http/dtos/not-returning.dto.ts` + `index.ts` -- DTOs já
  prontos da 4.0; documentar 409 `ALREADY_CHECKED_IN` na resposta de erro.
- `api/src/domains/boarding/shell/boarding.service.ts` + `boarding.module.ts:23-53` -- novo
  método no service (`EffectEventDispatcher.runAndDispatch`) + layer do adapter no
  `BOARDING_RUNTIME` (`Layer.mergeAll`).
- `api/prisma/schema.prisma:156-175` -- `BoardingRecord` é o modelo de referência; adicionar
  `BoardingAbsence` (`@@schema("boarding")`, `@@map("boarding_absences")`, unique
  `[companyId, idempotencyKey]`; SEM unique de ausência ativa — Postgres trata NULL como
  distinto, a checagem é aplicacional via findFirst). Migração: `npx prisma migrate dev` +
  `npx prisma generate`.
- `api/src/domains/trip/core/use-cases/get-trip-students.use-case.ts:9,48-82` -- derivar
  `NOT_RETURNING` no status map e excluir ausentes do `total`; estender
  `TripBoardingStatus`. Port: `api/src/domains/trip/core/ports/boarding-status.port.ts`
  (adicionar `findActiveAbsencesByTrip`) + adapter `prisma-boarding-status.adapter.ts`
  (leitura cross-schema de boarding já é precedente intencional).
- `api/src/domains/trip/shell/http/trip.controller.ts:96-114` -- `getActive`: branch por
  `req.user.role`; port `trip-repository.port.ts` ganha `findActiveReturnByStudent`
  (trip ACTIVE + type RETURN + rota do aluno via `RouteStudent`); novo use case pequeno no
  core. Atenção: enum de status é `ACTIVE | COMPLETED` (não "ENDED").
- `api/test/boarding.e2e-spec.ts:533-594` -- bloco 4.0 da matriz de roles: trocar 501→201 no
  STUDENT e manter 403/401; scaffolding (users, tokens, rota, `seedActiveTrip`) já existe.

**Mobile**
- `mobile/src/app/(student)/home.tsx` -- hoje só greeting + botão QR (45 linhas); recebe o
  botão, dialog de confirmação e estado. Padrões de render por union state:
  `mobile/src/app/(student)/qr-code.tsx:82-87` (`status === 'pending'`, nunca `isLoading`).
- `mobile/src/services/boarding.service.ts` -- já monta `X-Idempotency-Key` (:18-21);
  adicionar `notifyNotReturning(tripId, key)` com tipos de
  `components['schemas']['NotReturningRequestDto'/'NotReturningResponseDto']` (api.d.ts:582).
- `mobile/src/services/trip.service.ts:27` -- `getActiveTrip()` reusado para o aluno (OQ2a).
- `mobile/src/app/(driver)/scan.tsx:312` + `trip.tsx:213-231` -- padrões: `Crypto.randomUUID()`
  (expo-crypto) por tentativa (ref para retry), `useMutation` + `setQueryData` +
  `ApiClientError.code/status` para erros. Erros → mensagem pt-BR mapeada por `code`
  `ALREADY_NOT_RETURNING` vira estado registrado, não toast de erro; `ALREADY_CHECKED_IN`
  orienta falar com o motorista).
- `mobile/src/student-home.test.tsx` (NEW, fora de `src/app/`) -- modelo:
  `mobile/src/trip-screen.test.tsx` (mock de service, QueryClient fresco,
  `jest.mock('expo-router')`).

## Tasks & Acceptance

**Execution:**
- [x] `api/prisma/schema.prisma` + migração -- NEW `BoardingAbsence`; `npx prisma migrate dev`
  + `npx prisma generate`.
- [x] `api/src/domains/boarding/core/errors/boarding.errors.ts` -- tagged errors novos.
- [x] `api/src/domains/boarding/core/ports/absence-repository.port.ts` -- NEW port.
- [x] `api/src/domains/boarding/core/schemas/not-returning.schema.ts` -- NEW `Schema.Struct`
  `{ tripId: Schema.UUID }` (código de pipe: `VALIDATION_ERROR`).
- [x] `api/src/domains/boarding/core/use-cases/register-not-returning.use-case.ts` -- NEW
  (replay-first → trip ativa → aluno na rota → já CHECKED_IN → ausência ativa →
  create; `CANCELLABLE_WINDOW_MS`; evento `boarding.not_returning`).
- [x] `api/src/domains/boarding/shell/adapters/prisma-absence.adapter.ts` -- NEW adapter.
- [x] `api/src/domains/boarding/shell/boarding.module.ts` + `boarding.service.ts` +
  `boarding.controller.ts` -- wiring do endpoint real no stub da 4.0.
- [x] `api/src/domains/trip/core/ports/boarding-status.port.ts` +
  `shell/adapters/prisma-boarding-status.adapter.ts` +
  `core/use-cases/get-trip-students.use-case.ts` -- `NOT_RETURNING` no roster + `total`.
- [x] `api/src/domains/trip/` (port `trip-repository.port.ts`, use case, `trip.controller.ts`,
  `trip.service.ts`) -- `GET /trips/active` para STUDENT (viagem RETURN ativa na rota).
- [x] `api/openapi.json` + `mobile/src/types/api.d.ts` -- `npm run openapi:export` (api/) e
  `npm run openapi:types` (mobile/) após os ajustes de contrato; commit dos dois.
- [x] Testes unitários core: `register-not-returning.use-case.spec.ts` (NEW, matriz I/O),
  `get-trip-students.use-case.spec.ts` (UPDATE), spec do use case do active-trip do aluno
  (NEW), adapter spec (NEW, modelo `prisma-boarding.adapter.spec.ts`).
- [x] `api/test/boarding.e2e-spec.ts` -- UPDATE bloco 4.0 (501→201) + cenários da matriz
  (happy, replay, duplicada, já CHECKED_IN, fora da rota, viagem inativa, roster
  `NOT_RETURNING`).
- [x] `mobile/src/services/boarding.service.ts` + `mobile/src/app/(student)/home.tsx` --
  serviço + botão proeminente → dialog de confirmação (≤2 toques) → "Ausência registrada" +
  countdown por `cancellableUntil`; expirada, apresentada como consolidada; mensagens
  claras por código de erro; sem viagem de retorno ativa, botão desabilitado com dica.
- [x] `mobile/src/student-home.test.tsx` -- NEW (happy path, 2 toques, `ALREADY_NOT_RETURNING`
  → estado registrado, erros tipados, sem viagem → desabilitado).

**Acceptance Criteria:**
- Given aluno na rota com viagem ativa, when confirma "Não vou voltar" (2 toques), then 201
  persiste ausência e a tela mostra "Ausência registrada" com countdown decrescente até
  `cancellableUntil`, virando estado consolidado após expirar.
- Given ausência já ativa, when novo POST com key diferente, then 409 `ALREADY_NOT_RETURNING`
  e nenhuma segunda linha ativa.
- Given mesma key reenviada, then resposta original sem duplicar registro nem evento.
- Given erros tipados, when ocorrem, then mensagem clara no idioma e código corretos
  (`STUDENT_NOT_ON_TRIP` 403, `TRIP_NOT_ACTIVE` 409, validação 400).
- Given ausência ativa, when roster é lido, then aluno aparece `NOT_RETURNING` e o `total`
  do resumo o exclui; com check-in E ausência, `CHECKED_IN` prevalece.
- Given core do use case, when `npm test`, then suíte < 100ms sem infraestrutura.
- Given contrato alterado, when `openapi:export` 2x, then `git diff --exit-code -- openapi.json`
  vazio e `tsc --noEmit` do mobile sem erros novos.

## Implementation Notes

- **Branch `feat/4-1-registro-de-ausencia-nao-vou-voltar`** (a partir de `main` @ 8e1ce51),
  6 commits atômicos (modelo+migração; trip/roster/active; boarding core+shell; contrato;
  mobile; docs). Sem PR aberto — aguardando revisão/aprovação.
- **`cancellableUntil` também é coluna** (`boarding_absences.cancellableUntil`): o core
  calcula no create (mesma leitura de relógio do `notifiedAt`) e persiste — a 4.3 consulta
  o valor sem recalcular, e a resposta da API sai direto da linha.
- **Ordem real das regras no use case:** replay → trip ativa → aluno na rota → já
  CHECKED_IN → ausência ativa → create. O conflito com check-in vence a checagem de
  ausência ativa (testes fixam a ordem nos dois níveis).
- **Corrida de replay no adapter:** P2002 em `[companyId, idempotencyKey]` → re-leitura pela
  key com discriminador `{ created, record }` (mesmo padrão do check-in). `created: false`
  com payload divergente vira `IDEMPOTENCY_KEY_CONFLICT` no use case, sem evento duplicado.
- **Roster:** `findActiveAbsencesByTrip` entra no `Effect.all` (concurrency 3);
  `TripBoardingStatus` ganha `NOT_RETURNING`; invariante `boarded <= total` preservada
  (CHECKED_IN vence ausência e o aluno volta a contar).
- **Verificação executada (2026-09-07):** `npm run build` 0 erros; `npm test` 234/234 (suíte
  do core: 63ms); e2e boarding 40/40 + trip 32/32 (inclui branch STUDENT do `/trips/active`
  e 403 para ADMIN); `openapi:export` 2x com sha256 idêntico; `openapi:types` + `tsc
  --noEmit` mobile limpos; mobile `npm test` 124/124; lint sem arquivo da story na saída
  (baseline ~148 erros preexistentes); `git status --porcelain mobile/src/mocks/` vazio.
- **Falha e2e pré-existente (fora do escopo):** `route-assignment.e2e-spec.ts` espera login
  200 e a API responde 201 — provada presente no baseline 8e1ce51 via worktree. É a mesma
  suíte vermelha da baseline já registrada no action item `epic-3-retro-item-2`.
- `AbsenceRepository.findActiveByTrip` fica sem consumidor nesta story (superfície do port
  para 4.2/4.3). Smoke manual web (botão + roster refetch) não executado — coberto por e2e.

## Spec Change Log

## Review Triage Log

| # | Achado (camada) | Veredito | Evidência |
|---|-----------------|----------|-----------|
| 1 | BH: copy do app promete cancelamento ("Dá para cancelar…", "Cancelar disponível por m:ss") sem o botão, que só nasce na 4.3 | low | Real: `home.tsx` mostra countdown anunciando ação inexistente nesta fatia. Copy-only: dialog sem a frase de cancelamento + rótulo factual "Janela de cancelamento" (fica correto quando a 4.3 trouxer o botão). → patch |
| 2 | BH: botão "Meu QR Code" some quando a ausência está registrada — aluno que errou o toque fica sem QR para embarcar | medium | Real: o card de ausência substitui o bloco inteiro do QR em `home.tsx`. Aluno com registro indevido perde o artefato de embarque até o cache expirar (24h) — caminho de produto quebrado no cenário de erro do próprio fluxo. → patch (QR visível nos dois estados) |
| 3 | BH: replay de ausência CANCELADA (após 4.3) retorna 201 com a linha original → cliente mostra "Ausência registrada" para ausência desfeita | low | Inalcançável nesta fatia (`cancel-absence` é 501); o desfecho do replay de erro/cancelamento é decisão de contrato da 4.3 — mesmo tema de `epic-3-retro-item-3` e dos defers de ciclo de vida da 4.0. → defer |
| 4 | BH: POST com `tripId` OUTBOUND é aceito (roster da ida exclui o aluno do total) | false | Comportamento decidido na spec aprovada (Never: "sem validação de tipo de viagem — o contrato da 4.0 não declara esse erro; a tela só oferece a viagem de retorno ativa"). Cliente entregue nunca envia ida. Corrigir exigiria editar spec → rejeitado. |
| 5 | BH: contradição "Smoke manual web não executado" (Notes) vs Verification que lista o smoke | false | Verification é o plano pré-implementação; Implementation Notes é o registro de execução — mesmo padrão da triage #11 da 4.0. Sem contradição de fato. |
| 6 | BH: números divergentes (234/234 vs ~206+; ~148 vs ~147 lint) | false | Plano (estimativas) vs registro (execução real): `npm test` terminou em 234 testes e a baseline de lint medida foi 148. Mesmo padrão da 5. |
| 7 | BH: estado "Ausência registrada" some quando a viagem termina (query desabilitada sem tripId) | low | Comportamento real, mas consequência nula: viagem encerrada torna o card moot e o próximo retorno nasce limpo. Fix exige novo ramo de UI persistente pós-fim de viagem — complexidade sem benefício demonstrado. → rejeitado |
| 8 | BH: copy de `TRIP_NOT_ACTIVE` manda "Atualize e tente de novo" sem haver refresh na tela; código sem teste mobile | low | Real: mensagem promete ação indisponível e o mapeamento não tem caso de teste. Fix direto: ajustar a string + adicionar o caso no `student-home.test.tsx`. → patch |
| 9 | BH: `findActiveReturnByStudent` usa `findFirst` sem `orderBy` — viagem escolhida não-determinística com 2 retornos ativos | low | Alcançável só com anomalia operacional (2 motoristas com retorno ativo na mesma rota), mas o fix é 1 linha e o próprio e2e de trip precisa encerrar viagens pendentes para ser determinístico. → patch |
| 10 | BH: título de teste e2e obsoleto ("lógica na 4.1" num teste que É a lógica da 4.1) | low | Real e cosmético; correção direta. → patch |
| 11 | BH: comentário do fixture mobile diz "2 minutos à frente de notifiedAt" mas o valor é `now + 90s` | low | Real e cosmético; correção direta do comentário/fixture. → patch |
| 12 | BH: `AbsenceRepository.findActiveByTrip` sem consumidor (código especulativo) | false | Superfície do port explicitamente mandada pela Code Map da spec aprovada (para 4.2/4.3), com testes que provam o contrato do adapter. Nenhum defeito. |
| 13 | BH: drift de rastreabilidade — `ALREADY_CHECKED_IN` documentado no `@ApiResponse` do controller, não no DTO citado pela Code Map | false | O contrato entregue é o `openapi.json` regenerado e commitado (drift check verde); onde mora a anotação é detalhe de implementação. A correção pedida é editar a spec → rejeitado. |
| 14 | BH: sem e2e de conflito de idempotência entre alunos distintos e de isolamento de tenant no branch STUDENT do `/trips/active` | low | Cobertura existente prova os comportamentos (core unit para `studentId` divergente; filtro `companyId` uniforme e provado no adapter de ausências do mesmo PR). Os e2es extras são defesa-em-profundidade que adicionam superfície. → rejeitado |
| 15 | ECH: corrida endTrip × create — ausência persistida contra viagem recém-encerrada | low | Janela de milissegundos; consequência inerte (roster de viagem encerrada não é alcançado pela UI — sem viagem ativa a tela do motorista nem lista). Fix exigiria transação com re-check — complexidade sem dano demonstrado. → rejeitado |
| 16 | ECH: dialog dispensado com mutation em voo + reconfirmação ⇒ 2º POST com key nova (ausência dupla + evento duplo) | low | Real e alcançável em rede lenta (o fix é trava de UI: não resetar a key com mutation pendente e desabilitar o botão). → patch |
| 17 | ECH: cache escrito sob key possivelmente obsoleta (tripId do render vs variável da mutation) | low | Real: `onSuccess` usa `tripId` do closure; se a viagem mudar em voo, o estado se perde. Fix direto: escrever sob a variável recebida pela mutation. → patch |
| 18 | VG (gap pré-verificado): filtro `cancelledAt: null` do roster (`prisma-boarding-status.adapter.ts:65`) sem teste que observe linha cancelada — deletar o filtro mantém todas as suítes verdes | medium | Demonstrado pelo reviewer: nenhuma suíte produz ausência cancelada no caminho do roster; quando a 4.3 entregar cancelamento, aluno cancelado continuaria "NÃO VAI VOLTAR" com suíte verde. Disposição filed: patch (caso de linha cancelada no spec do adapter). → patch |
| 19 | VG (outro): MSW `boarding.handlers.ts:311` calcula `total` incluindo NOT_RETURNING — diverge da API real | low | Divergência real, mas o congelado proíbe tocar em `mobile/src/mocks/` nesta fatia (intenção aprovada pelo humano). → defer |
| 20 | VG (outro): mesmo `findFirst` sem `orderBy` do #9 (precedente `findActiveByDriver`) | low | Mesma causa raiz do #9 → agrupado no patch. |

## Design Notes

- **Sem unique de "ausência ativa" no Postgres:** unique composto com coluna anulada
  (`[tripId, studentId, cancelledAt]`) NÃO impediria duas linhas ativas — por padrão PG
  trata NULLs como distintos (NULLS DISTINCT) e o Prisma não expõe `NULLS NOT DISTINCT`.
  A regra "uma ausência ativa por (tripId, studentId)" é aplicacional (findFirst antes do
  create). A corrida residual (mesmo aluno, 2 dispositivos, keys diferentes, simultâneo)
  deixa 2 linhas ativas — benigno: roster mostra `NOT_RETURNING` e a próxima tentativa cai
  no 409. Idempotência da fila (mesma key) já serializa o caso real de retry.
- **Countdown do aluno:** estado por union type (`idle | registered | ...`), ticking local
  (setInterval 1s) derivado de `cancellableUntil` — nunca recalcular a janela no cliente.
  Sucesso da mutation grava `['studentAbsence', tripId]` via `setQueryData` (cache MMKV 24h
  cobre reload); reinstalação >24h recai no 409 `ALREADY_NOT_RETURNING`, mapeado para o
  estado "Ausência registrada" (sem countdown — a janela provavelmente expirou).
- **Evento sem consumidor:** `boarding.not_returning` é emitido e despachado via
  `EffectEventDispatcher`, mas não há listener até a 4.2 (SSE). Teste unitário do core
  assegura a emissão; e2e não abre stream nesta story.

## Verification

**Commands:**
- `cd api && npm run build` -- 0 erros
- `cd api && npx prisma migrate dev` -- migração aplicada sem erro (requer docker compose up)
- `cd api && npm test` -- unit verde, suíte do core < 100ms, sem regressão (~206+)
- `cd api && npm run test:e2e` -- boarding.e2e-spec verde (501→201 no bloco da 4.0)
- `cd api && npm run openapi:export` (2x) + `git diff --exit-code -- openapi.json` -- vazio
- `cd mobile && npm run openapi:types && npx tsc --noEmit` -- sem erros novos
- `cd mobile && npm test` -- suíte do home verde
- `cd api && npm run lint` -- nenhum arquivo da story na saída (baseline ~147 erros)
- `git status --porcelain mobile/src/mocks/` -- vazio

**Manual checks:**
- Smoke web: aluno logado → botão → confirmar → "Ausência registrada" + countdown; roster do
  motorista (refetch) mostra o aluno `NÃO VAI VOLTAR` e contagem ajustada.
