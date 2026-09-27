---
title: 'Story 6.11: polimento de estados (Skeleton, PermissionCard, OfflineBanner)'
type: 'feature'
ticket: '6-11-polimento-de-estados'
created: '2026-09-26'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '161059b045676ba4b06e248545e4405d5086d114'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The PermissionCard error note (failed permission prompt or settings) is not announced to screen readers.
    evidence: |-
      Pre-existing: the old StateView note (camera) and the old LocationPermissionCard error line had no live region or alert role either. Now that both requests share PermissionCard, one accessibilityLiveRegion/alert on the note covers them.
    location: >-
      mobile/src/components/ui/permission-card.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** As telas P0 redesenhadas (6.5–6.10) ainda mostram spinner genérico (`StateView kind="loading"`) enquanto carregam, a permissão de câmera é um `StateView` bloqueado enquanto a de localização já é cartão, e o `OfflineBanner` é faixa sem ícone com botão branco translúcido fora dos tokens (Story 6.11 em `epics.md`; EXPERIENCE.md → State Patterns e P1; DESIGN.md → Skeleton, OfflineBanner, PermissionCard).

**Approach:** Trocar os spinners de tela por skeletons com a forma do conteúdo final (preservando o nome acessível do carregamento), extrair um `PermissionCard` genérico usado por câmera e localização, e restilizar o `OfflineBanner` com ícones e tokens sem mudar texto, regras ou `testID`.

## Boundaries & Constraints

**Always:**
- Contrato de teste: textos visíveis de estados não-loading, nomes acessíveis, `testID`/`id` e `accessibilityRole` existentes ficam idênticos. O texto do carregamento ("Carregando viagem...", "Carregando alunos...", "Carregando sua viagem...", "Carregando rotas...", "Preparando câmera...") deixa de ser visível mas continua como `accessibilityLabel` do grupo de skeleton; testes que o buscavam por texto migram para `getByLabelText` no mesmo PR.
- `OfflineBanner`: texto literal da NFR13 e o de falha inalterados, `testID="offline-banner-dismiss"`, `accessibilityRole="alert"` nos textos, `accessibilityLiveRegion="polite"` no container, mesma posição (rodapé do layout do motorista) e mesmas regras de visibilidade.
- Só tokens de `lib/tokens.ts`/`lib/palette.ts`; ícones MDI via `MdiIcon`; nada de `opacity` em texto; ícones decorativos fora da árvore de acessibilidade. A guarda `palette.guard.test.ts` é atualizada no mesmo commit que remover o `rgba(255,255,255,0.92)`.
- Skeleton respeita `useReducedMotion()` (o componente da 6.2 já faz).
- Comentários/commits em inglês; commits atômicos na branch `feat/6-11-polimento-de-estados`.

**Never:**
- Mudar fluxos, navegação, lógica de query/SSE, regras da Tabela de Verdade do scan ou a API/`openapi.json`.
- Atraso de 400ms antes do skeleton, animação do contador do banner, anúncio de troca de estado no `StateView`, estado "offline — leitura" na home do aluno, splash de boot, tela de erro de mocks e `routes.tsx` (P2, Story 6.13) — fora do AC desta story.
- Mudar a linha de rota do `QrPass` (a 6.9 fixou carregamento como linha discreta na faixa) ou os spinners de ação (`PrimaryAction loading`, "checking" do `ScanResultOverlay`, boot do `_layout`).
- Transformar `+not-found` em tela própria: ele reexporta `index` (redirect, AC #3 de story anterior) e não tem superfície visual; o frame transitório já usa `navigationTheme` (6.1).
- Remover `kind: 'loading'` da API do `StateView`.
- Criar `*.test.tsx` sob `src/app/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Trip carregando | `isLoadingTrip` | Skeleton do `TripCard` dentro de `Screen`; label "Carregando viagem..." | — |
| Rotas carregando | `startOutboundPhase === 'loading'` | Skeleton da seção (bloco do estado vazio + 2 linhas de seletor 56dp); label "Carregando rotas..."; `testID="start-outbound-state"` mantido | — |
| Lista carregando | trip pending / roster pending sem cache / sem `data` | Skeleton: cabeçalho do contador + 6 `StudentRow` (avatar circular + 2 linhas + chip); label do ramo ("Carregando viagem..." ou "Carregando alunos...") | — |
| Track-bus carregando | `tripStatus === 'pending'` | Skeleton do `BusEtaCard` dentro de `Screen`; label "Carregando sua viagem..." | — |
| Scan carregando | `!permission` / `tripStatus === 'pending'` | Skeleton da tela de scan (faixa do HUD + janela quadrada central); labels "Preparando câmera..." / "Carregando viagem..." | — |
| Câmera pede permissão | `granted: false, canAskAgain: true` | `PermissionCard` ícone `camera`, "Permissão da câmera", texto atual, ação primária "Permitir acesso à câmera" | Rejeição → nota vermelha com o texto atual |
| Câmera bloqueada | `canAskAgain: false` | `PermissionCard` ícone `camera-off`, "Câmera bloqueada", "Abrir configurações" | Falha de `openSettings` → nota atual |
| Localização | motorista/aluno sem permissão | `LocationPermissionCard` renderiza via `PermissionCard`; `testID`s, textos e variante secundária iguais | Nota de erro inalterada |
| Offline pendente | `pendingCount > 0` | Faixa `banner-offline` (fundo `textBody`, texto `onPrimary`) com ícone `cloud-off-outline` + texto NFR13 com contador | — |
| Falha definitiva | `failedCount > 0` | Faixa `banner-error` (fundo `error`) com ícone `alert-circle-outline`, texto e "Dispensar" `quiet` em `onPrimary`, alvo ≥ 48dp | Sem `onDismissFailed` → sem botão |

</intent-contract>

## Code Map

- `mobile/src/components/ui/skeleton.tsx` -- `Skeleton` (shimmer, reduced motion, oculto da a11y). Adicionar aqui `SkeletonGroup({ label, children, testID, style })`: container `accessible`, `accessibilityRole="progressbar"`, `accessibilityLabel={label}`, `accessibilityState={{ busy: true }}`.
- `mobile/src/components/ui/state-view.tsx` -- mantém `loading` na API; não mudar.
- `mobile/src/components/ui/primary-action.tsx` -- variantes `primary`/`secondary`/`quiet` (+`color`), repassa `testID`. Reusar no `PermissionCard` e no "Dispensar".
- `mobile/src/components/trip/location-permission-card.tsx` -- já tem o visual do DESIGN.md (nível 1, ícone 40dp, `title`, `bodyLg`, ação, nota de erro). Extrair o visual para `components/ui/permission-card.tsx` e fazer este compor o novo, preservando lógica, `testID`s e textos.
- `mobile/src/components/scan/scan-blocked-states.tsx` -- `CameraPermissionState` (dois ramos com `actionError` compartilhado): trocar `StateView` por `PermissionCard` centrado sobre fundo `surfaceSoft`, ação `primary` (única da tela).
- `mobile/src/app/(driver)/scan.tsx` (~l.347, ~l.363), `trip.tsx` (~l.176), `student-list.tsx` (~l.190, ~l.271, ~l.291), `(student)/track-bus.tsx` (~l.288), `components/trip/start-outbound-section.tsx` (~l.55) -- os `StateView kind="loading"` a substituir.
- Formas a espelhar: `components/trip/trip-card.tsx`, `components/student-row.tsx`, `components/student-list/roster-header.tsx`, `components/track-bus/bus-eta-card.tsx`, `components/scan/scan-hud.tsx`/`scan-frame.tsx`, ramo de seleção de `start-outbound-section.tsx`.
- `mobile/src/components/offline-banner.tsx` -- restyle; `mobile/src/lib/palette.guard.test.ts` l.105 -- allowlist do `rgba(255,255,255,0.92)` a remover.
- Testes de tela ficam em `mobile/src/*.test.tsx` (`trip-screen`, `scan-screen`, `track-bus-screen`, `student-qr-screen`, …); `components/ui/test-utils.tsx` tem `renderUi`.
- `mobile/src/app/+not-found.tsx` -- não mudar.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/ui/skeleton.tsx` (+`skeleton.test.tsx`) -- adicionar `SkeletonGroup` -- um só lugar para o nome acessível do carregamento.
- [x] `mobile/src/components/ui/screen-skeletons.tsx` (+ teste) -- `TripCardSkeleton`, `RouteSelectorSkeleton`, `StudentListSkeleton` (contador + 6 linhas), `BusEtaCardSkeleton`, `ScanSkeleton`, cada um recebendo `label` e `testID` e compondo `SkeletonGroup` + `Skeleton` com tokens de spacing/radius -- formas conhecidas do EXPERIENCE.md.
- [x] `trip.tsx`, `start-outbound-section.tsx`, `student-list.tsx`, `track-bus.tsx`, `scan.tsx` -- trocar os `StateView kind="loading"` pelos skeletons da matriz, mesmos labels, mesma condição de entrada -- AC Skeleton.
- [x] `mobile/src/components/ui/permission-card.tsx` (+ teste) -- `PermissionCard({ icon, title, description, actionLabel, actionIcon, onPress, variant, note, testID, actionTestID })` com o visual atual do `LocationPermissionCard` -- AC PermissionCard.
- [x] `location-permission-card.tsx`, `scan-blocked-states.tsx` -- compor `PermissionCard`; câmera centralizada na tela com ação `primary`.
- [x] `mobile/src/components/offline-banner.tsx` (+`offline-banner.test.tsx`), `palette.guard.test.ts` -- restyle conforme a matriz, remover o branco 92% e sua allowlist; teste novo para os ícones presentes e ocultos da a11y -- AC OfflineBanner.
- [x] Testes de tela afetados (`trip-screen.test.tsx`, `scan-screen.test.tsx` e os que buscarem textos de carregamento) -- migrar para `getByLabelText` e cobrir: cada tela carregando mostra seu skeleton (`testID`) e não mostra spinner; câmera sem permissão renderiza `PermissionCard`.

**Acceptance Criteria:**
- Given qualquer tela P0 (Viagem, Lista, Scan, Acompanhar) carregando, when renderizada, then aparece o skeleton da forma final com o nome acessível do carregamento e nenhum `ActivityIndicator`.
- Given a câmera ou a localização sem permissão, when a tela é aberta, then o pedido aparece em `PermissionCard` (ícone 40dp, título, texto, ação) com os mesmos textos, `testID`s e caminho "Abrir configurações".
- Given fila offline pendente ou falhada, when o layout do motorista renderiza, then o `OfflineBanner` restilizado mostra ícone + texto NFR13 com `role=alert`, e "Dispensar" (`offline-banner-dismiss`) continua limpando a falha.
- Given `+not-found`, when uma rota protegida é aberta deslogado, then o redirect atual segue igual, sem superfície fora dos tokens.
- Given a suíte, when `npm test` e `npm run lint` rodam em `mobile/`, then ficam verdes e a guarda de paleta passa.

## Implementation Notes

- Baseline do `tsc --noEmit` antes da primeira edição: 3 erros pré-existentes (`scan.tsx` `user` possivelmente null, `use-trip-gps-capture.test.tsx`, `tracking-stream.service.test.ts`); continua igual.
- `PermissionCard` da câmera: `testID="camera-permission-card"`, ação `camera-permission-action`; ganhou ícone na ação (`camera`/`cog`), espelhando a de localização.
- "Sem spinner" nos testes de tela é verificado por `UNSAFE_queryAllByType(ActivityIndicator)` do Paper: o próprio `SkeletonGroup` tem `accessibilityRole="progressbar"`, então `getByRole('progressbar')` não distingue.
- "Dispensar" segue a matriz do plano (`quiet` em `onPrimary`), não o `on-color` do DESIGN.md; o lock de binding da guarda passou a exigir `onPrimary` no rótulo.
- E2E `boarding-offline-sync`: `:3000` estava ocupado fora do WSL (EADDRINUSE sem listener visível); rodado contra a API já em execução em `:3001` (`E2E_API_URL`/`BASE_URL`) com Expo Web `EXPO_PUBLIC_API_URL=http://localhost:3001 EXPO_PUBLIC_E2E=1` — verde.
- Capturas manuais 390×844 não foram feitas.

## Plan Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 26 findings — high 0, medium 0, low 15, false 10, maybe-false 1
- findings:
  - `[low]` `[patch]` (edge) `StudentListSkeleton` root does not clip; six fixed rows can draw past a short viewport onto the in-flow OfflineBanner on iOS — added `overflow: 'hidden'` to `listRoot`.
  - `[false]` `[reject]` (edge) stale `actionError` survives a `canAskAgain` flip — deliberate and pre-existing: the component comment says one component for both branches "so `actionError` survives the switch"; the rewrite kept it.
  - `[false]` `[reject]` (edge) camera testIDs changed from `state-view`/`state-view-action` — `grep -rn state-view api/tests mobile/src` (outside the component) finds no selector using them.
  - `[low]` `[patch]` (verification) LocationPermissionCard's secondary variant not pinned now that PermissionCard defaults to primary — added a trip-screen test asserting the action background is `canvas`.
  - `[low]` `[patch]` (verification) blocked-camera failed `openSettings` note untested after the rewrite — added a scan-screen test with a rejecting `openSettings`.
  - `[false]` `[reject]` (blind) sprint-status still `backlog` / plan not committed — the plan is committed at finalize; sprint-status is closed in the post-merge "close story" docs commit, as for 6.1–6.10.
  - `[low]` `[reject]` (blind) "Dispensar" is `quiet` in `onPrimary` while DESIGN.md says `on-color` — the intent contract's matrix fixes `quiet`/`onPrimary`; white on `error` passes AA; changing it means editing this build's plan. Flagged in Auto Run Result.
  - `[low]` `[reject]` (blind) 390×844 captures and a `+not-found` check have no evidence — the captures belong to the 6.12 visual gate (25 "depois" captures); `+not-found` has no code change and no surface.
  - `[low]` `[reject]` (blind) scan skeleton is light before the dark camera — cosmetic flash of < 1s; the `!permission` branch more often leads to the light PermissionCard; a dark body needs a new palette role for skeleton blocks.
  - `[low]` `[reject]` (blind) skeleton shape constants duplicate private constants of the real components — cosmetic drift only; the fix exports new public constants from five components.
  - `[low]` `[defer]` (blind) PermissionCard error note is not announced to screen readers — pre-existing in both the old StateView note and the old location card.
  - `[low]` `[patch]` (blind) location card secondary variant not locked by a test — same root cause and fix as the verification-gap row above.
  - `[low]` `[reject]` (blind) the "no note" assertion depends on Paper's Button label rendering — the test passes and states the intent; rewriting it adds nothing a user meets.
  - `[low]` `[reject]` (blind) "no spinner" checks only Paper's `ActivityIndicator` — no screen imports RN's; a regression would need a new import of a different component.
  - `[false]` `[reject]` (blind) offline-banner tests use plain `render` so assertions run under Paper's default theme — the asserted colors are `lightPalette` constants set in `StyleSheet`, not theme lookups.
  - `[maybe-false]` `[reject]` (blind) `progressbar` without `accessibilityValue` may read oddly on TalkBack; icon-hidden tests rely on `MdiIcon` internals — settling needs TalkBack on the AVDs; if true it is low (label is still read).
  - `[false]` `[reject]` (blind) raw `ICON_SIZE = 22` and dropped `textAlign: 'center'` — icon sizes are local constants in every ui component (tokens define none); left-aligned text follows the icon row layout and stays 17sp (≥ 16sp).
  - `[low]` `[reject]` (intent) Meu QR Code keeps the inline spinner in the route line — the QrPass and the QR render immediately; only the route label loads, shown as the discrete line story 6.9 fixed. Surfaced to the user as a judgment call.
  - `[false]` `[reject]` (intent) Aluno › Início has no skeleton — its loading is a text line inside TripStatusCard, not a spinner.
  - `[false]` `[reject]` (intent) no screen-level offline treatment — the AC's offline clause is the OfflineBanner bullet; "offline — leitura" is a new state outside the story.
  - `[false]` `[reject]` (intent) spinners remain in `routes.tsx`, boot, action buttons, the scan "checking" overlay and StateView's loading branch — routes is P2 (6.13), the rest are not screen loading states of P0 screens.
  - `[false]` `[reject]` (intent) `+not-found` has no code change — it re-exports the `index` redirect and renders nothing.
  - `[low]` `[reject]` (intent) outcome checked by tree assertions, not visual captures — same as the blind captures row; the 6.12 gate owns the visual evidence.
  - `[low]` `[reject]` (intent) "Dispensar" style differs from DESIGN.md — same as the blind row.
  - `[false]` `[reject]` (intent) visible "Carregando..." copy removed — the design specifies a skeleton with no caption; the accessible name is preserved.
  - `[low]` `[reject]` (intent) no 400ms delay before the skeleton — the flash is rarely noticed and the fix adds timers and state to five screens.

## Design Notes

`SkeletonGroup` existe porque cada `Skeleton` é oculto da acessibilidade: sem um container rotulado, o leitor de tela encontraria uma tela vazia durante o carregamento. O label preserva o nome acessível que os testes e o TalkBack já usavam:

```tsx
<SkeletonGroup label="Carregando viagem..." testID="trip-skeleton">
  <Skeleton height={28} width="60%" />
  <Skeleton height={96} borderRadius={radius.lg} />
</SkeletonGroup>
```

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: todas as suítes verdes.
- `cd mobile && npm run lint` -- expected: sem erros.
- `cd mobile && npx tsc --noEmit` -- expected: nenhum erro novo além da baseline registrada antes da primeira edição.
- `cd mobile && grep -rn "kind=\"loading\"" src/app src/components --include=*.tsx | grep -v test` -- expected: vazio.
- `cd api && npx playwright test tests/e2e/boarding-offline-sync.e2e.spec.ts` (com `docker compose up -d`, API e Expo Web como o `playwright.config` exigir) -- expected: verde; se a infra não subir, registrar por quê.

**Manual checks (if no CLI):**
- Capturas 390×844 (Expo Web + mocks ou API real) dos skeletons de Viagem/Lista/Acompanhar, do `PermissionCard` de câmera e das duas faixas do `OfflineBanner`; nada truncado nem estourando a largura.

## Auto Run Result

**Summary:** The P0 screens now show skeletons shaped like their final content instead of spinners: TripCard (Viagem), the route selector (no trip), the roster counter plus 6 StudentRows (Lista), BusEtaCard (Acompanhar) and the scan HUD plus window (Scan). A new `SkeletonGroup` keeps the old loading copy as the accessible name (role progressbar, busy). A generic `PermissionCard` now renders both the camera request (centred, primary action) and the location card (secondary, unchanged texts/testIDs). The `OfflineBanner` has `cloud-off-outline`/`alert-circle-outline` icons, typography/spacing tokens and a `quiet` "Dispensar" in `onPrimary` (≥ 48dp); the NFR13 text, `offline-banner-dismiss`, `role=alert` and the polite live region are unchanged, and the white-92% allowlist entry is gone. `+not-found` is unchanged (redirect, no surface).

**Files changed:**
- `mobile/src/components/ui/skeleton.tsx` (+test): `SkeletonGroup`.
- `mobile/src/components/ui/screen-skeletons.tsx` (+test): the five screen skeletons.
- `mobile/src/components/ui/permission-card.tsx` (+test): generic PermissionCard.
- `mobile/src/components/trip/location-permission-card.tsx`, `mobile/src/components/scan/scan-blocked-states.tsx`: compose PermissionCard.
- `mobile/src/app/(driver)/trip.tsx`, `student-list.tsx`, `scan.tsx`, `mobile/src/app/(student)/track-bus.tsx`, `mobile/src/components/trip/start-outbound-section.tsx`: spinners → skeletons.
- `mobile/src/components/offline-banner.tsx` (+test), `mobile/src/lib/palette.guard.test.ts`: banner restyle and guard update.
- `mobile/src/trip-screen.test.tsx`, `scan-screen.test.tsx`, `student-list.test.tsx`, `track-bus-screen.test.tsx`: loading via `getByLabelText`, skeleton/no-spinner, camera PermissionCard, location secondary variant, camera settings failure.

**Review:** 26 findings (edge 3, verification 2, blind 12, intent 9). Patched: 3 entries, all low (list skeleton clipping; location secondary variant test; camera `openSettings` failure test). Deferred: 1 (PermissionCard note not announced — pre-existing). Rejected: 22 — 10 false and 11 low/1 maybe-false with reasons in the Review Triage Log. Notable judgment calls: "Dispensar" is `quiet`/`onPrimary` (plan contract) rather than DESIGN.md's `on-color`; the Meu QR Code route line keeps its inline spinner (the QR renders immediately; only the route label loads).

**Follow-up review recommended:** false — patched 0 high, 0 medium, 3 low.

**Verification:** `mobile npm test` 58 suites / 731 tests green; `npm run lint` clean; `npx tsc --noEmit` only the 3 baseline errors; the `kind="loading"` grep is empty; Playwright `boarding-offline-sync` green, run against the API on `:3001` because `:3000` was taken outside WSL.

**Residual risks:** the 390×844 captures were not taken (left to the 6.12 visual gate); the scan skeleton is light before the dark camera view; skeleton shape constants mirror private constants of the real components and can drift.

