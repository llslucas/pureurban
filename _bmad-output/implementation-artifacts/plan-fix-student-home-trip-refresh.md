---
title: 'Fix: home do aluno não reflete o estado do servidor (viagem de retorno e embarque)'
type: 'bugfix'
ticket: ''
created: '2026-09-26'
status: 'in-review'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
baseline_revision: '7c82ed6db45f2faf94243228ffb494af1e84443c'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-registro-de-ausencia-nao-vou-voltar.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Na revisão em emulador de 2026-09-26, com o app aberto a home do aluno
(`(student)/home.tsx`) nunca descobre a viagem de retorno ativa: `activeTripOptions` não tem
polling e o `focusManager` do TanStack não está ligado ao `AppState`, então "Não vou voltar"
fica desabilitado até um cold start. Além disso, o card "Ausência registrada" vive só no cache
local (24h, sem GET) e continua na tela depois que o motorista faz o check-in do aluno, embora
o servidor já o trate como embarcado.

**Approach:** (1) Ligar o `focusManager` ao `AppState` no app inteiro e fazer a home do aluno
consultar periodicamente a viagem ativa e o estado do aluno. (2) Novo endpoint
`GET /api/v1/boarding/status` (STUDENT), no mesmo formato do `GET /boarding/reminder`, que
passa a ser a fonte da verdade do estado do aluno na viagem de retorno ativa e substitui o
cache local `['studentAbsence', …]` (decisão do Lucas). Um branch
(`fix/student-home-trip-refresh`) com commits atômicos (decisão do Lucas).

## Boundaries & Constraints

**Always:**
- Contrato: 200 `{ data: { tripId, status: 'CHECKED_IN' | 'NOT_RETURNING' | 'NOT_CHECKED_IN',
  absence: { id, notifiedAt, cancellableUntil } | null } | null, meta }`. `data: null` quando
  não há viagem de retorno ativa (resolvida ANTES do boarding, como no reminder). 401; 403 para
  quem não é STUDENT. `studentId` vem do JWT. `CHECKED_IN` prevalece sobre ausência ativa
  (mesma regra do roster).
- Core puro em Effect (`noEvents`), sem ports novos: reusa `TripAccess`, `BoardingRepository` e
  `AbsenceRepository`. Toda query filtrada por `companyId`. Imports relativos com `.js`.
- `openapi.json` e `mobile/src/types/api.d.ts` regenerados e commitados no mesmo PR.
- Mobile: as mutations continuam escrevendo o resultado direto no cache da query de status
  (resposta imediata); nos desfechos de corrida (`ALREADY_NOT_RETURNING`,
  `CANCELLATION_PERIOD_EXPIRED`, `ABSENCE_NOT_FOUND`) a tela invalida e usa o que o servidor
  devolver. O countdown continua vindo só de `cancellableUntil`.
- `CHECKED_IN`: sem card de ausência e sem "Não vou voltar". Mostra um card "Embarque
  confirmado", sem ações.
- Polling só na home do aluno (override no `useQuery`, não na factory que o motorista também
  usa), pausado em background pelo `focusManager`.

**Never:**
- Não mexer nos POSTs de ausência/cancelamento, no stream SSE (restrito a DRIVER), na fila
  offline nem nas keys `['activeTrip']` / `['trip', tripId, 'students']`.
- Não ligar o `onlineManager` ao NetInfo (é outro defer).
- Não corrigir os outros achados da revisão (fallback de GPS, confirmação de encerrar, UUID no
  card, erros de `tsc`/lint).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sem viagem de retorno | STUDENT, nenhum retorno ativo na rota | 200 `{ data: null }` | N/A |
| Pendente | Retorno ativo, sem check-in nem ausência | `NOT_CHECKED_IN`, `absence: null` | N/A |
| Ausente | Ausência ativa | `NOT_RETURNING` + `absence` com a janela do servidor | N/A |
| Embarcado | Check-in existe (com ou sem ausência ativa) | `CHECKED_IN`, `absence: null` | N/A |
| Ausência cancelada | Só linha com `cancelledAt` | `NOT_CHECKED_IN` | N/A |
| Viagem encerrada entre resolver e ler | Trip deixa de estar ACTIVE | `data: null` (revalidação no core) | N/A |
| Papel errado / sem token | DRIVER/ADMIN · sem JWT | — | 403 · 401 |
| Home aberta, motorista inicia o retorno | App em primeiro plano | "Não vou voltar" habilitado em ≤ 1 intervalo de polling, sem remount | Erro de GET mantém a tela; retenta no próximo ciclo |
| Home aberta, motorista faz o check-in do aluno ausente | Card "Ausência registrada" visível | Card some e aparece "Embarque confirmado" | N/A |
| App volta do background | `AppState` → `active` | Queries stale refazem o fetch (refetch on focus) | N/A |

</frozen-after-approval>

## Code Map

**API (modelo: o slice do reminder)**
- `api/src/domains/boarding/core/use-cases/get-pending-reminder.use-case.ts` -- modelo do use
  case novo `get-student-boarding-status.use-case.ts`: `findActiveReturnTripById`
  (revalidação) → `findCheckInByTripAndStudent` → `findActiveByTripAndStudent`; `noEvents`.
  Spec modelo: `get-pending-reminder.use-case.spec.ts`.
- `api/src/domains/boarding/shell/boarding.service.ts:108-119` -- `getPendingReminder` é o
  modelo do novo `getStudentStatus` (Date → ISO). Adicionar o use case ao import; o
  `BoardingRuntimeContext` já cobre os ports.
- `api/src/domains/boarding/shell/http/boarding.controller.ts:274-340` -- handler `reminder`:
  copiar `@Roles(['STUDENT'])`, o envelope nullable no `@ApiResponse` e a resolução via
  `tripService.getActiveStudentTrip`. Novo `@Get('status')`, declarado antes do `@Sse('events')`.
- `api/src/domains/boarding/shell/http/dtos/pending-reminder.dto.ts` + `index.ts` -- modelo do
  novo `student-boarding-status.dto.ts` (DTO de classe, para gerar um tipo correto no mobile).
- `api/test/boarding/checkin-reminder.e2e-spec.ts` -- modelo de scaffolding do e2e (seed de
  trip de retorno, tokens); `api/test/boarding/roles-matrix.e2e-spec.ts` -- adicionar a linha
  da rota nova.

**Mobile**
- `mobile/src/app/_layout.tsx` -- root com `PersistQueryClientProvider`; é aqui que o
  `focusManager` é ligado ao `AppState` (via módulo novo `mobile/src/lib/app-focus.ts`, com
  `setupAppFocus()` testável e que retorna o unsubscribe; no web o default do TanStack já
  funciona, então ignorar `Platform.OS === 'web'`).
- `mobile/src/lib/trip-queries.ts` -- adicionar `studentBoardingStatusKey(tripId)` +
  `studentBoardingStatusOptions(tripId)` (`enabled: Boolean(tripId)`, retry sem 4xx, como em
  `tripStudentsOptions`). `activeTripOptions` fica igual.
- `mobile/src/services/boarding.service.ts` -- `getMyStatus()` + tipo
  `StudentBoardingStatusResponse` de `components['schemas']`.
- `mobile/src/app/(student)/home.tsx` -- trocar a query `['studentAbsence', …]` (`queryFn: () =>
  null`) pela query de status; `registered` = `status === 'NOT_RETURNING'`; `expiryMs` vem de
  `status.absence`. Mutations: `setQueryData` com o status derivado; `removeQueries` e os
  `setQueryData` de corrida viram `invalidateQueries`. Polling `refetchInterval: 15_000` nas
  queries de viagem ativa, status e reminder. Corrigir o comentário "No polling" do reminder.
- `mobile/src/student-home.test.tsx` -- mock de service de `boardingService`: adicionar
  `getMyStatus`; os casos atuais que semeiam `['studentAbsence', …]` passam a semear/mockar o
  status. Modelo de estrutura: `mobile/src/trip-screen.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `api/src/domains/boarding/core/use-cases/get-student-boarding-status.use-case.ts` + `.spec.ts` -- NEW, TDD pela matriz de I/O -- fonte da verdade do estado
- [x] `api/src/domains/boarding/shell/http/dtos/student-boarding-status.dto.ts` + `index.ts` -- NEW DTO -- contrato tipado
- [x] `api/src/domains/boarding/shell/boarding.service.ts` + `boarding.controller.ts` -- `GET /boarding/status` -- wiring
- [x] `api/test/boarding/student-status.e2e-spec.ts` (NEW) + `roles-matrix.e2e-spec.ts` -- cenários da matriz contra o banco real -- contrato verificado
- [x] `api/openapi.json` + `mobile/src/types/api.d.ts` -- `npm run openapi:export` / `npm run openapi:types` -- drift discipline
- [x] `mobile/src/lib/app-focus.ts` + `app-focus.test.ts` (NEW) + `_layout.tsx` -- `focusManager` ↔ `AppState` -- refetch on focus
- [x] `mobile/src/lib/trip-queries.ts` + `mobile/src/services/boarding.service.ts` -- query/service de status
- [x] `mobile/src/app/(student)/home.tsx` + `mobile/src/student-home.test.tsx` -- TDD: polling descobre a viagem sem remount, status do servidor dirige o card, `CHECKED_IN` → "Embarque confirmado", testes existentes adaptados

**Acceptance Criteria:**
- Given a home aberta sem viagem, when o GET de viagem ativa passa a devolver o retorno, then "Não vou voltar" fica habilitado sem remount (teste com fake timers).
- Given "Ausência registrada" visível, when o GET de status passa a devolver `CHECKED_IN`, then o card some e "Embarque confirmado" aparece.
- Given uma reinstalação sem cache e uma ausência ativa no servidor, when a home abre, then o card aparece com o countdown do servidor (sem precisar do 409).
- Given os dois emuladores (motorista17/aluno17, API :3001) com o retorno `d5e1e932` ativo, when o motorista escaneia o aluno com o app do aluno aberto, then a home do aluno converge sem reiniciar.

## Design Notes

A ausência deixa de ter cache "sem GET": a query de status é uma query comum persistida pelo
MMKV, com o servidor como autoridade. As mutations fazem só o otimismo do desfecho conhecido,
por exemplo:

```ts
queryClient.setQueryData(studentBoardingStatusKey(tripId), {
  tripId, status: 'NOT_RETURNING',
  absence: { id: a.id, notifiedAt: a.notifiedAt, cancellableUntil: a.cancellableUntil },
})
```

15s de polling segue a ordem de grandeza do `activeTrackingTripOptions` (10s) e fica em
primeiro plano só por causa do `focusManager`.

## Verification

**Commands:**
- `cd api && npx vitest run src/domains/boarding` -- expected: verde
- `cd api && npx vitest run --config vitest.config.e2e.ts test/boarding` -- expected: verde (Postgres via docker)
- `cd api && npm run openapi:export && git diff --exit-code -- openapi.json` (2ª execução) -- expected: sem diff
- `cd mobile && npm test && npm run lint` -- expected: verde; `npx tsc --noEmit` sem erros além dos 3 já conhecidos

**Manual checks:**
- Emuladores: login do aluno17 com o app aberto enquanto o retorno está ativo → botão habilitado; registrar ausência; motorista17 escaneia o QR → a home do aluno mostra "Embarque confirmado" em ≤ ~15s.

## Implementation Notes

- **Branch `fix/student-home-trip-refresh`**, 7 commits atômicos: use case core; endpoint
  (DTO+service+controller); e2e; contrato; `app-focus`; query/service de status; home + testes.
- **`ALREADY_CHECKED_IN` também invalida o status** (além dos 3 códigos de corrida do plano):
  é o mesmo tipo de desfecho "estado local atrás do servidor" e leva direto ao card
  "Embarque confirmado" em vez de esperar o próximo ciclo. A mensagem pt-BR continua.
- **`cancelQueries` antes do `setQueryData`** nas duas mutations: um GET de polling iniciado
  antes do POST podia chegar depois e sobrescrever o desfecho conhecido com o estado velho.
- **Guarda `status.tripId === tripId`** na home: status de outra viagem (troca de viagem em voo)
  é ignorado até a query da viagem certa responder.
- **`trip-screen.test.tsx` passou a mockar `boarding.service`**: `trip-queries` agora importa o
  serviço (factory do status), o que arrastava `api-client` → MMKV nativo para esse teste.
- **Verificação executada (2026-09-26):** `npx vitest run src/domains/boarding` 11 files/113
  testes; `npm test` api 340/340; e2e `test/boarding` 7 files/79 testes (Postgres docker);
  `nest build` limpo; `openapi:export` 2x com arquivo idêntico; mobile `npm test` 364/364,
  `npm run lint` sem erros, `npx tsc --noEmit` só com os 3 erros já conhecidos (scan.tsx,
  use-trip-gps-capture.test, tracking-stream.service.test).
- **Não executado:** o check manual nos emuladores (motorista17/aluno17, API :3001) — o 4º
  critério de aceite fica pendente de verificação humana.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-09-26) — high 0 · medium 2 · low 13 · false 3 · maybe-false 0

| # | Lens | Finding | Verdict | Route | Evidence / action |
|---|------|---------|---------|-------|-------------------|
| 1 | BH | Botão habilitado antes do status carregar → POST que só pode dar 409 | low | reject | Os 409 (`ALREADY_*`) já convergem via invalidação + mensagem; janela de ~1 request. Fix exigiria novo estado de gating. |
| 2 | BH, ECH | Dialog aberto não fecha quando o polling vira CHECKED_IN/NOT_RETURNING | medium | patch | `dialogVisible` só muda por mutation/dismiss (home.tsx:361); confirmar gera 409 com o aluno já embarcado. Fechar o dialog quando `checkedIn \|\| registered`. |
| 3 | BH | Cache key (tripId do cliente) vs payload (trip do servidor) | low | reject | O guard `tripId === tripId` já impede exibição errada; divergência dura até o próximo poll de activeTrip. |
| 4 | BH | Polling continua com a home montada atrás de outra rota | low | reject | Custo de 3 GETs/15s enquanto QR/track-bus está aberto; sem efeito visível ao usuário. |
| 5 | BH | 3 requests por ciclo + lookups repetidos | low | reject | Carga compatível com o tracking (10s); otimização não pedida. |
| 6 | BH | e2e sem janela expirada/cross-tenant/200 no roles matrix | low | reject | `findActiveByTripAndStudent` filtra só `cancelledAt` (port); tenant coberto pelos adapters existentes; 200 coberto em student-status.e2e. |
| 7 | BH | Teste "check-in wins" redundante | false | reject | O teste anterior (spec:141-155) já afirma `absence not.toHaveBeenCalled`, travando a precedência. |
| 8 | BH | Comentários novos/editados em português (CLAUDE.md exige inglês) | low | patch | Confirmado no diff de home.tsx (ex.: "Cancelar reabre a pendência..."). Tradução direta. |
| 9 | BH | DTO: nome genérico, sem `format: date-time`, root sem `type` | low | reject | Mesmo padrão do `PendingReminderResponseDto` existente; sem conflito de nome hoje. |
| 10 | BH | Chaves `['studentAbsence']` órfãs no MMKV | low | reject | Expiram em 24h (`maxAge`), nada as lê. |
| 11 | BH | `nowMs` velho renderiza countdown de janela expirada | low | reject | Dura até o primeiro tick (1s) e corrige sozinho. |
| 12 | BH | Plan Change Log/Triage Log vazios | false | reject | Change Log é só para loopbacks; o Triage Log é escrito agora, nesta revisão. |
| 13 | BH | Snackbar de ALREADY_CHECKED_IN sem teste | false | reject | Coberto em student-home.test.tsx:291. Parte do race de `cancelQueries` → #15. |
| 14 | VG | Wiring de `setupAppFocus` no `_layout.tsx` sem teste | low | defer | Sem harness de render do RootLayout; checagem em emulador cobre. |
| 15 | VG, BH | Guard `cancelQueries` contra GET em voo sem teste | medium | patch | Nenhum mock com promise pendente; remover o `await` não quebra nada. Adicionar teste com GET diferido (notify e cancel). |
| 16 | VG | Guard `serverStatus.tripId === tripId` sem teste | low | patch | Todos os fixtures usam RETURN_TRIP.id. Adicionar caso de trip divergente. |
| 17 | VG | Polling do reminder sem teste | low | patch | Remover `refetchInterval` do reminder não quebra nada. Adicionar caso com fake timers. |
| 18 | ECH | onError de corrida depende do refetch ter sucesso (ALREADY_NOT_RETURNING, ABSENCE_NOT_FOUND, CANCELLATION_PERIOD_EXPIRED) | low | patch | Com o refetch falhando, a tela fica no estado velho (sem card ou com Cancelar). Restaurar a escrita imediata do desfecho conhecido antes de invalidar (inclui ALREADY_CHECKED_IN → CHECKED_IN). |
