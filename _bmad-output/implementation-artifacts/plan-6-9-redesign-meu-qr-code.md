---
title: 'Story 6.9: redesign do Meu QR Code'
type: 'feature'
ticket: '6-9-redesign-meu-qr-code'
created: '2026-09-26'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '34f09897bdce2aac688036d4854562579bfd8b61'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      "+N rotas" says "+1 rotas" (plural) when the student has exactly two routes.
    evidence: |-
      Copy carried over unchanged from the pre-6.9 screen (`+${routeList.length - 1} rotas`); the plan kept existing texts. Covered by the mixed-routes test, which pins the current copy.
    location: >-
      mobile/src/app/(student)/qr-code.tsx (routeLine)
    severity: low
  - summary: >-
      Route line changes (loading -> route / error / stale) are not announced to screen readers.
    evidence: |-
      No accessibilityLiveRegion on the route lines; the pre-6.9 screen had none either.
    location: >-
      mobile/src/components/student-qr/qr-pass.tsx (QrPassRouteLine)
    severity: low
  - summary: >-
      No test proves the Snackbar reopens after being dismissed and the query failing again.
    evidence: |-
      The errorUpdatedAt-driven effect is unchanged pre-6.9 logic; tests only assert the first appearance.
    location: >-
      mobile/src/app/(student)/qr-code.tsx (snackbar effect)
    severity: low
---

<intent-contract>

## Intent

**Problem:** A tela "Meu QR Code" parece um cartão genérico: nome em fonte fina, "Rota" como seção com divisor, emoji 🚌 que vira tofu no web, `opacity` em texto e sessão inválida com layout próprio — nada remete a "passe de embarque" (EXPERIENCE.md → auditoria `(student)/qr-code`, "Aluno › Meu QR Code — P0"; Story 6.9 em `epics.md`).

**Approach:** Novo componente `QrPass` (cartão `radius.xl`: faixa `brand` amarela com `bus-school`, nome `titleLg` e linha de rota; corpo branco com o `StudentQrCode` intocado e rodapé "Mostre ao motorista"), centralizado num `Screen variant="scroll"` com o pull-to-refresh atual. Estados da rota viram uma linha discreta dentro da faixa; sessão inválida vira `StateView kind="blocked"`. Primeiro teste Jest da tela no mesmo PR.

## Boundaries & Constraints

**Always:**
- Lógica intocada: `qrValue` (`buildQrPayload`/`encodeQrPayload`, deps `[user?.id, sessionId]`), query `['routes','mine']` (`staleTime` 30s, `retry: 2`), normalização `routeList`, `showErrorState`/`showLoadingState` (`status === 'pending'`)/`showEmptyState`, Snackbar 4s com "Tentar novamente" e reabertura por `errorUpdatedAt`, guarda `!qrValue || !user || user.role !== 'STUDENT'`, `logout()` ANTES de `router.replace('/(auth)/login')`.
- QR: `react-native-qrcode-svg` com `#FFFFFF`/`#000000`, `quietZone={16}`, `ecl="M"`, `MAX_SIZE` 288 e `MIN_SIZE` 120 inalterados; o corpo do passe é branco (`lightPalette.canvas`) para continuar a quiet zone.
- Só tokens de `lib/tokens.ts`/`lib/palette.ts` (`brand`/`onBrand` na faixa); ícones via `MdiIcon`; sem `opacity` em texto; sem emoji.
- Comentários/commits em inglês; remover comentários redundantes dos arquivos tocados (os que explicam o porquê ficam, traduzidos).

**Never:**
- Mudar API, `api/openapi.json`, `_layout.tsx` (título "Meu QR Code" fica) ou o payload do QR.
- Skeleton, estado "offline — leitura" ou brilho máximo (6.11 / D-UX-10).
- Tornar o passe tocável ou adicionar ações novas.
- Criar `*.test.tsx` sob `src/app/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rota carregada | 1 rota com nome | Faixa: nome do aluno + nome da rota (sem emoji) | — |
| Várias rotas | N > 1 rotas | Rota + "+{N-1} rotas" na mesma faixa | — |
| Carregando | `status === 'pending'` (inclui pausada offline) | Linha "Carregando rota..." com `ActivityIndicator` pequeno `onBrand` | — |
| Erro sem cache | `isError` e sem rotas | Linha "Não foi possível carregar sua rota." (ícone `cloud-alert`) + Snackbar atual | "Tentar novamente" chama `refetch` |
| Erro com cache | `isError` e rotas em cache | Rota + linha "Rota possivelmente desatualizada"; sem Snackbar | — |
| Sem rota | `success` e lista vazia (ou payload não-array/sem `name`) | Linha "Nenhuma rota vinculada" (ícone `map-marker-off`) | — |
| Sessão inválida | sem `sessionId`, sem `user` ou papel ≠ STUDENT | `StateView kind="blocked"` "Sua sessão precisa ser renovada" + detalhe atual + ação "Entrar novamente"; nenhum QR renderizado | ação: `logout()` depois `router.replace` |

</intent-contract>

## Code Map

- `mobile/src/app/(student)/qr-code.tsx` -- tela (219 linhas). Linhas 13–87 (lógica) ficam; o JSX (52–73 e 89–155) e `styles` são refeitos. Snackbar continua irmão do conteúdo (fora do `Screen`, como em `(student)/home.tsx`).
- `mobile/src/components/student-qr-code.tsx` -- QR puro; só `HORIZONTAL_CHROME` muda para o chrome novo (gutter 16 + padding do corpo 16 + borda 1, por lado) e o comentário é reescrito em inglês. Allowlisted em `lib/palette.guard.test.ts:83` — não mover o arquivo.
- `mobile/src/components/ui/{screen,state-view,mdi-icon}.tsx` -- reuso. `Screen` aceita `variant="scroll"` + `refreshControl`; o `scrollContent` já tem `flexGrow: 1` (centralizar com um wrapper `flexGrow: 1, justifyContent: 'center'`).
- `mobile/src/lib/palette.ts:130-133` -- papéis `brand` (#f4d35e) e `onBrand` (ink); `lib/tokens.ts` -- `typography.titleLg/body/caption`, `radius.xl`, `spacing`, `elevation.level1`.
- `mobile/src/components/scan/scan-blocked-states.tsx` -- padrão `StateView kind="blocked"` com logout; o comentário da linha 17 cita `(student)/qr-code.tsx` — manter verdadeiro.
- `mobile/src/student-home.test.tsx:1-60` -- padrão de teste de tela (QueryClientProvider, SafeAreaProvider com `TEST_INSETS`, PaperProvider, `jest.mock` de `expo-router`/services/`auth.store`).
- Nenhum e2e Playwright referencia textos desta tela (só `home-qr-shortcut` no `e2e-driver.ts`).

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/student-qr/qr-pass.tsx` (+ `qr-pass.test.tsx`) -- novo `QrPass` puramente de exibição: props `name`, `route` (nó da linha de rota, fornecido pela tela), `qrValue`, `testID`. Cartão `radius.xl`, `overflow: 'hidden'`, borda `hairline`; faixa `brand` com `MdiIcon bus-school` 32dp `onBrand`, nome `titleLg` `onBrand`, `route` abaixo; corpo `canvas` com `StudentQrCode` e rodapé "Mostre ao motorista" (`body`, `textMuted`, ícone `cellphone-screenshot` ou similar decorativo). Corpo com `accessible` + `accessibilityLabel="QR code de embarque"`. Exporta também `QrPassRouteLine` (`icon?`/`loading?` + texto `body` `onBrand`, variante secundária para "+N rotas"/"desatualizada"). Teste cobre faixa, nome, rodapé, linha de rota com spinner e com ícone.
- [x] `mobile/src/components/student-qr-code.tsx` -- atualizar `HORIZONTAL_CHROME` e o comentário.
- [x] `mobile/src/app/(student)/qr-code.tsx` -- sessão inválida → `StateView kind="blocked"` (mesmos textos, `testID="qr-session-blocked"`); caminho feliz → `Screen variant="scroll" refreshControl={<RefreshControl …/>}` com o `QrPass` centralizado e a linha de rota montada pela matriz; remover emoji, `Divider`, "Rota", `Card` e `opacity`.
- [x] `mobile/src/student-qr-screen.test.tsx` -- novo, cobre a matriz inteira: cada estado da linha de rota, "+N rotas", "desatualizada" sem Snackbar, Snackbar + "Tentar novamente" → `refetch` (getMyRoutes chamado de novo), payload não-array tratado como sem rota, sessão inválida (sem sessionId / papel DRIVER) sem QR e com ordem `logout` → `replace`, e o `value` do QR igual a `encodeQrPayload(buildQrPayload(user.id, sessionId))` (mockar `react-native-qrcode-svg` se preciso para ler o `value`).

**Acceptance Criteria:**
- Given um aluno com sessão válida e rota, when abre "Meu QR Code", then vê um único cartão centralizado com faixa amarela (ícone de ônibus, nome, rota), o QR no corpo branco e "Mostre ao motorista" abaixo, sem emoji nem divisor.
- Given o QR renderizado no alvo web, when a captura é lida pelo decodificador do scanner do motorista (zxing-wasm/`barcode-detector`), then o texto decodificado é igual ao payload gerado para aquele aluno.
- Given `npm test`, when roda, then todas as suítes passam, incluindo as novas.

## Implementation Notes

- `accessible` + `accessibilityLabel="QR code de embarque"` (com `accessibilityRole="image"`) ficou num wrapper só do QR dentro do corpo, não no corpo inteiro: agrupar o corpo esconderia "Mostre ao motorista" do leitor de tela.
- Ícones das linhas de rota: `map-marker-path` (rota), `cloud-alert` (erro), `map-marker-off` (sem rota), `clock-alert-outline` ("desatualizada"); rodapé com `cellphone-screenshot`. Linha secundária sem ícone ("+N rotas") recua para alinhar com o texto da linha acima.
- `HORIZONTAL_CHROME` = `(16 + 1 + 16) * 2` = 66; em 360dp o QR continua no teto de 288.
- Verificação: `npm test` 55 suítes / 683 testes verdes; `npm run lint` limpo; `tsc --noEmit` só com os 3 erros da baseline. Expo Web (`EXPO_PUBLIC_USE_MOCKS=1`) + Chromium 390×844 e 360×800 com `aluno`, `aluno-sem-rota`, `aluno-multirota` e `aluno-erro`: overflow horizontal 0, faixa com os textos esperados, e o QR capturado do passe decodificado com `zxing-wasm` igual a `{"studentId":<auth.user.id>,"sessionId":<qr.sessionId>}` nos 8 casos.
- Fora do escopo, notado: a ação "Tentar novamente" do Snackbar usa o roxo padrão do Paper (`inversePrimary`), igual às demais telas; não foi tocado.

## Plan Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 16, false 5, maybe-false 0
- findings:
  - `[low]` `[defer]` (edge) "+1 rotas" plural with two routes — pre-existing copy kept by the plan; deferred.
  - `[low]` `[reject]` (edge) empty `user.name` leaves an empty header slot — the auth store always carries the server's required name; fix adds a guard for an unshown state.
  - `[low]` `[patch]` (edge) `iconIn` returns undefined → opaque TypeError — helper now looks icons up by their testIDs and throws naming the missing one.
  - `[false]` `[reject]` (edge) a11y label on an inner QR wrapper, not the whole body — deliberate (logged in Implementation Notes): grouping the body would hide "Mostre ao motorista"; the QR is still announced once.
  - `[low]` `[defer]` (blind) "+1 rotas" plural — same as the edge row; deferred.
  - `[low]` `[patch]` (blind) paused/offline query of the loading row untested — added an `onlineManager.setOnline(false)` case asserting "Carregando rota..." and no fetch.
  - `[low]` `[patch]` (blind) pull-to-refresh through `Screen` untested — added a case firing `student-qr-scroll`'s `onRefresh` and asserting a second `getMyRoutes`.
  - `[low]` `[patch]` (blind) `HORIZONTAL_CHROME` hard-codes other components' layout — now derived from `spacing.gutter`, `elevation.level1.borderWidth`, `spacing[4]`; 320dp test pins size 254.
  - `[low]` `[reject]` (blind) sizing ignores side safe-area insets/landscape — `app.json` locks `orientation: portrait`, where side insets are 0; fix needs onLayout measuring.
  - `[low]` `[reject]` (blind) "+N rotas" indented but "desatualizada" (with icon) not — only visible with several routes plus a cached-route error; cosmetic.
  - `[false]` `[reject]` (blind) duplicated `surfaceSoft` background on the root View — identical color under the Screen; no visible or developer harm named.
  - `[low]` `[patch]` (blind) weak assertions: opacity check on 3 strings, icon lookup by tree shape — no-opacity extended to the three route-line variants; icons found by testID.
  - `[low]` `[defer]` (blind) route status changes not announced — pre-existing (old screen had no live region); deferred.
  - `[low]` `[patch]` (blind) mixed named/nameless routes untested — added case asserting "Linha A" and "+1 rotas".
  - `[low]` `[defer]` (blind) Snackbar reopen after each failure untested — pre-existing logic unchanged; deferred.
  - `[low]` `[reject]` (intent) QR grows on < 368dp (240→254 at 320dp) — the sizing rule (288 cap, 120 floor, width minus real chrome) is kept; the old chrome reserved space that no longer exists, and the pass fits (320dp test, 360dp capture).
  - `[false]` `[reject]` (intent) scanner readability only verified manually — the AC asks for verification on the web target; done with zxing-wasm (driver scanner's decoder) on 8 captures.
  - `[false]` `[reject]` (intent) State Patterns table (StateView empty/error, skeleton) not followed — the story AC and the P0 section put route states as a line inside the band; skeleton belongs to 6.11.
  - `[false]` `[reject]` (intent) Snackbar kept alongside the in-band error line — the AC does not remove it; EXPERIENCE keeps existing rules.
  - `[low]` `[patch]` (verification) pull-to-refresh untested — same fix as the blind row.
  - `[low]` `[patch]` (verification) QR sizing vs pass layout untested — same fix as the blind `HORIZONTAL_CHROME` row.

## Design Notes

"Mostre ao motorista" é o texto do spec (substitui "Mostre este código ao motorista", que nenhum teste consulta). A faixa usa só `onBrand` (ink sobre #f4d35e ≈ 12:1); linhas de estado discretas = tipo `body`/`caption` + ícone, não cor mais clara. O passe usa `level1` (borda, sem sombra) como os demais cartões do redesign.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: todas as suítes verdes.
- `cd mobile && npm run lint` -- expected: sem erros.
- `cd mobile && npx tsc --noEmit` -- expected: nenhum erro novo além da baseline (3 erros pré-existentes: scan.tsx, use-trip-gps-capture.test.tsx, tracking-stream.service.test.ts).

**Manual checks (if no CLI):**
- Expo Web com `EXPO_PUBLIC_USE_MOCKS=1`, Chromium 390×844 e 360×800 (script `.mjs` com `api/node_modules/playwright`): captura do passe com rota e sem rota; nada truncado nem estourando a largura. Decodificar o QR da captura com `zxing-wasm` (em `mobile/node_modules`) ou alimentando o scanner do motorista via stub de `getUserMedia` e conferir que o texto é o payload do aluno.

## Auto Run Result

**Summary:** "Meu QR Code" rebuilt as a boarding pass: `QrPass` card (radius.xl, level1) with a brand-yellow band (`bus-school`, name in titleLg, route line), white body with the unchanged `StudentQrCode` and the "Mostre ao motorista" footer. Route states (loading/error/no route, "+N rotas", "desatualizada") are discreet lines inside the band; invalid session is a blocked `StateView`. Query, payload, Snackbar and logout-order logic unchanged; pull-to-refresh kept via `Screen`.

**Files changed:**
- `mobile/src/app/(student)/qr-code.tsx` — new layout over Screen + QrPass; StateView blocked; comments translated.
- `mobile/src/components/student-qr/qr-pass.tsx` (+test) — new QrPass and QrPassRouteLine.
- `mobile/src/components/student-qr-code.tsx` — chrome derived from tokens to match the pass.
- `mobile/src/student-qr-screen.test.tsx` — first screen test: full state matrix, refresh, offline, invalid session.

**Review:** 21 findings (edge 4, blind 11, intent 4, verification 2). Patches applied: 5 entries from 8 rows (all low). Deferred: 3 items from 4 rows (low, pre-existing). Rejected: 9 — 5 false and 4 low (empty name, landscape insets, note alignment, QR growing on <368dp) not worth the added complexity or unreachable; reasons in the Review Triage Log.

**Follow-up review recommended:** false — patched counts: high 0, medium 0, low 5.

**Verification:** mobile `npm test` 55 suites / 687 tests green; `npm run lint` clean; `npx tsc --noEmit` 3 errors, identical to baseline (scan.tsx, use-trip-gps-capture.test.tsx, tracking-stream.service.test.ts). Manual (implementer): Expo Web + mocks, Chromium 390×844 and 360×800, 4 mock students — no horizontal overflow; the QR captured from the pass decoded with zxing-wasm matched the student payload in all 8 cases.

**Residual risks:** No native device check of the pass (brand yellow and QR scan on the AVDs). The "desatualizada" line was only exercised in Jest (no mock account triggers an error with cached route). Snackbar action still uses Paper's default purple (out of scope, all screens).
