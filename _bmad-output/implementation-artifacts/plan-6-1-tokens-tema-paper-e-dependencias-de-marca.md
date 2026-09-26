---
title: 'Story 6.1: tokens, tema Paper e dependências de marca'
type: 'feature'
ticket: '6-1-tokens-tema-paper-e-dependencias-de-marca'
created: '2026-09-26'
status: 'built'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
baseline_revision: '527b094f6822ae65f5d4a4b8cfa9c60bb1883c26'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O mobile não tem uma fonte única de tipografia, spacing, radius, elevation e motion. O
tema Paper não é tipado nem usa Inter. Aparecem três fundos (`#f2f2f2` do React Navigation, `#fffbfe`
do MD3 e `#f8fafc`). O launcher mostra "mobile" com o ícone do template, e ainda sobra código morto
do template Expo.

**Approach:** Criar `lib/tokens.ts` a partir do `DESIGN.md`. Tipar `AppTheme` (MD3 + `configureFonts`
com Inter + `custom`) com um hook `useAppTheme`. Unificar os fundos no Paper e no React Navigation.
Adotar o amarelo-escolar como papel de marca full-bleed no ícone e no splash (D-UX-1). Instalar
Inter e `expo-haptics` (D-UX-2/3). Renomear o app para "PureUrban" (D-UX-11) e remover o código
morto do template. Branch `feat/6-1-tokens-tema-paper-e-dependencias-de-marca`, com commits atômicos.

**Decisões (Lucas, 26/09/2026):** (1) a escala tipográfica completa do DESIGN.md entra já no
`configureFonts`. "Fonte" no AC cobre família + tamanhos: o texto das telas cresce 1–2px onde a
variante mapeada muda (titleMedium, bodyMedium, bodyLarge, bodySmall, labelLarge). (2) Plano mantido
inteiro (~2.500 tokens), num PR só, para garantir uma única rebuild nativa.

## Boundaries & Constraints

**Always:**
- Nenhum hex fora de `lib/palette.ts`. `tokens.ts` e `theme.ts` referenciam papéis da paleta.
- Todo texto, `testID`, nome acessível e `accessibilityRole` fica idêntico, e Jest continua verde sem editar asserts de tela.
- `palette.guard.test.ts` é atualizado na mesma mudança que altera token, papel ou `app.json`.
- O app continua travado em claro. `darkTheme` recebe o mesmo `fonts`/`custom` só para manter o tipo, sem consumo.
- O boot espera as fontes carregarem, entrando no gate `isBooting` que já existe. Se o carregamento falhar, o app não trava e cai no fallback do sistema.
- Dependências novas via `npx expo install`, fixadas na versão compatível com o SDK 55.

**Never:**
- Restyle de telas: spacing, layout, cores de componente, emoji, títulos duplicados → stories 6.2+.
- Trocar `slug`, `scheme` ou `android.package` (quebraria o vínculo EAS, o deep link e o APK instalado).
- Consumir `expo-haptics` em tela (só instalar; o uso vem na 6.6).
- Amarelo em texto, borda, chip ou tela do motorista.
- Disparar `eas build` sem confirmação explícita do usuário no momento.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Boot normal | Fontes carregam | Spinner até DB, mocks e fontes; depois, telas em Inter | — |
| Falha de fonte | `useFonts` devolve erro | O gate abre mesmo assim e o texto cai no fallback do sistema | `console.error`, sem tela de erro |
| Jest | `expo-font` mockado pelo jest-expo | Renders existentes passam sem mudança de assert | — |

</frozen-after-approval>

## Code Map

- `mobile/src/lib/palette.ts` -- fonte única de cor. Adicionar os papéis `brand`/`onBrand` (= `designTokens.signatureYellow`/`ink`) em `SemanticColors`, light e dark, e atualizar o comentário D7 ("adotado full-bleed, D-UX-1"). Nenhum hex novo.
- `mobile/src/lib/theme.ts` -- hoje é `lightTheme`/`darkTheme` sem tipo. Adicionar `background: lightPalette.surfaceSoft` (hoje é o `#fffbfe` MD3), `fonts` e `custom`, e exportar `AppTheme`, `useAppTheme` e `navigationTheme`. Os demais bindings ficam.
- `mobile/src/app/_layout.tsx` -- `PaperProvider theme={lightTheme}` aparece 2× e é travado pelo regex da guarda (manter o literal). Adicionar `useFonts` ao `isBooting` e `ThemeProvider` (`@react-navigation/native`) em volta do `<Stack>` com `navigationTheme`.
- `mobile/src/lib/palette.guard.test.ts` -- a camada (4) trava `app.json` em `#ffffff` no splash/adaptiveIcon; passa a exigir `designTokens.signatureYellow`. Adicionar o par de contraste `onBrand × brand` ≥ 4.5 e locks de `background`, `fonts` e navegação.
- `mobile/app.json` -- `name: "mobile"` → `"PureUrban"`; splash e adaptiveIcon com fundo `#f4d35e`; novos PNGs. `expo-font` como plugin, se o `expo install` pedir.
- `mobile/assets/images/{icon,splash-icon,android-icon-*,favicon}.png` -- substituir pela marca: glifo `bus-school` (MaterialCommunityIcons, TTF em `node_modules/@expo/vector-icons/.../Fonts/`) em tinta `#181d26` sobre amarelo. Gerar com script Pillow no scratchpad (`uv run --with pillow`), sem commitar o script. O monochrome leva só o glifo. `assets/expo.icon` (iOS) fica fora, porque não há build iOS.
- Código morto do template (sem consumidores, verificado por grep): `src/constants/theme.ts` (importa `global.css`), `src/hooks/use-theme.ts`, `src/hooks/use-color-scheme.ts`, `src/hooks/use-color-scheme.web.ts`, `src/global.css`.
- Telas: 100% `Text` do Paper (nenhum `Text` do RN). A fonte chega por tema, e nenhuma tela é editada.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/package.json` -- `npx expo install @expo-google-fonts/inter expo-haptics` -- deps de D-UX-2/3, instaladas de uma vez só para a rebuild única.
- [x] `mobile/src/lib/tokens.ts` -- NEW: `typography` (os 11 papéis do DESIGN com fontSize, lineHeight em px, letterSpacing e família Inter por peso), `spacing` (1–7, gutter, sectionGap, touchMin 48, actionHeight 56), `radius` (sm 8, md 12, lg 16, xl 24, full 9999), `elevation` (níveis 0–3 do DESIGN; o nível 2 é sombra y2/blur8/12% com `shadowColor` da paleta) e `motion` (press 90, reduced 120, enter 180, standard 200, emphasis 300, progress 400, pulse 600, pressScale 0.97; EXPERIENCE.md → Microinterações) -- vocabulário único.
- [x] `mobile/src/lib/tokens.test.ts` -- NEW: token-pin dos valores contra o DESIGN.md -- mesmo padrão da guarda de paleta.
- [x] `mobile/src/lib/palette.ts` -- papéis `brand`/`onBrand` -- D-UX-1.
- [x] `mobile/src/lib/theme.ts` -- `configureFonts` (ver Design Notes), `background`, `custom: { spacing, radius, motion }`, `AppTheme`, `useAppTheme`, `navigationTheme` -- AC de tema tipado e fundos.
- [x] `mobile/src/app/_layout.tsx` -- `useFonts` com Inter 400/500/600/700 no gate de boot + `ThemeProvider` -- fonte e fundo `#f2f2f2`.
- [x] `mobile/src/lib/palette.guard.test.ts` -- locks novos: app.json amarelo, brand/onBrand, background, navigationTheme, ThemeProvider no `_layout` -- a guarda acompanha o token.
- [x] `mobile/app.json` + `mobile/assets/images/*.png` -- nome, ícone e splash de marca -- D-UX-11.
- [x] Remover os 5 arquivos do template listados no Code Map -- código morto.
- [ ] Dev build Android -- depois do merge-ready, **perguntar** e só então rodar `eas build -p android --profile development`, instalar via `adb.exe install` e validar o boot nos 2 AVDs -- AC da rebuild única.

**Acceptance Criteria:**
- Given o app no Expo Web (390×844), when abro login, trip e home do aluno, then o fundo de toda tela e o fundo dos TextInput são `#f8fafc`, o texto está em Inter na escala do DESIGN.md, e nada além de fundo e tipografia mudou em relação às capturas de `audit/`.
- Given `useAppTheme()` numa tela, when acesso `theme.custom.spacing.gutter` e `theme.fonts.displaySmall`, then o TypeScript tipa os dois sem cast.
- Given a suíte, when rodo `npm test`, `npm run lint` e `npx tsc --noEmit` em `mobile/`, then tudo verde, com a guarda cobrindo marca, fundo e app.json.
- Given o APK de dev novo nos AVDs, when abro o app, then o launcher mostra "PureUrban" com o ícone amarelo, o splash é de marca e o login renderiza em Inter.

## Implementation Notes

- 7 commits atômicos em `feat/6-1-tokens-tema-paper-e-dependencias-de-marca` (deps → tokens → marca na paleta → tema → `_layout` → app.json/ícones → código morto). Branch não enviada.
- O DESIGN.md tem **10** papéis tipográficos, não 11. `tokens.typography` tem os 10.
- `labelLarge` → `label` (15/600), não `button` (17/700), para cumprir o "1–2px" da decisão (1). `typography.button` existe nos tokens para a story de componentes.
- `lineHeight` = `round(fontSize × razão)`: 44, 34, 28, 24, 24, 22, 20, 22, 18, 16.
- `navigationTheme.fonts`: regular/medium/bold/heavy → Inter 400/500/600/700 (o `bold` do React Navigation é 600).
- `expo install` não pediu o plugin `expo-font`; as fontes carregam em runtime via `useFonts`. `imageWidth` do splash ficou em 76.
- Ícones gerados a partir do glifo `bus-school` recortado pelo alfa e centralizado (foreground/monochrome em 52% da largura, dentro da zona segura de 66/108).
- `tsc --noEmit`: 3 erros pré-existentes no baseline `527b094` (`scan.tsx:315`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172`); nenhum novo.
- Expo Web + mocks: login, trip ativa (com geolocalização concedida) e home do aluno com fundo `rgb(248,250,252)` em tela e TextInput e texto em Inter; layout idêntico ao de `audit/light-01`, `light-11` e `light-30`. Títulos de tela com `fontWeight: '700'` avulso sobre variante Regular ganham negrito sintético (previsto nas Design Notes).
- Pós-review (passada 1): 7 patches em `b92c928`, `85e38e2` e `c33bd82`; gate de fonte com teste unitário em `ccdaeae`. Depois deles, a suíte completa ficou vermelha em ~60% das rodadas por um flake de carga em `trip-screen.test.tsx:160` (`waitFor` com default de 1s; no baseline, 2/9 rodadas). `8f397ab` sobe só esse timeout para 3s: 6/6 rodadas verdes, 389/389.

## Plan Change Log

## Review Triage Log

**Passada 1 (thorough, 4 lentes):** 1 medium · 7 low · 5 false · 1 maybe-false · 1 descritivo. Rota: 7 patch, 2 defer, demais rejeitados. Sem intent_gap/bad_plan.

| # | Lente | Achado | Veredito | Rota / evidência |
|---|---|---|---|---|
| 1 | verification-gap | Gate de fonte e `ThemeProvider` no `_layout` cobertos só por regex de fonte | medium | patch: `root-layout.test.tsx` renderiza o `RootLayout` (spinner / probe / erro abre / cores do nav theme) |
| 2 | blind + edge | Views de boot e mockError sem fundo: splash amarelo → tela branca → `#f8fafc` | low | patch: `backgroundColor: lightTheme.colors.background` nas duas |
| 3 | blind + intent | AC do `useAppTheme` tipado sem consumidor | low | patch: `theme.test.tsx` consome sem cast |
| 4 | blind | Comentários novos em português (o CLAUDE.md pede inglês) | low | patch: traduzir só os comentários adicionados e a string do `console.error` |
| 5 | blind | Falta token `maxWidth: 560` do DESIGN → Layout | low | patch: `spacing.contentMaxWidth` + pin |
| 6 | blind | `elevation.level2` pinado com `toMatchObject` (`elevation: 4` sem pin) | low | patch: `toEqual` + porquê do `elevation` Android |
| 7 | blind | Doc de `motion` diz "ms", mas tem `pressScale` | low | patch: corrigir comentário |
| 8 | verification-gap | `project-context.md:101` aponta para `useTheme`/`ThemeColor` apagados | low | defer (arquivo de contexto de agente) |
| 9 | blind | `fontFamily` por peso + `fontWeight` pode dar negrito duplo no Android | maybe-false | defer: resolve-se no APK de dev nos AVDs |
| 10 | blind | Patch sem os PNGs | false | Exclusão do staging do diff; os 6 PNGs estão no branch (`git diff --stat 527b094`) |
| 11 | blind | Plano diz "11 papéis" e "7 commits" | false | O fix edita o plano → rejeitado pela regra; as Notes já registram 10 |
| 12 | blind | `typography`/`elevation` fora de `theme.custom` | false | O AC fixa `custom: { spacing, radius, motion }`; os tokens exportados são o outro acesso previsto |
| 13 | blind | `level3` sem `backgroundColor` | false | A cor do overlay varia por tom (sucesso/aviso/erro); nível 3 = sem sombra |
| 14 | blind | Fallback silencioso em `interVariant` para peso fora de 400–700 | false | O MD3 só usa pesos 400/500 no typescale; o ramo é inalcançável |
| 15 | blind | Regexes da guarda frágeis; par dark de brand redundante | low | rejeitado: source-lock é o padrão da guarda; redundância inofensiva |
| 16 | edge | Web: falha de fonte → família nua cai no serif do browser | low | rejeitado: fontes são assets locais, a falha é improvável; o fix exige `Platform.select` em todas as variantes |
| 17 | edge | Tela de mockError renderiza antes das fontes | low | rejeitado: só dev (mocks); cai no fallback, sem crash |
| 18 | edge | `navigationTheme` muda `primary`/`border` além do "fundo e tipografia" | low | rejeitado: previsto nas Design Notes; efeito só no tint iOS (sem build iOS) e na hairline |
| 19 | intent | `displaySmall` também muda (36 → 40) além das 5 variantes da decisão | false | Nenhuma tela usa `displaySmall` (grep); `headlineMedium`/`titleLarge` mantêm 28/22 |

## Design Notes

**Android e peso:** fonte custom registrada por nome não sintetiza `fontWeight` de forma confiável.
Por isso cada variante MD3 aponta para a família do peso certo (`Inter_700Bold`, etc.), e não
`Inter` + `fontWeight`. As variantes que o DESIGN não mapeia (displayLarge/Medium, headlineLarge/Small,
titleSmall, labelMedium/Small) ficam com os tamanhos default do MD3, só trocando para a família Inter
do peso MD3 correspondente (400 → Regular, 500 → Medium). Estilos avulsos de tela com
`fontWeight: '700'` sobre Inter Regular podem ganhar negrito sintético no Android até as stories de tela.

```ts
const fonts = configureFonts({ config: {
  displaySmall: { fontFamily: 'Inter_700Bold', fontSize: 40, lineHeight: 44, letterSpacing: -0.5, fontWeight: '700' },
  // ... um por papel, gerado a partir de tokens.typography
}})
```

**React Navigation:** `navigationTheme` = `DefaultTheme` + `colors` da paleta (`background:
surfaceSoft`, `card: canvas`, `text: ink`, `border: hairline`, `primary: primary`) + `fonts` Inter.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: suíte toda verde (guarda incluída)
- `cd mobile && npm run lint && npx tsc --noEmit` -- expected: 0 erros novos
- `cd mobile && grep -rn "constants/theme\|use-theme\|use-color-scheme" src` -- expected: vazio

**Manual checks:**
- Expo Web + Playwright (`api/node_modules/playwright`, `.mjs`), com mocks: capturas "depois" de login, trip ativa e home do aluno, comparadas com `audit/light-01`, `light-11` e `light-30`.
- APK de dev nos AVDs (ver memória android-emulator-verification): launcher, splash e login.
