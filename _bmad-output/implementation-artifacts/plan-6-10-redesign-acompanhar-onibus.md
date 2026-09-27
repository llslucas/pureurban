---
title: 'Story 6.10: redesign do Acompanhar Ônibus'
type: 'feature'
ticket: '6-10-redesign-acompanhar-onibus'
created: '2026-09-26'
status: 'built'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'c7ca71476e682d2bcf60bec9a53520554b0ea043'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A watchPositionAsync failure (device location services off) is treated as permission denied, so the card offers "Permitir" in a loop.
    evidence: |-
      Pre-existing: the effect's catch already set deviceLocationDenied for any failure before 6.10 (it showed the "Ative a localização" text). Separating "services off" needs a new state and copy.
    location: >-
      mobile/src/app/(student)/track-bus.tsx (device location effect catch)
    severity: low
  - summary: >-
      Chip changes ("Ao vivo" to "Sem sinal GPS") and ETA changes are not announced to screen readers.
    evidence: |-
      Pre-existing: the old Paper chips had no live region either. A polite live region or announceForAccessibility would cover it.
    location: >-
      mobile/src/components/track-bus/bus-eta-card.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** O Acompanhar Ônibus mostra latitude/longitude cruas como informação principal; ETA/distância ficam num segundo cartão, "Em tempo real"/"Sem sinal GPS" são chips outlined de mesmo peso, permissão negada é texto solto e há `opacity` em texto (EXPERIENCE.md → auditoria `(student)/track-bus` e "Aluno › Acompanhar ônibus — P0"; Story 6.10 em `epics.md`).

**Approach:** Novo `BusEtaCard` herói (ETA `displayCount`, distância `title` "X de você", chip de frescor "Ao vivo" com ponto pulsante / "Sem sinal GPS há N min", legenda `caption` "Última posição às HH:MM · precisão ~N m"; coordenadas só no rótulo de acessibilidade da legenda). Estados aguardando/sem viagem/erro via `StateView`; permissão negada via `LocationPermissionCard` com texto de aluno; banner de dado velho via `ui/Banner`. Lógica de SSE, resync e timer de 15s intocada.

## Boundaries & Constraints

**Always:**
- Lógica intocada (Story 5.2 / wrap-1/3): queries `activeTrackingTripOptions`/`lastKnownLocationOptions` e a desestruturação rastreada, `isStrictlyNewer`, `appliedResyncRef`, `GPS_SIGNAL_TIMEOUT_MS` 15s e `markSignal`/`clearSignalTimer`, reset por `tripId`, effect do stream (`streamEpoch`, `onOpen` invalida last-known, `onTripEnded`, `onUnrecoverable`), ação "Atualizar" (bump epoch + `refetchTrip` + invalidate last-known). Só se adiciona estado de exibição.
- "há N min" conta desde a última CHEGADA de posição (instante em que `markSignal` roda), nunca pela idade do `capturedAt`.
- Só tokens de `lib/tokens.ts`/`lib/palette.ts` (`CHIP_TONES` do `status-chip`); ícones via `MdiIcon`; sem `opacity` em texto; sem emoji; animação com Reanimated respeitando `useReducedMotion()` (ponto estático).
- Contrato de teste do épico: cada copy alterada é atualizada no Jest e no e2e Playwright no mesmo PR; `testID`s novos antes de trocar asserts.
- Comentários/commits em inglês; traduzir/remover comentários redundantes dos arquivos tocados (os que explicam o porquê ficam, traduzidos).

**Never:**
- Mudar API, `openapi.json`, `lib/geo.ts`, `tracking-stream.service`, `track-bus-queries` ou o `_layout.tsx`.
- Skeleton, mapa, ponto pulsante no StateView aguardando (6.11) ou pull-to-refresh novo.
- Mudar o texto/fluxo do card do motorista em `(driver)/trip.tsx`.
- Criar `*.test.tsx` sob `src/app/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ao vivo | posição + aluno localizado, < 15s desde a chegada | Herói: ETA (`formatEta`, ex. "~8 min"/"Chegando"), "2,4 km de você", chip "Ao vivo" com ponto | — |
| Sem sinal < 1 min | 15–59s sem posição | Chip "Sem sinal GPS" (tom warning, ícone); ponto mantido | — |
| Sem sinal ≥ 1 min | ≥ 60s desde a última chegada | "Sem sinal GPS há N min" (N = floor), atualiza sozinho enquanto degradado | — |
| Legenda | qualquer posição | "Última posição às HH:MM" + " · precisão ~N m" se `accuracy`; `capturedAt` inválido → "--:--" | nunca "NaN" |
| Sem localização do aluno | granted, sem fix ainda | ETA "—", linha "Capturando sua localização para calcular a distância..." | — |
| Permissão negada | `granted: false` ou request lança | ETA "—" e `LocationPermissionCard` abaixo do herói com texto de aluno (começa "Ative a localização do app"); ação pede de novo (`canAskAgain`) ou abre configurações | falha do request → `canAskAgain: true` |
| Aguardando | viagem ativa sem posição | `StateView` empty `bus-clock` "Aguardando a primeira posição" + detalhe atual (variação de erro do last-known mantida) | — |
| Sem viagem / fim (409) | `!tripId \|\| tripEnded` | `StateView` empty atual (inalterado) | — |
| Erro da descoberta | sem cache | `StateView` error atual (inalterado) | "Tentar novamente" → `refetchTrip` |
| Stream morto | `onUnrecoverable` | `Banner` warning "Dados podem estar desatualizados — sem atualização em tempo real" + "Atualizar", acima do herói ou do aguardando; não renderizado quando não há queda | ação atual |

</intent-contract>

## Code Map

- `mobile/src/app/(student)/track-bus.tsx` -- tela (397 linhas). Linhas 25–237 (lógica) ficam; comentários em português traduzidos. Render 239–359 e `styles` refeitos. `formatClock` passa a HH:MM ("--:--" se inválido). Adicionar: `lastSignalAt` (setado dentro de `markSignal`, zerado junto com o reset por `tripId`), um relógio `now` que só tica (intervalo ~10s) enquanto `gpsStale`, `devicePermission` (resposta do request, `canAskAgain`) e um `locationEpoch` no effect do device para o "Permitir" re-pedir e reassistir.
- `mobile/src/components/ui/{screen,state-view,banner,status-chip,mdi-icon}.tsx` -- reuso. `Banner` não tem `visible`: renderizar condicionalmente. `CHIP_TONES`/`StatusChip` para o chip degradado (tom `warning`); o chip "Ao vivo" precisa do ponto, então é um pill próprio com `CHIP_TONES.success`. Padrão de animação/reduced-motion em `ui/banner.tsx`.
- `mobile/src/components/trip/location-permission-card.tsx` -- adicionar prop opcional `description` (default = texto atual do motorista) e afrouxar `permission` para `Pick<LocationPermissionResponse, 'canAskAgain'>`. `trip.tsx` não muda.
- `mobile/src/lib/tokens.ts` -- `typography.displayCount/title/caption/label`, `radius.lg`, `elevation.level1`, `motion`. Loop do pulso 1,6s como constante local (não é token; `tokens.test.ts` fixa os tokens).
- `mobile/src/track-bus-screen.test.tsx` -- suíte da tela (527 linhas, fake timers com `Date` mockado). Asserts que mudam: coordenadas `getByText(/-20\.75555…/)` → `getByLabelText`; "Em tempo real" → "Ao vivo"; `'0 m'` → "0 m de você"; `/Posição de …/` → `/Última posição às \d{2}:\d{2}/` e "--:--"; `/Ative a localização do app/` continua (card).
- `api/tests/e2e/tracking-live.e2e.spec.ts` -- `expectedTexts` (l.105-112), `expectStudentSees` (l.155-162), `realtimeChip`/`staleChip` (l.164-173) e o comentário sobre o banner oculto (que deixa de existir). `getByText` sem `exact` é substring.
- Não há mock de tracking no app (`src/mocks/handlers`); a verificação no web é pelo e2e real.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/track-bus/bus-eta-card.tsx` (+ `bus-eta-card.test.tsx`) -- `BusEtaCard` só de exibição, props: `eta: string | null`, `distance: string | null`, `pendingLine?: string` (mostrado quando `distance` é null), `freshness: { kind: 'live' } | { kind: 'stale'; minutes: number }`, `caption: string`, `captionAccessibilityLabel: string`. Cartão `level1` `radius.lg`; linha superior "Ônibus da sua rota" (`label`) + chip; ETA `displayCount` tabular ("—" se null); distância `title`; legenda `caption` `textMuted`. Exportar `signalLossLabel(minutes)` ("Sem sinal GPS" se < 1, senão "Sem sinal GPS há N min"). testIDs `bus-eta-card`, `bus-eta-value`, `bus-eta-distance`, `bus-eta-live`, `bus-eta-stale`, `bus-eta-caption`. Teste: ao vivo, degradado 0/3 min, ETA ausente, legenda com rótulo de acessibilidade, reduced motion sem crash.
- [x] `mobile/src/components/trip/location-permission-card.tsx` -- prop `description` e tipo afrouxado.
- [x] `mobile/src/app/(student)/track-bus.tsx` -- novo render pela matriz: `Screen` fixo com `Banner` condicional + `BusEtaCard` + card de permissão; aguardando = `Banner` condicional + `StateView` dentro do `Screen`; demais estados inalterados. Distância exibida como `${formatDistance(d)} de você`; rótulo de acessibilidade da legenda inclui as coordenadas `lat.toFixed(5), lon.toFixed(5)`.
- [x] `mobile/src/track-bus-screen.test.tsx` -- atualizar asserts e cobrir: "há 1 min" após 75s sem posição e "há 2 min" após o relógio avançar; evento novo volta a "Ao vivo"; permissão negada → card e "Permitir acesso à localização" chama o request de novo e passa a mostrar a distância; `canAskAgain: false` → "Abrir configurações"; banner ausente sem queda.
- [x] `api/tests/e2e/tracking-live.e2e.spec.ts` -- `eta` = `formatEta(meters)`; coordenadas via `page.getByLabel(coords)`; `realtimeChip` = "Ao vivo" exato; `staleChip` = regex `^Sem sinal GPS`; reescrever o comentário do banner oculto.

**Acceptance Criteria:**
- Given um aluno com viagem ativa, posição do ônibus e a própria localização, when abre "Onde está o ônibus", then vê um cartão herói com o ETA em destaque, "X de você", chip "Ao vivo" e a legenda "Última posição às HH:MM · precisão ~N m", sem coordenadas visíveis.
- Given o ônibus parou de transmitir, when passam 15s e depois mais de 1 min, then o chip vira "Sem sinal GPS" e depois "Sem sinal GPS há N min", com o último ponto mantido.
- Given `npm test` no mobile, when roda, then todas as suítes passam, incluindo as novas.

## Implementation Notes

- Relógio do "há N min" tica a cada 10s só enquanto `gpsStale`; o rótulo pode atrasar até um tick em relação ao minuto real (teste de "há 2 min" avança até 125s por isso).
- `LocationPermissionCard.requestPermission` afrouxado para `() => Promise<unknown>`; no aluno ele só incrementa `locationEpoch`, que refaz o request e o `watchPositionAsync`. Com `granted` o `deviceLocationDenied` já zera na resposta do request (antes só zerava no primeiro fix).
- Chip degradado usa o ícone `crosshairs-off`; no web em 390 px ele quebra para a linha de baixo do rótulo "Ônibus da sua rota" (flexWrap), sem truncar.
- `api/tests/README.md` atualizado junto ("Ao vivo", coordenadas só no rótulo de acessibilidade).
- E2E rodado com a API em :3002 (`E2E_API_URL`/`BASE_URL`), pois :3000 estava indisponível no WSL e :3001 é o processo do usuário: 3/3 verdes. Capturas 390×844 ao vivo e "Sem sinal GPS há 1 min" sem overflow horizontal.

## Plan Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 24 findings — high 0, medium 1, low 13, false 6, maybe-false 0 (4 intent-alignment divergences counted as low)
- findings:
  - `[medium]` `[patch]` (edge) no permission re-check after returning from system settings (canAskAgain false) — AppState 'active' listener bumps the location epoch while denied, same pattern as the driver's trip.tsx; screen test added.
  - `[low]` `[reject]` (edge) card's actionError path is dead because requestPermission always resolves — only reachable if requestForegroundPermissionsAsync rejects (rare); fix needs promise plumbing between the effect and the card.
  - `[low]` `[defer]` (edge) watchPositionAsync failure shown as permission denied, causing a "Permitir" loop — pre-existing misclassification in the effect's catch; deferred.
  - `[false]` `[reject]` (edge) double tap on "Permitir" bumps the epoch twice — the first effect is cancelled and the second applies the result; no bad outcome.
  - `[low]` `[patch]` (edge) fixed Screen can clip the permission card's action at large font scale — bus branch now uses `Screen variant="scroll"`.
  - `[false]` `[reject]` (edge) e2e distance substring collision — the fixed points give "222 m de você" and "55,6 km de você"; neither is a substring of the other.
  - `[medium]` `[patch]` (blind) no re-check after settings — same as the first edge row.
  - `[low]` `[reject]` (blind) card error message never shows — same as the edge row.
  - `[low]` `[defer]` (blind) every failure treated as denied — same as the edge row; deferred.
  - `[low]` `[reject]` (blind) "há N min" after an old seed contradicts the caption time — deliberate: wrap-3 declares staleness by data arrival, never by capturedAt age; the caption shows the real capture time.
  - `[low]` `[reject]` (blind) no hours format ("há 135 min") — needs over an hour of lost signal with the screen open; extra branch not worth it.
  - `[low]` `[patch]` (blind) ETA value has no accessibility context when present — value now carries "Tempo estimado de chegada: …"; covered in the card test.
  - `[low]` `[defer]` (blind) chip/ETA changes not announced — pre-existing (old chips had no live region); deferred.
  - `[low]` `[reject]` (blind) LiveChip duplicates StatusChip styles — sharing needs a new slot on StatusChip (public surface); both chips are pinned by tests.
  - `[low]` `[reject]` (blind) permission card not shown while waiting for the first position — same placement as before 6.10 (OQ-1); the card shows as soon as a position arrives.
  - `[low]` `[reject]` (blind) stale-clock interval stop / trip reset untested — the interval is cleaned by the effect on `gpsStale` change and `lastSignalAt` is reset with the existing per-trip reset; adding tests for plain React cleanup is low value.
  - `[false]` `[reject]` (blind) e2e ETA/distance substring matches too loose — with the fixed points the texts are "~1 min"/"222 m de você" vs "~133 min"/"55,6 km de você"; no overlap.
  - `[false]` `[reject]` (blind) HH:MM caption hides updates — the spec example is HH:MM ("Última posição às 21:04"); NFR2 is proved by the distance/ETA text in the e2e.
  - `[low]` `[patch]` (verification) "permission granted, no fix yet" screen state untested — screen test with a silent watchPositionAsync, on mount and after denied → "Permitir".
  - `[low]` `[patch]` (verification) driver's default card description unasserted — assertion added to trip-screen.test.tsx.
  - `[low]` `[reject]` (intent) reuses the driver LocationPermissionCard instead of a generic PermissionCard — it already has the DESIGN.md PermissionCard look (level 1, 40dp icon, title, action); generalising PermissionCards belongs to story 6.11.
  - `[low]` `[reject]` (intent) no pulsing listening dot on waiting / no track-bus Skeleton — not in the story AC; Skeletons are story 6.11.
  - `[false]` `[reject]` (intent) "há N min" reading (hidden under 1 min, counted from arrival) is one of several — the matrix fixes this reading and follows the wrap-3 arrival rule; the tests match it.
  - `[false]` `[reject]` (intent) visible changes on the SSE degradation path (banner mounting, "Ao vivo" copy) — the AC's "não muda" is about SSE/fallback behavior; the copy and banner look are the redesign itself.

## Design Notes

O chip degradado usa tom `warning` com ícone (chip `label` 600 + ícone cumpre o piso de contraste do âmbar). O ETA "—" em vez de sumir mantém a forma do herói estável quando a localização do aluno chega. O card de permissão fica abaixo do herói (a posição do ônibus continua útil sem distância, regra OQ-1 da 5.2). Texto sugerido do card: "Ative a localização do app para ver em quanto tempo o ônibus chega até você. Ela só é usada nesta tela."

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: todas as suítes verdes.
- `cd mobile && npm run lint` -- expected: sem erros.
- `cd mobile && npx tsc --noEmit` -- expected: só os 3 erros da baseline (scan.tsx, use-trip-gps-capture.test.tsx, tracking-stream.service.test.ts).
- `cd api && npm run lint` -- expected: sem erros novos no e2e alterado.
- `cd api && npx playwright test tests/e2e/tracking-live.e2e.spec.ts` (com `docker compose up -d`, API e Expo Web como o `playwright.config` exigir) -- expected: 3 testes verdes; se a infra não subir, registrar por quê.

**Manual checks (if no CLI):**
- Durante o e2e (ou script `.mjs` com `api/node_modules/playwright` contra API real), capturar a tela do aluno 390×844 nos estados ao vivo e sem sinal; nada truncado nem estourando a largura.

## Auto Run Result

**Summary:** "Acompanhar Ônibus" rebuilt around a `BusEtaCard` hero: ETA in display-count ("~8 min"/"Chegando", "—" while unknown), "X de você" distance, a freshness chip ("Ao vivo" with a pulsing dot that stays still under reduced motion; "Sem sinal GPS" → "Sem sinal GPS há N min", counted from the last position arrival) and the caption "Última posição às HH:MM · precisão ~N m". Raw coordinates live only in the caption's accessibility label. Waiting uses `StateView`; a denied permission shows `LocationPermissionCard` with student copy. It can ask again, open settings, and re-checks when the app returns to the foreground. The stale banner is `ui/Banner`, rendered only during a stream outage. The SSE, resync, monotonic-guard and 15s-timer logic is unchanged.

**Files changed:**
- `mobile/src/components/track-bus/bus-eta-card.tsx` (+test): new hero card, LiveChip and `signalLossLabel`.
- `mobile/src/app/(student)/track-bus.tsx`: new render (scroll Screen), arrival clock, permission state, `locationEpoch`, AppState re-check; comments translated.
- `mobile/src/components/trip/location-permission-card.tsx`: optional `description`, looser prop types (driver unchanged).
- `mobile/src/track-bus-screen.test.tsx`: copy updates plus the counter, banner, permission and pending-state cases.
- `mobile/src/trip-screen.test.tsx`: asserts the driver's default card text.
- `api/tests/e2e/tracking-live.e2e.spec.ts`, `api/tests/README.md`: follow the new copy (coordinates via `getByLabel`).

**Review:** 24 findings (edge 6, blind 12, verification 2, intent 4). Patches: 5 entries (1 medium: re-check after settings; 4 low: scroll Screen, ETA a11y label, pending-state test, driver text assertion). Deferred: 2 (services-off shown as denied; chip changes not announced; both pre-existing). Rejected: 17. 6 were false (double tap, e2e substring collisions ×2, HH:MM caption, the "há N min" reading, SSE-path visual changes). 11 were low: dead card error path ×2, old-seed "há N min", no hours format, LiveChip style duplication, card not shown while waiting, interval cleanup tests, generic PermissionCard/Skeleton/listening dot (story 6.11). The reasons are in the Review Triage Log.

**Follow-up review recommended:** false. Patched counts: high 0, medium 1, low 4.

**Verification:**
- mobile `npm test`: 56 suites / 703 tests green.
- `npm run lint`: clean.
- `npx tsc --noEmit`: 3 errors, the same as the baseline.
- Playwright `tracking-live.e2e.spec.ts`: 3/3 green against a real API (port 3002) and Expo Web, NFR2 15ms. This ran before the review patches; the patches don't touch the e2e-visible copy.
- Manual (implementer): 390×844 captures of live and degraded states, with no horizontal overflow.

**Residual risks:**
- No check on a native device.
- The e2e was not re-run after the review patches (scroll Screen, AppState listener).
- "há N min" can lag the real minute by up to 10s.
- A device with location services off still shows the permission card (deferred).
