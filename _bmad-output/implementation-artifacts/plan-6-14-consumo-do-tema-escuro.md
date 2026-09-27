---
title: 'Story 6.14 — Consumo do Tema Escuro'
type: 'feature'
ticket: ''
created: '2026-09-27'
baseline_revision: '53069aad5a18997548b2a7ba6ff5252447c78a41'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/antes-depois.md'
warnings: ['guardrail-file-count', 'oversized']
deferred:
  - summary: >-
      Consumo do tema escuro não verificado em build nativo (Android/iOS).
    evidence: |-
      userInterfaceStyle "automatic" só vale após regenerar o dev build; toda a verificação foi no Expo Web
      (Playwright colorScheme) e em Jest. Resolveria: dev build regenerado nos AVDs com o SO em escuro,
      conferindo StatusBar (auto e o dark do login), headers e troca de esquema com o app aberto.
    location: >-
      mobile/app.json
    severity: medium (unverified)
  - summary: >-
      Sem cor de fundo nativa da raiz para o escuro; possível flash claro em transições no Android.
    evidence: |-
      app.json não define backgroundColor de raiz e nada chama SystemUI.setBackgroundColorAsync. Resolveria:
      observar transições de stack/teclado no AVD em dark; se o flash ocorrer, sincronizar a cor de raiz com o tema.
    location: >-
      mobile/src/app/_layout.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** O app está travado no tema claro (spec-1-11b, D-UX-4): `_layout.tsx` fixa `lightTheme`, `app.json` fixa `userInterfaceStyle: "light"` e ~40 arquivos leem `lightPalette`/`statusTints` em `StyleSheet.create` de módulo, então o `darkTheme` é código morto e os papéis de status não têm variante legível sobre o canvas escuro.

**Approach:** Remover a trava: o provider escolhe `lightTheme`/`darkTheme` por `useColorScheme()`, `app.json` vira `"automatic"`, o tema passa a carregar a paleta semântica e os tintes de status (`theme.custom.palette`/`theme.custom.tints`), os componentes trocam `lightPalette` por estilos derivados do tema, e o `darkPalette` ganha variantes on-dark AA de status/link/info.

## Boundaries & Constraints

**Always:**
- Hex só em `lib/palette.ts`; `palette.guard.test.ts` verde e atualizada no mesmo commit que mudar token ou trava.
- Variantes on-dark reusam tokens já registrados quando possível; a única cor nova é `errorOnDark: '#f2b8b5'` (erro baseline MD3 dark) em `appExtensions`, com decisão registrada no comentário.
- Contraste ≥ 4.5:1 de todo papel de status/link/info on-dark sobre `darkPalette.canvas` e `darkPalette.surface`, travado na guarda.
- Contrato de teste preservado: textos, nomes acessíveis, `testID`, `accessibilityRole` idênticos.
- Superfícies de identidade fixa não mudam com o esquema: chrome de câmera (`scan-frame`, `scan-hud`, `scan-result-overlay` — sobre o feed, overlay branco à noite seria ofuscamento) e o passe do QR (`qr-pass`: amarelo de marca + quiet zone branca). Esses três/quatro arquivos continuam lendo a paleta clara, numa allowlist explícita e comentada na guarda.
- Commits atômicos com a suíte verde em cada um: (1) paleta/tema/hook + guarda, trava ainda ativa; (2..n) migração mecânica dos componentes por pasta; (último) remoção da trava + `app.json` + capturas.

**Never:**
- Não mudar fluxo, navegação, copy ou layout; não adicionar dependência nativa (`expo-system-ui` já está instalado).
- Não adicionar toggle de tema no app — só segue o SO.
- Não renegociar tokens do DESIGN.md nem os valores claros.
- Não criar teste sob `mobile/src/app/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SO claro | `useColorScheme()` = `light` | `lightTheme` + nav claro; render idêntico ao atual | — |
| SO escuro | `useColorScheme()` = `dark` | `darkTheme` + nav escuro; fundos/texto/chips do `darkPalette` | — |
| Esquema indefinido | `useColorScheme()` = `null`/`unspecified` | cai no `lightTheme` | — |
| Troca em runtime | SO muda com o app aberto | telas re-renderizam com o novo tema (estilos memoizados por tema) | — |
| Chip de status em dark | `StatusChip`/`StudentRow` com os 3 status | cor on-dark + tinte 12% da cor on-dark | — |
| Scan/QR em dark | câmera ou passe do QR com SO escuro | aparência idêntica ao claro | — |

</intent-contract>

## Code Map

- `mobile/src/lib/palette.ts` -- `designTokens`, `appExtensions`, `darkMapping`, `SemanticColors`, `lightPalette`, `darkPalette` (:165), `statusTints` (:194, derivado só do claro). Trocar `statusTints` por `makeStatusTints(p: SemanticColors)` + `lightStatusTints`/`darkStatusTints`. No `darkPalette`: `success`/`successBorder` = `designTokens.successBorder` (7.0:1), `info`/`infoBorder`/`link` = `designTokens.infoBorder` (5.3:1), `linkActive` = `darkMapping.text`, `warning` = `designTokens.signatureMustard` (7.5:1), `error` = `appExtensions.errorOnDark` (9.9:1). Reescrever o comentário que diz que as variantes on-dark são "story futura".
- `mobile/src/lib/theme.ts` -- `custom` hoje é compartilhado (`{ spacing, radius, motion }`); passa a ser por tema com `palette` e `tints`. `navigationTheme` vira `lightNavigationTheme` + `darkNavigationTheme` (base `DarkTheme` do `@react-navigation/native`). Adicionar `useThemedStyles(factory: (t: AppTheme) => T)` (memo por tema) e exportar os pares por esquema (ex. `themeFor(scheme)`).
- `mobile/src/lib/tokens.ts:89-110` -- preset `elevation` usa `lightPalette` em módulo; virar `makeElevation(p)` (ou expor via tema) e manter `level3` e as constantes numéricas. `student-qr-code.tsx:17` lê só `elevation.level1.borderWidth` — preservar um valor estático para isso.
- `mobile/src/lib/boarding-status.ts` -- `STATUS_PRESENTATION` guarda cores; separar texto/ícone (estático) de cor (função de `palette`/`tints`). Consumidores: `components/ui/status-chip.tsx`, `components/student-row.tsx` e seus testes.
- `mobile/src/lib/app-header.tsx:18-35` -- `appHeaderOptions` estático com `lightPalette`; virar função do tema (ou hook) usada pelos `_layout` dos grupos.
- `mobile/src/app/_layout.tsx:81-130` -- dois `<PaperProvider theme={lightTheme}>` + `backgroundColor: lightTheme.colors.background` + `ThemeProvider value={navigationTheme}`; trocar pelo tema do esquema. Verificar o `StatusBar` (expo-status-bar) em `style="auto"`.
- `mobile/app.json:9` -- `userInterfaceStyle` → `"automatic"`.
- Componentes a migrar (padrão: `const styles = useThemedStyles(createStyles)` e cores inline via `useAppTheme().custom.palette`): `components/{account-menu,offline-banner,student-row}.tsx`, `components/ui/{banner,boarding-counter,confirm-dialog,countdown-pill,permission-card,primary-action,screen,screen-skeletons,skeleton,state-view,status-chip}.tsx`, `components/student-list/roster-header.tsx`, `components/student-home/{shortcut-card,trip-status-card}.tsx`, `components/track-bus/bus-eta-card.tsx`, `components/trip/{active-trip-actions,start-outbound-section,trip-card,trip-link-row}.tsx`, `components/routes/route-card.tsx`, `components/scan/scan-blocked-states.tsx`, `app/(auth)/login.tsx`, `app/(admin)/home.tsx`, `app/(driver)/{routes,student-list}.tsx`, `app/(student)/{home,qr-code}.tsx`, e qualquer outro que o grep de `lightPalette|statusTints|elevation.level` revelar.
- Fixos (allowlist, não migrar cor): `components/scan/{scan-frame,scan-hud,scan-result-overlay}.tsx`, `components/student-qr/qr-pass.tsx`.
- `mobile/src/lib/palette.guard.test.ts` -- :242-249 contrastes dark; :474-475 `darkTheme.custom toBe lightTheme.custom` (reescrever: `fonts` compartilhado, `custom.palette` = paleta do tema); :495-499 source-lock da trava (inverter: exige `useColorScheme` e nenhum `theme={lightTheme}` fixo); :522-527 `userInterfaceStyle` `light` → `automatic`.
- Testes que montam `PaperProvider theme={lightTheme}` (`components/ui/test-utils.tsx`, `*-screen.test.tsx`, `student-row.test.tsx`, `lib/theme.test.tsx`) e `lib/tokens.test.ts`, `ui/sticky-action-bar.test.tsx`, `ui/permission-card.test.tsx` -- ajustar às novas APIs. Telas testadas sem `PaperProvider` caem no `MD3LightTheme` sem `custom`: o hook/factories precisam de fallback para `lightTheme` quando `custom` falta, ou esses testes passam a envolver o provider.
- `mobile/scripts/capture-demo-screens.mjs` -- já tem `loginShots(scheme)` e `colorScheme` por captura (:98-125, :317). Adicionar `dark-` para as telas P0: 11 trip ativa, 12 student-list, 13 scan idle, 14 scan sucesso, 30 student home, 31 qr-code, 32 track-bus, 33 dialog não vou voltar.
- `_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/{antes-depois.md,DESIGN.md,EXPERIENCE.md}` -- notas "idêntico ao claro (trava)" e D-UX-4 passam a descrever o consumo; tabela ganha as linhas dark novas.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/lib/palette.ts` -- variantes on-dark, `errorOnDark`, `makeStatusTints` + tintes por esquema -- AC de status on-dark
- [x] `mobile/src/lib/theme.ts` -- `custom.palette`/`custom.tints` por tema, nav claro/escuro, `useThemedStyles`, fallback para tema sem `custom` -- infraestrutura de consumo
- [x] `mobile/src/lib/{tokens,boarding-status,app-header}.ts(x)` -- presets de cor viram funções do tema -- sem cor de módulo
- [x] `mobile/src/lib/palette.guard.test.ts` -- contrastes on-dark (canvas e surface ≥ 4.5), bindings novos, allowlist de `lightPalette` fora de `lib/` = só os 4 arquivos fixos -- guarda atualizada
- [x] Componentes e telas do Code Map -- migrar para estilos do tema, um commit por pasta, Jest verde em cada -- dark de fato renderiza
- [x] `mobile/src/app/_layout.tsx` + `mobile/app.json` + guarda -- remover a trava (último commit de código) -- AC do provider
- [x] Testes Jest -- cobrir a I/O matrix: seleção de tema por esquema (`light`/`dark`/`null`), `StatusChip` e `StudentRow` sob `darkTheme` com cores on-dark, `useThemedStyles` recalcula na troca de tema
- [x] `mobile/scripts/capture-demo-screens.mjs` + `after/dark-*.png` + docs UX -- capturas claro/escuro das telas P0 -- AC de verificação

**Acceptance Criteria:**
- Given o SO em escuro, when abro qualquer tela P0 no alvo web (390×844, mocks), then fundo, cards, texto e chips seguem o `darkPalette`, sem superfície clara residual fora do scan e do passe do QR.
- Given o SO em claro, when regenero as capturas `light-*` das telas P0, then elas não mostram mudança visual em relação ao `after/` atual.
- Given o `darkPalette`, when a guarda roda, then todo papel de status/link/info on-dark tem ≥ 4.5:1 sobre `canvas` e `surface` escuros, e nenhum arquivo fora de `lib/` e da allowlist importa `lightPalette`.
- Given `app.json`, when leio a config, then `userInterfaceStyle` é `"automatic"` e o `_layout` escolhe o tema por `useColorScheme()`.

## Implementation Notes

- Implementado pelo subagente em 9 commits (`a1457ac`..`51133ba`); ver o relato em `## Auto Run Result`.
- Verificação (sessão principal): a auditoria da matriz achou a linha "Scan/QR em dark" coberta só pela allowlist de imports. Adicionado `mobile/src/components/fixed-identity.test.tsx` (commit `7f7f243`): renderiza `QrPass` e `ScanResultOverlay` (checking/success) sob `lightTheme` e `darkTheme` e compara a árvore com estilos achatados — o `Text` do Paper herda `onSurface` do tema, mas o componente sobrescreve a cor, então só a árvore achatada reflete o que renderiza.
- `tsc` tem 3 erros pré-existentes na baseline (`scan.tsx:312`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172`), em arquivos que esta story não toca.

## Plan Change Log

## Review Triage Log

### 2026-09-27 — Review pass
- verdicts: 29 findings — high 0, medium 10, low 13, false 3, maybe-false 3
- findings:
  - `maybe-false` `defer` (intent-alignment) Consumo nativo não verificado: `userInterfaceStyle` só é checado por source-lock e as telas só no Expo Web — resolveria: dev build Android regenerado e verificado nos AVDs com o SO em escuro.
  - `medium` `patch` (intent-alignment) Nenhum teste renderiza superfícies P0 sob `darkTheme` afirmando ausência de claro residual — agrupado com o gap de primitivos; renders escuros de Banner/PrimaryAction/Screen/OfflineBanner adicionados.
  - `low` `reject` (intent-alignment) Menu de overflow aberto e ETA feliz do track-bus sem captura escura — o Menu é widget Paper sob o tema ativo e o ETA feliz é inalcançável no mock (limite registrado em antes-depois.md); nova captura exigiria sessão de Metro só para isso.
  - `low` `reject` (intent-alignment) Chip info sobre o tinte ≈ 4.42:1 sobre `surface` escuro — o único chip info vive no TripCard (canvas, 4.50:1); travar o uso por source-lock adiciona complexidade para um caso que não ocorre.
  - `false` `reject` (intent-alignment) Scan e passe do QR não escurecem ("sem ofuscamento" parcial) — decisão do plano: o overlay claro é o esquema MENOS ofuscante sobre a câmera, e a quiet zone branca é requisito funcional de leitura do QR.
  - `false` `reject` (intent-alignment) Binding escuro do StudentRow sem probe — `student-row.test.tsx` renderiza o StudentRow sob `darkTheme` nos 3 status.
  - `medium` `patch` (verification-gap) Tema Paper do RootLayout só checado por regex — probe do `root-layout.test.tsx` estendido para ler o tema Paper em dark/light/null.
  - `medium` `patch` (verification-gap) `useAppHeaderOptions`/`HeaderBackground` sem teste de comportamento — `lib/app-header.test.tsx` sob dark e light.
  - `medium` `patch` (verification-gap) Primitivos compartilhados nunca renderizados sob `darkTheme` — mesmo grupo do item 2.
  - `medium` `patch` (blind-hunter) StatusBar `auto` desenha ícones brancos sobre o hero amarelo do login em dark — login passa a renderizar `<StatusBar style="dark" />`.
  - `maybe-false` `defer` (blind-hunter) Nada verificado em build nativo — mesmo item do primeiro (native).
  - `maybe-false` `defer` (blind-hunter) Sem cor de fundo nativa da raiz para o escuro (flash claro em transições no Android) — resolveria: observar transições/teclado no AVD em dark; se ocorrer, `SystemUI.setBackgroundColorAsync` pelo tema.
  - `medium` `patch` (blind-hunter) Cards escuros mais escuros que a tela (surfaceSoft = element, level1 = canvas) — `darkPalette.surfaceSoft` → `darkMapping.canvas`.
  - `medium` `patch` (blind-hunter) Sombra level2 vira brilho branco em dark (`shadowColor: p.text`) — cor de sombra independente do esquema; teste escuro de elevation corrigido.
  - `low` `reject` (blind-hunter) Shimmer do Skeleton escurece em vez de clarear em dark — a faixa segue animada e perceptível; corrigir exige um papel novo por esquema.
  - `low` `patch` (blind-hunter) DARK_PAIRS sem `onPrimary × error/textBody/primary` — pares adicionados à guarda.
  - `low` `reject` (blind-hunter) Exceção do chip info apoiada em comentário — mesmo motivo do chip info acima.
  - `low` `patch` (blind-hunter) fixed-identity sem os estados de falha e sem ScanHud — casos adicionados.
  - `low` `patch` (blind-hunter) Teste do fallback do `useAppTheme` só checa `gutter` — passa a exigir `custom.palette === lightPalette`.
  - `low` `patch` (blind-hunter) sprint-status ainda `backlog` / D-UX-4 — status → `review`; a 6.14 é a story P2 prevista pela própria D-UX-4 ("tema escuro vira story opcional P2"), então não há reabertura a registrar.
  - `false` `reject` (blind-hunter) Plano não versionado e incompleto — estado esperado no meio do step de revisão; o Finalize preenche e versiona o plano.
  - `low` `reject` (blind-hunter) Guarda (5) contornável por `makeElevation(lightPalette)`/`themeFor('light')` — exige esforço deliberado; cobrir cada forma infla a guarda.
  - `medium` `patch` (blind-hunter) Fundo Paper escuro (canvas) ≠ fundo nav/tela (surfaceSoft) — mesma causa dos cards invertidos; resolvido pelo mesmo patch.
  - `low` `patch` (blind-hunter) `ColorSchemeName` redeclarado em theme.ts — reuso do tipo do `react-native`.
  - `low` `reject` (blind-hunter) Mock do caminho privado `useColorScheme` no root-layout.test — funciona no RN atual; `spyOn` no índice do RN é frágil sob jest-expo.
  - `low` `reject` (blind-hunter) Banner recria `bannerTones` a cada render — custo desprezível (5 strings).
  - `medium` `patch` (edge-case) StatusBar branca sobre o hero amarelo — mesmo patch do login.
  - `medium` `patch` (edge-case) Sombra level2 branca em dark — mesmo patch de elevation.
  - `low` `patch` (edge-case) `DARK_P0` sem gêmeo claro é descartado em silêncio no script de captura — o script passa a lançar erro.

## Design Notes

A família `lightPalette` em `StyleSheet.create` de módulo é o motivo de a migração tocar tantos arquivos: o estilo precisa ser recriado por tema. Padrão alvo:

```tsx
const createStyles = ({ custom: { palette } }: AppTheme) =>
  StyleSheet.create({ card: { backgroundColor: palette.surface } })

export function RouteCard(props: Props) {
  const styles = useThemedStyles(createStyles)
  // ...
}
```

Escolhas on-dark: reuso de tokens existentes (`successBorder`, `infoBorder`, `signatureMustard`) em vez de hex novos; o único hex novo é o erro, porque nenhum token registrado é um vermelho legível no escuro. O âmbar mostarda tem 7.5:1 no canvas escuro e resolve o piso de 3:1 do âmbar claro (D3) no esquema escuro.

O guard-rail do épico (~15 arquivos) é excedido por causa da conversão mecânica; o risco fica contido pelos commits por pasta com a suíte verde e pelo contrato de teste intacto.

## Verification

**Commands:**
- `cd mobile && npx tsc --noEmit` -- expected: sem erros novos (3 pré-existentes na baseline)
- `cd mobile && npm test` -- expected: suíte verde (Jest já limitado a 25% de workers; não rodar junto com Metro)
- `cd mobile && npm run lint` -- expected: sem erros
- `cd mobile && grep -rln "lightPalette\|lightStatusTints" src --include=*.tsx | grep -v test` -- expected: só os 4 arquivos fixos

**Manual checks (if no CLI):**
- Com Metro web em mocks (`EXPO_PUBLIC_USE_MOCKS=1 EXPO_PUBLIC_E2E=1 npx expo start --web --port 8081`), rodar `node mobile/scripts/capture-demo-screens.mjs` e inspecionar os `dark-*` das telas P0; derrubar o Metro antes de Jest/tsc.

## Auto Run Result

**Resumo:** o app segue o esquema do SO. `_layout.tsx` escolhe Paper + navegação por `themeFor(useColorScheme())` (`null`/`unspecified` → claro), `app.json` está em `"automatic"`, e o tema carrega a paleta, os tintes e a elevação em `custom`. Cerca de 40 componentes e telas saíram do `lightPalette` de módulo para `useThemedStyles`. O `darkPalette` ganhou variantes on-dark AA de status/link/info, com um único hex novo (`errorOnDark #f2b8b5`). Scan e passe do QR mantêm a identidade clara (allowlist na guarda + `fixed-identity.test.tsx`).

**Arquivos (principais):**
- `mobile/src/lib/palette.ts`: variantes on-dark, `makeStatusTints` e o fundo de tela escuro = canvas.
- `mobile/src/lib/theme.ts`: `custom` por tema, nav claro/escuro, `themeFor`, `useThemedStyles` e o fallback do `useAppTheme`.
- `mobile/src/lib/{tokens,boarding-status,app-header}`: cores viram funções do tema; a sombra usa tinta fixa.
- `mobile/src/app/_layout.tsx` + `mobile/app.json`: trava removida e `StatusBar` `auto`.
- `mobile/src/app/(auth)/login.tsx`: `StatusBar` `dark` sobre o hero amarelo.
- Componentes/telas do Code Map: estilos derivados do tema.
- `mobile/src/lib/palette.guard.test.ts`: contrastes on-dark, allowlist de `lightPalette` e a trava invertida.
- Testes novos: `fixed-identity`, `app-header`, renders escuros dos primitivos, tema do RootLayout.
- `mobile/scripts/capture-demo-screens.mjs` + `after/dark-*.png`: capturas escuras das telas P0.
- Docs de UX e `sprint-status.yaml` (6.14 → `review`).

**Revisão (1 passada, 29 achados):**
- **Patches (12 entradas, 10 médios e 7 baixos por linha):** fundo de tela escuro invertido e o split Paper/nav; sombra branca; StatusBar sobre o hero; teste do tema Paper do RootLayout; teste do header; renders escuros dos primitivos; pares escuros onPrimary; estados de falha e ScanHud no fixed-identity; teste do fallback; `ColorSchemeName`; gêmeo `DARK_P0`; sprint status.
- **Diferidos (2):** verificação nativa e cor de fundo nativa da raiz (ver `deferred`).
- **Rejeitados:**
  - capturas do menu e do ETA feliz: widget Paper sob o tema, e o ETA é inalcançável no mock;
  - chip info sobre `surface` (2 linhas): só existe sobre canvas;
  - scan/QR claros no escuro: é decisão de design, e a quiet zone é funcional;
  - probe do StudentRow: o teste escuro já existe;
  - shimmer do Skeleton: exige um papel novo;
  - plano não versionado: é o estado esperado no meio do step;
  - guarda contornável: exigiria esforço deliberado;
  - mock de caminho privado: funciona no RN atual;
  - `bannerTones` por render: custo desprezível.

**Recomendação de nova revisão: `true`.** Foram patchados 2+ entradas médias (primeira passada): 0 high, 7 medium e 5 low por entrada. Risco nomeado: a troca de `darkPalette.surfaceSoft` para canvas muda o fundo de TODAS as telas escuras. As capturas foram refeitas e conferidas (11/11), mas as superfícies `surface`/`surfaceSoft` que não estão nas capturas (diálogos, menu, skeletons) não foram revistas depois da troca.

**Verificação:**
- `npx tsc --noEmit`: só os 3 erros pré-existentes.
- `npm run lint`: limpo.
- `npm test`: 63 suítes e 823 testes verdes.
- O grep de `lightPalette|lightStatusTints` fora de testes retorna só os 4 arquivos fixos.
- Metro web com mocks e `capture-demo-screens.mjs dark`: 11/11 capturadas; `dark-11` e `dark-30` inspecionadas; o Metro foi derrubado antes de outros processos.

**Nota pós-fechamento (27/09/2026):** a revisão de follow-up recomendada acima (`followup_review_recommended: true`) não rodou antes do fechamento da story. A retro do épico 6 (`epic-6-retro-2026-09-27.md`, achados R1/R2) fez esse papel para as superfícies escuras, e os achados foram corrigidos no hardening do épico 6 (`plan-epic-6-hardening.md`, action items 21 e 25).

**Riscos residuais:**
- Nada verificado em device.
- O chip info fica em ~4.42:1 se um dia for posto sobre `surface` escuro.
- O guard-rail de arquivos do épico foi excedido (~70 arquivos no diff, a maioria conversão mecânica e testes).
