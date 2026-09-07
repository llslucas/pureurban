---
title: 'Rota real do motorista na tela de viagem (fecha a Story 3.1 e o Épico 3)'
type: 'feature'
created: '2026-09-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '1a79920dd9e769231625f306e692c7f8d8c7bc02'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `(driver)/trip.tsx` manda `PLACEHOLDER_ROUTE_ID = 'route-placeholder-id'` em
todo `POST /trips` — não é UUID (a API rejeita com 400) e, mesmo sendo, cairia em 403
`DRIVER_NOT_ASSIGNED`. **Iniciar viagem pela UI não funciona.** É a única pendência que
trava a Story 3.1 em `review` e, com ela, o fechamento do Épico 3.

**Approach:** A tela lê as rotas do motorista de `GET /api/v1/routes/mine` (endpoint do
Épico 2, já consumido por `(driver)/routes.tsx` via `routesService.getMyRoutes()`) e usa o
`id` real no `POST /trips`: uma rota → seleção automática; duas ou mais → seletor antes de
"Iniciar Viagem"; nenhuma → ação desabilitada com aviso. O backend não muda. Ao fim, a
Story 3.1 vai para `done` e o Épico 3 fecha.

## Boundaries & Constraints

**Always:**
- Reusar `routesService.getMyRoutes()` e a query key `['routes', 'mine']` (mesma entrada de
  cache de `(driver)/routes.tsx`).
- Distinguir carregando / erro (com retry) / lista vazia como `(driver)/routes.tsx` faz —
  nunca tratar erro como "sem rota".
- Manter o "Iniciar Retorno" que já funciona na sessão via `setQueryData` após encerrar a
  ida (`relatedTripId` = id da ida).

**Never:**
- Não tocar em nenhum arquivo de `api/` (core, shell, DTO, schema, migração, openapi.json)
  — exceto ajuste de comentário em `boarding-happy-path.e2e.spec.ts`.
- Não adicionar/alterar endpoint. Persistir "Iniciar Retorno" além do reload continua
  diferido (ver Open Questions).
- Não conectar `onlineManager` ao NetInfo; não criar store para a rota selecionada (estado
  local basta).

## I/O & Edge-Case Matrix

| Estado | Entrada | Comportamento esperado |
|--------|---------|------------------------|
| Uma rota | `/routes/mine` → `[rotaA]`, sem viagem ativa | "Iniciar Viagem" habilitado → `POST /trips` com `routeId = rotaA.id`, `OUTBOUND` |
| Múltiplas rotas | `/routes/mine` → `[rotaA, rotaB]` | Seletor visível; "Iniciar" só habilita após escolher; usa o `id` escolhido |
| Nenhuma rota | `/routes/mine` → `[]` | "Iniciar Viagem" desabilitado + "Peça ao administrador para vincular uma rota" |
| Rotas carregando | query `['routes','mine']` pending | Indicador de carregamento na área de iniciar |
| Erro ao carregar rotas | `/routes/mine` → 500 | Mensagem de erro + "Tentar novamente" (`refetch`); não mostra "sem rota" |
| Viagem já ativa | `/trips/active` → ACTIVE | Escanear / Alunos / Encerrar inalterados; `/routes/mine` não é chamado |
| Iniciar retorno (sessão) | ida COMPLETED no cache | `POST /trips` `RETURN`, `relatedTripId` = id da ida, mesma rota |
| DRIVER_NOT_ASSIGNED | `POST /trips` → 403 | `Alert` com a mensagem da API; tela fica no estado de iniciar |

## Decisions

- **"Iniciar Retorno" além do reload (AC #3 da Story 3.1) — diferido (Lucas, 2026-09-06).**
  A AC #3 é atendida *na sessão*: encerrar a ida → "Iniciar Retorno" (via `setQueryData`,
  sem reload). A persistência do botão entre reloads do app **não** entra neste spec —
  exige decisão de contrato de API (novo endpoint, ou `/trips/active` devolver a ida
  recém-encerrada num TTL) e fica registrada no `deferred-work.md`. Nenhum arquivo de
  `api/` muda por causa disso. O Épico 3 fecha com esse item explicitamente diferido.

</frozen-after-approval>

## Code Map

- `mobile/src/app/(driver)/trip.tsx` -- **alvo.** `PLACEHOLDER_ROUTE_ID:10` sai;
  `startMutation:58` e `handleStartOutbound:79` passam a receber o `routeId` resolvido; o
  estado 1 (`!activeTrip || COMPLETED`, linha 107) ganha a lógica de rota. Estado ACTIVE
  (linha 158) inalterado.
- `mobile/src/services/routes.service.ts` -- `getMyRoutes(): Promise<AssignedRoute[]>`;
  `AssignedRoute` = `{ id, name, description, originCity, destinationCity, ... }`. Reusar.
- `mobile/src/app/(driver)/routes.tsx` -- referência dos padrões loading / erro+retry /
  empty. Não modificar.
- `mobile/src/services/trip.service.ts` -- `startTrip(routeId, type, relatedTripId?)` já
  aceita `routeId`. Sem mudança.
- `mobile/src/mocks/handlers/routes.handlers.ts` -- `/routes/mine`: 1 rota por padrão,
  `[MOCK_ROUTE, MOCK_SECOND_ROUTE]` para `aluno-multirota@pureurban.com`, `[]` para
  `aluno-sem-rota@`, 500 para `aluno-erro@`. `MOCK_ROUTE.id` = `880e8400-…440200`.
- `mobile/src/mocks/handlers/trip.handlers.ts` -- POST `/trips:139` ecoa `routeId`; comentário
  `:154-156` sobre o placeholder fica obsoleto. `MOCK_ROUTE_ID:27` já bate com o de routes.
- `mobile/src/components/student-card.test.tsx` -- padrão de render (jest-expo +
  `@testing-library/react-native`). Nenhum teste ainda monta `QueryClientProvider`.
- `mobile/src/lib/roster-stale-banner.test.ts:14-16` -- documenta por que testes não vivem
  sob `src/app/` (o Expo Router empacota tudo lá como rota). O teste de render da tela vai
  para `mobile/src/trip-screen.test.tsx`, importando `TripScreen` de `@/app/(driver)/trip`.
- `api/src/domains/trip/core/use-cases/start-trip.use-case.ts:36` -- confirma que o backend
  valida `isDriverAssignedToRoute`. Contexto; não modificar.
- `api/tests/e2e/boarding-happy-path.e2e.spec.ts:38-42` -- comentário "a tela ainda usa
  routeId placeholder" fica desatualizado.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/app/(driver)/trip.tsx` -- `PLACEHOLDER_ROUTE_ID` removido; `useQuery(['routes','mine'])`
  via `routesService.getMyRoutes`, `enabled: !isLoadingTrip && (!activeTrip || (activeTrip.status
  === 'COMPLETED' && activeTrip.type === 'RETURN'))` (busca só quando `StartOutboundSection`
  vai renderizar; nunca em viagem ativa nem no fluxo "Iniciar Retorno"); estado local
  `selectedRouteId` descartado se sair da lista corrente; auto-seleção derivada quando
  `routes.length === 1`; `SegmentedButtons` quando `> 1`; "Iniciar Viagem" desabilitado sem
  rota resolvida; branches loading/erro+retry/empty espelhando `routes.tsx` (o ramo empty só
  renderiza depois da query rodar); `handleStartOutbound`/`handleStartReturn` passam o
  `routeId` resolvido (retorno usa `activeTrip.routeId`). Comentários novos em inglês.
- [x] `mobile/src/mocks/handlers/trip.handlers.ts` -- comentário obsoleto do POST `/trips`
  sobre o `PLACEHOLDER_ROUTE_ID` reescrito (em inglês, sem cláusula de ciclo de vida da story).
- [x] `mobile/src/trip-screen.test.tsx` -- **novo** (fora de `src/app/`). Render com
  `QueryClientProvider` (`retryDelay: 0` — as telas fixam `retry: 2` na query; `gcTime`
  ajustado) + mocks jest de `trip.service`/`routes.service`; client limpo no `afterEach`.
  Casos: loading de rotas, uma rota (start chama `startTrip` com o id real),
  múltiplas (seletor + start travado até escolher), sem rota (desabilitado + aviso), erro de
  rotas (retry, não "sem rota"), `DRIVER_NOT_ASSIGNED` (alerta), viagem ativa
  (Escanear/Encerrar, `/routes/mine` não chamado), encerrar ida→"Iniciar Retorno", encerrar
  RETURN→volta ao seletor de rota (não ao falso "sem rota").
- [x] `api/tests/e2e/boarding-happy-path.e2e.spec.ts` -- **apenas o comentário** (~linhas
  38-42) ajustado para explicar só o *porquê* de semear via API (determinismo,
  independência do seed de rotas); semeadura por API mantida.
- [x] `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md` -- `Status`
  → `done`; nota de conclusão + seção "Decisão de produto" marcada como RESOLVIDA; nota na
  AC #3 apontando o carve-out de persistência entre reloads.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-1-…` → `done`;
  `epic-3` → `done`; `last_updated` e comentários dos blocos do Épico 3 atualizados.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- seção 2026-09-06 da 3.1:
  `PLACEHOLDER_ROUTE_ID` marcado resolvido; dois resíduos abertos em entradas próprias e
  grepáveis — (1) persistência de "Iniciar Retorno" entre reloads (decisão de contrato de
  API), (2) query `['activeTrip']` não distingue `isError` de "sem viagem" (erro de rede
  em `/trips/active` deixa o motorista disparar viagem duplicada → 409).

**Acceptance Criteria:**
- Given motorista com uma rota e sem viagem ativa, when toca "Iniciar Viagem", then `POST
  /api/v1/trips` sai com o UUID real dessa rota e a tela passa a exibir a viagem ativa
  (verificado no alvo web com mocks).
- Given motorista sem rota, when abre a tela, then "Iniciar Viagem" fica desabilitado com
  orientação para procurar o administrador.
- Given motorista com duas+ rotas, when não escolheu, then "Iniciar Viagem" fica
  desabilitado; após escolher, o `POST /trips` usa o `id` escolhido.
- Given viagem ativa, when a tela carrega, then Escanear/Alunos/Encerrar são idênticos ao
  atual e `/routes/mine` não é chamado.
- Given a Story 3.1 e o Épico 3, when este spec conclui e é verificado, then
  `sprint-status.yaml` tem `3-1-… : done` e `epic-3: done`.

## Implementation Notes

## Spec Change Log

- **2026-09-06 — review loop 1, patch-only (decisão do Lucas).** O review encontrou 4 itens
  com raiz no spec (test em `src/app/`, passos manuais inexecutáveis, `SegmentedButtons`,
  divergência de cópia) que a rota padrão trataria como `bad_spec` + loopback. Lucas optou
  por **patch-only, sem re-derivar**: a implementação atual fica, os achados viram patches
  no lugar. Amendas neste spec, sem tocar `<frozen-after-approval>`:
  - Code Map / Tasks: o teste de render sai de `mobile/src/app/(driver)/trip.test.tsx` para
    `mobile/src/trip-screen.test.tsx` — o Expo Router empacota todo arquivo sob `src/app/`
    como rota (ver `src/lib/roster-stale-banner.test.ts:14-16`).
  - Design Notes: `enabled` da query de rotas passa a cobrir a viagem COMPLETED RETURN.
  - Verification: passos manuais reescritos para só o que `motorista@pureurban.com`
    demonstra; multi-rota / sem-rota / erro ficam cobertos pelo teste de render (Lucas
    escolheu "confiar nos testes automatizados", sem novas sentinelas de mock).
  - `SegmentedButtons` mantido (Lucas não trocou o controle).

## Review Triage Log

Loop 1 — Blind Hunter + Edge Case Hunter + Verification Gap. Verification Gap: nenhum gap
de regressão / adoção / verificação quebrada (a resolução de rota está coberta pelos 8
casos). Rota de triagem geral: **patch-only por decisão do Lucas** (a rota padrão do
workflow seria `bad_spec` + loopback para A/C/D).

- **A — `trip.test.tsx` sob `src/app/`** (blind-hunter, verification-gap). `patch`. Confirmado:
  o `require.context` do Expo Router 55 casa `./(driver)/trip.test.tsx` (só `+api`/`+html`/
  `+middleware`/`+native-intent` são excluídos) e `getFileMeta` dá `specificity: 0` porque
  `test` não é plataforma — vira rota navegável `/(driver)/trip.test`, entra no `/_sitemap`
  e nos tipos de `typedRoutes`, e o `jest.mock` de módulo estoura se a rota renderizar. A
  regra está documentada em `src/lib/roster-stale-banner.test.ts:14-16`. Fix: mover para
  `mobile/src/trip-screen.test.tsx`, importar via `@/app/(driver)/trip`.
- **B — viagem COMPLETED RETURN cai no falso "sem rota"** (edge-case, blind-hunter). `patch`,
  `medium`. Confirmado: `endMutation` grava a viagem COMPLETED no cache; para uma RETURN
  concluída `isReturn` é falso (checa `type === 'OUTBOUND'`), então `StartOutboundSection`
  renderiza — mas `enabled: !isLoadingTrip && !activeTrip` mantém a query desligada enquanto
  a viagem COMPLETED está no cache, `routes` fica `undefined`, nenhum estado de
  loading/erro/fetch está ativo e o componente cai no ramo `noRoutes` mostrando "Peça ao
  administrador…" por ~10s (`staleTime` do `['activeTrip']`) até o refetch devolver `null`.
  Fora da I/O Matrix. Fix: `enabled` cobre `activeTrip.status === 'COMPLETED' && type ===
  'RETURN'`; o ramo `noRoutes` só renderiza depois da query rodar.
- **C — passos manuais de Verification inexecutáveis** (blind-hunter). `patch` (edita este
  spec, autorizado pelo Lucas). Confirmado: `aluno-multirota@` / `aluno-sem-rota@` /
  `aluno-erro@` são `role: 'STUDENT'` em `auth.handlers.ts` — roteiam para `(student)/`,
  nunca chegam a `(driver)/trip.tsx`. `routes.handlers.ts` chaveia `/routes/mine` nesses
  e-mails, mas ninguém loga como motorista com eles. Fix: seção Verification reescrita
  (acima) — sem novas sentinelas, por decisão do Lucas.
- **D — `SegmentedButtons` para escolha de rota** (edge-case, blind-hunter). `low`,
  **rejeitado**. Trunca com nomes longos / 3+ rotas e diverge da lista vertical de
  `routes.tsx`, mas o caso comum (2 rotas) funciona, 3+ rotas por motorista é raro e trocar
  o controle é mais que correção direta. Lucas manteve `SegmentedButtons`.
- **E — divergência de cópia trip.tsx × routes.tsx** (blind-hunter). `low`, **rejeitado**.
  "Não foi possível carregar suas rotas." × "Não conseguimos carregar suas rotas." etc. —
  inconsistência cosmética; os textos de `routes.tsx` também não são padronizados entre si.
- **F — comentários novos em português** (blind-hunter). `patch`, `low`. `CLAUDE.md` pede
  comentários de código em inglês. Fix: traduzir os comentários novos de `trip.tsx`,
  `trip-screen.test.tsx` e `trip.handlers.ts`.
- **G — `selectedRouteId` não revalidado contra a lista** (edge-case, blind-hunter,
  verification-gap). `patch`, `low` (probabilidade real baixa: rota do motorista removida
  no meio da sessão com ele na tela de iniciar). Fix: `resolvedRouteId` volta a `null` se o
  `selectedRouteId` não estiver mais em `routes`.
- **H — `QueryClient` vaza timers no teste** (verification-gap). `patch`, `low`. Jest
  reclama "did not exit"; os testes existentes chamam `client.clear()` no cleanup. Fix:
  limpar/desmontar o client em `afterEach`.
- **I — story/épico em `done` antes do review** (blind-hunter). Sem ação: artefato de o
  subagente de implementação ter rodado as tasks de fechamento junto com o código. O
  workflow reconcilia o status ao fim (step-05).
- **J — AC #3 parcial, lista de ACs da story não anotada** (blind-hunter). `patch`, `low`.
  Fix: nota na AC #3 da story apontando o carve-out de reload (já em Decisions +
  `deferred-work.md`).
- **K — `deferred-work.md` esconde item aberto dentro de entrada "RESOLVIDO"** (blind-hunter).
  `patch`, `low`→`medium` (o resíduo `['activeTrip']` não distingue `isError` de "sem
  viagem" é bug real: erro de rede em `/trips/active` renderiza "Iniciar Viagem" e o
  motorista pode disparar uma viagem que o backend barra com 409). Fix: separar os dois
  resíduos abertos em entradas próprias, grepáveis.
- **L — comentário de `api/` acopla ao ciclo de vida da story** (blind-hunter). `patch`,
  `low`. Fix: comentar só o *porquê* de semear via API (determinismo), sem "Story 3.1
  fechada".

## Design Notes

- A query de rotas fica `enabled: !isLoadingTrip && (!activeTrip || (activeTrip.status ===
  'COMPLETED' && activeTrip.type === 'RETURN'))`: busca `/routes/mine` só quando o
  `StartOutboundSection` de fato vai renderizar (sem viagem, ou logo após encerrar uma
  RETURN). Em viagem ativa e no fluxo "Iniciar Retorno" (OUTBOUND concluída) a rota vem de
  `activeTrip.routeId` e a chamada seria morta — preserva a contagem de toques da NFR19.
- Auto-seleção de rota única: derivar (`routes?.length === 1 ? routes[0].id : selectedRouteId`)
  no render em vez de `useEffect`, para poupar um render. O `selectedRouteId` é descartado
  se não estiver mais na lista corrente de rotas (evita `POST /trips` com id órfão → 403).

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: verde, incluindo `src/trip-screen.test.tsx`.
- `cd mobile && npm run lint` -- expected: sem novos erros/warnings.
- `cd mobile && npx tsc --noEmit` -- expected: 0 erros.

**Manual (alvo web, `cd mobile && EXPO_PUBLIC_USE_MOCKS=1 npm run web`):**
- Login `motorista@pureurban.com` (uma rota vinculada) → "Iniciar Viagem" habilitado →
  toca → card ATIVO; no Network o `POST /trips` levou `routeId: "880e8400-…440200"` (UUID,
  não `route-placeholder-id`).
- Encerrar a ida → "Iniciar Retorno" → viagem `RETURN` ATIVA com `relatedTripId` = id da ida.

Os estados multi-rota (seletor), sem-rota (desabilitado + aviso) e erro de carga (retry,
nunca "sem rota") não são alcançáveis no alvo web hoje: as sentinelas `aluno-multirota@` /
`aluno-sem-rota@` / `aluno-erro@` de `routes.handlers.ts` logam como `STUDENT` e não chegam
a `(driver)/trip.tsx`. Ficam cobertos por `src/trip-screen.test.tsx` (montagem real da tela
com `QueryClientProvider`), por decisão do Lucas de não adicionar sentinelas de motorista.
