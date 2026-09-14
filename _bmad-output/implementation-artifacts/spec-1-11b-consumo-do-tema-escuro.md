---
title: '1.11b — Render coerente sob esquema escuro (defer da story 1.11)'
type: 'bugfix'
created: '2026-09-13'
status: 'in-progress'
baseline_commit: bd2f5da782ee7821bfd10a2d77952991691f2dd7
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/1-11-revisao-da-paleta-de-cores.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Com o esquema escuro do SO ativo, o app renderiza em tema misto: os widgets Paper flipam para o `darkTheme` (mapeamento D6 da 1.11) enquanto as telas do grupo (driver) ficam light-locked e o fundo da janela nunca é pintado — na tela de login o título fica branco sobre branco (invisível), e o mesmo render quebrado se repete na home do aluno, no QR e nos botões outlined. Além disso, papéis MD3 não sobrescritos (`elevation`) pintam de violeta os Cards/Surfaces elevados, incluindo o Banner de dado velho (`#F7F3F9` light).

**Approach:** **D1 decidido — trava light:** o `PaperProvider` e o chrome nativo (`userInterfaceStyle`) ficam fixos em light, e o app inteiro renderiza coerente em qualquer esquema do SO; o consumo reativo real (useTheme/darkPalette) segue como story futura, já registrada no defer da 1.11. Junto disso, os papéis `elevation` dos dois temas Paper passam a mapear tons da paleta (fim do resíduo violeta em Banner/Cards/Surfaces).

## Boundaries & Constraints

**Always:**
- Fonte única de cor: todo valor novo deriva de papel existente de `lib/palette.ts` (nenhum hex novo fora dela — a guarda falha).
- Allowlist de câmera/QR da guarda intacta (chrome de câmera, quiet zone, scrim, faixa do "Dispensar").
- Comentários de `lib/theme.ts` permanecem escopados aos papéis realmente sobrescritos (padrão da 1.11).
- `darkTheme` e o mapeamento D6 permanecem no código e cobertos pelos locks da guarda.

**Never:**
- Não criar toggle de tema nem persistir preferência de tema.
- Não renegociar tokens frozen do DESIGN.md nem introduzir variantes on-dark de link/info/status (decisão de cor nova é da futura story de consumo — ver defer da 1.11).
- Não tocar no chrome de câmera/QR (allowlist) nem no `STATUS_PRESENTATION`/telas light-locked.
- Não remover `darkTheme` nem seus testes: o mapeamento D6 fica pronto para a story futura de consumo reativo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SO escuro + web | login renderiza | Título, subtítulo, labels e botão em tons light (ink sobre branco); nada branco-sobre-branco | N/A |
| SO escuro + nativo | qualquer tela/stack | Headers nativos e widgets Paper permanecem light (`userInterfaceStyle` + provider fixos) | N/A |
| SO claro | qualquer tela | Visual como hoje (única mudança visível: fundo de Cards/Surfaces elevados sai do violeta `#F7F3F9` para tom da paleta) | N/A |
| Banner de dado velho | track-bus, roster stale | Fundo de tom da paleta (sem violeta MD3), texto/action legíveis | N/A |
| Tela de erro de mocks | `EXPO_PUBLIC_USE_MOCKS=1` com falha | Segunda instância do provider também fixa em light (mesmo tratamento) | N/A |

</frozen-after-approval>

## Code Map

- `mobile/src/app/_layout.tsx:17,61,85` — `useColorScheme` + dois `<PaperProvider theme={colorScheme === 'dark' ? darkTheme : lightTheme}>` (raiz e tela de erro de mocks): o flip que produz o misto.
- `mobile/app.json:9,15,31` — `userInterfaceStyle: "automatic"` (flips nativos); `adaptiveIcon.backgroundColor: "#E6F4FE"` e splash `backgroundColor: "#208AEF"` — resíduos da paleta antiga (azul substituído na 1.11).
- `mobile/src/lib/theme.ts` — `lightTheme`/`darkTheme`; comentário das linhas 4–9 afirma que `elevation` permanece default MD3 (vira falso com este trabalho — atualizar).
- `mobile/src/lib/palette.ts` — `lightPalette`/`darkPalette`/`darkMapping`/`designTokens`: vocabulário de onde saem os tons de `elevation` (`surfaceSoft` `#f8fafc`, `surfaceStrong` `#e0e2e6`, dark: `element` `#1d1f25`, `surfaceStrong`=`hairline` `#41454d`).
- `mobile/src/lib/palette.guard.test.ts` — varredura hex/rgba com allowlist; token-pins; binding locks dos temas; **lock atual (:416–423) exige `elevation`/`outline` em default MD3 — precisa ser reescrito** para exigir binding de `elevation` à paleta (enquanto `outline`/`outlineVariant` seguem default, com o comentário atual).
- `mobile/node_modules/react-native-paper/.../Banner.js:61` + `Surface.js:167–173` — Banner usa `Surface elevation=1` → fundo = `colors.elevation.level1` (mesmo mecanismo de Card/Menu/Dialog/Snackbar).
- Reativos/breaking hoje (sem cor própria): `(auth)/login.tsx`, `(admin)/home.tsx`, `(student)/home.tsx`, `qr-code.tsx`, `track-bus.tsx` — com a trava light voltam a render coerente sem uma linha de mudança.
- Light-locked (não tocar em D1=B): `(driver)/trip.tsx`, `(driver)/scan.tsx`, `(driver)/student-list.tsx`, `(driver)/routes.tsx`, `components/student-card.tsx` (`STATUS_PRESENTATION` em nível de módulo), `components/offline-banner.tsx`.
- Legado sem consumidores (intocado): `constants/theme.ts` (`Colors`), `hooks/use-theme.ts`, `hooks/use-color-scheme.web.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/lib/theme.ts` — sobrescrever `colors.elevation` nos dois temas com tons da paleta (light: `level0` transparent, `level1–2` → `surfaceSoft`, `level3–5` → `surfaceStrong`; dark: `level1–2` → `darkMapping.element`, `level3–5` → `darkMapping.hairline`) — fim do violeta em Banner/Cards/Surfaces.
- [x] `mobile/src/lib/theme.ts` — reescrever o comentário do cabeçalho: `elevation` agora É sobrescrito; `outline`/`outlineVariant` permanecem default MD3 (resíduo documentado).
- [x] `mobile/src/app/_layout.tsx` — fixar `lightTheme` nos dois `PaperProvider` (remover `useColorScheme` e o ternário); comentário curto registra a trava e aponta a story futura de consumo reativo (defer da 1.11).
- [x] `mobile/app.json` — `userInterfaceStyle: "light"`; splash e `adaptiveIcon.backgroundColor` → `#ffffff` (canvas) — fim do resíduo azul `#208AEF`/`#E6F4FE` da paleta antiga.
- [x] `mobile/src/lib/palette.guard.test.ts` — reescrever o lock de papéis não-sobrescritos: `elevation` passa a exigir binding à paleta (cada level casa com papel), `outline`/`outlineVariant` seguem exigindo default; novo source-lock: `app/_layout.tsx` sem `useColorScheme` e com `lightTheme` direto (trava da trava); allowlist inalterada.

**Acceptance Criteria:**
- Given esquema escuro no SO (emulado via `prefers-color-scheme: dark` no web), when o app abre no login, then título "PureUrban", subtítulo, labels dos inputs e botão "Entrar" renderizam nos tons light de hoje — nenhum texto branco sobre fundo branco.
- Given esquema escuro, when o usuário navega por trip/scan/student-list/routes, home do aluno, QR e track-bus, then nenhum widget Paper renderiza em dark (uniformidade light; sem render misto).
- Given o Banner de dado velho visível no track-bus, when renderizado em qualquer esquema, then o fundo vem de tom da paleta (`surfaceSoft`), sem o violeta `rgb(247, 243, 249)`.
- Given esquema claro, when o app é usado, then o visual é o de hoje exceto o fundo dos Surfaces elevados (violeta → tom da paleta), sem regressão de contraste (suíte AA da guarda cobre os novos pares).
- Given `cd mobile && npm test`, then a guarda passa com os locks novos (mutação: reverter o provider para o ternário derruba o teste).

## Implementation Notes

<!-- Agent-owned. Append-only during implementation. -->

### Execução (2026-09-13)

- `lib/theme.ts`: `elevation` sobrescrito nos dois temas (light: `level0` permanece o
  default `'transparent'`, `level1–2` → `surfaceSoft`, `level3–5` → `surfaceStrong`;
  dark: `level1–2` → `darkMapping.element`, `level3–5` → `darkMapping.hairline`);
  comentário do cabeçalho reescrito (`elevation` agora É sobrescrito;
  `outline`/`outlineVariant` seguem default MD3, resíduo documentado).
- `app/_layout.tsx`: os dois `PaperProvider` com `lightTheme` direto; `useColorScheme`
  e o import de `darkTheme` removidos; comentário no provider raiz registra a trava e
  aponta a story futura de consumo reativo (defer da 1.11).
- `app.json`: `userInterfaceStyle: "light"`; splash e `adaptiveIcon.backgroundColor`
  → `#ffffff`.
- `palette.guard.test.ts`: lock de papéis não-sobrescritos reescrito — `elevation`
  com binding nível a nível à paleta (`toEqual` contra o spread do default MD3 +
  overrides, o que também prende o `level0` transparent), `outline`/`outlineVariant`
  seguem exigindo default; novo source-lock do `_layout` (sem `useColorScheme`, sem
  `darkTheme`, exatamente dois `theme={lightTheme}`); dois pares AA novos para a
  superfície elevada (ink × `surfaceStrong` no claro; texto × `surfaceStrong` no
  escuro). Allowlist inalterada.

### Verificação

- `cd mobile && npm test` — **347 testes** (343 do baseline + 4 novos: 2 locks que
  substituem o antigo + 2 pares de contraste), 26 suítes, 0 falhas. O aviso "worker
  process has failed to exit" é preexistente (timers de `trip-screen.test.tsx`).
- `npm run lint` — limpo (exit 0). `npx tsc --noEmit` — exatamente os 3 erros
  pré-existentes do baseline (`scan.tsx` TS18047, `use-trip-gps-capture.test.tsx`
  TS2554, `tracking-stream.service.test.ts` TS2339); nenhum novo.
- **Mutação, 2 cenários (ambos derrubam a guarda):** (1) reverter o provider ao
  ternário com `useColorScheme`/`darkTheme` de volta → falha o source-lock do
  `_layout`; (2) trocar `level1` light de `surfaceSoft` para `surfaceStrong` → falha
  o lock de binding do `elevation`.
- **Playwright headless** (chromium do repo, via `playwright-core` da `api/`) contra
  o Metro local (8081) com `colorScheme: 'dark'` e `'light'`: o login renderiza
  IDÊNTICO nos dois esquemas — título "PureUrban", subtítulo e rótulos em ink
  `rgb(24, 29, 38)`, botão "Entrar" com fundo tinta e rótulo branco (screenshots
  `/tmp/login-{dark,light}-11b.png`, efêmeros). Nada branco-sobre-branco.
- Bundle web (`entry.bundle?platform=web`) — HTTP 200, sem erro de
  resolução/transform.
- A 1ª tentativa do comentário novo do `theme.ts` citava hex/rgb literais e foi
  DERRUBADA pela própria guarda (a varredura pega comentários) — reescrito sem
  literais, mesmo padrão do issue 9619 do `qr-scanner.tsx` na 1.11.

### Risco residual / fora de escopo

- A caminhada tela a tela (trip/scan/student-list/routes, home do aluno, QR,
  track-bus com Banner) sob esquema escuro não foi executada — exigiria a sessão
  mockada completa da 1.11. A trava é estrutural: sem `useColorScheme` na árvore não
  existe caminho para o `darkTheme` nos widgets, e o source-lock impede a regressão
  no fonte; `userInterfaceStyle: "light"` cobre o chrome nativo.
- `darkTheme` e o mapeamento D6 permanecem sem consumidores (intencional — story
  futura de consumo reativo), continuando cobertos pelos locks da guarda.

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. -->

## Review Triage Log

<!-- Append-only. Populated by step-04 on every review pass. -->

## Design Notes

O mecanismo do bug: nenhum ponto da árvore pinta o fundo (janela do SO/browser = branco) e o `PaperProvider` alterna com o esquema do SO — telas reativas recebem `onSurface` branco em dark sobre esse branco (login é o caso mais visível: 100% widgets Paper). Telas light-locked (grupo driver) escondem o problema com fundo próprio, mas os widgets que elas não pintam (ex.: botão outlined "Alunos da Viagem") flipam do mesmo jeito. A trava light elimina a fonte da divergência (o flip), não o sintoma tela a tela.

Mapeamento de `elevation` proposto (Surface.js lê `colors.elevation.level{n}` do prop `elevation`; Banner default = 1):

```ts
// light: level0 'transparent' (default); level1–2 surfaceSoft #f8fafc; level3–5 surfaceStrong #e0e2e6
// dark:  level1–2 darkMapping.element #1d1f25;    level3–5 darkMapping.hairline #41454d
```

## Verification

**Commands:**
- `cd mobile && npm test` — expected: suíte inteira verde (334+ casos), incluindo os locks novos de `elevation` e do `_layout`.
- `cd mobile && npm run lint` — expected: sem erros.

**Manual checks (se nenhum CLI cobrir):**
- Metro no 8081 + Playwright headless emulando `prefers-color-scheme: dark`: screenshot de `/login` e de `/track-bus` (com Banner forçado via refetch stale) — título do login legível em ink; fundo do Banner em `#f8fafc`; nenhum widget em dark.
- Mesma caminhada com esquema claro: visual idêntico ao atual (exceto fundo dos elevados).
