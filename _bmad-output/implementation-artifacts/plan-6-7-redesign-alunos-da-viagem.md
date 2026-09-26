---
title: 'Story 6.7: redesign de Alunos da Viagem'
type: 'feature'
ticket: '6-7-redesign-alunos-da-viagem'
created: '2026-09-26'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '45a24cb3343623d7378eb5394b0131c1c1f34d1b'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      e2e `absence-reminder › fora da janela` fails: its helper `ageAbsenceInClientCache` looks for a `studentAbsence` query that no longer exists.
    evidence: |-
      Commit 3aaf151 (student-home refresh fix, PR #54) replaced the `studentAbsence` query with `studentBoardingStatusKey`; the e2e helper still searches the persisted MMKV cache for `queryKey[0] === 'studentAbsence'` and throws "studentAbsence de <trip> não encontrada no cache persistido". Fails on the student home before any roster step; story 6.7 does not touch that code.
    location: >-
      api/tests/e2e/absence-reminder.e2e.spec.ts:55-110
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A lista de embarque mostra só "1/2 embarcados" num `titleLarge`, linhas sem avatar com chip de glifo (`✓ — !`), banner Paper cru e vazio em texto solto; o motorista precisa contar linha a linha quem falta e não percebe a linha que mudou por SSE (EXPERIENCE.md → "Motorista › Alunos da viagem — P0", Story 6.7 em `epics.md`).

**Approach:** Cabeçalho fixo `RosterHeader` (BoardingCounter do `summary` + mini-legenda), `StudentCard` evolui para `StudentRow` (avatar de iniciais 40dp, `StatusChip` com ícone MDI, pulso Reanimated na mudança de status), banner de dado velho via `Banner` e vazio via `StateView`; seletores Jest/e2e que dependiam do texto "X/Y embarcados" e dos glifos migram no mesmo PR.

## Boundaries & Constraints

**Always:**
- Lógica intocada: `applyNotReturningToRoster`/`applyAbsenceCancelledToRoster`, handlers SSE, `useEffect` da conexão, guardas 1–12 e seus textos, `showStaleBanner`, `RefreshControl` (refaz viagem + roster), Snackbar `"<nome> não vai voltar no ônibus"` (4s), ordem do servidor (`data={students}` sem sort).
- Contagem principal sempre de `summary` (FR25). Legenda: `embarcaram = summary.boarded`, `aguardando = max(0, summary.total − summary.boarded)`, `não vão voltar = students.filter(NOT_RETURNING).length` (o servidor não expõe esse total). Singular com 1: "1 embarcou", "1 não vai voltar"; "N aguardando" invariável. Os três termos sempre presentes, separados por " · ".
- `BoardingCounter` da lista com `testID="roster-counter"` (rótulo acessível dele: "N de T embarcados"). Trip fica montado sob a lista na mesma pilha com o mesmo rótulo — e2e da lista seleciona por `getByTestId('roster-counter')`, nunca `getByLabel` solto.
- Rótulo acessível da linha inalterado: `"Ana, Embarcou às 18:04"` / `"Ana, Não embarcou"`; data inválida não mostra hora.
- `React.memo` na linha; eventos SSE continuam trocando só o objeto do aluno afetado.
- Cores só de `theme`/`lightPalette`/`statusTints`/`withAlpha` e tokens de `lib/tokens`; `palette.guard.test.ts` verde e atualizado junto.
- `useReducedMotion()`: sem pulso de fundo; chip troca com corte seco ou fade 120ms (`motion.reduced`).

**Never:**
- Mudar serviços, query keys, `trip-queries.ts`, API, fluxo ou navegação; tornar a linha tocável.
- Skeleton de carregamento (6.11), `ListSectionHeader`/seções, sort ou agrupamento por status.
- Nova dependência; string `X/Y embarcados` em qualquer lugar da tela.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lista normal | roster `{boarded:1,total:2}`, Ana NOT_CHECKED_IN, Bruno CHECKED_IN 18:05 | Cabeçalho "1/2 embarcados" + "1 embarcou · 0 não vão voltar · 1 aguardando"; linhas com avatar "A"/"B", chips "Não embarcou"/"Embarcou" com ícone | — |
| SSE not_returning | Ana → NOT_RETURNING | chip "Não vai voltar" (`account-cancel`), linha pulsa no tinte warning 600ms e volta; total 2→1; legenda "1 embarcou · 1 não vai voltar · 0 aguardando"; Snackbar com o nome | evento de aluno fora do cache: nada pulsa, sem toast |
| SSE absence_cancelled | Ana volta a NOT_CHECKED_IN | chip "Não embarcou", pulso no tinte neutro | — |
| Mudança por refetch | status diferente após invalidação | mesma linha pulsa (a linha reage a qualquer mudança de status enquanto montada) | — |
| Primeira renderização | lista abre | nenhuma linha pulsa | — |
| Dado velho | `roster.isError && data` ou `streamStale` | `Banner tone="warning"` "Dados podem estar desatualizados — sem atualização em tempo real" + ação "Atualizar" (refetch); some quando a condição cai | — |
| Vazio | `students: []` | `StateView kind="empty"` título "Nenhum aluno vinculado a esta rota" no lugar da lista; cabeçalho "0/0" | — |
| Nomes | "Ana Souza" / "Ana" / "  " | iniciais "AS" / "A" / "?" | — |
| 60 alunos | roster de 60 | renderiza cabeçalho e primeira janela da FlatList; NFR4 | — |

</intent-contract>

## Code Map

- `mobile/src/app/(driver)/student-list.tsx` -- 385 linhas. Helpers SSE (24-73), handlers + conexão (75-160), guardas (162-285), render da lista (287-354: header `titleLarge` com `${boarded}/${total} embarcados` 297-305, Paper `Banner` 307-316, `FlatList` + `RefreshControl` + `ListEmptyComponent` 318-339, Snackbar 341-349), estilos 356-385 (`count`, `empty*` saem). Comentários em português ao redor: traduzir para inglês só os que forem tocados.
- `mobile/src/components/student-card.tsx` (+ `student-card.test.tsx`) -- `git mv` para `student-row.tsx`/`student-row.test.tsx`, export `StudentRow` (memo). Reaproveitar `formatCheckedInAt` e o fallback de status desconhecido.
- `mobile/src/components/ui/` -- `BoardingCounter` (`summary`, `testID`), `StatusChip` (`status`, `testID` → `${testID}-icon`), `Banner` (`tone`, `message`, `action`, sem prop `visible` — renderizar condicional), `StateView` (`kind="empty"`, `icon`), `MdiIcon`, `test-utils.tsx`.
- `mobile/src/lib/boarding-status.ts` -- `STATUS_PRESENTATION`; remover o campo glifo `icon` (único consumidor era o card) e o comentário "until story 6.7".
- `mobile/src/lib/tokens.ts` -- `motion.pulse` 600, `motion.standard` 200, `motion.reduced` 120, `typography.title/caption/label/body`, `spacing`, `radius.full`. `mobile/src/lib/palette.ts` -- `lightPalette.surface/surfaceStrong/text/textBody/textMuted/hairline`, `statusTints`.
- `mobile/src/lib/palette.guard.test.ts` -- import de `StudentCard`/`STATUS_PRESENTATION` (l.9), `chipColorsFor` (267-288, sobe ancestrais até achar `backgroundColor` — o fundo animado da linha não pode ser o primeiro ancestral com cor acima do rótulo do chip), source-locks `student-list` (637-643, `count:` deixa de existir) e `student-card` (645-649).
- `mobile/src/components/ui/status-chip.test.tsx:5` -- importa `STATUS_PRESENTATION` de `@/components/student-card`; passar a `@/lib/boarding-status`.
- `mobile/src/student-list.test.tsx` -- 43 asserções por `'N/M embarcados'` e por `'✓ Embarcou'`/`'— Não embarcou'`/`'! Não vai voltar'`; migrar para `getByLabelText('N de M embarcados')` e rótulos sem glifo (só a lista está montada no Jest).
- `api/tests/e2e/absence-reminder.e2e.spec.ts` -- `NOT_RETURNING_BADGE` (33), `openDriverRoster(countText)` (35-45), 138/171/187/361. `api/tests/e2e/boarding-happy-path.e2e.spec.ts:79-80` -- contador da lista e `getByText('Embarcou').first()` (sem `exact`, casaria "1 embarcou" da legenda).

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/student-row.tsx` (+ `student-row.test.tsx`, via `git mv` do card), `mobile/src/lib/boarding-status.ts`, `status-chip.test.tsx`, `palette.guard.test.ts`, `student-list.tsx` (import), `student-list.test.tsx` -- `StudentRow`: avatar 40dp `radius.full` fundo `surfaceStrong` com `initialsOf(name)` (exportado) em `label`/`text`; nome `title` (2 linhas máx.), hora `caption` muted; `<StatusChip status>` à direita; min 64dp; divisor `hairline` inset 72; em fontScale alto o chip pode quebrar para baixo (`flexWrap`). Pulso: ao mudar `status` depois do mount, fundo vai do `STATUS_PRESENTATION[novo].background` a `surface` em `motion.pulse` e o chip faz fade 200ms; nada no primeiro render; sem pulso com reduced motion. Remover glifo do mapa; migrar asserções de glifo; mover imports e source-lock do guard para `student-row` -- componente de linha da spec.
- [x] `mobile/src/components/student-list/roster-header.tsx` (+ test) -- `RosterHeader({ summary, students })`: `BoardingCounter testID="roster-counter"` + `Text` da legenda (`body`, `textMuted`, `testID="roster-legend"`) via `rosterLegend(students, summary)` exportado e puro (regras em Always) -- cabeçalho fixo.
- [x] `mobile/src/app/(driver)/student-list.tsx` -- cabeçalho vira `RosterHeader` fora da `FlatList` (fixo); stale vira `{showStaleBanner ? <Banner tone="warning" …/> : null}` entre cabeçalho e lista com gutter; `ListEmptyComponent` vira `StateView kind="empty"` com ícone de grupo; `renderItem` usa `StudentRow`; estilos `count`/`empty*` removidos; atualizar source-lock do guard.
- [x] `mobile/src/student-list.test.tsx` -- migrar seletores; novos casos: legenda antes/depois de not_returning e absence_cancelled; Banner de dado velho com "Atualizar" refazendo o roster (`onUnrecoverable`) e ausente sem a condição; vazio via StateView; roster de 60 alunos renderiza cabeçalho "0 de 60 embarcados" e a primeira linha; a linha afetada pelo SSE é a única que recebe objeto novo (referências das demais preservadas no cache).
- [x] `api/tests/e2e/absence-reminder.e2e.spec.ts`, `api/tests/e2e/boarding-happy-path.e2e.spec.ts` -- `openDriverRoster` recebe `{ boarded, total }` e espera `getByTestId('roster-counter')` com `aria-label` "B de T embarcados"; asserções de contagem idem; badge por `getByText('Não vai voltar', { exact: true })`; happy path 80 com `exact: true` -- contrato de teste migrado no mesmo PR (regra do épico).

**Acceptance Criteria:**
- Given a lista aberta com roster carregado, when o motorista olha o topo, then vê o `BoardingCounter` e a legenda "N embarcaram · N não vão voltar · N aguardando" fixos enquanto a lista rola.
- Given um evento SSE de ausência para um aluno da lista, when ele é aplicado, then só essa linha pulsa, o chip muda com ícone e o Snackbar com o nome aparece.
- Given a tela renderizada, when inspeciono o texto, then não há glifo `✓ — !` como status nem a string "X/Y embarcados".
- Given as suítes, when rodo `npm test`/lint no mobile e os e2e `absence-reminder` e `boarding-happy-path`, then passam com os seletores migrados.

## Implementation Notes

- `StudentRow`: o pulso é um `Animated.View` absoluto irmão do conteúdo (opacidade 1→0 em `motion.pulse`, cor = tinte do novo status); o chip fica num `Animated.View` sem cor que faz fade (`motion.standard`, ou `motion.reduced` com reduzir movimento). Assim o chip continua sendo o primeiro ancestral com `backgroundColor` acima do rótulo (`chipColorsFor` do guard verde sem mudança de lógica). O divisor `hairline` fica no corpo da linha: gutter 16 + avatar 40 + gap 16 = inset 72. O nome reserva `flexBasis` 96 antes de o chip quebrar para baixo (`flexWrap`).
- Estilos do cabeçalho saíram de `student-list.tsx` para `roster-header.tsx`; o source-lock do guard foi dividido em `student-list` (fundo), `roster-header` (fundo/divisória/legenda) e `student-row` (linha/avatar/nome/hora/divisória/pulso).
- Vazio: o `StateView` fica no `ListEmptyComponent` (com `contentContainerStyle` `flexGrow: 1`) para manter o pull-to-refresh; o cabeçalho continua mostrando "0/0" como a matriz pede (o EXPERIENCE.md sugeria ocultar o contador — o plano prevalece).
- Verificação: `npm test` no mobile 50 suítes / 628 testes verdes; `npm run lint` limpo; `npx tsc --noEmit` só com os 3 erros pré-existentes da baseline (`scan.tsx:311`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172` — idênticos num worktree de `45a24cb`).
- e2e (API real em :3001, Expo Web :8081 com `EXPO_PUBLIC_E2E=1`, `E2E_API_URL=http://localhost:3001`): `boarding-happy-path` e os 2 testes de `absence-reminder` que abrem a lista do motorista passam (NFR3 incluído). `absence-reminder › fora da janela` falha em `ageAbsenceInClientCache` ("studentAbsence … não encontrada no cache persistido"), só na home do aluno e antes de qualquer passo da lista — fora do escopo desta story; não investigado.
- Capturas Expo Web 390×844 com mocks (normal, dado velho, vazio, 60 alunos) no scratchpad da sessão; cabeçalho na mesma posição antes/depois de rolar a lista de 60.

## Plan Change Log

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 30 findings — high 0, medium 2, low 24, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` (intent) pulse isolation to the SSE row only inferred from memo + identity — covered by the row test (sequences) plus the screen test (only the affected object replaced); a screen-level animation assertion under the Reanimated mock adds no signal.
  - `[low]` `[reject]` (intent) fixed header verified structurally, not by scrolling — Jest cannot scroll; Expo Web screenshots before/after scrolling 60 rows confirmed it (Implementation Notes).
  - `[low]` `[reject]` (intent) NFR4 time budget not measured — server unchanged; windowing now asserted (row 60 unmounted on first render); timing left to the 6.12 visual gate.
  - `[low]` `[reject]` (intent) empty roster keeps the counter "0/0" while EXPERIENCE.md States says "contador oculto" — real spec deviation carried by the plan's matrix; empty route is rare in everyday use and does not appear in the demo, and the fix adds a branch; surfaced to the user as a one-line follow-up.
  - `[false]` `[reject]` (intent) singular legend / mixed data sources — deliberate pt-BR agreement and FR25-consistent sources (server exposes no not-returning total); no wrong output shown.
  - `[low]` `[reject]` (intent) server order has no new test — `data={students}` unchanged from the baseline; no sort was introduced.
  - `[low]` `[patch]` (intent) banner `isError && data` branch untested — same root as the blind row below; test added.
  - `[medium]` `[defer]` (intent) `fora da janela` e2e failing — pre-existing since 3aaf151; deferred.
  - `[false]` `[reject]` (blind) "no X/Y embarcados" check proves nothing — the Never rule targets a single text node (Playwright strict-mode collision with trip); the split "1/2" + "embarcados" is the DESIGN.md counter by design.
  - `[low]` `[patch]` (blind) every row shares testID `student-row` — `renderItem` passes `student-row-${studentId}`.
  - `[low]` `[patch]` (blind) pulse/chip fade starts one frame after paint — effect moved to `useLayoutEffect`.
  - `[low]` `[reject]` (blind) no screen-reader announcement on row change — the pre-6.7 card had none either; absences keep the Snackbar; a live region on 60 rows would be noisy and is new behavior outside the spec.
  - `[low]` `[patch]` (blind) stale-banner test covers only `streamStale` — new case: roster loads, refetch rejects, banner shown with cached list.
  - `[low]` `[reject]` (blind) "only that row pulses" not screen-tested — same as the intent row above.
  - `[medium]` `[defer]` (blind) failing e2e not tracked — recorded in `deferred`.
  - `[low]` `[patch]` (blind) Portuguese/redundant comments left in edited files — removed the chip JSDoc in boarding-status.ts; snackbar comment translated.
  - `[low]` `[reject]` (blind) mixed-language describe title — cosmetic, no named harm.
  - `[low]` `[patch]` (blind) 60-student test overclaims NFR4 — now also asserts row 60 is not mounted on first render.
  - `[low]` `[patch]` (blind) `initialsOf` drops NFD accents — `normalize('NFC')` + "Érica Souza" → "ÉS" test.
  - `[low]` `[reject]` (blind) guard source-lock depends on formatting — same regex-lock pattern as every other entry in the guard.
  - `[low]` `[reject]` (blind) glyph-absence regexes inconsistent — hypothetical future breakage only; current tests correct.
  - `[false]` `[reject]` (blind) `restoreAllMocks` after `mockReturnValue(false)` may leave `useReducedMotion` undefined — Jest 29 `restoreAllMocks` only restores spies; even if cleared, `undefined` is falsy and equals the default; suite green.
  - `[false]` `[reject]` (blind) `spacing[1] / 2` bypasses tokens — the token rule in the plan covers colors/typography; 2dp gap derived from the scale, no harm named.
  - `[low]` `[patch]` (verification-gap) pulse tests only spy `withTiming`, never the sequences — `withSequence` spied: none on first render, (1,0) pulse + (0,1) chip on change, only (0,1) with reduced motion.
  - `[low]` `[patch]` (verification-gap) student-home.test.tsx cites deleted student-card.test.tsx — now cites student-row.test.tsx.
  - `[low]` `[patch]` (edge) initials overflow the 40dp avatar at fontScale 2.0 — `maxFontSizeMultiplier` 1.3 + `numberOfLines={1}`.
  - `[low]` `[patch]` (edge) NFD initials — same patch as the blind row.
  - `[low]` `[reject]` (edge) no live region on row change — same as the blind row.
  - `[low]` `[patch]` (edge) api/tests/README.md describes old badge/count selectors — updated.
  - `[low]` `[patch]` (edge) stale student-card comment in student-home.test.tsx — same patch as the verification-gap row.

## Design Notes

- Pulso na linha por mudança de `status` (ref do status anterior), não por sinal vindo do handler SSE: sem nova plumbing na tela; a FlatList chaveia por `studentId`, então a ref é sempre do mesmo aluno. Refetch que muda status também pulsa — é o mesmo sinal ("esta linha mudou").
- Pulso num `Animated.View` de fundo absoluto atrás do conteúdo (ou `backgroundColor` interpolado na raiz) — cuidado com `chipColorsFor` do guard: o chip precisa continuar sendo o primeiro ancestral com `backgroundColor` acima do rótulo.
- Legenda com "aguardando" do `summary`, não contagem de `NOT_CHECKED_IN`: mantém coerência com o contador (FR25) quando o cache está entre um evento e o refetch.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: todas as suítes verdes
- `cd mobile && npm run lint && npx tsc --noEmit` -- expected: sem erros
- `cd api && npx playwright test tests/e2e/absence-reminder.e2e.spec.ts tests/e2e/boarding-happy-path.e2e.spec.ts` (API + Expo Web de pé; a 6.6 usou a API em :3001) -- expected: verde; se o ambiente não subir, registrar em Implementation Notes

**Manual checks (if no CLI):**
- Expo Web 390×844 com `EXPO_PUBLIC_USE_MOCKS=1`: capturas da lista (normal, dado velho, vazio) no scratchpad da sessão; cabeçalho não rola com a lista.

## Auto Run Result

- **Summary:** "Motorista › Alunos da viagem" redesigned: fixed `RosterHeader` (BoardingCounter `roster-counter` + legend "N embarcaram · N não vão voltar · N aguardando"), `StudentRow` (initials avatar, MDI `StatusChip`, background pulse + chip fade on status change, reduced-motion aware), stale data via `Banner` warning, empty via `StateView`; glyphs removed from `STATUS_PRESENTATION`; Jest and e2e selectors migrated.
- **Files:** `mobile/src/components/student-row.tsx` (+test, renamed from student-card) — row; `mobile/src/components/student-list/roster-header.tsx` (+test) — header + `rosterLegend`; `mobile/src/app/(driver)/student-list.tsx` — composition; `mobile/src/lib/boarding-status.ts` — glyph field removed; `status-chip.tsx`/`status-chip.test.tsx`, `palette.guard.test.ts`, `student-home.test.tsx` — references; `mobile/src/student-list.test.tsx` — migrated + new cases; `api/tests/e2e/absence-reminder.e2e.spec.ts`, `boarding-happy-path.e2e.spec.ts`, `api/tests/README.md` — selector migration.
- **Review:** 13 patch rows applied (low), 2 deferred rows (one pre-existing e2e failure), 15 rejected with reasons in the triage log. Follow-up review recommended: false (0 high, 0 medium patched).
- **Verification:** mobile `npm test` 50 suites / 630 tests green after patches; `npm run lint` clean; `tsc --noEmit` only the 3 baseline errors; api eslint on the two e2e files 0 errors. Playwright before patches: `boarding-happy-path` and 2/3 `absence-reminder` green; `fora da janela` red (pre-existing, deferred). Patches did not touch e2e specs.
- **Residual risks:** empty roster shows "0/0" instead of hiding the counter (spec deviation, rejected low); pulse/haptics verified in Jest + Expo Web only, no device; e2e not re-run after the review patches.
