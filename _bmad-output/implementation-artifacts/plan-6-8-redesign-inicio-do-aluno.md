---
title: 'Story 6.8: redesign do Início do Aluno'
type: 'feature'
ticket: '6-8-redesign-inicio-do-aluno'
created: '2026-09-26'
status: 'built'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '5588ae9d1b7da753eaf6db2200dfdbc09e386ad2'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      TripStatusCard state changes (waiting -> checked in, registered -> consolidated) are not announced to screen readers.
    evidence: |-
      The card has no accessibilityLiveRegion; the pre-6.8 Paper Card had none either, so poll-driven flips were already silent. Banner and CountdownPill do announce.
    location: >-
      mobile/src/components/student-home/trip-status-card.tsx
    severity: low
  - summary: >-
      The consolidated absence card (window expired) gives no guidance on how to reverse it.
    evidence: |-
      After the window closes the card shows only title/detail; "Avise o motorista pessoalmente" appears only in the Snackbar after a CANCELLATION_PERIOD_EXPIRED race. Same as the pre-6.8 "Ausência registrada" card.
    location: >-
      mobile/src/app/(student)/home.tsx
    severity: low
  - summary: >-
      Countdown can flash a stale value for up to 1s when the absence arrives after the tick stopped.
    evidence: |-
      nowMs is only refreshed by the 1s interval, which runs only while isCounting; an absence that lands minutes after mount renders against the mount-time nowMs until the first tick (pill "Desfazer em 15:00", or Desfazer briefly shown after expiry). Logic unchanged from pre-6.8 ("Janela de cancelamento").
    location: >-
      mobile/src/app/(student)/home.tsx (nowMs / isCounting)
    severity: low
---

<intent-contract>

## Intent

**Problem:** A home do aluno é uma pilha centralizada de botões colados ("Meu QR Code"/"Acompanhar ônibus" sem gap), não mostra o estado da viagem nem do embarque até algo acontecer, e "Não vou voltar" tem o mesmo peso do rastreio (EXPERIENCE.md → auditoria `(student)/home`, "Aluno › Início — P0", Flow 4; Story 6.8 em `epics.md`).

**Approach:** Painel do dia sobre `Screen` (scroll) + `StickyActionBar`: saudação `titleLg` à esquerda, cartão de status da viagem com `StatusChip` e horário, dois `ShortcutCard` 112dp lado a lado, lembrete como `Banner` warning, "Não vou voltar" `secondary` no rodapé, ausência com novo `CountdownPill` + "Desfazer", dialog via `ConfirmDialog` "Avisar motorista". Testes Jest e e2e migram no mesmo PR.

## Boundaries & Constraints

**Always:**
- Lógica intocada: queries (`activeTripOptions` + poll 15s, `studentBoardingStatusOptions`, `['studentReminder', tripId]`), `RACE_OUTCOMES`, `ERROR_MESSAGES`, `applyRaceOutcome`, as duas mutations e suas keys por tentativa (`attemptKeyRef`/`cancelAttemptKeyRef`), `cancelQueries` antes de `setQueryData`, invalidação do reminder, fechar dialog quando o poll resolve o estado, filtro `serverStatus.tripId === tripId`, countdown derivado só de `cancellableUntil` (tick 1s), `router.navigate` (não `push`), Snackbar 4s com as mesmas mensagens.
- NFR19: "Não vou voltar" = 2 toques (rodapé → "Avisar motorista"). Nenhuma confirmação nova.
- Só tokens de `lib/tokens.ts`/`lib/palette.ts`; ícones MDI via `MdiIcon`; status = cor + ícone + rótulo; sem `opacity` em texto.
- Microinterações respeitam `useReducedMotion()` (cross-fade 120ms ou corte); háptico fica fora do web.
- Comentários/commits em inglês.

**Never:**
- Mudar API, contrato ou `api/openapi.json`; mudar `_layout.tsx` (títulos de header ficam).
- Novo estado "offline — leitura", ação "Tentar novamente" no Snackbar ou Skeleton (Story 6.11).
- Pull-to-refresh novo na home; ação no Banner do lembrete (o rodapé é a única entrada, evita dois botões "Não vou voltar").
- Criar `*.test.tsx` sob `src/app/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sem viagem | `activeTrip` null / pending / error | Cartão sem chip com o `tripHint` atual (3 textos mantidos); rodapé com "Não vou voltar" desabilitado | — |
| Aguardando | viagem ACTIVE, status null ou `NOT_CHECKED_IN` | Chip "Aguardando" (`clock-outline`, neutral), "Viagem de volta em andamento", "Iniciada às HH:mm"; rodapé habilitado | — |
| Embarcou | `CHECKED_IN` | Chip `status="CHECKED_IN"`, "Embarque confirmado" + "O motorista registrou seu embarque na volta."; sem rodapé, sem banner | — |
| Ausência na janela | `NOT_RETURNING`, agora < `cancellableUntil` | Chip "Não vai voltar", "Motorista avisado", "Avisado às HH:mm" (de `notifiedAt`), `CountdownPill` "Desfazer em M:SS", botão `secondary` "Desfazer"; sem rodapé | Falha do cancelamento → Snackbar atual |
| Ausência consolidada | janela expirada ou `absence: null` | Mesmo cartão sem pill, sem "Desfazer", sem "Avisado às" quando `absence` é null | — |
| Lembrete | reminder != null, não registrado, não embarcado | `Banner` warning título "E a volta?" + "Você ainda não confirmou o retorno. Se não vai voltar, avise o motorista." acima do cartão | GET falha → banner some, tela segue |
| Últimos 30s | restante ≤ 30s | Texto da pill em `warning` bold | — |

</intent-contract>

## Code Map

- `mobile/src/app/(student)/home.tsx` -- tela inteira (453 linhas); toda a lógica das linhas 20–262 fica; só o JSX (264–404) e `styles` são refeitos. `formatCountdown` sai para o `CountdownPill`.
- `mobile/src/components/ui/{screen,sticky-action-bar,primary-action,status-chip,banner,confirm-dialog,mdi-icon}.tsx` -- reuso. `StatusChip` aceita `{status}` ou `{label, icon, tone}`. `ConfirmDialog` bloqueia dismiss durante `loading` (aceito; `handleDismissDialog` continua correto). `PrimaryAction` tem `impact` (háptico de seleção) e `testID`.
- `mobile/src/lib/boarding-status.ts` -- `STATUS_PRESENTATION` (rótulos "Embarcou"/"Não vai voltar"); não alterar.
- `mobile/src/components/trip/trip-card.tsx:27` -- formatação `toLocaleTimeString('pt-BR', {hour, minute})` para "HH:mm"; copiar o idioma.
- `mobile/src/components/scan/scan-result-overlay.tsx:64-77` -- padrão de háptico `notificationAsync` (web ignorado, `.catch(() => {})`).
- `mobile/src/components/ui/banner.tsx` -- ganha `title?` opcional.
- `mobile/src/student-home.test.tsx` -- 842 linhas, ~90 consultas por texto; padrão de montagem de tela (QueryClientProvider, mocks de services/router, sem PaperProvider).
- `api/tests/support/helpers/e2e-driver.ts:45-55`, `api/tests/e2e/tracking-live.e2e.spec.ts:151`, `api/tests/e2e/absence-reminder.e2e.spec.ts:150-361` -- seletores e2e da home.

## Tasks & Acceptance

**Execution:**
- [ ] `mobile/src/components/ui/countdown-pill.tsx` (+ `.test.tsx`) -- novo: props `remainingMs`, `label` (ex. "Desfazer em"), `testID`; pílula `statusTints.warning`, ícone `timer-sand`, texto único `"<label> M:SS"` tabular; ≤30s texto `warning` bold; `accessibilityLabel` por minuto ("Desfazer em até N min"), `accessibilityLiveRegion="polite"`; exporta `formatCountdown` -- CountdownPill do DESIGN.md.
- [ ] `mobile/src/components/ui/banner.tsx` (+ teste) -- `title?` renderizado em `typography.label` acima da mensagem -- "E a volta?" continua um nó de texto exato.
- [ ] `mobile/src/components/student-home/shortcut-card.tsx` (+ `.test.tsx`) -- `Pressable` 112dp, `elevation.level1`, `radius.lg`, ícone MDI 32dp, rótulo `typography.title`, `accessibilityRole="button"`, `accessibilityLabel`=rótulo, escala 0,97/`motion.press` (reduzido: sem escala), `flex: 1`.
- [ ] `mobile/src/components/student-home/trip-status-card.tsx` (+ `.test.tsx`) -- cartão `level1` com overline "VIAGEM DE VOLTA", chip opcional, título, detalhe, caption de hora, `children` (pill + Desfazer); fade de entrada 250ms ao mudar `stateKey` (reduzido: 120ms).
- [ ] `mobile/src/app/(student)/home.tsx` -- montar a matriz acima: `Screen variant="scroll"` com `footer` = `StickyActionBar` [`PrimaryAction` secondary "Não vou voltar", `icon="bus-alert"`, `impact`, `testID="home-not-returning"`, disabled `!tripId || notifyMutation.isPending`] só quando nem embarcado nem registrado; saudação `titleLg` à esquerda; banner; cartão; linha com `ShortcutCard` "Meu QR" (`qrcode`, testID `home-qr-shortcut`) e "Onde está o ônibus" (`bus-marker`, testID `home-track-shortcut`) com gap `spacing[3]`; `ConfirmDialog` título "Não vou voltar?", mensagem atual, `confirmLabel="Avisar motorista"`, `loading={notifyMutation.isPending}`; "Desfazer" `secondary` `undo-variant` com loading/disabled atuais; `notificationAsync(Success)` no `onSuccess` do notify (não-web); Snackbar como irmão do `Screen`; remover comentários obsoletos do JSX.
- [ ] `mobile/src/student-home.test.tsx` -- migrar: "Meu QR Code"→testID/`Meu QR`; "Confirmar"→"Avisar motorista"; "Cancelar"→"Desfazer"; `/Janela de cancelamento …/`→`/Desfazer em …/`; "Ausência registrada"→"Motorista avisado"; dois "Não vou voltar"→um. Adicionar: chip por estado, "Iniciada às"/"Avisado às", rodapé ausente em embarcado/registrado, navegação dos dois atalhos.
- [ ] `api/tests/support/helpers/e2e-driver.ts`, `api/tests/e2e/tracking-live.e2e.spec.ts`, `api/tests/e2e/absence-reminder.e2e.spec.ts` -- mesmos renomes; `toHaveCount(2)`→um botão; comentários ajustados.

**Acceptance Criteria:**
- Given o aluno abre o Início, when a tela renderiza, then a saudação fica à esquerda, o cartão de status aparece acima de "Meu QR" e "Onde está o ônibus" lado a lado (112dp, com espaço), e tocar cada um chama `router.navigate` com `/(student)/qr-code` e `/(student)/track-bus`.
- Given viagem de volta ativa sem ausência, when o aluno toca "Não vou voltar" no rodapé e depois "Avisar motorista", then o POST sai com o tripId (2 toques) e o cartão vira "Motorista avisado" com a pill e "Desfazer".
- Given ausência na janela, when toca "Desfazer", then o cancelamento sai em 1 toque e o rodapé volta.
- Given `npm test`, when roda, then todas as suítes passam, incluindo as migradas.

## Design Notes

"Motorista avisado" e "Desfazer em 4:59" vêm do Flow 4 do spine (vence mock). Detalhe do cartão registrado: "Você não vai voltar nesta viagem." (o título já diz que o motorista sabe). "Aguardando" é rótulo próprio do aluno — não reusa "Não embarcou" do roster, por isso `StatusChip` na forma `{label, icon, tone}`.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: todas as suítes verdes.
- `cd mobile && npm run lint` -- expected: sem erros.
- `cd mobile && npx tsc --noEmit` -- expected: nenhum erro novo além da baseline.
- `cd api && npx eslint tests/e2e/absence-reminder.e2e.spec.ts tests/e2e/tracking-live.e2e.spec.ts tests/support/helpers/e2e-driver.ts` -- expected: 0 erros.

**Manual checks (if no CLI):**
- Expo Web com `EXPO_PUBLIC_USE_MOCKS=1`, Chromium 390×844: capturas da home aguardando, com lembrete e com ausência registrada; nada truncado, atalhos lado a lado.

## Implementation Notes

- Implemented by a subagent in 7 commits (17da303..e6e8eb5) plus review fixes in 015ab17. `STATE_FADE_MS = 250` is local to `trip-status-card.tsx` (no 250ms token; `tokens.test.ts` pins the list). Shortcut cards got `flexGrow: 1` so both stay equal height when "Onde está o ônibus" wraps at 390px (122dp each). `api/tests/README.md` wording updated for the renamed copy.

## Plan Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 28 findings — high 0, medium 0, low 16, false 12, maybe-false 0
- findings:
  - `[low]` `[reject]` (intent) layout (left greeting, side by side, 112dp, gap) asserted on styles, not geometry — Jest cannot measure layout; the implementer's Expo Web 390×844 screenshots confirmed it; geometry checks would need a new visual harness.
  - `[low]` `[patch]` (intent) checked-in card has no time although the AC asks for chip "e horário" — added the "Iniciada às HH:mm" caption to the checked-in branch and asserted it.
  - `[low]` `[patch]` (intent) queries for renamed copy were rewritten to the new text instead of preserved or moved to testID — migrated to existing testIDs (dialog confirm, undo, QR shortcut, pill) plus a per-state title testID; one pill-format text check kept.
  - `[false]` `[reject]` (intent) reminder banner lost its own "Não vou voltar" (4.4 entry) — the AC only requires a warning Banner; the footer opens the same dialog/mutation in 2 taps, covered by the rewritten 4.4 test.
  - `[false]` `[reject]` (intent) copy beyond the ACs ("Avisar motorista", "Meu QR", "Onde está o ônibus", "Desfazer") — all from EXPERIENCE.md "Aluno › Início — P0"/Flow 4, which the AC cites as the spec.
  - `[false]` `[reject]` (blind) stack titles "Meu QR Code"/"Acompanhar ônibus" differ from shortcut labels — EXPERIENCE.md names the screens that way and gives the shorter entry labels; intentional.
  - `[false]` `[reject]` (blind) selection haptic on the footer tap instead of the confirm tap — EXPERIENCE.md lists "Não vou voltar" as the impact action; ConfirmDialog applies impact only to destructive confirms by design.
  - `[false]` `[reject]` (blind) undo gives no haptic/announcement — the spec's microinteraction table defines none for undo; the card cross-fade is the specified feedback.
  - `[low]` `[defer]` (blind) TripStatusCard changes not announced (no live region) — pre-existing (old card had none); deferred.
  - `[low]` `[reject]` (blind+edge) card shows "Aguardando" and the footer is enabled while the status GET is unresolved — the plan's matrix deliberately maps null to waiting (old UI also enabled the button); misleading only on cold cache with an existing absence, resolved by the first GET; fix adds a new state.
  - `[low]` `[defer]` (blind) consolidated card lacks reversal guidance — pre-existing copy behavior; deferred.
  - `[false]` `[reject]` (blind) waiting card overline repeats "Viagem de volta" in the title — overline + title mirrors the DESIGN.md TripCard pattern; no named harm.
  - `[false]` `[reject]` (blind) toLocaleTimeString without fallback — same idiom as trip-card.tsx/student-row.tsx, validated on the AVDs in 6.5; the server always sends ISO timestamps.
  - `[false]` `[reject]` (blind) pill warning-on-tint contrast unchecked — palette.ts documents amber at ~3.67:1 on its tint, allowed by the accessibility floor only bold/with icon; the pill's last-30s text is bold with the timer-sand icon (same pairing as the NOT_RETURNING StatusChip).
  - `[low]` `[patch]` (blind) footer `impact` selection haptic never asserted — added a native test expecting Haptics.selectionAsync on pressing home-not-returning.
  - `[low]` `[reject]` (blind) ShortcutCard has no pressed feedback under reduced motion — affects only reduced-motion users; fix adds a new pressed-style/ripple path.
  - `[false]` `[reject]` (blind) removed tap-count comment with no test for "QR in 1 tap" — the shortcut test presses the card once and asserts router.navigate('/(student)/qr-code').
  - `[false]` `[reject]` (blind) nested status ternary — readability preference with no named harm.
  - `[low]` `[patch]` (blind) comment in cancelMutation.onSuccess breaks mid-sentence — reflowed.
  - `[false]` `[reject]` (blind) e2e depends on testID → data-testid — the 6.7 e2e already relies on it (roster counter by testID); stable in react-native-web.
  - `[false]` `[reject]` (blind) helper doc comment still says "atalho 'Meu QR'" — it still describes that shortcut accurately.
  - `[low]` `[patch]` (verification) equal-height fix `flexGrow: 1` not asserted — added to the card style assertion in shortcut-card.test.tsx.
  - `[low]` `[patch]` (verification, same root cause as the blind haptic row) footer selection haptic not verified at the home — same fix.
  - `[low]` `[patch]` (verification) handleDismissDialog comment describes a mid-flight dismiss that ConfirmDialog now blocks — comment rewritten to call the isPending guard defensive; code kept.
  - `[low]` `[defer]` (edge) stale nowMs when the absence lands after the tick stopped — pre-existing logic kept intact by the plan; deferred.
  - `[low]` `[reject]` (edge) Snackbar overlays the footer for 4s after an error — error path only; fix requires measuring the footer height.
  - `[low]` `[reject]` (edge) dialog stays open with an enabled confirm if the trip ends while it is open — rare; handleConfirm ignores the tap safely; fix adds an effect.
  - `[low]` `[patch]` (edge, same root cause as the handleDismissDialog row) isPending branch unreachable while loading — same comment fix.

## Auto Run Result

**Summary:** Student home rebuilt as a day panel: left-aligned greeting, TripStatusCard with StatusChip + time per state, "Meu QR"/"Onde está o ônibus" ShortcutCards side by side, reminder as warning Banner, "Não vou voltar" as secondary in the StickyActionBar (2 taps via ConfirmDialog "Avisar motorista"), registered absence with CountdownPill + "Desfazer". Query/mutation/race/countdown logic unchanged.

**Files changed:**
- `mobile/src/app/(student)/home.tsx` — new layout over Screen/StickyActionBar; success haptic on notify.
- `mobile/src/components/ui/countdown-pill.tsx` (+test) — new pill, per-minute announcement, last-30s emphasis.
- `mobile/src/components/ui/banner.tsx` (+test) — optional `title`.
- `mobile/src/components/student-home/shortcut-card.tsx` (+test) — 112dp tappable card.
- `mobile/src/components/student-home/trip-status-card.tsx` (+test) — status card with fade on state change.
- `mobile/src/student-home.test.tsx` — migrated to new copy/testIDs, 12 new 6.8 cases.
- `api/tests/e2e/absence-reminder.e2e.spec.ts`, `api/tests/e2e/tracking-live.e2e.spec.ts`, `api/tests/support/helpers/e2e-driver.ts`, `api/tests/README.md` — selectors/copy.

**Review:** 28 findings. Patches applied: 6 entries (all low). Deferred: 3 (low, pre-existing). Rejected: 17 (12 false, 5 low not worth the added complexity); 8 patched rows grouped into 6 entries — reasons in the Review Triage Log.

**Follow-up review recommended:** false — patched counts: high 0, medium 0, low 6.

**Verification:** mobile `npm test` 53 suites / 665 tests green; `npm run lint` clean; `npx tsc --noEmit` 3 errors, identical to baseline 5588ae9 (scan.tsx, use-trip-gps-capture.test.tsx, tracking-stream.service.test.ts); api eslint on the three e2e files 0 errors. Manual: Expo Web + mocks at 390×844 (student-status/reminder responses stubbed in the browser) — waiting, reminder, dialog and registered states render without truncation.

**Residual risks:** Playwright e2e not executed (needs API + DB + Expo Web); selector changes reasoned from the rendered screen. `absence-reminder › fora da janela` was already failing before this story (deferred in plan-6-7). No native device check of the new home.
