---
title: 'Story 6.12: gate visual da demo (marco do Épico 6)'
type: 'chore'
ticket: '6-12-gate-visual-da-demo'
created: '2026-09-27'
status: 'review'
route: 'full'
route_source: 'auto'
review: ''
review_source: ''
lenses_ran: []
baseline_revision: 'f7f9adce88dc63d078d8c9e725f24a25fe7fbe4e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** O redesign do Épico 6 (6.1–6.11, todas mergeadas; a 6.6 entrou no PR #63 apesar do `sprint-status.yaml` ainda dizer `backlog`) nunca foi verificado ponta a ponta nem tem as capturas "depois" que a monografia precisa ao lado das 26 capturas "antes" em `audit/` (D-UX-13).

**Approach:** Um script reprodutível de captura (Expo Web + MSW, Chromium 390×844 @2x) gera as capturas "depois" com os mesmos nomes e estados de `audit/` numa pasta irmã `after/`; um documento lado a lado as referencia; o gate roda toda a bateria de testes, as buscas de hex/`lightPalette` e registra os resultados no plano.

## Boundaries & Constraints

**Always:** mesmos nomes de arquivo e mesmos estados das capturas `audit/` (usuário mock, tela, ação e esquema de cor do SO — `dark-*` com `colorScheme: 'dark'`); capturas geradas pelo script, nunca editadas à mão; resultados reais do gate (contagens de teste, falhas com saída) registrados em Implementation Notes; `docs/`/`_bmad-output/` em português, código e commits em inglês.

**Never:** mudar código de produção do app ou da API para "passar" o gate — defeito encontrado vira achado registrado (e só é corrigido aqui se for trivial e isolado, em commit próprio `fix(...)`); commitar `mobile/.env` com `EXPO_PUBLIC_USE_MOCKS=1` (restaurar o valor original ao final); criar arquivos de teste sob `mobile/src/app/`; declarar verificado em device o que não foi.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Captura completa | Expo Web com mocks em :8081, script rodado | 26 PNGs em `after/`, 1:1 com `audit/` | — |
| Estado inalcançável no mock | ex.: `track-bus` cai em erro no mock, como no "antes" | captura o estado que o mock produz, anotado no doc lado a lado | nunca inventar estado |
| Tela que mudou de copy/estrutura | seletor antigo não existe mais | script usa `testID`/texto atuais | falha explícita por captura, sem PNG vazio |
| Device indisponível | nenhum AVD em `adb.exe devices` | itens de device (Inter, háptico, ícone, splash) registrados como pendentes de verificação manual | status final não os dá como feitos |

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/audit/` -- 26 capturas "antes" (23 `light-*`, 3 `dark-*`); nomes definem os estados a reproduzir. `EXPERIENCE.md` §"Auditoria da UI atual" descreve o método (MSW + `EXPO_PUBLIC_E2E=1`, 390×844 @2x).
- `mobile/src/mocks/handlers/auth.handlers.ts` -- usuários mock (`motorista@`, `motorista-sem-viagem@`, `motorista-viagem-encerrada@`, `motorista-turma-vazia@`, `motorista-turma-grande@`, `aluno@`, `aluno-sem-rota@`, …, domínio `@pureurban.com`) e senha aceita.
- `mobile/src/mocks/handlers/{trip,boarding,routes}.handlers.ts` -- sentinelas por e-mail e estado em memória (reset no reload).
- `mobile/src/utils/e2e-scan-hook.ts` -- `globalThis.__E2E_INJECT_SCAN__(raw)` com `EXPO_PUBLIC_E2E=1`; payload do QR de aluno válido: ver `boarding.handlers.ts`/`decodeQrPayload`.
- `mobile/.env` -- hoje `EXPO_PUBLIC_USE_MOCKS=0`, `EXPO_PUBLIC_API_URL=http://localhost:3001`; mocks/E2E podem ir por env de linha de comando em vez de editar o arquivo.
- `api/node_modules/playwright` (1.58) -- Chromium para o script; MCP do Playwright não serve (pede Chrome).
- `api/tests/e2e/*.e2e.spec.ts`, `api/playwright.config.*` -- `pw:e2e` sobe o app web contra a API real; `BASE_URL`/`E2E_API_URL` permitem outra porta se :3000 estiver ocupada.
- `mobile/src/lib/palette.ts`, `mobile/src/lib/palette.guard.test.ts` -- fonte única de hex e a guarda.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-6` está `backlog` por engano (mergeada no PR #63); `6-12` a fechar.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/scripts/capture-demo-screens.mjs` -- script Node que resolve Playwright a partir de `../api/node_modules`, abre `http://localhost:8081` a 390×844 @2x, e para cada uma das 26 capturas faz login com o usuário mock certo, navega/age (injeção de scan, abrir dialog, etc.) e salva `after/<mesmo-nome>.png`; aceita filtro por nome; falha com mensagem por captura -- reprodutibilidade para a monografia e para a 6.14.
- [x] `_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/after/*.png` -- gerar as 26 capturas rodando o script com o Expo Web em mocks -- evidência "depois" (D-UX-13).
- [x] `_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/antes-depois.md` -- tabela por estado: id, descrição, usuário mock, imagem antes, imagem depois, nota (divergências de estado); instrução curta de como regenerar -- leitura lado a lado.
- [x] Gate de testes (sem arquivo) -- `docker compose up -d`; mobile `npm run lint`, `npm test`, `npx tsc --noEmit`; api `npm run lint`, `npm test`, `npm run test:e2e`, `npm run test:pw:api`, `npm run test:pw:e2e` (API em porta livre); buscas de hex e `lightPalette`; registrar contagens, NFRs de performance medidos e qualquer falha com saída.
- [x] Fluxos da demo -- percorrer no web (API real) embarque na ida, partida da volta, "onde está o ônibus" e "não vou voltar" (os specs `pw:e2e` cobrem; registrar quais); se houver AVD acessível por `adb.exe`, conferir Inter, ícone e splash por captura; háptico e itens sem device ficam como pendência manual explícita.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-6` → `done` (PR #63); `6-12` → status final com comentário do gate.

**Acceptance Criteria:**
- Given o Expo Web com mocks, when rodo `node mobile/scripts/capture-demo-screens.mjs`, then `after/` contém exatamente os 26 nomes de `audit/`, cada PNG 780×1688 e não vazio.
- Given o gate, when rodo a bateria, then lint, Jest mobile, testes API (unit, supertest e2e, `pw:api`, `pw:e2e`) passam e os NFRs de performance medidos ficam dentro do budget, ou a falha fica registrada com saída e o status não é `done`.
- Given `mobile/src` fora de `lib/palette.ts` e testes, when busco `#[0-9a-fA-F]{3,8}\b` e `lightPalette` em telas/componentes, then não há ocorrência fora das exceções já permitidas pela `palette.guard.test.ts`.
- Given `antes-depois.md`, when aberto, then cada uma das 26 linhas aponta para um antes e um depois existentes.

## Implementation Notes

- Retomada 2026-09-27: já existem sem commit `mobile/scripts/capture-demo-screens.mjs` e os 26 PNGs em `after/` (conferir contra os ACs antes de refazer). O usuário ligou os emuladores: `adb.exe devices` lista `emulator-5554` (motorista61@pureurban.dev) e `emulator-5556` (aluno61@pureurban.dev), senha `pureurban61`, dev build `com.pureurban.mobile`. Setup que funcionou: API na porta 3001 (`api/.env`), `CI=1 npx expo start --dev-client --port 8081` em `mobile/`, `adb.exe -s <serial> reverse tcp:8081 tcp:8081` e `tcp:3001`, depois `am start -a android.intent.action.VIEW -d 'exp+mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'`. Armadilhas: se o adb travar, `taskkill.exe /IM adb.exe /F` e `adb.exe start-server`; screenshots (1080×2400) são a fonte de verdade, tocar por coordenadas; não mandar KEYCODE_BACK no login; a cena virtual da câmera mostra o QR do aluno17 (abrir o scan com viagem ativa faz check-in real); a suíte e2e escreve no mesmo banco de dev.

- Duas quedas do WSL (08:45 e 08:51, OOM de 16 GB): o `npm test` do mobile abria 31 workers do jest-expo enquanto o Metro rodava. Corrigido em f7d5049 (`maxWorkers: '25%'`). Nas próximas execuções, derrubar o Expo Web antes da bateria de testes e não rodar Metro, Jest, tsc e Playwright ao mesmo tempo.

- **Resultado do gate (27/09/2026, rodado em sequência, sem Metro durante Jest/tsc):**
  - Capturas: `node mobile/scripts/capture-demo-screens.mjs` → 26/26 em ~70 s; `ls audit | diff - <(ls after)` vazio; todos os PNGs 780×1688, nenhum vazio. Rodado duas vezes (antes e depois da correção do mock), mesmo resultado. `mobile/.env` intocado (`EXPO_PUBLIC_USE_MOCKS=0`): mocks e hook de scan foram por env de linha de comando.
  - Mobile: `npm run lint` limpo; `npm test` 58 suites / 731 testes verdes; `npx tsc --noEmit` só os 3 erros da baseline (scan.tsx:312, use-trip-gps-capture.test.tsx:92, tracking-stream.service.test.ts:172).
  - API: `npm test` 60 arquivos / 340 testes verdes; `npm run test:e2e` 15 arquivos / 209 testes verdes; `npm run test:pw:api` 2/2 (API em :3001, `BASE_URL`/`E2E_API_URL`, `E2E_SERVERS_UP=1`); `npm run test:pw:e2e` 10/10 com Expo Web real (`EXPO_PUBLIC_USE_MOCKS=0`, `EXPO_PUBLIC_API_URL=http://localhost:3001`, `EXPO_PUBLIC_E2E=1`).
  - **`npm run lint` da API: VERMELHO — 147 erros, 56 warnings** em 25 arquivos de `src/`/`test/` (maiores: `prisma-user.adapter.spec.ts` 28, `prisma.service.spec.ts` 19, `prisma-global.module.spec.ts` 11). É a baseline conhecida (`deferred-work.md`, spec-4-0, spec-wrap-1); a branch não toca `api/src`. O AC do épico pede lint verde, então isto segura o `done`.
  - NFRs medidos (todos no budget): NFR1 check-in 12 ms (≤ 2000), NFR2 posição → texto do aluno 9 ms (≤ 5000), NFR3 "Avisar motorista" → contagem do motorista 101 ms (≤ 3000), NFR4 lista com 55 alunos 28 ms (≤ 1000).
  - Busca de hex (`#[0-9a-fA-F]{3,8}\b` fora de `palette.ts`/testes/`types/api.d.ts`): só as 6 ocorrências da allowlist da guarda (`student-qr-code.tsx` ×3, `qr-scanner.tsx`, `scan.tsx` ×2). OK.
  - **Busca de `lightPalette`: 5 telas importam** — `(auth)/login.tsx`, `(student)/home.tsx`, `(student)/qr-code.tsx`, `(driver)/student-list.tsx`, `(driver)/routes.tsx` (além de ~30 componentes/libs, que são o uso previsto). A guarda não proíbe o import; ao contrário, fixa `lightPalette.*` por source-lock em `routes.tsx` e `student-list.tsx`. O AC do épico ("nenhum import de `lightPalette` em telas") não é cumprido ao pé da letra. Inofensivo com o tema travado (D-UX-4), mas é trabalho da 6.14 (tema escuro) migrar essas telas para `useAppTheme`. Não corrigido aqui: não é trivial (5 telas + a guarda).
- **Fluxos da demo no web contra a API real (specs `pw:e2e`):** embarque na ida → `boarding-happy-path` (+ `boarding-invalid-qr` ×2, `boarding-offline-sync`); partida da volta → `absence-reminder` "aluno confirma ausência…" (lista do motorista na RETURN semeada, chip "Não vai voltar", contagem e toast) e `tracking-live` "fim pela UI" (encerrar pelo ConfirmDialog, depois "Iniciar Retorno" visível); "onde está o ônibus" → `tracking-live` feliz e degradado; "não vou voltar" → `absence-reminder` (notificar, desfazer na janela, fora da janela, lembrete). Lacuna: nenhum spec toca "Iniciar Retorno" pela UI (a RETURN vem semeada pela API).
- **Device (AVDs, dev build, Metro `--dev-client` + `adb reverse` 8081/3001):** ícone amarelo com ônibus e nome "PureUrban" no launcher (emulator-5554); splash amarelo com ônibus capturado numa rajada de `screencap` no cold start; fonte Inter nas telas do motorista (Viagem sem viagem ativa, "Rota Teste 17", card de permissão de localização) e do aluno (Início, "Olá, Aluna Seis Um"). Evidências só no scratchpad da sessão, não versionadas. **Pendente de verificação manual: háptico** (sucesso/aviso/erro no scan, "Não vou voltar", ações de impacto) — não dá para conferir por screenshot. Os fluxos completos no device não foram refeitos nesta sessão (foram na 6.1/6.11). Observação: o botão "Tools" do dev client fica por cima do menu de overflow do header; só existe no dev build.
- **Achados sem correção (registrados):** `light-11`/`light-19` mostram "Rota atribuída" em cold start com viagem ativa (decisão congelada da 6.5); lista vazia mantém o contador "0/0" (desvio aceito na 6.7); "Minhas rotas" sem restyle (6.13, backlog); avatares "A0" com nomes mock numéricos (`initials` pega o primeiro caractere de "01"); estados do mock inalcançáveis (`light-32`, `light-34`, `light-19`) iguais ao "antes" e cobertos pelo `pw:e2e`.

## Plan Change Log

- 2026-09-27 — Três correções pequenas e isoladas encontradas pelo gate, cada uma em commit próprio:
  1. `mobile/src/mocks/handlers/boarding.handlers.ts`: `summary.total` do mock passou a excluir `NOT_RETURNING`, como a API real (`get-trip-students.use-case`). Antes a legenda da lista não fechava ("0 embarcaram · 1 não vai voltar · 4 aguardando" com 4 alunos). O script de captura espera "1 de 3" em `light-17`.
  2. `mobile/src/components/ui/mdi-icon.tsx`: `aria-hidden` no ícone. O react-native-web 0.21 ignora `accessibilityElementsHidden`/`importantForAccessibility`, e o glifo MDI entrava no nome acessível dos botões no web ("󰕍 Desfazer"), o que quebrava `getByRole('button', { name: 'Desfazer', exact: true })` no `absence-reminder`.
  3. `api/tests/e2e/absence-reminder.e2e.spec.ts`: `ageAbsenceInClientCache` procurava a query `studentAbsence`, removida no PR #54 (home do aluno passou a ler `GET /boarding/status` sob `studentBoardingStatus`). O spec "fora da janela" falhava sempre desde então.
- 2026-09-27 — Status final `review`, não `done`: lint da API na baseline vermelha, `lightPalette` em 5 telas e háptico sem verificação manual.

## Review Triage Log

## Design Notes

`after/` ao lado de `audit/` (mesmo nome de arquivo) permite diff visual direto e links relativos simples no documento. Os `dark-*` continuam sendo "SO em escuro" — o app trava em claro (D-UX-4), então devem sair iguais aos `light-*`; isso comprova a trava.

## Verification

**Commands:**
- `ls audit | diff - <(ls after)` (na pasta da UX) -- expected: sem diferença
- `cd mobile && npm run lint && npm test && npx tsc --noEmit` -- expected: lint e Jest verdes; tsc só com os 3 erros da baseline (scan.tsx, use-trip-gps-capture.test.tsx, tracking-stream.service.test.ts)
- `cd api && npm run lint && npm test && npm run test:e2e && npm run test:pw:api && npm run test:pw:e2e` -- expected: verdes
- `grep -rnE "#[0-9a-fA-F]{3,8}\b|lightPalette" mobile/src --include=*.tsx --include=*.ts | grep -v -e palette.ts -e '\.test\.'` -- expected: só exceções conhecidas da guarda

**Manual checks (if no CLI):**
- Olhar cada par antes/depois: estado equivalente, nada truncado nem com overflow horizontal.
