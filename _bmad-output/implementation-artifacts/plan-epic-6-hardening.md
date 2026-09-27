---
title: 'Hardening do épico 6 — action items 21, 23, 25 e 26 da retro'
type: 'bugfix'
ticket: ''
created: '2026-09-27'
baseline_revision: '4b95d4ba8317a2bd4b020c8cc2720f0359bae711'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-09-27.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      project-context.md ainda lista só (auth)/(driver)/(student) e não cita os presets custom.layers.
    evidence: |-
      A seção Expo Router omite (admin)/; a linha de theming não diz que overlay/pressed/shimmer/refresh existem para superfícies flutuantes e pull-to-refresh. Arquivo de contexto de agente: exige aplicação humana.
    location: >-
      _bmad-output/project-context.md
    severity: low
  - summary: >-
      Encerrar viagem que falha com 409 TRIP_NOT_ACTIVE mantém a tela na viagem ativa; toda nova tentativa falha igual.
    evidence: |-
      Pré-existente: nem o Alert antigo nem o Banner novo invalidam activeTripKey no erro. Resolveria: invalidar a query ativa quando o code for TRIP_NOT_ACTIVE.
    location: >-
      mobile/src/app/(driver)/trip.tsx
    severity: medium
  - summary: >-
      Caller "Desfazer" da home do aluno sem teste do estado em loading (cor mantida e busy).
    evidence: |-
      student-home.test.tsx não segura cancelAbsence pendente; recolocar `|| cancelMutation.isPending` em disabled passaria verde.
    location: >-
      mobile/src/app/(student)/home.tsx:342
    severity: low
  - summary: >-
      Ativação por leitor de tela do wrapper nativo do PrimaryAction não verificada em device.
    evidence: |-
      Jest só simula accessibilityAction 'activate'. Resolveria: TalkBack no AVD com o dev build do AI2.
    location: >-
      mobile/src/components/ui/primary-action.tsx
    severity: medium (unverified)
  - summary: >-
      Correções de R1, R3, R4 e R5 exercitadas só em Jest, sem Expo Web nem device.
    evidence: |-
      A AC do banner é declarada para Expo Web; nenhum pw:e2e cobre falha de iniciar/encerrar. R4/R5 foram vistos em device. Resolveria: pw:e2e com falha de rede injetada e o dev build do AI2 (item 22).
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A retro do épico 6 (`epic-6-retro-2026-09-27.md`) deixou achados confirmados sem correção: tema escuro incoerente nas fronteiras 6.2 × 6.14 (R1), guarda de consumo com buracos (R2), três bugs de comportamento vistos em device (R3–R6), divergência na saída do admin (AV2), lacunas de teste (R7a–c) e o `project-context.md` desatualizado (R9).

**Approach:** Uma rodada de hardening, só no mobile e nos docs BMAD, com os action items que têm o Dev como dono: **AI1** (item 21), **AI3** (item 23), **AI5** (item 25) e **AI6** (item 26). Um commit atômico por item e a suíte verde a cada commit.

## Boundaries & Constraints

**Always:**
- No tema claro, a aparência continua igual (a demo roda em claro). Toda mudança visual vale só para `theme.dark`, exceto o spinner do `RefreshControl`, que passa a usar a cor do tema.
- Novas cores só como papéis derivados de `lib/palette.ts`, sem hex novo. Leitura de tema via `useAppTheme()`/`useThemedStyles`.
- Cópia de UI em pt-BR; código, comentários e commits em inglês (CLAUDE.md). Comentário só para explicar o *porquê*.
- Rodar Jest, lint e tsc **em sequência, com o Metro parado** (memória: OOM do WSL).

**Never:**
- Não tocar em `api/src`.
- Fora de escopo: **AI2/item 22** (dev build e verificação em device: é do Lucas; o NFR4 do `pw:api` mede a API, não o custo de render da `StudentRow`, então remedi-lo não responde o R7e), **AI4/item 24** (acessibilidade, que espera decisão do Lucas), **AI7/item 27** (processo, também do Lucas) e os achados "Baixos" da retro.
- Não mexer em `outline`/`outlineVariant` (resíduo documentado).
- Não remover o `Math.min` do HUD.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Falha ao iniciar viagem | POST /trips rejeita (rede ou 4xx) | `Banner` de erro na tela de Viagem com cópia pt-BR; o botão volta a ficar habilitado | Rede/timeout (`TypeError` do fetch ou `REQUEST_TIMEOUT`): "Sem conexão com o servidor. Verifique a internet e tente de novo."; `ApiClientError` com status > 0: a `message` do servidor (já em pt-BR) |
| Falha ao encerrar viagem | PATCH /end rejeita | O diálogo fecha, a viagem continua ativa e o `Banner` de erro aparece (também no web) | Mesma classificação; o banner some na próxima tentativa ou em sucesso |
| Localização negada + volta ao app | `deviceLocationDenied` e AppState → active | `getForegroundPermissionsAsync` (sem prompt); se `granted`, re-inscreve; senão, só atualiza `canAskAgain` | Rejeição do getter: mantém o estado negado |
| Botão em loading | `loading` true | Cor do botão sem mudança (não fica cinza), `accessibilityState` com `busy: true`; o toque é engolido | — |
| Scan de aluno NOT_RETURNING | roster com o aluno em `NOT_RETURNING`, id na sessão | `boarded + 1` e `total + 1` (ex.: 30/31 → 31/32) | Id fora do roster: continua somando só no `boarded`, com o teto do `Math.min` |
| Admin toca "Sair" | — | `logout()` e depois `router.replace('/(auth)/login')` | — |

</intent-contract>

## Code Map

- `mobile/src/lib/theme.ts` — `lightTheme`/`darkTheme`. `colors.inverse*` herdam o violeta do MD3. No `darkTheme`, `colors.surface` é `darkPalette.canvas`, enquanto `custom.palette.surface` é `element`.
- `mobile/src/lib/palette.ts` — escuro: canvas `#181d26`, element `#1d1f25` (praticamente igual ao canvas), hairline `#41454d` (o único tom que se destaca do canvas).
- `mobile/src/lib/tokens.ts` `makeElevation` — `level2` = canvas + sombra (a sombra some no escuro).
- `mobile/src/components/account-menu.tsx:98`, `components/ui/confirm-dialog.tsx:69` — `backgroundColor: palette.canvas`.
- `mobile/src/components/ui/sticky-action-bar.tsx:45` — `...elevation.level2`.
- `mobile/src/components/trip/trip-link-row.tsx:48` — pressed = `surfaceSoft`, que no escuro é o canvas.
- `mobile/src/components/ui/skeleton.tsx:104` — o highlight usa `palette.canvas` (no escuro, escurece).
- `RefreshControl` em `app/(driver)/routes.tsx:92`, `app/(student)/qr-code.tsx:115`, `app/(driver)/student-list.tsx:330`.
- `mobile/src/lib/palette.guard.test.ts` — seção (5) (`:348-378`) com a regex de consumo; binding do `darkTheme` (`:501-516`), que hoje fixa `surface: darkPalette.canvas` e precisa ser atualizado; o lock do `app.json` (`:616`) já fixa os dois amarelos.
- `mobile/src/app/(driver)/trip.tsx:137-150,167-175,226-241` — `Alert.alert` e callers com `disabled` + `loading`. Usar o `Banner` (`components/ui/banner.tsx`, tone `error`, já tem `accessibilityLiveRegion`).
- `mobile/src/services/api-client.ts:113-124`, `services/api-error.ts` — falha de transporte relança o erro do fetch; timeout vira `ApiClientError('REQUEST_TIMEOUT', …, 0)`.
- `mobile/src/app/(student)/track-bus.tsx:228-284` — effect por epoch que chama `requestForegroundPermissionsAsync`; listener de AppState em `:278-284`.
- `mobile/src/components/ui/primary-action.tsx:108-120` — Paper `Button`; `disabled` deixa cinza. `app/(student)/home.tsx:342-343` também passa os dois.
- `mobile/src/utils/trip-boarded-count.ts` (+ `.test.ts`) — HUD. A API conta check-in de `NOT_RETURNING` nos dois lados (`api/src/domains/trip/core/use-cases/get-trip-students.use-case.ts:63-108`).
- `mobile/src/app/(admin)/home.tsx:33` — `onPress: logout`, sem `replace`. A sequência de referência está em `account-menu.tsx:32-38`.
- `mobile/src/group-layouts.test.tsx` — o stub de `Stack` descarta `screenOptions`, fora `headerRight`; admin sem teste.
- `mobile/src/mocks/handlers/boarding.handlers.ts:309-318` — summary do GET /trips/:id/students. O `msw` está nas deps (`src/mocks/server.ts`).
- `mobile/src/components/ui/test-utils.tsx` — `renderUi(el, theme)` aceita `darkTheme`.
- Componentes tematizados sem render sob `darkTheme`: account-menu, roster-header, shortcut-card, confirm-dialog, boarding-counter, screen-skeletons, permission-card, state-view, bus-eta-card, sticky-action-bar, trip-status-card, start-outbound-section, skeleton, trip-link-row, trip-card, scan-blocked-states, countdown-pill, active-trip-actions, route-card.
- Docs: `_bmad-output/project-context.md:101`; `implementation-artifacts/plan-6-6-redesign-escanear-qr.md` (`status: 'built'`); `plan-6-14-consumo-do-tema-escuro.md` (`followup_review_recommended: true`); `implementation-artifacts/sprint-status.yaml` (itens 21–27).

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/lib/theme.ts` -- (AI1a/b) mapear `inverseSurface`/`inverseOnSurface`/`inversePrimary` nos dois temas às roles da paleta do esquema OPOSTO: claro → `inverseSurface: darkPalette.canvas`, `inverseOnSurface: darkPalette.text`, `inversePrimary: darkPalette.link`; escuro → `lightPalette.canvas`/`lightPalette.text`/`lightPalette.link`. A guarda trava contraste ≥ 4.5:1 de onSurface e primary sobre o inverseSurface e alinhar `darkTheme.colors.surface` a `darkPalette.surface`; expor em `custom` um preset de superfície sobreposta por esquema (claro = `{ backgroundColor: canvas }`, escuro = `surface` + borda hairline) e uma cor de pressed (claro `surfaceSoft`, escuro `surfaceStrong`) -- tira o violeta do Snackbar e separa as camadas.
- [x] `account-menu.tsx`, `confirm-dialog.tsx`, `sticky-action-bar.tsx` (borda superior hairline só no escuro), `trip-link-row.tsx`, `skeleton.tsx` (highlight clareia no escuro), os 3 `RefreshControl` (`tintColor`/`colors` = `palette.text`, `progressBackgroundColor` = `palette.surface`) -- (AI1c/d) consumir os presets.
- [x] `mobile/src/lib/palette.guard.test.ts` -- (AI1e/R2) nenhum valor de `colors.*` dos dois temas, incluindo `elevation`, pode sobrar da paleta violeta do MD3 (compara com `MD3*Theme.colors`, exceto `outline`, `outlineVariant`, `level0` e as chaves que não são cor, documentadas numa lista); `colors.surface === custom.palette.surface` nos dois temas; a regex de consumo passa a cobrir `designTokens|appExtensions|darkMapping|MD3LightTheme|MD3DarkTheme|DefaultTheme` fora de `lib/` e da allowlist. Atualizar o binding do `darkTheme.surface`.
- [x] `mobile/src/components/trip/trip-error.ts` (novo) + `trip.tsx` -- (AI3a) `tripActionErrorMessage(error, action)` classifica o erro como rede ou servidor e devolve a cópia em pt-BR. `trip.tsx` troca o `Alert.alert` por estado + `<Banner tone="error">` nos dois ramos de render; o banner limpa em nova tentativa e em sucesso. Testes: função pura + tela.
- [x] `track-bus.tsx` -- (AI3b) o listener de foreground usa `getForegroundPermissionsAsync` e só bump o epoch quando `granted`; atualiza `canAskAgain`. Teste: com a permissão negada, o foreground não chama `request…`.
- [x] `primary-action.tsx` + callers (`trip.tsx`, `home.tsx`) -- (AI3c) os callers param de passar `disabled` com o mesmo sinal de `loading`. O componente passa `accessibilityState={{ busy: loading, disabled: disabled || loading }}` ao `Button` (confirmar que o Paper repassa; se não repassar, aplicar no wrapper acessível). Teste.
- [x] `trip-boarded-count.ts` (+ teste) -- (AI3d) id da sessão que está `NOT_RETURNING` no roster soma +1 no `total`.
- [x] `app/(admin)/home.tsx` (+ teste) -- (AI3e) Sair = `logout()` e depois `router.replace('/(auth)/login')`.
- [x] `group-layouts.test.tsx` -- (AI5a) o stub de `Stack` guarda `screenOptions`; testar que driver, student e admin aplicam `useAppHeaderOptions()` (mesmas chaves e valores) e que o admin não tem `headerRight`.
- [x] `components/dark-theme-render.test.tsx` (novo) -- (AI5b) `it.each` com os componentes listados no Code Map renderizados sob `darkTheme`, conferindo que nenhum `backgroundColor`/`color` resolvido vem só da paleta clara (`lightPalette` sem par no `darkPalette`), mais asserts específicos de menu, diálogo e skeleton para os presets novos.
- [x] `mocks/handlers/boarding.handlers.test.ts` (novo) -- (AI5c) com o `msw/node` e um roster com um `NOT_RETURNING`: `total` o exclui e `boarded` conta só `CHECKED_IN`.
- [x] Docs (AI6): `project-context.md:101` passa a descrever `useAppTheme().custom`/`useThemedStyles` + a allowlist de `lightPalette` (4 superfícies fixas); `plan-6-6` com `status: 'done'`; `plan-6-14` ganha uma nota em Auto Run Result dizendo que o follow-up não rodou e que a retro fez esse papel para as superfícies escuras; `sprint-status.yaml` com os itens 21, 23, 25 e 26 `done`, anotando o PR.

**Acceptance Criteria:**
- Given o app no tema escuro, when o Snackbar, o menu "Sair", um `ConfirmDialog` ou a `StickyActionBar` aparecem, then nenhum tom violeta do MD3 é usado e a superfície se distingue do fundo por borda hairline.
- Given o app no tema claro, when qualquer tela é renderizada, then os estilos resolvidos são os mesmos de antes, exceto o `tintColor` do `RefreshControl` (ver a guarda e os testes existentes, que continuam verdes).
- Given um componente fora de `lib/` que importe `designTokens` ou `MD3LightTheme`, when o Jest roda, then a guarda falha apontando o arquivo.
- Given o Expo Web, when iniciar ou encerrar a viagem falha, then aparece uma mensagem em pt-BR na tela (nada fica mudo).

## Implementation Notes

- Quatro commits, um por action item, cada um com Jest, lint e tsc verdes em sequência (Metro parado): AI1 `32d7e91` (tema), AI3 `439a92b` (comportamento), AI5 `3ff69ec` (testes) e AI6 (docs, este commit).
- AI1: `custom.layers` concentra os presets por esquema (`overlay`, `pressed`, `shimmer` e `refresh`, espalhado no `RefreshControl`). No claro, os valores são os de antes; o `progressBackgroundColor` do claro é `#ffffff`, igual ao default do Android. A `StickyActionBar` lê `theme.dark` para a borda superior.
- AI1/guarda: além de `outline`, `outlineVariant` e `level0`, ficam no default MD3 `shadow`, `scrim`, `backdrop`, `surfaceDisabled` e `onSurfaceDisabled`, que são neutros e não tons do violeta. A lista `MD3_TEMPLATE_KEEP` documenta cada um. O teste exige que toda outra chave de `colors.*` seja um valor da paleta, e não só diferente do default MD3, porque `error` e `onPrimary` coincidem com o MD3 por decisão (D2). O contraste travado é `inverseOnSurface` e `inversePrimary` sobre `inverseSurface`, o par que o Snackbar desenha.
- AI3c: o Paper fixa `accessibilityState={{ disabled }}` no touchable interno. No nativo, o wrapper `Animated.View` passa a ser o elemento acessível (role, label, `busy`/`disabled` e a ação `activate`), e o `Button` fica com `accessible={false}`. No web, o Button do Paper continua sendo o elemento acessível, porque um segundo `role="button"` aninhado tornaria ambíguos os `getByRole('button', …)` dos e2e Playwright.
- AI3a: `tripActionErrorMessage` devolve `{ title, message }`: o título nomeia a ação e a mensagem segue a classificação rede × servidor.

## Plan Change Log

- AI5c: o `msw/node` não carregava sob o `jest-expo` (deps ESM-only: `rettime`, `@open-draft/*` em `.mjs` e `until-async` em `.js`). O `mobile/jest.config.js` passou a transformar `.mjs` e a tirar `until-async` do ignore, mantendo o resto do preset. A suíte inteira segue verde.

## Review Triage Log

### 2026-09-27 — Review pass
- verdicts: 38 findings — high 0, medium 9, low 18, false 7, maybe-false 4
- findings:
  - `[medium]` `[patch]` (blind) `trip-error.ts`: um erro do servidor com status > 0 ainda chega em inglês ("An error occurred", HttpException do Nest) — confirmado em `api-client.ts:162-171` e `effect-exception.filter.ts:88-93`; patch: cópia genérica em pt-BR para 5xx e para os códigos INTERNAL_ERROR/HTTP_ERROR/INVALID_RESPONSE/UNKNOWN_ERROR.
  - `[medium]` `[patch]` (blind) banner de erro da viagem fica velho quando a viagem muda (não é ligado à viagem) — confirmado: o estado só limpa no `onMutate`; patch: banner ligado a `id:status` da viagem no momento da falha. Sem botão de dispensar: rejeitado dentro do mesmo grupo, porque o patch já remove o caso velho.
  - `[low]` `[defer]` (blind) `project-context.md` sem `(admin)/` e sem os presets de `custom.layers` — arquivo de contexto de agente → defer.
  - `[low]` `[reject]` (blind) papéis MD3 novos sem trava de contraste — tertiary/errorContainer não são renderizados pelo app (só o Snackbar usa `inverse*`, que tem trava); guarda nova = complexidade sem uso real.
  - `[low]` `[patch]` (blind) nada fixa o "claro sem mudança" — patch: valores de `lightTheme.custom.layers` fixados em teste (junto com a lacuna do RefreshControl).
  - `[false]` `[reject]` (blind) redação do plano sobre o RefreshControl no claro — correção seria editar o plano desta build; o código cumpre a intenção (spinner tematizado).
  - `[low]` `[reject]` (blind) a sonda de escuro ignora shadowColor/fill/rippleColor e o menu fechado — o menu tem assert dedicado; `shadowColor` é ink por decisão (tokens.ts); ampliar a sonda é complexidade de teste com pouco retorno.
  - `[medium]` `[patch]` (blind) a11y do PrimaryAction: no web não há `busy` e o loading lê como habilitado; `actionName` ignorado; label fixo — a parte do web é regressão real (antes era aria-disabled) → patch `aria-busy` no wrapper web; `actionName` ignorado é falso (só `activate` é declarado); label fixo é baixo e sem caller que precise de override.
  - `[false]` `[reject]` (blind) `jest.config.js` falha em silêncio se o preset mudar — a falha seria alta: o teste do msw quebraria com erro de ESM.
  - `[low]` `[reject]` (blind) sprint-status marca done antes do PR; o plano ficou sem commit — padrão do repo é anotar o PR no fechamento; o plano é commitado no Finalize.
  - `[low]` `[patch]` (blind) a nota do item 21 omite o pin do amarelo do app.json — patch: nota diz que o lock já existia.
  - `[low]` `[reject]` (blind) HUD infla o total se o check-in de um NOT_RETURNING for rejeitado — aluno NOT_RETURNING está na rota, então a rejeição é improvável; a correção exigiria rastrear rejeições na sessão.
  - `[low]` `[reject]` (blind) o teste do handler hardcoda UUIDs do seed — uma mudança de seed quebra alto, não em silêncio; baixo.
  - `[low]` `[reject]` (blind) `track-bus`: `.catch(() => {})` e corrida de dois foregrounds — corrida exige dois foregrounds em ms com resultados diferentes; improvável.
  - `[low]` `[patch]` (verification-gap) `layers.refresh` sem assert em nenhum RefreshControl — patch: tela de rotas sob `darkTheme` com `toMatchObject(layers.refresh)`.
  - `[low]` `[patch]` (verification-gap) pressed do TripLinkRow só verificado como constante — patch: render escuro com `style({ pressed: true })`.
  - `[low]` `[defer]` (verification-gap) "Desfazer" da home do aluno sem teste de caller em loading — disposição do próprio lens.
  - `[false]` `[reject]` (verification-gap, other) AC diz que o claro não muda, mas os papéis MD3 mudam no claro — intencional pelo AI1a; a correção seria editar o plano.
  - `[maybe-false]` `[defer]` (verification-gap, other) a ativação do wrapper nativo por TalkBack/VoiceOver não foi verificada — resolveria: teste em device (AI2).
  - `[medium]` `[patch]` (edge) servidor com mensagem que não é pt-BR (500, guard, throttler) — mesmo defeito do primeiro achado do blind; mesmo patch.
  - `[low]` `[reject]` (edge) `error.message` vindo como array ou vazio — `ApiClientError.message` é string; o filtro da API normaliza para string; improvável.
  - `[low]` `[reject]` (edge) TypeError de bug classificado como rede — improvável; a regex sobre a mensagem do fetch varia por plataforma e seria frágil.
  - `[medium]` `[patch]` (edge) banner velho não ligado à viagem — mesmo defeito do blind; mesmo patch.
  - `[medium]` `[defer]` (edge) 409 TRIP_NOT_ACTIVE no encerrar mantém a tela ativa — pré-existente (o Alert antigo também não invalidava); a mudança só troca o canal.
  - `[medium]` `[patch]` (edge) no web o botão lê habilitado e não ocupado durante a requisição — mesmo defeito do a11y web; mesmo patch.
  - `[false]` `[reject]` (edge) serviços de localização desligados geram loop de re-inscrição — sem loop: com o getter concedido, o `watch` falha uma vez e o `catch` marca negado; o comportamento é o mesmo de antes da mudança.
  - `[low]` `[reject]` (edge) HUD infla com check-in de NOT_RETURNING rejeitado — mesmo motivo da rejeição do blind.
  - `[low]` `[reject]` (edge) sonda escura ignora shadowColor/borderLeft/fill — mesmo motivo da rejeição do blind.
  - `[low]` `[reject]` (edge) caso do AccountMenu renderiza o menu fechado — coberto pelo assert dedicado do menu aberto.
  - `[false]` `[reject]` (edge) `jest.config` silencioso — a falha seria alta (erro de ESM no teste do msw).
  - `[false]` `[reject]` (edge, claim) o claro muda além do RefreshControl — intencional (AI1a: Snackbar sem violeta nos dois temas); a correção é redação do plano.
  - `[medium]` `[patch]` (edge, claim) busy/disabled não chegam ao web — mesmo patch do a11y web.
  - `[low]` `[reject]` (edge, claim) a guarda isenta shadow/scrim/backdrop/disabled — documentado no código com motivo (neutros; mudar os disabled alteraria o claro).
  - `[medium]` `[patch]` (edge, claim) a AC "pt-BR sempre" é violada por erros 5xx e genéricos — mesmo patch do fallback pt-BR.
  - `[false]` `[reject]` (intent) escopo C/A/D (todos os itens, lint da API, os Baixos) — o dono de cada item na retro seleciona a leitura B; 22, 24 e 27 dependem do Lucas.
  - `[maybe-false]` `[defer]` (intent) pin do amarelo não aparece no diff — o lock já existia em `palette.guard.test.ts` (app.json); a nota do item 21 foi corrigida (patch acima).
  - `[maybe-false]` `[defer]` (intent) rastreio incompleto (PR a anotar, plano sem commit) — resolvido no Finalize e na abertura do PR.
  - `[maybe-false]` `[defer]` (intent) as correções só foram exercitadas em Jest, sem Expo Web ou device (R3 web, R4 e R5 nativos, R1 escuro) — resolveria: `pw:e2e` e o dev build do AI2.

## Design Notes

Por que o plano está `oversized`/`multiple-goals`: a lição AI7(a) da retro ainda não foi adotada, e os quatro itens são pequenos e independentes. A mitigação é **um commit por action item** (tema, comportamento, testes, docs), cada um com a suíte verde. Assim a revisão consegue enxergar a fronteira de cada item.

Classificação do erro (esboço):

```ts
const isTransport = !(error instanceof ApiClientError) || error.status === 0
return isTransport ? NETWORK_COPY : error.message
```

## Verification

**Commands (em sequência, Metro parado):**
- `cd mobile && npm test` -- expected: todas as suites verdes (baseline 6.14: ~62+ suites).
- `cd mobile && npm run lint` -- expected: limpo.
- `cd mobile && npx tsc --noEmit` -- expected: só os 3 erros da baseline (scan.tsx, use-trip-gps-capture.test.tsx, tracking-stream.service.test.ts).

**Manual checks:**
- `git diff origin/main --stat -- api/src` vazio.

## Auto Run Result

**Resumo:** rodada de hardening dos action items de Dev da retro do épico 6: AI1 (item 21, coerência do tema escuro + guarda), AI3 (item 23, bugs de comportamento), AI5 (item 25, testes das fronteiras) e AI6 (item 26, docs e rastreio). Um commit por item, mais o commit da revisão e uma correção de tipo. `api/src` intocado.

**Arquivos (principais):**
- `mobile/src/lib/theme.ts` — papéis MD3 do template mapeados à paleta (Snackbar sem violeta), `colors.surface` escuro alinhado, `custom.layers` (overlay/pressed/shimmer/refresh) por esquema.
- `account-menu.tsx`, `confirm-dialog.tsx`, `sticky-action-bar.tsx`, `trip-link-row.tsx`, `skeleton.tsx`, 3 telas com `RefreshControl` — consomem os presets.
- `mobile/src/lib/palette.guard.test.ts` — sem resíduo MD3 em `colors.*`, igualdade de surface Paper/app, contraste do Snackbar e regex de consumo ampliada.
- `components/trip/trip-error.ts` + `app/(driver)/trip.tsx` — Banner de erro em pt-BR (rede, servidor genérico ou mensagem de domínio), ligado ao estado da viagem.
- `app/(student)/track-bus.tsx` — o foreground só consulta a permissão (getter), sem prompt.
- `components/ui/primary-action.tsx` + callers — loading sem cinza; `busy` no wrapper nativo, `aria-busy` no web.
- `utils/trip-boarded-count.ts` — NOT_RETURNING escaneado entra no total.
- `app/(admin)/home.tsx` — Sair = logout + replace.
- Testes novos: `dark-theme-render.test.tsx`, `mocks/handlers/boarding.handlers.test.ts`, `trip-error.test.ts`, `admin-home-screen.test.tsx`; ampliados: `group-layouts`, `trip-screen`, `track-bus-screen`, `primary-action`, `driver-routes-screen`, `trip-boarded-count`.
- `mobile/jest.config.js` — transforma as deps ESM-only do `msw` (`.mjs`, `until-async`).
- Docs: `project-context.md`, `plan-6-6` (done), `plan-6-14` (nota do follow-up), `sprint-status.yaml` (itens 21/23/25/26 done; PR #73).

**Revisão (4 lentes, 38 achados):** 9 patches aplicados em 6 grupos (3 medium: fallback pt-BR para erro de servidor, banner ligado à viagem, `aria-busy` no web; 3 low: asserts do RefreshControl e das layers claras, pressed do TripLinkRow, nota do item 21). 5 itens diferidos (frontmatter `deferred`). 20 rejeitados, cada um com o motivo registrado no Review Triage Log. Depois da revisão, o tsc pegou um erro novo no teste da sonda de pressed (`never` cast), corrigido em `bdbe777`.

**Follow-up recomendado: true.** Foram 3 patches medium e 0 high. Risco nomeado: o banner de erro e o `aria-busy` foram verificados só em Jest; o Expo Web (alvo da AC do banner) e o leitor de tela nativo não foram exercitados. O R4 e o tema escuro nativo dependem do dev build do AI2.

**Verificação (em sequência, Metro parado):** `npm test` → 66 suites / 904 testes verdes (baseline 63 / 833); `npm run lint` limpo; `npx tsc --noEmit` → só os 3 erros da baseline; `git diff origin/main -- api/src` vazio. Aviso intermitente "worker failed to exit gracefully" no Jest completo: não reproduz com o teste do msw isolado (`--detectOpenHandles` limpo) e some ao excluir qualquer um dos dois arquivos novos, então parece flutuação de agendamento de worker e não um handle vazado.

**Riscos residuais:** itens 22 (device), 24 (a11y, decisão do Lucas) e 27 (processo) seguem em backlog. O 409 TRIP_NOT_ACTIVE no encerrar é pré-existente e foi diferido. A mudança no claro se restringe ao Snackbar (sai o violeta) e ao spinner do RefreshControl.
