---
title: 'Epic 6 item 22: dev build novo e verificação nativa'
type: 'chore'
ticket: 'epic-6-retro-item-22-dev-build-e-verificacao-nativa'
created: '2026-09-27'
status: 'done'
baseline_revision: '881d6ebd19164074aed74fecd2e2258e3b9f4931'
route: 'oneshot'
route_source: 'auto'
review: 'quick'
review_source: 'auto'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: 'R7e segue aberto: o pw:api mede só a rede; falta medir o render do roster com useThemedStyles por StudentRow'
  - summary: 'Háptico notificationAsync (Não vou voltar, scan com sucesso) não observado no build novo'
  - summary: 'StatusBar no login em escuro não verificada em device'
---

<intent-contract>

## Intent

**Problem:** O dev build instalado nos AVDs (26/09 18:20) é anterior à 6.14 e traz `userInterfaceStyle: light` embutido, então o tema escuro nativo, o háptico e o inset com `OfflineBanner` nunca foram verificados em device; e o NFR4 (`pw:api`) não foi remedido depois da migração `useThemedStyles` (retro do épico 6, AI2 / R7d / R7e).

**Approach:** Gerar um novo APK `development` via EAS a partir da `main` atual (881d6eb), copiar para `C:\Users\lucas\Downloads\`, instalar nos dois AVDs a partir dessa pasta e rodar o roteiro nativo (escuro seguindo o SO, troca com o app aberto, StatusBar, háptico, inset com OfflineBanner). Remedir o NFR4 com `test:pw:api`. Registrar resultados neste plan e no `sprint-status.yaml`; defeitos encontrados viram defer rastreado, não fix nesta rodada.

</intent-contract>

## Implementation Notes

Rota oneshot: o item é operacional (build na nuvem EAS, instalação, verificação em device e medição). A única mudança versionada prevista é o registro do resultado em `_bmad-output/`.

**Resultado da rodada (27/09/2026, 15:00–15:50 UTC-3).**

- **Build:** EAS `487dcec2-998f-4d3b-b6d0-278ddf587c41`, profile `development`, commit `881d6ebd19164074aed74fecd2e2258e3b9f4931` (merge do PR #73), FINISHED. APK salvo em `C:\Users\lucas\Downloads\pureurban-dev-epic6-item22.apk` (250 MB) e instalado a partir dali nos dois AVDs com `adb.exe install -r` (`Success`; `lastUpdateTime` 15:29/15:30 UTC). Metro `--dev-client --clear` no HEAD, API real em :3001, `adb reverse` 8081/3001.
- **NFR4 via `pw:api` (remedido; R7e segue aberto):** `roster-nfr4.spec.ts` contra a API em :3001 → `GET /trips/:id/students` em **25 ms** (budget 1000 ms, 55 alunos; na 6.12 foram 28 ms). Mas o spec só mede a chamada de rede, e a preocupação do R7e é o custo de render no mobile (`useThemedStyles` cria um StyleSheet por `StudentRow`). O número cumpre a letra do item e não responde ao R7e, que foi para `deferred-work.md`. O seed do spec criou uma empresa com 55 alunos, uma rota e uma viagem no banco de dev que atende os AVDs.
- **Tema escuro seguindo o SO ✓** (`cmd uimode night yes`): o cold start mostra fundo nativo escuro com spinner, sem flash branco da raiz. A tela Viagem do motorista e o Início do aluno renderizam no escuro, com os ícones da StatusBar claros.
- **Troca com o app aberto ✓:** `night no` → `night yes` com a tela Viagem aberta. O mesmo processo (pid 30150, sem reinício) repinta claro↔escuro em ~5 s, e a StatusBar inverte os ícones nos dois sentidos.
- **Háptico do scan ✓ (só `impactAsync`):** `dumpsys vibrator_manager` do emulator-5554 registra, com o APK novo, uma vibração de `com.pureurban.mobile` às 15:41:34 (`usage: TOUCH`), logo depois do scan offline de 15:41:25. Resultado enfileirado → `'light'` → `impactAsync` (`scan-result-overlay.tsx:73-76`). Os duplos pulsos de notificação da lista são de 14:03–14:04, anteriores à instalação (15:30), então vêm do build antigo. Com o build novo, `notificationAsync` não foi observado.
- **Háptico do "Não vou voltar" — não verificado:** a aluna61 já tinha ausência registrada às 14:06 numa viagem RETURN em andamento, e registrar de novo exigiria encerrar a viagem da demo. O caminho é `Haptics.notificationAsync` (`(student)/home.tsx:153`), diferente do `impactAsync` visto no scan. Fica em `deferred-work.md`.
- **Inset duplicado com o OfflineBanner (R7d) — CONFIRMADO:** com o motorista offline (reverse 3001 removido) e 1 embarque na fila, a tela Viagem mostra um vão de ~40 dp entre "Escanear QR Code" e o banner. `sticky-action-bar.tsx:36` soma `insets.bottom` e o banner em `(driver)/_layout.tsx:37` soma o mesmo inset. Registrado em `deferred-work.md` como fix pendente.
- **Fila offline ✓ (bônus):** o check-in feito offline às 15:41:25 sincronizou ao recriar o reverse (`boarding_records.checkedInAt` = hora do scan, `createdAt` 15:45:10). O card da Viagem passou de 0/1 para 1/1 menos de 1 min depois do dreno.
- **Ambiente:** o emulator-5556 (2,4 GB de RAM, 274 MB livres, load 12) levou ANR "failed to complete startup" em três cold starts seguidos. Um `adb reboot` do AVD resolveu. O mesmo APK subiu de primeira no emulator-5554, então não é defeito do build. O adb também caiu no primeiro `install` e precisou de `start-server`.
- **Não coberto nesta rodada:** a StatusBar no login em escuro, que o AI2 pede explicitamente (exigiria deslogar uma das contas da demo). Fica em `deferred-work.md`. Os dois AVDs voltaram para `Night mode: no`, como estavam.

## Verification

**Commands:**
- `cd mobile && npx eas build -p android --profile development --non-interactive` -- expected: build FINISHED, APK baixável
- `adb.exe -s <serial> install -r C:\Users\lucas\Downloads\<apk>` -- expected: `Success` nos dois AVDs
- `cd api && BASE_URL=http://localhost:3001 E2E_API_URL=http://localhost:3001 E2E_SERVERS_UP=1 npx playwright test tests/api/roster-nfr4.spec.ts --project=api --workers=1` -- expected: 1 passed, roster abaixo de 1000 ms (sem `E2E_SERVERS_UP=1`, o spec é pulado em silêncio se a API não estiver na porta sondada)

**Manual checks:**
- `cmd uimode night yes/no` com o app aberto: fundo, StatusBar e telas seguem o SO sem reiniciar; sem flash branco da raiz no cold start em escuro
- StatusBar no login em escuro (ícones claros sobre o fundo escuro)
- Háptico do scan e do "Não vou voltar": evidência via `dumpsys vibrator_manager` (ou registro honesto de que não é observável)
- Driver offline (reverse 3001 removido) com a StickyActionBar visível: inset inferior não duplicado

## Review Triage Log

**Passo 1 (quick), 27/09/2026.** 5 achados, todos procedentes (0 falsos). Todos viraram patch neste plan, em `deferred-work.md` e em `sprint-status.yaml`.

| # | Achado | Veredito | Ação |
|---|--------|----------|------|
| 1 | O R7e foi dado como resolvido, mas o `pw:api` não mede o render do mobile | procedente | Bullet reescrito; R7e vai para `deferred-work.md` |
| 2 | Login em escuro e háptico do "Não vou voltar" sem rastreio | procedente | Entradas em `deferred-work.md` e em `deferred:`; check de login na Verification |
| 3 | "Já provado no scan" é falso: o scan usa `impactAsync`, não `notificationAsync` | procedente | Bullet corrigido; os duplos pulsos são do build antigo |
| 4 | O comando do NFR4 não reproduz a execução (:3000 e skip silencioso) | procedente | Comando exato com `BASE_URL`/`E2E_API_URL`/`E2E_SERVERS_UP`; seed no banco de dev anotado |
| 5 | Plan `in-review` com o item já `done` | procedente | Plan fechado como `done` após a triagem |
