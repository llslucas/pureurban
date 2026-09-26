---
title: 'Story 6.5: redesign da viagem do motorista'
type: 'feature'
ticket: '6-5-redesign-viagem-do-motorista'
created: '2026-09-26'
status: 'built'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
baseline_revision: '64bc67d9cf0b94cfb29bcae4864d601f141dcfa9'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A tela `(driver)/trip` mostra o UUID da rota, a contagem em texto corrido 15px, emoji-tofu no tipo e no chip, H1 duplicado e três botões empilhados no meio da tela — "Encerrar" vermelho a 16px do "Escanear", sem confirmação (EXPERIENCE.md → Achados por tela, `audit/light-11`, `light-19`, `light-20`, `light-23`).

**Approach:** Primeiro commit extrai os blocos de `trip.tsx` em componentes sem mudar comportamento. Depois o restyle conforme "Motorista › Viagem — P0": `TripCard` herói (overline do tipo, nome da rota, `StatusChip`, `BoardingCounter`, "Iniciada às HH:MM"), ações na `StickyActionBar`, "Alunos da Viagem" como item de lista 56dp, e "Encerrar Viagem" secundário vermelho com `ConfirmDialog` (D-UX-7). Estados sem viagem / ida concluída / turma vazia / erro via `StateView`/`TripCard`.

## Boundaries & Constraints

**Always:**
- Lógica intocada: queries (inclusive o `enabled` de `['routes','mine']` — nenhuma chamada a `/routes/mine` com viagem ACTIVE), mutações, `resolveRouteId`, GPS/permissão, `router.navigate`, guarda `isMutating`, `Alert` de erro.
- Contrato de teste: textos `Iniciar Viagem`, `Iniciar Retorno`, `Escanear QR Code`, `Alunos da Viagem` (com `accessibilityRole="button"`), `Encerrar Viagem`, `Carregando rotas...`, `Não foi possível carregar suas rotas.`, `Tentar novamente`, `Peça ao administrador para vincular uma rota.`, textos do card de permissão e `testID="trip-screen"` permanecem.
- Nome da rota: `routes` do cache casado por `activeTrip.routeId`; sem match → "Rota atribuída". Nunca o UUID.
- Contagem: `summary` do servidor; "—" enquanto indefinido.
- Sem hex; `trip.tsx` não importa `lightPalette` (gate da 6.12) — cores ficam nos componentes; tipografia de `lib/tokens`.

**Never:**
- Nova dependência nativa; mudar serviços, query keys ou a API.
- Legenda por status no `BoardingCounter` (só `summary` está disponível aqui; fica para a 6.7), Skeleton e `PermissionCard` genérico (6.11), animação de rolagem do número.
- Confirmação em qualquer caminho além de Encerrar.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ativa | `activeTrip` ACTIVE, rota no cache | TripCard: "Viagem de ida"/"Viagem de retorno", nome da rota, chip "Em andamento" (`progress-clock`), `boarded/total`, "Iniciada às HH:MM" (sem segundos); bar: Encerrar Viagem (secundário vermelho) acima de Escanear QR Code (primary) | — |
| Ativa, cold start | rota fora do cache | "Rota atribuída"; `/routes/mine` não é chamado | — |
| Encerrar | toque em Encerrar Viagem | ConfirmDialog; "Voltar" fecha sem PATCH; "Encerrar" dispara `endTrip` com loading e fecha no sucesso | erro: `Alert` atual e dialog fecha |
| Ida concluída | OUTBOUND COMPLETED | TripCard com chip "Concluída" (`flag-checkered`) e contagem final; bar: Iniciar Retorno (`replay`) | — |
| Retorno concluído | RETURN COMPLETED | TripCard Concluída + seção de partida (seletor) | — |
| Sem viagem, 1 rota | — | StateView `empty` `bus-clock` "Nenhuma viagem em andamento" + nome da rota; bar: Iniciar Viagem | `Alert` atual |
| Sem viagem, >1 rota | — | lista de opções com rádio 56dp "Escolha a rota da viagem"; Iniciar Viagem desabilitado até escolher | — |
| Sem rota | `routes=[]` | StateView `empty` `map-marker-off` com "Peça ao administrador…"; **sem** botão Iniciar | — |
| Erro rotas / erro viagem | query em erro sem dado | StateView `error` + "Tentar novamente" | retry |
| Turma vazia | `summary.total===0` | contador oculto; linha "Nenhum aluno nesta rota" no TripCard | — |

</frozen-after-approval>

## Code Map

- `mobile/src/app/(driver)/trip.tsx` -- tela de 626 linhas: `TripStatusChip`/`TripTypeLabel` (emoji), `LocationPermissionCard` (65-117), `StartOutboundSection` (137-235), `TripScreen` com queries/mutações (237-503). O ramo COMPLETED usa `isReturn` para decidir Iniciar Retorno vs seção de partida.
- `mobile/src/components/ui/` -- da 6.2: `Screen` (`variant`, `footer`), `StickyActionBar` (primária por último), `PrimaryAction` (`variant` primary/secondary/danger/quiet, `impact`, `id`, `testID`, `color`), `StatusChip` (modo `label/icon/tone`, tons `success`/`info`), `StateView` (`kind`, `icon`, `detail`, `action`), `ConfirmDialog` (`destructive`, `loading`, testIDs `-confirm`/`-cancel`; usa `Portal`), `MdiIcon`. Reusar; mudanças de API só aditivas (ex.: `color` valer também para `secondary`).
- `mobile/src/lib/tokens.ts` -- `typography.displayCount/titleLg/overline/bodyLg`, `spacing`, `radius`, `elevation.level1`, `motion`. `lib/palette.ts` -- `lightPalette`, `statusTints` (só em componentes).
- `mobile/src/app/(auth)/login.tsx` -- referência de restyle da 6.4 com `Screen`/`PrimaryAction`.
- `mobile/src/trip-screen.test.tsx` -- `renderScreen()` sem `PaperProvider`/`SafeAreaProvider`; precisa dos dois agora (`Portal`, insets). Modelo: `components/ui/test-utils.tsx` (`renderUi`, `TEST_INSETS`). Testes de encerrar (291, 313) passam a confirmar; teste "sem rota" (210) troca "botão desabilitado" por "sem botão".
- `api/tests/e2e/tracking-live.e2e.spec.ts:437-457` -- clica "Encerrar Viagem" e espera `✅ Concluída`; linhas 257/349/424 só checam visibilidade (seguem válidas). `api/tests/support/helpers/e2e-driver.ts:37` e `absence-reminder.e2e.spec.ts:43` usam `getByRole('button')` em "Escanear QR Code"/"Alunos da Viagem".
- `mobile/src/app/(driver)/_layout.tsx` -- header "Viagem" já existe; nada a mudar.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/trip/location-permission-card.tsx`, `start-outbound-section.tsx`, `trip-status.tsx` (chip + label do tipo) -- extração verbatim de `trip.tsx`, `trip.tsx` importando-os; commit próprio com a suíte verde -- guarda-corpo do épico.
- [x] `mobile/src/components/ui/boarding-counter.tsx` (+ `.test.tsx`) -- `display-count` tabular "boarded**/total**" (denominador `textMuted`), rótulo "embarcados", barra 8dp `surfaceStrong`→`success` com largura animada 400ms (Reanimated, respeita reduced motion), "—" sem summary, `maxFontSizeMultiplier` 1.5 -- reusado em 6.6/6.7.
- [x] `mobile/src/components/trip/trip-card.tsx` (+ `.test.tsx`) -- cartão `elevation.level1` `radius.lg`: overline do tipo, nome da rota `titleLg`, `StatusChip` (ACTIVE `progress-clock`/success "Em andamento"; COMPLETED `flag-checkered`/info "Concluída"), `BoardingCounter` ou linha de turma vazia, "Iniciada às HH:MM" só quando ACTIVE.
- [x] `mobile/src/components/trip/*` restantes -- permissão e seção de partida restilizadas com tokens; seletor como lista de rádio 56dp; estados via `StateView`; remover emojis e `trip-status.tsx` se ficar sem uso.
- [x] `mobile/src/app/(driver)/trip.tsx` -- `Screen variant="scroll"` com `footer` `StickyActionBar`; item de lista "Alunos da Viagem" 56dp com chevron; ConfirmDialog de encerrar; estados loading/erro via `StateView`; sem `StyleSheet` com cor.
- [x] `mobile/src/trip-screen.test.tsx` -- providers; confirmar nos fluxos de encerrar; novos casos: nome da rota do cache, fallback "Rota atribuída" sem UUID, "Voltar" não chama `endTrip`, "Iniciada às" sem segundos, turma vazia oculta o contador.
- [x] `api/tests/e2e/tracking-live.e2e.spec.ts` -- após clicar "Encerrar Viagem", confirmar via `getByTestId('end-trip-dialog-confirm')`; `✅ Concluída` → `getByText('Concluída', { exact: true })`.

**Acceptance Criteria:**
- Given viagem ACTIVE, when a tela abre, then a ação primária "Escanear QR Code" fica na barra inferior fixa e nenhum botão `contained` compete com ela no conteúdo.
- Given qualquer estado, when inspeciono o texto renderizado, then não há emoji nem UUID de rota.
- Given as suítes, when rodo Jest e o e2e de tracking, then passam com os seletores preservados.

## Implementation Notes

- 11 commits sobre `64bc67d`: extração verbatim (5899cc0), `PrimaryAction` secondary aceita `color`, `BoardingCounter`, `TripCard`, restyle da tela (+ `active-trip-actions.tsx`, `trip-link-row.tsx`; `trip-status.tsx` removido), e2e, e as correções da revisão.
- Fora do Code Map: `api/tests/e2e/boarding-happy-path.e2e.spec.ts:50` lia `Alunos: 0/N` — passou a `getByLabel('0 de N embarcados')`.
- Jest: o `Modal` do Paper não completa o fade-out, então o dialog é verificado pela prop `visible`.
- A guarda de toque duplo do confirm só vale depois do re-render com `isPending` (tick seguinte); em velocidade humana não ocorre, e a tela não ganhou guarda própria.
- e2e (servidores locais, API :3001): 9 verdes, incluindo os 3 `tracking-live` e `boarding-happy-path`; `absence-reminder` › "fora da janela" falha igual na `main` (pré-existente). Não reexecutado após as correções da revisão (só código mobile e comentário).
- Capturas "depois" (ativa, ida concluída, turma vazia, sem viagem, dialog) geradas no scratchpad da sessão, não versionadas — ficam para a 6.12 (D-UX-13).

## Plan Change Log

## Review Triage Log

### Passe 1 (2026-09-26) — high 0 · medium 1 · low 9 · false 3 · maybe-false 0

| # | Lente | Achado | Veredito | Rota | Evidência |
|---|---|---|---|---|---|
| 1 | edge-case, blind | `confirmEndVisible` sobrevive à troca de viagem: refetch de `/trips/active` (staleTime 10s) devolvendo COMPLETED com o dialog aberto → próxima viagem ACTIVE monta com o dialog aberto | medium | patch | `trip.tsx` só zera o estado no settle da mutação; derivar a visibilidade do id da viagem |
| 2 | edge-case, blind | `BoardingCounter` anima 0→ratio em toda abertura (summary chega depois do mount), contradizendo o comentário | low | patch | `useSharedValue(ratio)` com `summary` undefined no mount; semear no primeiro valor definido |
| 3 | verification-gap | `loading={endMutation.isPending}` do dialog sem teste de toque duplo | low | patch | todos os testes confirmam uma vez contra promise resolvida |
| 4 | verification-gap | botões do `LocationPermissionCard` nunca pressionados após a reescrita | low | patch | handler correto (lido), mas troca dos ramos passaria na suíte |
| 5 | verification-gap, blind | ordem/variante de Encerrar vs Escanear (D-UX-7, AC 1) só travada por regex de fonte | low | patch | nenhum render test de `ActiveTripActions` |
| 6 | verification-gap | TripCard acima do card de permissão no estado concluído (ab291b9) sem teste | low | patch | testes de permissão nunca usam COMPLETED |
| 7 | blind | checagem sem emoji/UUID só nos estados ativos; `renderedText()` serializa props (testID com UUID) | low | patch | AC "qualquer estado" |
| 8 | blind | comentários tocados em português (`tracking-live`, `trip.tsx`) | low | patch | CLAUDE.md: comentários em inglês |
| 9 | blind | comentário de cabeçalho de `trip-screen.test.tsx` fora da largura | low | patch | cosmético, correção direta |
| 10 | edge-case | `BoardingCounter` com `total===0` fora do TripCard mostraria "0/0" | low | rejeitado | nenhum outro caller hoje; 6.7 decide o vazio da lista |
| 11 | blind | `startOutboundPhase` sem teste unitário direto | low | rejeitado | as quatro fases cobertas por testes de tela (loading, erro, sem rota, pronto) |
| 12 | blind | várias rotas: "Iniciar Viagem" desabilitado sem explicar | low | rejeitado | rótulo "Escolha a rota da viagem" acima da lista; comportamento anterior igual |
| 13 | blind | ícones decorativos do card de permissão/rádios expostos ao leitor de tela | false | rejeitado | `MdiIcon` já aplica `accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"` |
| 14 | blind | `BoardingCounter` sem live region; `boarded>total` desalinha texto e barra | low | rejeitado | spec não pede live region no TripCard; `boarded>total` não demonstrado vindo do servidor |
| 15 | blind | trava de fonte do `palette.guard` frágil; `destructive` do dialog não travado | low | rejeitado | problema de dev sem dano nomeado; `ConfirmDialog` destructive coberto pelos testes do componente |
| 16 | blind | bookkeeping (sprint-status, plano não versionado, capturas) | false | rejeitado | feito no step 5 / commit de docs; correção seria editar o plano |
| 17 | intent-alignment | nome da rota só com cache; cold start mostra "Rota atribuída" | false | rejeitado | decisão congelada (Always + Design Notes); levada ao humano na apresentação |
| 18 | intent-alignment | estado sem rota perdeu o botão desabilitado | false | rejeitado | pedido pela matriz congelada ("sem botão Iniciar") e pela spec |

Patches 1–9 aplicados em fd35442, 9737c4d, 4f49173, b1a7bda; `npm test` 539/539, lint limpo, tsc só os 3 erros pré-existentes.

## Design Notes

- Nome da rota durante a viagem: a query de rotas já é `useQuery` com `enabled` falso na viagem ativa; `enabled:false` ainda devolve o dado em cache (persistido 24h no MMKV), então o nome aparece sem nova chamada — preserva a Design Note de NFR19 e o teste `does NOT call /routes/mine`.
- Confirmação: `confirmLabel="Encerrar"` (verbo; não contém "Encerrar Viagem", então o `getByRole` do Playwright continua achando só o gatilho) e `testID="end-trip-dialog"`. O dialog fecha em `onSuccess`/`onError` da mutação; o `loading` do dialog segue `endMutation.isPending`.
- "Encerrar Viagem": `PrimaryAction variant="secondary"` com ícone `stop-circle` e `color` = erro (hoje `secondary` ignora `color`: estender o componente + teste, nunca hex na tela) — se a variante não aceitar cor de texto, adicionar prop mínima no componente em vez de hex na tela.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: suíte verde
- `cd mobile && npm run lint && npx tsc --noEmit` -- expected: 0 erros novos (existentes: `scan.tsx:316`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172`)
- `grep -nE "#[0-9a-fA-F]{3,8}\b|lightPalette|[🚌🔄🟢✅]" "mobile/src/app/(driver)/trip.tsx"` -- expected: vazio
- `cd api && npm run test:pw:e2e -- tracking-live` -- expected: verde, se a infra local estiver de pé

**Manual checks:**
- Expo Web com mocks (390×844): capturas "depois" de ativa, ida concluída, turma vazia, sem viagem e dialog de encerrar, comparadas com `audit/light-11`, `light-19`, `light-20`, `light-23`.
