---
title: 'Story 6.2: componentes base de estado e ação'
type: 'feature'
ticket: '6-2-componentes-base-de-estado-e-acao'
created: '2026-09-26'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
baseline_revision: '4fe97ea204aa2118a057508e376f27abe3c89878'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Os padrões de estado e ação são copiados entre telas. Há três `Loading` idênticos
(scan, student-list, track-bus), além de `Blocked` (scan) e dois `Centered` com espaçamentos,
opacidades e botões diferentes. Não existe botão primário, barra fixa, chip, banner nem diálogo
compartilhados. Com isso, cada redesign das stories 6.3–6.11 teria de reinventar tudo.

**Approach:** Criar `mobile/src/components/ui/` com `Screen`, `PrimaryAction`, `StickyActionBar`,
`StatusChip`, `StateView`, `Skeleton`, `Banner` e `ConfirmDialog`. Eles seguem o DESIGN.md
(Components) e o EXPERIENCE.md (Component Patterns / State Patterns) e usam só os tokens da 6.1.
Depois, trocar as cópias de `Loading`/`Blocked`/`Centered` por `StateView`, com o mesmo texto.

## Boundaries & Constraints

**Always:**
- Nenhum hex/rgb literal nos arquivos novos: cor vem de `useAppTheme()`, `lightPalette` ou `statusTints` (a guarda da paleta varre `src/`).
- Todo texto das telas tocadas fica idêntico, inclusive títulos, detalhes, rótulos de botão e a `note` de erro do scan. Os asserts existentes de Jest seguem verdes sem edição.
- Alvos tocáveis ≥ 48dp (`spacing.touchMin`); `PrimaryAction` primary/secondary/danger/on-color com 56dp (`spacing.actionHeight`).
- Ícones só MDI, pelo prop `icon` do Paper ou por `MaterialCommunityIcons` de `@expo/vector-icons`. Ícones decorativos ficam fora da árvore de acessibilidade.
- Animações (escala 0,97 ao pressionar, shimmer, entrada do Banner) respeitam `useReducedMotion()`. O háptico só dispara com `impact` (`Haptics.selectionAsync`, ignorando falha e o web).
- `StatusChip` lê o mapa `STATUS_PRESENTATION` de `student-card.tsx`, que ganha `mdiIcon` e `accessibilityLabel`: CHECKED_IN `check-circle`/verde, NOT_CHECKED_IN `clock-outline`/neutro, NOT_RETURNING `account-cancel`/âmbar (D-UX-12).
- Comentários novos em inglês, só o porquê.

**Never:**
- Restyle de tela além da troca dos três helpers. `StudentCard` mantém os glifos `✓ — !`, porque `student-list.test.tsx:175-176` os assere e a troca é da 6.7. Os estados inline de `trip.tsx` e `routes.tsx` também ficam (6.5/6.13).
- Adotar `Screen`, `StickyActionBar`, `Banner` ou `ConfirmDialog` em telas existentes: o Banner MD3 de student-list/track-bus, o Dialog do home e o `OfflineBanner` ficam como estão (6.7/6.8/6.10/6.11).
- Atraso de 400ms ou Skeleton no lugar do spinner das telas (6.11).
- Dependência nova ou cor/token novos na paleta.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| StateView loading | `kind="loading" title="Carregando alunos..."` | Spinner + título, sem ação | — |
| StateView com ação | `kind="error"`, `action={label,onPress}` | Ícone `cloud-alert` em círculo, título, detalhe, PrimaryAction 56dp | — |
| StateView sem ação | track-bus "Nenhuma viagem ativa no momento" | Sem botão | — |
| Nota de erro | scan `note=actionError` (string ou null) | Nota em `error` bold só quando é string não-vazia | — |
| PrimaryAction loading | `loading` true, toque duplo | Spinner no lugar do ícone, rótulo mantido, `onPress` não dispara | — |
| Status desconhecido | `StatusChip status` fora do union (cache antigo) | Cai em NOT_CHECKED_IN, como o `StudentCard` | — |
| Reduzir movimento ligado | Press / Skeleton / Banner | Sem escala nem shimmer; o Banner aparece com fade curto ou corte seco | — |

</frozen-after-approval>

## Code Map

- `mobile/src/lib/tokens.ts` -- `typography` (titleLg, bodyLg, label, button…), `spacing` (gutter, touchMin 48, actionHeight 56, contentMaxWidth 560), `radius`, `elevation.level2`, `motion` (press 90, pressScale 0.97, enter 180, standard 200). Só consumir.
- `mobile/src/lib/theme.ts` -- `useAppTheme()` → `colors` + `custom {spacing,radius,motion}`. Só consumir.
- `mobile/src/lib/palette.ts` -- papéis `surfaceSoft`, `surfaceStrong`, `canvas`, `textMuted`, `borderStrong`, `success`, `warning`, `error`, `info`, `onPrimary`; `statusTints.{success,warning,error,info,neutral}`. Não há papéis "container": use os tints.
- `mobile/src/lib/palette.guard.test.ts` -- varre todo `src/`, então hex literal em arquivo novo reprova. Tem render probes de `STATUS_PRESENTATION` (:548-602), que devem continuar verdes com os campos novos, e locks por regex em scan/student-list (:604-642), que não devem ser quebrados ao remover os helpers.
- `mobile/src/components/student-card.tsx:8-25` -- `StatusPresentation`/`STATUS_PRESENTATION`: estender com `mdiIcon` e `accessibilityLabel`, mantendo `icon` (glifo) para o `StudentCard`.
- `mobile/src/app/(driver)/scan.tsx` -- `Loading` :590 (chamadas :366, :407); `Blocked` :601 com `note` (chamadas :347, :371, :386, :418, :430, :443); estilos `centered*`/`action*` :652-670 e :744-755. O container é `#000000` (allowlist).
- `mobile/src/app/(driver)/student-list.tsx` -- `Loading` :335 (:182, :250, :267); `Centered` :346 (:167, :191, :204, :226, :237, :256); estilos :408-434.
- `mobile/src/app/(student)/track-bus.tsx` -- `Loading` :356 (:241); `Centered` :367 com ação opcional (:246, :257); estilos :406-425.
- Testes existentes: `components/student-card.test.tsx` (render sem provider); `student-list.test.tsx:134` (PaperProvider + QueryClient); `track-bus-screen.test.tsx:157,160,177,301`. Não há `renderWithProviders`, e o jest-expo roda sem setup file.
- Reanimated 4.2.1, worklets, `expo-haptics` e safe-area já estão instalados. Hoje nenhum arquivo de `src/` importa reanimated.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/student-card.tsx` -- adicionar `mdiIcon` e `accessibilityLabel` ao `STATUS_PRESENTATION` -- fonte única do StatusChip.
- [x] `mobile/src/components/ui/primary-action.tsx` -- NEW `PrimaryAction {label, onPress, icon?, variant: primary|secondary|danger|on-color|quiet, loading?, disabled?, impact?, testID?}` sobre o `Button` do Paper, com escala via Reanimated e háptico em `impact`.
- [x] `mobile/src/components/ui/state-view.tsx` -- NEW `StateView {kind, title, detail?, icon?, note?, action?}`. Ícones default: error `cloud-alert`, blocked `lock-outline`, empty `information-outline`. Círculo de 88dp em `surfaceStrong` com ícone de 48dp; loading usa spinner. Centralizado, fundo `surfaceSoft`.
- [x] `mobile/src/components/ui/screen.tsx` -- NEW `Screen {variant: scroll|fixed, footer?, refreshControl?}` com safe area (edges sem top, porque o header nativo cobre), fundo `surfaceSoft`, gutter e `maxWidth` 560 centralizado.
- [x] `mobile/src/components/ui/sticky-action-bar.tsx` -- NEW faixa `canvas` com `elevation.level2`, padding 16 + inset inferior, 1–2 filhos empilhados; escondida enquanto o teclado está aberto (`Keyboard` listeners).
- [x] `mobile/src/components/ui/status-chip.tsx` -- NEW pílula de 32dp, ícone de 18dp + rótulo `label`. Aceita `status: BoardingStatus` (via mapa, com fallback) ou `{label, icon, tone}` genérico para os chips de viagem da 6.5.
- [x] `mobile/src/components/ui/skeleton.tsx` -- NEW bloco `surfaceStrong` `radius.sm` com `width/height` e shimmer em loop de 1,2s; oculto para acessibilidade.
- [x] `mobile/src/components/ui/banner.tsx` -- NEW `Banner {tone: warning|info|error, message, action?}` com ícone, texto `body` e ação `quiet`. Entrada com slide de 12dp + fade de 200ms; `accessibilityLiveRegion="polite"`.
- [x] `mobile/src/components/ui/confirm-dialog.tsx` -- NEW Dialog do Paper em `Portal` `{visible, title, message, confirmLabel, onConfirm, onDismiss, destructive?, loading?}`. "Voltar" `quiet` e confirmação `primary` (ou `danger`), ambas ≥ 48dp.
- [x] `mobile/src/components/ui/*.test.tsx` -- NEW, um por componente, com render dentro de `PaperProvider theme={lightTheme}`. Cobrir todos os estados/variantes/tons, a matriz de I/O, a altura mínima (style) e o contraste AA dos pares texto×fundo do StatusChip e do Banner (âmbar aceito com ícone, D3 da 1.11).
- [x] `mobile/src/app/(driver)/scan.tsx`, `(driver)/student-list.tsx`, `(student)/track-bus.tsx` -- trocar `Loading`/`Blocked`/`Centered` por `StateView` (`kind` por semântica: acesso/viagem de outro/sem viagem → blocked; falha de carga → error; sem viagem ativa no track-bus → empty). Apagar os helpers e os estilos órfãos.

**Acceptance Criteria:**
- Given a suíte Jest, when rodo `npm test`, then todos os testes existentes passam sem editar asserts de tela, e cada componente de `ui/` tem teste de render cobrindo seus estados.
- Given scan, student-list e track-bus, when faço grep por `function Loading|function Centered|function Blocked`, then não há resultado.
- Given `src/components/ui/`, when a guarda da paleta roda, then não há hex/emoji e a allowlist fica inalterada.

## Implementation Notes

- Reanimated no Jest: o render real falha ("Native part of Worklets doesn't seem to be initialized"). Criado `mobile/jest.setup.js` (em `setupFiles` do `jest.config.js`) com os mocks oficiais `react-native-worklets/src/mock` e `react-native-reanimated/mock`; o mock oficial não traz `useReducedMotion` ("ADD ME IF NEEDED"), então ele entra como `jest.fn(() => false)`, que os testes trocam para `true`.
- Helpers novos em `ui/`: `mdi-icon.tsx` (tipo `MdiIconName` + ícone MDI fora da árvore de acessibilidade, usado por todos os componentes e pelo tipo de `mdiIcon` do `STATUS_PRESENTATION`) e `test-utils.tsx` (`renderUi` com PaperProvider `lightTheme` + SafeAreaProvider e flush do `setState` assíncrono da fonte do ícone; `contrastRatio` compondo o tinte sobre o canvas).
- `PrimaryAction` ganhou o prop opcional `color`: é a cor do rótulo em `on-color` (tom do overlay) e em `quiet` (ação do Banner `error`, branca sobre o vermelho).
- Cores e tipografia vêm direto de `lightPalette`/`statusTints`/`tokens` e não de `useAppTheme().custom`: `track-bus-screen.test.tsx` renderiza sem PaperProvider, e aí o tema default do Paper não tem `custom`.
- `StateView` loading mostra o título em `body-lg` `muted` (legenda do spinner), não em `title-lg`.
- Ícones por tela: scan permissão `camera`, câmera bloqueada `camera-off`, track-bus vazio `bus-clock` (State Patterns); os demais usam o default do `kind`.
- Banner: `warning`/`info` usam o tinte com texto tinta; `error` segue o `banner-error` do DESIGN (vermelho chapado com texto `onPrimary`).
- ConfirmDialog: com `loading`, "Voltar" e o dismiss por fora ficam inertes; o háptico `impact` acompanha `destructive`.
- `tsc --noEmit` mostra 3 erros que já existiam antes, em código não alterado: `scan.tsx:316` (`user` possivelmente null dentro do callback), `use-trip-gps-capture.test.tsx:92` e `tracking-stream.service.test.ts:172`.

- Auditoria da matriz (step 3): a linha "Reduzir movimento" não tinha teste para o Press. Entraram em `primary-action.test.tsx` dois testes: escala 0,97→1 via spy em `withTiming`, e sem `withTiming` com reduced motion. Suíte: 40 suítes / 472 testes verdes.

- Correções da revisão: `STATUS_PRESENTATION` foi para `src/lib/boarding-status.ts` (o `student-card` reexporta) para o `ui/` não depender de componente de feature; o StatusChip quebra linha em vez de truncar (fontScale 2.0); os estados "Nenhuma viagem ativa" de scan e student-list usam o ícone `bus-clock`; o `PrimaryAction` não escala enquanto está inerte e volta a 1 com movimento reduzido; o `StickyActionBar` nasce escondido se o teclado já está aberto; o `style` do Skeleton aceita `StyleProp`. Novos testes de tela: `src/scan-screen.test.tsx` e casos de StateView em student-list e track-bus.

## Plan Change Log

## Review Triage Log

### Passada 1 (lentes: blind-hunter, edge-case-hunter, verification-gap, intent-alignment)

Contagem: 0 high, 5 medium, 16 low, 4 false, 0 maybe-false. Sem intent_gap/bad_plan: 13 patch, 1 defer, o resto rejeitado.

| # | Lente | Achado | Veredito | Rota / evidência |
|---|---|---|---|---|
| 1 | verification-gap + blind | scan sem teste de tela: os 7 `StateView` (note de permissão, `openSettings`, logout antes do replace) podem regredir com a suíte verde | medium | patch: `scan-screen.test.tsx` só com os estados pré-câmera |
| 2 | verification-gap | student-list: bloqueado/erro/`DRIVER_NOT_ASSIGNED` nunca renderizados no teste | medium | patch: 2–3 casos em `student-list.test.tsx` |
| 3 | verification-gap | track-bus: retry do estado de erro sem teste | medium | patch: 1 caso em `track-bus-screen.test.tsx` |
| 4 | verification-gap + blind | Entrada do Banner não observada: sem o `useEffect`, o banner fica em opacidade 0 e os testes passam | medium | patch: spy em `withTiming` (1, `motion.standard` / `motion.reduced`). 200ms é o valor do EXPERIENCE, então `motion.enter` não se aplica |
| 5 | blind | `StatusChip` (ui/) importa o mapa de `student-card` (feature). Na 6.7, o `StudentRow` renderiza o chip e isso vira ciclo | medium | patch: mover o mapa para `lib/boarding-status.ts`, com `student-card` reexportando |
| 6 | blind + edge | `PrimaryAction` escala ao pressionar com `loading`/`disabled`, sugerindo que o toque valeu | low | patch: `pressTo` ignora quando `inert` |
| 7 | edge | Reduced motion ligado entre pressIn e pressOut deixa o botão preso em 0,97 | low | patch: com reduced motion, `scale.value = 1` sem animar |
| 8 | blind | Teste de reduced motion restaura o mock inline; se falhar, vaza para os testes seguintes | low | patch: restauração em `afterEach` |
| 9 | blind + edge | `StatusChip` com `numberOfLines={1}` + `flexShrink: 0` trunca ou estoura o único texto em fontScale 2.0 (piso de acessibilidade do EXPERIENCE) | low | patch: remover `numberOfLines`, `flexShrink: 1`, `maxWidth: '100%'` |
| 10 | blind | "Nenhuma viagem ativa" do motorista (scan/lista) mostra cadeado, que sugere permissão | low | patch: `icon="bus-clock"` nesses dois `StateView`, como no track-bus |
| 11 | blind | `Skeleton.style` tipado `ViewStyle`, não aceita arrays/condicionais | low | patch: `StyleProp<ViewStyle>` |
| 12 | edge | `StickyActionBar` montada com o teclado já aberto fica visível até o próximo evento | low | patch: `useState(() => Keyboard.isVisible())` |
| 13 | verification-gap + blind | Teste "shimmers" não detecta shimmer que nunca começa; título do teste do ConfirmDialog promete o `danger` que não verifica | low | patch: spy `withRepeat`/`withTiming` no Skeleton; renomear o teste |
| 14 | blind | `StateView` não anuncia a troca loading → erro ao leitor de tela | low | defer: os helpers antigos também não anunciavam (pré-existente); entra na 6.11 |
| 15 | blind + edge | Banner sem anúncio no iOS (`accessibilityLiveRegion` é só Android) | low | rejeitado: não há build iOS (6.1); no web o RN mapeia para `aria-live` |
| 16 | blind | `Screen` sem opção de inset no topo para telas sem header | low | rejeitado: nenhum consumidor hoje; a correção adiciona parâmetro (a 6.4 decide com o hero full-bleed) |
| 17 | blind | Sem teste de teardown dos listeners do teclado; o scroll de `Screen` sem `KeyboardAvoidingView` | low | rejeitado: nenhum consumidor; KAV é decisão de tela (6.4) |
| 18 | blind | `jest.setup.js` usa o caminho privado `react-native-worklets/src/mock`; `test-utils` fica em `ui/` | false | É o caminho que a doc do Reanimated 4 manda mockar (`node_modules/react-native-worklets/src/mock.ts`); `test-utils` não é alcançável pelo bundle do Router e passa na guarda; nenhum dano nomeado |
| 19 | edge | `refreshControl` descartado em silêncio com `variant="fixed"` | low | rejeitado: improvável; a correção exige uma união discriminada no tipo público |
| 20 | edge | `ConfirmDialog` não permite háptico em confirmação não destrutiva ("Não vou voltar" na 6.8) | low | rejeitado: sem consumidor; a 6.8 adiciona o prop `impact` quando precisar |
| 21 | edge | `contrastRatio` ignora alpha de `#rrggbbaa` | false | `withAlpha` devolve `rgba()` (`palette.ts:16-23`), que o parser trata; nenhum token é hex de 8 dígitos |
| 22 | edge | `mdi-icon.tsx` sem teste próprio | false | O AC cobre os 8 componentes; `MdiIcon` é helper, e o ocultamento de acessibilidade é assertado em Banner/StatusChip/StateView |
| 23 | intent | Leituras R2 (Skeleton/400ms/PermissionCard nas telas) e R4 (adotar os demais componentes) não implementadas | low | rejeitado: excluídas pelo **Never** do bloco congelado, aprovado pelo usuário; a 6.11 tem o Skeleton no AC (epics.md) |
| 24 | intent | Visual dos estados migrados muda (círculo, cor muted, 56dp, fundo `surfaceSoft` no scan) | false | O intent pede "mesmo texto", e o texto é idêntico; o visual novo é o objetivo do StateView |
| 25 | blind | Testes do chip usam `32`/`9999` literais | low | rejeitado: cosmético |

## Design Notes

**Reanimated no Jest:** como nada em `src/` importa reanimated hoje, confirme primeiro que um render
com `useSharedValue`/`useAnimatedStyle` passa sob o jest-expo. Se falhar, configure o mock oficial
(`react-native-reanimated/mock` ou o setup do worklets) no `jest.config.js`, sem trocar para `Animated`.

**Por que o StudentCard fica com glifos:** o AC da 6.2 pede que o `StatusChip` *mapeie* os estados;
a substituição visual na lista é o `StudentRow` da 6.7. Estender o mapa em vez de duplicá-lo
mantém uma fonte única (EXPERIENCE → StatusChip).

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: suíte toda verde (guarda incluída)
- `cd mobile && npm run lint && npx tsc --noEmit` -- expected: 0 erros novos
- `cd mobile && grep -rnE "function (Loading|Centered|Blocked)" src/app` -- expected: vazio

**Manual checks:**
- Expo Web + Playwright com mocks: capturas dos estados bloqueado/erro de student-list e track-bus (vazio), conferindo texto idêntico e ação de 56dp.
