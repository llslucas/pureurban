---
title: 'Story 6.13 — Redesign: Minhas Rotas e Painel Admin'
type: 'feature'
ticket: ''
created: '2026-09-27'
status: 'done'
baseline_revision: '55ea9af3296b9dbff7e8e48eb6166933bd35c5b5'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
warnings: []
deferred:
  - summary: >-
      Nenhum teste fixa que os layouts de grupo (admin, e também driver/student) adotam appHeaderOptions, nem que o admin não tem headerRight.
    evidence: |-
      group-layouts.test.tsx stuba o Stack e só lê screenOptions.headerRight de DriverLayout/StudentLayout; admin-home-screen.test.tsx renderiza só AdminHome. Remover screenOptions={appHeaderOptions} de (admin)/_layout.tsx não quebra teste nenhum. Estender o stub de group-layouts para capturar screenOptions cobre os três grupos de uma vez.
    location: >-
      mobile/src/app/(admin)/_layout.tsx:8
    severity: low
---

<intent-contract>

## Intent

**Problem:** "Minhas rotas" (`(driver)/routes.tsx`) e o painel admin são as duas telas que ficaram fora do redesign do Épico 6: rótulos em CAIXA-ALTA, descrição em itálico, emoji antes do nome, estados vazio/erro feitos à mão; o admin é um placeholder cru sem marca nem header padrão.

**Approach:** Extrair um `RouteCard` no vocabulário do épico (nome em `title`, "Origem → Destino" com ícone `arrow-right`, descrição `body` sem itálico) e montar a tela sobre `Screen` + `StateView`; trocar o admin por marca (faixa amarela + wordmark, como o hero do login) sobre um `StateView` "Em breve" com "Sair" como ação.

## Boundaries & Constraints

**Always:** Fluxos e navegação intactos — "Minhas rotas" continua **sem entrada** no app (D-UX-6 recusada); pull-to-refresh e o Snackbar de falha continuam; o admin continua saindo por `logout()` do `useAuthStore`. Cores só via papéis de `lib/palette.ts` + tokens de `lib/tokens.ts`, seguindo o idioma das telas já redesenhadas (`lightPalette` direto é a dívida aceita da 6.14). Tema claro apenas. `palette.guard.test.ts` verde e atualizado no mesmo commit que mexer no source travado. Comentários em inglês, só o porquê.

**Never:** Nada de dependência nova (nativa ou JS). Não criar entrada/menu para "Minhas rotas". Não mudar `routes.service.ts`, a query key `['routes','mine']`, nem os handlers de rotas. Não mexer em StateView/Screen/PrimaryAction (reusar como estão). Não construir funcionalidade real de admin.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Com rotas | `/routes/mine` → 2 rotas | Legenda "2 rotas atribuídas" + um RouteCard por rota; descrição só quando não nula | — |
| Carregando | query `status === 'pending'` (inclui pausada offline) | StateView `loading` "Carregando rotas..." — nunca o vazio | — |
| Vazio | sucesso com `[]` (ou payload não-array) | StateView `empty` `map-marker-off`, "Você ainda não tem rota." + "Fale com a administração." | — |
| Erro sem cache | falha, sem rotas | StateView `error` `cloud-alert`, "Não foi possível carregar suas rotas", PrimaryAction "Tentar novamente" → `refetch()` | Snackbar de falha reabre a cada nova falha |
| Erro com cache | falha, rotas em cache | Cards continuam visíveis | Snackbar de falha (regra atual) |
| Admin | usuário ADMIN logado | Faixa de marca + StateView `empty` "Em breve"; "Sair" chama `logout()` | — |

</intent-contract>

## Code Map

- `mobile/src/app/(driver)/routes.tsx` -- tela atual; RouteCard inline, estados à mão, Snackbar com reabertura por `errorUpdatedAt` (manter essa lógica).
- `mobile/src/app/(student)/qr-code.tsx` -- idioma de referência: `Screen variant="scroll"` + `RefreshControl`, `status === 'pending'`, normalização `Array.isArray`, Snackbar.
- `mobile/src/components/trip/trip-card.tsx` -- estilo de card redesenhado (`...elevation.level1`, `radius.lg`, `typography.*`).
- `mobile/src/components/ui/state-view.tsx`, `ui/screen.tsx`, `ui/mdi-icon.tsx` -- reusar sem alterar (StateView tem `testID` + `-action`).
- `mobile/src/app/(auth)/login.tsx` (~l.180–245) -- hero de marca: `lightPalette.brand`/`onBrand`, ícone `bus-school`, wordmark "PureUrban" em `typography.headline`.
- `mobile/src/app/(admin)/_layout.tsx`, `(admin)/home.tsx` -- placeholder; `(student)/_layout.tsx` mostra `appHeaderOptions` de `lib/app-header.tsx`.
- `mobile/src/lib/palette.guard.test.ts:619` -- lock de call-site "routes" com regex sobre `wrapper`/`routeLabel`/`routeValue`: reescrever para os novos estilos (tela + `route-card.tsx`).
- `mobile/src/trip-screen.test.tsx` -- padrão de teste de tela: vive em `src/` (nunca em `src/app/`), jest.mock de services, QueryClient + SafeArea(`TEST_INSETS`) + Paper providers.
- `mobile/src/mocks/handlers/auth.handlers.ts` -- usuários mock; não há ADMIN.
- `mobile/scripts/capture-demo-screens.mjs` (l.190 `light-18-routes`) e `_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/antes-depois.md` -- evidência visual.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/mocks/handlers/auth.handlers.ts` + `mobile/scripts/capture-demo-screens.mjs` -- adicionar `admin@pureurban.com` (role `ADMIN`) e a captura `light-40-admin` (login → espera o botão "Sair", presente antes e depois do redesign); gerar o **antes** do admin em `audit/light-40-admin.png` antes do redesign -- o admin não tinha usuário mock nem captura.
- [x] `mobile/src/components/routes/route-card.tsx` (+ `route-card.test.tsx`) -- RouteCard: nome `typography.title` (sem emoji), linha origem → destino com `MdiIcon arrow-right`, descrição `typography.body` sem itálico e só se não nula; `accessible` com rótulo "<nome>, de <origem> para <destino>" -- componente reutilizável do épico.
- [x] `mobile/src/app/(driver)/routes.tsx` -- reescrever sobre `Screen`/`StateView`/`RouteCard` conforme a matriz; manter Snackbar e pull-to-refresh -- restyle da P2.
- [x] `mobile/src/driver-routes-screen.test.tsx` -- cobrir as 5 linhas de rotas da matriz (inclui retry chamando `getMyRoutes` de novo e ausência de itálico/emoji).
- [x] `mobile/src/app/(admin)/_layout.tsx`, `(admin)/home.tsx` (+ `mobile/src/admin-home-screen.test.tsx`) -- header com `appHeaderOptions` (título "Painel"); tela = faixa de marca + `StateView kind="empty"` título "Em breve", detalhe curto, ação "Sair" (ícone `logout`) → `logout()`; teste de render + clique.
- [x] `mobile/src/lib/palette.guard.test.ts` -- atualizar o lock "routes" para os novos call-sites (fundo e papéis de texto do card); acrescentar lock do admin para `brand`/`onBrand`.
- [x] `_bmad-output/.../after/light-18-routes.png`, `after/light-40-admin.png`, `antes-depois.md` -- regenerar capturas e atualizar a linha light-18 + nova linha light-40.

**Acceptance Criteria:**
- Given o motorista navega para `/routes` com rotas atribuídas, when a tela renderiza, then cada rota aparece em RouteCard com nome sem emoji, "Centro → Campus Universitário" com ícone e descrição sem itálico nem rótulos em CAIXA-ALTA.
- Given o app do motorista, when se procura uma entrada para "Minhas rotas" (header, menu, Viagem), then não existe nenhuma nova.
- Given um usuário ADMIN logado, when o painel abre, then aparece a marca PureUrban e o StateView "Em breve", e tocar "Sair" encerra a sessão.
- Given a suíte mobile, when `npm test` e `npm run lint` rodam, then ficam verdes, incluindo `palette.guard.test.ts`.

## Implementation Notes

- Rótulo de acessibilidade do RouteCard: "<nome>, de <origem> para <destino>" como pedido, **mais** ". <descrição>" quando ela existe — o cartão é um nó `accessible` único e, sem isso, o leitor de tela nunca chegaria à descrição.
- Admin sem `AccountMenu` no header: a única ação do painel ("Sair") já está na tela; o header usa só `appHeaderOptions`. Ícone do StateView: `tools`.
- Erro sem cache ganhou detalhe "Verifique sua conexão e tente novamente." e a ação usa o ícone `refresh` com `loading` enquanto busca.
- Teste de reabertura do Snackbar lê a prop `visible` (não o texto): o Paper mantém o texto montado durante a animação de saída, o que deixava o teste instável com a suíte inteira.
- `tsc --noEmit`: 3 erros pré-existentes fora do escopo (`(driver)/scan.tsx:312`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172`), já presentes na baseline; nenhum nos arquivos da 6.13.

## Plan Change Log

## Review Triage Log

### 2026-09-27 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 18, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent-alignment) "Sem entrada nova" só é garantido por arquivos intocados; testes checam props de estilo, não o render no device — auditoria descritiva, sem defeito: a leitura implementada (navegação, D-UX-6) é a do EXPERIENCE.md, e a evidência renderizada está nas capturas light-18/light-40.
  - `[low]` `[patch]` (verification-gap) `refreshing={isRefetching}` sem teste — adicionadas asserções: `refreshing` false no primeiro carregamento e true num refetch pendente (d3d4624).
  - `[low]` `[defer]` (verification-gap) Header `appHeaderOptions` do admin sem teste — adiado (ver `deferred`): o mesmo buraco vale para driver/student e a correção é estender `group-layouts.test.tsx`.
  - `[low]` `[reject]` (edge-case) Array com elementos null derrubaria o `.map` — contrato do backend devolve objetos; o código anterior tinha o mesmo comportamento; guarda extra é complexidade sem caso demonstrado.
  - `[false]` `[reject]` (edge-case) ids duplicados/ausentes como key — `id` é UUID PK obrigatório em `AssignedRoute`; não ocorre.
  - `[low]` `[reject]` (edge-case) Offline sem cache fica em "Carregando rotas..." indefinidamente — é a linha "Carregando (inclui pausada offline)" da matriz, mesma escolha da tela de QR; o OfflineBanner do layout cobre o aviso de rede.
  - `[low]` `[reject]` (edge-case) "Tentar novamente" offline não dá feedback — query pausa até a rede voltar, mesmo comportamento das telas irmãs; exigiria ramo novo.
  - `[false]` `[reject]` (edge-case) `[]` em cache + refetch com falha troca vazio por erro — idêntico ao código anterior (`showErrorState = isError && vazio`) e à linha "Erro sem cache" da matriz.
  - `[low]` `[patch]` (edge-case) Teste offline religa a rede com a tela montada, vazando fetch — agora desmonta antes de `setOnline(true)` (d3d4624).
  - `[low]` `[patch]` (edge-case) `numberOfLines` removidos do nome/descrição — restaurados 2 e 3 linhas (d3d4624). Agrupado com o achado equivalente do blind-hunter.
  - `[false]` `[reject]` (blind) Plano não commitado / triagem vazia — a revisão estava em andamento; o plano é commitado na finalização.
  - `[low]` `[patch]` (blind) `sprint-status.yaml` ainda em backlog — 6-13 passa a `review` (PR pendente).
  - `[low]` `[patch]` (blind) Docs desatualizados (intro do antes-depois, EXPERIENCE.md:41) — intro cita a regeneração na 6.13; a linha da auditoria passa a dizer que o admin não tinha mock *na auditoria*. O salto light-35 → light-40 é intencional (faixa própria do admin); sem mudança.
  - `[low]` `[patch]` (blind) Comentário de `app-header.tsx` só citava driver/student — atualizado para incluir o admin sem AccountMenu (d3d4624).
  - `[low]` `[patch]` (blind) `numberOfLines` removidos — mesmo grupo do achado do edge-case; corrigido em d3d4624.
  - `[low]` `[reject]` (blind) Spinner do pull-to-refresh aparece junto do loading do botão no retry — mesmo padrão `isRefetching` da tela de QR; separar pull do usuário exige estado novo.
  - `[low]` `[patch]` (blind) Teste offline vaza fetch — mesmo grupo do achado do edge-case; corrigido em d3d4624.
  - `[low]` `[reject]` (blind) Fundo duplicado no `root` de routes e lock sobre ele — o View externo pinta o fundo atrás do Snackbar, igual a qr-code.tsx; sem dano nomeável.
  - `[low]` `[patch]` (blind) `useAuthStore()` sem seletor no admin — trocado por `useAuthStore((state) => state.logout)` (d3d4624).
  - `[low]` `[reject]` (blind) Admin anuncia dois headers / ícone / safe-area lateral — o ícone já sai da árvore de acessibilidade via `MdiIcon`; o wordmark com `role=header` repete o hero do login; bordas laterais só importam em paisagem, que o app não usa.
  - `[low]` `[defer]` (blind) ACs sem teste automatizado (sem entrada nova; header do admin; ícone do Sair) — mesmo grupo do achado de header do verification-gap; ver `deferred`.
  - `[low]` `[reject]` (blind) Teste de reabertura do Snackbar amarrado a `toHaveBeenCalledTimes(6)` — só quebra se `retry` mudar, e aí quebra de forma explícita; reescrever a espera não compensa.

## Auto Run Result

**Resumo:** "Minhas rotas" redesenhada sobre `Screen` + `StateView` com o novo `RouteCard` (nome em `title` sem emoji, "Origem → Destino" com `arrow-right`, descrição `body` sem itálico); tela continua sem entrada no app. Painel admin com faixa de marca (ícone `bus-school` + wordmark "PureUrban") sobre `StateView` "Em breve" com "Sair", e header padrão `appHeaderOptions`. Usuário mock `admin` e captura `light-40-admin` antes/depois.

**Arquivos:**
- `mobile/src/components/routes/route-card.tsx` (+ teste) — componente RouteCard.
- `mobile/src/app/(driver)/routes.tsx` — tela reescrita (estados via StateView, Snackbar e pull-to-refresh mantidos).
- `mobile/src/driver-routes-screen.test.tsx` — cobertura da matriz de estados.
- `mobile/src/app/(admin)/home.tsx`, `(admin)/_layout.tsx` (+ `admin-home-screen.test.tsx`) — painel com marca e "Em breve".
- `mobile/src/lib/palette.guard.test.ts` — locks de routes, route-card e admin.
- `mobile/src/lib/app-header.tsx` — comentário atualizado.
- `mobile/src/mocks/handlers/auth.handlers.ts`, `mobile/.env.example`, `mobile/scripts/capture-demo-screens.mjs` — usuário `admin` e captura light-40.
- `_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/` — `after/light-18`, `audit|after/light-40`, `antes-depois.md`, `EXPERIENCE.md`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 6.13 em `review`.

**Revisão:** 22 achados — 10 linhas de patch (7 correções distintas, todas `low`), 2 adiados (1 item em `deferred`: teste de header dos layouts de grupo), 10 rejeitados (4 `false`, 6 `low` de baixo impacto) com motivo registrado acima.

**Follow-up review:** `false` — nenhum patch `high` nem `medium` (patches: high 0, medium 0, low 7).

**Verificação:** `npx jest --maxWorkers=25%` → 61 suítes / 753 testes verdes; `npm run lint` limpo; `npx tsc --noEmit` → 3 erros pré-existentes em arquivos não tocados (`(driver)/scan.tsx:312`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172`). Capturas light-18 e light-40 regeneradas em Expo Web + MSW e inspecionadas.

**Riscos residuais:** sem validação em device Android (só Jest + Expo Web); header dos layouts de grupo sem teste (adiado); erros de tsc pré-existentes seguem abertos.

## Design Notes

A tela de rotas não ganha Skeleton: o `EXPERIENCE.md` só pede Skeleton para Trip, lista, QR e track-bus. Copy do vazio vem de State Patterns ("Você ainda não tem rota. Fale com a administração."). Nenhum teste Jest/Playwright referencia o texto atual de routes/admin (verificado por grep); o único contrato externo é a captura `light-18-routes`, que espera "Linha Centro - Universidade" — preservado.

## Verification

**Commands:**
- `cd mobile && npx jest --maxWorkers=25%` -- expected: todas as suítes verdes
- `cd mobile && npm run lint` -- expected: sem erros
- `cd mobile && npx tsc --noEmit` -- expected: sem erros (não rodar junto com Metro/Jest — memória de OOM do WSL)

**Manual checks (if no CLI):**
- Expo Web com mocks (`EXPO_PUBLIC_USE_MOCKS=1 EXPO_PUBLIC_E2E=1 npx expo start --web --port 8081`) + `node mobile/scripts/capture-demo-screens.mjs light-18 light-40`: capturas refletem os ACs.
