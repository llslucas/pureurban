---
title: 'Story 6.6: redesign do Escanear QR (clímax da demo)'
type: 'feature'
ticket: '6-6-redesign-escanear-qr'
created: '2026-09-26'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
baseline_revision: '798c8bf081f4c221ba6749bc451170194a4ad52e'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The scan screen test has no case for "Tentar novamente" resending with the same idempotency key, nor for QUEUE_FULL from the screen.
    evidence: |-
      Gap predates this story (the screen test only covered blocked states before 6.6); the retry/idempotency logic was not changed here. mockUuid/expo-crypto mocks were added but never asserted.
    location: >-
      mobile/src/scan-screen.test.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** O scan é o clímax da demo, mas o sucesso não diz quem embarcou, o contador é da sessão (não da viagem), o ícone é glifo de texto (`✓ ✕ !`), a auto-retomada de 2,5s não tem indicação de tempo, "Ver lista" tem 44dp e não há háptico nem animação (EXPERIENCE.md → Achados, `audit/light-13..16`).

**Approach:** Primeiro commit extrai de `scan.tsx`, sem mudar comportamento, o overlay de resultado e os estados bloqueados. Depois o restyle de "Motorista › Escanear — P0": `ScanResultOverlay` (nome do aluno do roster em cache, ícone MDI em círculo, barra regressiva, háptico por tom mapeado em `utils/scan-feedback.ts`), `ScanHud` (X/Y da viagem do roster em cache + otimista, sessão como linha secundária, "Ver lista" 48dp) e `ScanFrame` (linha de varredura Reanimated + dica).

## Boundaries & Constraints

**Always:**
- Lógica da 3.3b/3.4b intocada: `describeFailure`, códigos, tons, títulos, detalhes, `canRetry`, `isBusy`/`isSubmitting`/`lastSuccessStudentId`, idempotência, fila offline, `SUCCESS_RESUME_MS` 2500, só sucesso e enfileirado auto-retomam, gate de foco, `useFocusEffect(resume)`, hook E2E.
- Contrato de teste: textos `Embarque confirmado`, `Verificando...`, `Escanear próximo`, `Tentar novamente`, `Ir para Viagem`, `Ver lista` (role button), títulos da tabela, textos dos estados bloqueados, e a linha de sessão `N embarque(s) nesta sessão` (regex do `e2e-driver.ts:39`) permanecem.
- Nenhuma string única do HUD igual a `X/Y embarcados` nem `accessibilityLabel` contendo `X de Y embarcados` — a lista (`student-list.tsx:304`) e o trip (`getByLabel`) ficam montados na mesma pilha e o Playwright falharia em strict mode.
- Sem hex fora de `lib/palette.ts` exceto o chrome de câmera na `ALLOWLIST` da guarda (mover as entradas junto com o código); translúcidos via `withAlpha`; tipografia de `lib/tokens`.
- `useReducedMotion()`: sem escala/tremor/varredura; háptico e barra regressiva permanecem.
- Háptico nunca no web (`Platform.OS !== 'web'`) e falha de háptico engolida (`.catch(() => {})`), como `PrimaryAction`.

**Never:**
- Nova dependência nativa; mudar serviços, query keys, API ou os textos de `describeFailure`.
- Traço SVG do check, `PermissionCard` genérico (6.11), som.
- Substituir o título "Embarque confirmado" pelo nome.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sucesso, aluno no roster | QR válido, 201, roster em cache | Overlay verde: ícone `check-bold`, "Embarque confirmado", nome (`titleLg`), detalhe; barra 4dp esvazia em 2,5s; háptico Success; toque em qualquer lugar retoma; anúncio "Ana Souza embarcou" | — |
| Sucesso, aluno fora do roster | roster ausente/sem o id | Igual, sem linha de nome; anúncio "Embarque confirmado" | — |
| Enfileirado | falha de transporte, enfileirou | Overlay `offline`, `cloud-upload-outline`, barra regressiva, toque retoma, háptico Light | — |
| Já embarcou | 409 DUPLICATE | Âmbar, `alert`, título ≥24 e detalhe ≥20 bold, nome se conhecido, háptico Warning, sem auto-retomada | — |
| Falha / QR inválido | 4xx, INVALID_QR local | Vermelho, `close-thick`, háptico Error, ações atuais | — |
| Sem conexão (fila indisponível) | NETWORK_ERROR / REQUEST_TIMEOUT | Tom `offline`, `cloud-off-outline`, háptico Error, "Tentar novamente" | — |
| HUD | roster `{boarded:11,total:38}`, 1 sucesso nesta sessão ainda não refletido | "12" / "/38" + "embarcados" + "1 embarque nesta sessão" + "Ver lista" 48dp | roster indefinido/erro → "—" |
| HUD após refetch | aluno já `CHECKED_IN` no roster | não conta duas vezes | — |
| Ocioso | câmera ativa | linha de varredura 1,8s ida-e-volta dentro da janela; "Aponte para o QR do aluno" abaixo | pausa quando `isPaused`; sem linha com reduced motion |

</intent-contract>

## Code Map

- `mobile/src/app/(driver)/scan.tsx` -- 708 linhas. `ScanResult` union (37-50), `TONE_COLOR` (70-78), `submit` (187-256: sucesso 196-213, enfileirado 228-246), `handleScan` (258-322, `payload.studentId` disponível), blocos bloqueados (345-472: role, permissão ×2 com `actionError`, loading, erro, sem viagem, `cameraError`), HUD `counterBar` (495-515), overlays (517-607), estilos. `boardedCount` é da sessão.
- `mobile/src/components/qr-scanner.tsx` -- `CameraView` + máscara de 4 painéis + `Corner`s; `isPaused` desliga `onBarcodeScanned`. Extrair máscara/cantos para `ScanFrame` e adicionar linha + dica; `QrScanner` mantém nome/props (o teste da tela o moca).
- `mobile/src/utils/scan-feedback.ts` -- `Tone`, `ScanFeedback`, `describeFailure`, `QUEUED_FEEDBACK`, `QUEUE_FULL_FEEDBACK`, `feedbackIcon` (glifo; único consumidor é `scan.tsx`). Trocar por mapeamentos MDI + háptico. Teste: `scan-feedback.test.ts:125,142`.
- `mobile/src/lib/trip-queries.ts` -- `tripStudentsOptions(tripId)` (roster `{students:[{studentId,name,status,checkedInAt}], summary:{boarded,total}}`, `enabled` só com id); `summary.total` já exclui NOT_RETURNING.
- `mobile/src/components/ui/` -- `PrimaryAction` (`variant="on-color"`, `color`, `quiet`), `StateView`, `MdiIcon`, `BoardingCounter` (padrão Reanimated + `useReducedMotion`), `test-utils.tsx` (`renderUi`). `mobile/src/lib/palette.ts` -- `lightPalette`, `withAlpha`. `mobile/src/lib/tokens.ts` -- `typography.headline/titleLg/title/bodyLg/caption`, `spacing.touchMin`, `motion`.
- `mobile/src/scan-screen.test.tsx` -- moca `QrScanner` como `() => null`, `tripService.getTripStudents`, `boardingService.checkIn`; hoje só estados bloqueados.
- `mobile/src/lib/palette.guard.test.ts:87-99` -- `ALLOWLIST` de `qr-scanner.tsx` e `scan.tsx` (preto, `rgba(0,0,0,0.6)`, `rgba(0,0,0,0.55)`, `rgba(255,255,255,0.16)`); entrada morta ou arquivo inexistente falham. `:612-619` -- source-lock de `TONE_COLOR`/Verificando em `scan.tsx`: mover para o arquivo do overlay.
- `api/tests/support/helpers/e2e-driver.ts:37-39`, `api/tests/e2e/boarding-happy-path.e2e.spec.ts:76-80`, `boarding-invalid-qr.e2e.spec.ts:52,72`, `boarding-offline-sync.e2e.spec.ts:71` -- seletores do scan; devem passar sem edição.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/scan/scan-result-overlay.tsx`, `mobile/src/components/scan/scan-blocked-states.tsx`, `mobile/src/app/(driver)/scan.tsx`, `palette.guard.test.ts` -- extração verbatim (overlay checking/success/failure com `TONE_COLOR`; role guard, permissão com `actionError` interno, sem viagem) com `scan.tsx` importando; commit próprio com a suíte verde -- guarda-corpo do épico.
- [x] `mobile/src/utils/scan-feedback.ts` (+ test) -- `feedbackIcon` passa a devolver `MdiIconName` (sucesso/enfileirado → ver matriz); novo `feedbackHaptic` → `'success'|'warning'|'error'|'light'`; entradas para o sucesso (`kind: 'success'`) -- mapeamento puro, fonte única.
- [x] `mobile/src/components/scan/scan-result-overlay.tsx` (+ test) -- ícone 96dp em círculo `withAlpha(onPrimary,0.2)`, título `headline`, nome `titleLg`, detalhe 20px bold, ações `PrimaryAction on-color`/`quiet` 56dp, barra regressiva 4dp no topo (`autoResumeMs`), `Pressable` de tela inteira nos estados que auto-retomam, `accessibilityLiveRegion="assertive"` com anúncio, entrada fade+escala 0,96→1 (180ms), tremor ±8dp no erro, balanço ±6° no âmbar, háptico disparado uma vez por resultado.
- [x] `mobile/src/components/scan/scan-hud.tsx` (+ test) e helper puro de contagem -- `boarded = summary.boarded + ids da sessão ainda não CHECKED_IN no roster`; "—" sem roster; linha de sessão com o texto atual; "Ver lista" 48dp translúcido com `router.navigate`.
- [x] `mobile/src/components/scan/scan-frame.tsx` (+ test), `mobile/src/components/qr-scanner.tsx` -- máscara/cantos movidos; linha 2dp `withAlpha(onPrimary,0.6)` com `withRepeat` 1,8s, cancelada com `isPaused` e ausente com reduced motion; dica `bodyLg` branca abaixo da janela.
- [x] `mobile/src/app/(driver)/scan.tsx` -- `useQuery(tripStudentsOptions(activeTrip?.id))` antes dos returns; guardar `studentName` (e ids da sessão) no resultado; compor HUD/overlay; nenhum estilo com cor além do chrome preto.
- [x] `mobile/src/scan-screen.test.tsx` -- moca `QrScanner` capturando `onScan` e `expo-haptics`; casos: nome do roster no sucesso, fallback sem nome, HUD X/Y + otimista sem dupla contagem, háptico por tom (Success/Warning/Error/Light), toque no overlay de sucesso retoma, falha não retoma por toque, "Ver lista" navega.
- [x] `mobile/src/lib/palette.guard.test.ts` -- `ALLOWLIST` e source-lock seguindo o código movido.

**Acceptance Criteria:**
- Given um check-in bem-sucedido de aluno no roster, when o overlay aparece, then o nome do aluno está visível junto de "Embarque confirmado" e o háptico de sucesso foi disparado.
- Given qualquer overlay, when inspeciono o render, then não há glifo `✓ ✕ !` como ícone — só MDI.
- Given as suítes, when rodo Jest e os e2e de boarding, then passam com os seletores atuais inalterados.

## Implementation Notes

- 6 commits over `798c8bf`: extraction without behavior change (29492d4), overlay (5e3db4e), ScanFrame (f147e21), HUD + wiring + `utils/trip-boarded-count.ts` (0a48604), mask-over-corners fix found in screenshots (25c7044, pre-existing), review patches (d4e4203).
- Off the Code Map: new pure helper `mobile/src/utils/trip-boarded-count.ts` (+ test); `QrScanner` keeps its name/props and renders `ScanFrame`; corners now use `onPrimary`, so `#ffffff` left the guard allowlist.
- "Escanear próximo" becomes `quiet` (48dp) when retry/"Ir para Viagem" is present — DESIGN.md defines `quiet` as the 48dp text button; the primary on-color actions stay 56dp.
- e2e: the 4 boarding specs green against the real API on :3001 (port 3000 busy on the Windows side), with no test edits. Screenshots (idle, success with name, already boarded, invalid QR, queued) in the session scratchpad, not versioned — 6.12 collects them.
- Haptics verified only under Jest (no device available).

## Plan Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 29 findings — high 0, medium 0, low 16, false 8, maybe-false 0 (+5 descriptive intent notes logged as rejected)
- findings:
  - `[false]` `[reject]` (blind) session ids leak into the next trip — scan is a Stack screen above trip; ending a trip requires popping back to trip, which unmounts scan and its state.
  - `[low]` `[patch]` (blind) out-of-roster/rejected ids can push boarded past total — `Math.min(…, total)` + test (d4e4203).
  - `[low]` `[reject]` (blind) rejected queued check-ins never leave the optimistic count — needs drain→screen reconciliation (new plumbing) for a rare offline-rejection case; capped by the patch above.
  - `[low]` `[reject]` (blind) session line counts repeats, trip count dedupes — session line keeps the pre-6.6 per-check-in semantics; repeats only via re-queued offline scans.
  - `[low]` `[patch]` (blind) `cachedStudentName` comment says "never fetched" — comment reworded (d4e4203).
  - `[low]` `[reject]` (blind) `accessibilityLiveRegion` Android-only — target platform is Android (demo AVDs); iOS announce would add a new code path.
  - `[low]` `[reject]` (blind) countdown animates `width` and may drift vs the timer — same pattern as BoardingCounter; drift is one frame, overlay unmounts at the timer.
  - `[low]` `[patch]` (blind) Portuguese comments carried into new files — translated to English in the 4 scan components (d4e4203).
  - `[low]` `[reject]` (blind) `utils/scan-feedback.ts` imports `MdiIconName` type — type-only import, same as `lib/boarding-status.ts`; no named harm.
  - `[low]` `[defer]` (blind) screen test lacks retry-same-key / QUEUE_FULL cases, unused mocks — pre-existing gap; deferred.
  - `[low]` `[patch]` (blind) checking test never asserts background — `testID="scan-overlay"` + background assertion (d4e4203).
  - `[low]` `[reject]` (blind) HUD texts uncapped at large font scale — spec caps only the count; layout floor is fontScale 1.3.
  - `[false]` `[reject]` (blind) offline duplicate pre-check from roster — would change 3.3b/3.4b rules, which the intent freezes.
  - `[false]` `[reject]` (blind) HUD/countdown ignore safe area — scan route shows the Stack header (`(driver)/_layout.tsx`), so `top: 0` sits below it.
  - `[low]` `[reject]` (blind) ScanFrame tests fragile / no position check — no named failure; test-only refactor.
  - `[false]` `[reject]` (edge) session ids across trips — same refutation as the first row.
  - `[low]` `[reject]` (edge) queued-then-rejected phantom +1 — same as the blind row; capped.
  - `[low]` `[patch]` (edge) boarded can exceed total — same patch (d4e4203).
  - `[low]` `[patch]` (edge) a11y label "1 embarcados" — singular for 1 + test (d4e4203).
  - `[false]` `[reject]` (edge) negative scan-line travel for 0<height<2 — the window is 70% of the screen's short side (≥ ~250dp); unreachable.
  - `[low]` `[reject]` (edge) countdown starts after the timer — sub-frame offset; overlay unmounts on the timer.
  - `[false]` `[reject]` (edge) "Escanear próximo" 48dp violates NFR18 — 48dp is the floor in EXPERIENCE.md; 56dp applies to primary actions, and DESIGN.md defines `quiet` as 48dp.
  - `[low]` `[patch]` (verification-gap) haptic dedup guard never exercised — new test flips `useReducedMotion` to re-run the effect; fails without the guard (d4e4203).
  - `[low]` `[patch]` (verification-gap) failure announcement unasserted — DUPLICATE (with name) and NOT_ALLOWED (no name) label assertions (d4e4203).
  - `[false]` `[reject]` (intent) name not the headline — deliberate Design Note: keeps the e2e `Embarque confirmado` contract; name has its own `titleLg` line and the announcement is "Nome embarcou".
  - `[false]` `[reject]` (intent) no PermissionCard for camera — P0 spec says "Estados bloqueados via StateView"; PermissionCards are the 6.11 P1 scope; AC admits either.
  - `[false]` `[reject]` (intent) D-UX-9 contrast not measured — D-UX-9 approved "tipo grande" (≥24/20 bold) as the resolution, which the tests pin.
  - `[low]` `[reject]` (intent) tap-anywhere resume is a new interaction — required by EXPERIENCE.md (ScanResultOverlay, Gestos); behavior of the resume path unchanged.
  - `[low]` `[reject]` (intent) haptics/motion verified only in Jest — no device available (story 1.7 memory); left for the 6.12 visual gate.

## Design Notes

- Nome como linha própria, não título: preserva `getByText('Embarque confirmado')` do e2e e segue a anatomia do DESIGN.md (título `headline` + nome `titleLg` + detalhe). O anúncio de leitor de tela usa "Nome embarcou".
- Nome também em falhas quando o `studentId` decodificado está no roster (ex.: "Já embarcou" com o nome); QR inválido nunca tem nome.
- Contagem otimista por conjunto de ids (não `+1` cego): o `invalidateQueries` após o sucesso traz o aluno como `CHECKED_IN` e ele não conta duas vezes; enfileirados continuam somando até o dreno.
- HUD: número e "embarcados" em `Text` separados e rótulo acessível "12 embarcados de 38 na viagem" — ver Always sobre strict mode.
- Háptico: `notificationAsync(Success|Warning|Error)` e `impactAsync(Light)` (D-UX-3 adotado na 6.1); sem fallback `Vibration`.
- PermissionCard genérico fica para a 6.11 (mesma decisão da 6.5); a permissão de câmera segue em `StateView blocked`, o que a AC admite.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: suíte verde
- `cd mobile && npm run lint && npx tsc --noEmit` -- expected: 0 erros novos em relação à `main` (baseline: `scan.tsx:316`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172`)
- `grep -nE "#[0-9a-fA-F]{3,8}\b|[✓✕]" mobile/src/components/scan/*.tsx "mobile/src/app/(driver)/scan.tsx"` -- expected: só `#000000` do chrome de câmera
- `cd api && npm run test:pw:e2e -- boarding` -- expected: verde, se a infra local estiver de pé

**Manual checks:**
- Expo Web com mocks (390×844): capturas "depois" de ocioso, sucesso com nome, enfileirado, já embarcou, erro, comparadas com `audit/light-13..16`.

## Auto Run Result

- **Summary:** scan screen redesigned — ScanResultOverlay (student name from cached roster, MDI icon in circle, 4dp countdown, per-tone haptics via `utils/scan-feedback.ts`, enter/shake/sway with reduced motion), ScanHud (trip X/Y from cached roster + optimistic ids, session line kept, "Ver lista" 48dp), ScanFrame (Reanimated scan line + hint). 3.3b/3.4b logic untouched; first commit is a pure extraction.
- **Files:** `app/(driver)/scan.tsx` (composition + roster query), `components/qr-scanner.tsx` (renders ScanFrame), `components/scan/{scan-result-overlay,scan-hud,scan-frame,scan-blocked-states}.tsx` (+ tests), `utils/scan-feedback.ts` (MDI icon + haptic mapping), `utils/trip-boarded-count.ts` (count helper), `scan-screen.test.tsx` (flow tests), `lib/palette.guard.test.ts` (allowlist/source-lock follow the code).
- **Review:** 7 patches applied (all low), 1 deferred (low, pre-existing test gap), 21 rejected/false with reasons in the triage log.
- **Follow-up review:** false — no high or medium patched.
- **Verification:** `npm test` 597/597; `npm run lint` clean; `tsc --noEmit` only the 3 pre-existing errors; color/glyph grep only `#000000` camera chrome; boarding e2e 4/4 (before review patches, which touched only comments, a11y label, count cap and tests).
- **Residual risks:** haptics and animations not exercised on a device; e2e not rerun after the review patches.
