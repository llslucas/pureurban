---
title: 'Story 4.5: E2E do Épico 4'
type: 'feature'
created: '2026-09-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: a194d73c23368c1bdc7f8c696ba1f4eb5576f587
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O Épico 4 está funcionalmente completo (4.1–4.4 `done`), e a camada supertest
(`boarding.e2e-spec.ts`) já prova a matriz de API dos quatro fluxos — inclusive a entrega
do evento no stream em <3s. Mas nada prova a experiência ponta a ponta pela UI: o aluno
tocar "não vou voltar" e o motorista ver o status e a contagem mudarem em <3s (NFR3), o
countdown alimentado por `cancellableUntil`, o estado consolidado fora da janela e o
lembrete in-app respondido pelo aluno — tudo contra a API real. Sem essa prova e sem o
drift check do `openapi.json`, o marco de entrega do épico não se sustenta.

**Approach:** Nova suíte Playwright (projeto `e2e` da 3.6, sem `webServer` — pré-requisitos
manuais + auto-skip) dirigindo Expo Web com mocks desligados contra a API local. Seed do
cenário por API com credenciais de aluno retornadas; duas páginas em contextos separados
(motorista na lista, aluno na home) sobre a mesma viagem RETURN. Fluxos dependentes de
tempo (janela de 2 min, lembrete de 15 min) usam um helper de "aging" de timestamps via
Prisma — precedente do supertest —, nunca sono de tempo real nem backdoor em produção.
`openapi:check` fecha o AC de contrato.

## Boundaries & Constraints

**Always:**
- Specs em `api/tests/e2e/` (projeto `e2e`, Desktop Chrome, serial), importando `test`/`expect`
  de `merged-fixtures`; guard `e2eServersUnavailable()` no `beforeAll` (auto-skip sem infra;
  `E2E_SERVERS_UP=1` transforma ausência em falha).
- Seed via API, tenant faker isolado, sem cleanup (padrão 3.6): o cenário do épico 4 cria
  OUTBOUND com check-ins reais (header `X-Idempotency-Key`), encerra-a e abre RETURN ativa.
- Aging de timestamps (`startedAt` da RETURN, `notifiedAt`/`cancellableUntil` da ausência) é
  o ÚNICO acesso direto ao banco, centralizado num helper de support (cliente Prisma com
  adapter `PrismaPg` + dotenv, padrão do `prisma/seed.ts` da 1.9).
- Lembrete disparado pelo scheduler real do dev server (tick de 60s, sem kill-switch em
  `:3000`): o spec faz polling de `GET /api/v1/boarding/reminder` com token do aluno
  (timeout ≥90s) e depois remonta a home (reload) — o banner refresca em mount/remount.
- NFR3 medido como wall-clock do clique em "Confirmar" até o badge/contagem visível na
  página do motorista, budget de 3000ms em const, log `[NFR3] ...ms` e margem de ambiente
  local documentada no README (a prova de rede pura <3s já vive no supertest).
- Duas páginas em contexts separados na mesma viagem: motorista logado → "Gestão de Viagem"
  → "Ver lista"; aluno logado → home com o botão "Não vou voltar".
- Console do browser sem `[mocks] MSW ativo`; toda chamada `/api/v1` contra a API real.

**Never:**
- Não mudar código de produção (`api/src/`, `mobile/src/`): sem testID novo (convenção
  text/role-based), sem endpoint/backdoor de trigger do scan de lembretes, sem tocar em
  `CANCELLABLE_WINDOW_MS` ou `CHECKIN_REMINDER_DELAY_MS`.
- Não tocar em `api/test/boarding.e2e-spec.ts`, nas specs Playwright do épico 3, em
  `playwright.config.ts`, em `mobile/src/mocks/` nem no gate duplo do hook de scan.
- Sem `webServer` no Playwright, sem migração/reset de banco, sem Expo Go, sem mock de
  banco, sem esperar janela real (2 min / 15 min) com sono.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Notificar ausência (UI) | Aluno na home com RETURN ativa; confirma no dialog "Não vou voltar?" | `POST /not-returning` 201 (contrato da 4.1 — correção autorizada pelo Lucas em 09/09/2026); home vira "Ausência registrada" com countdown `M:SS` e botão Cancelar; motorista vê badge "! Não vai voltar", contagem `N-1` e toast "{nome} não vai voltar no ônibus" | N/A |
| NFR3 | Mesmo fluxo, t0 = clique em Confirmar | badge/contagem do motorista visíveis em <3000 ms (log `[NFR3]`) | N/A |
| Cancelar dentro da janela | Aluno toca "Cancelar" com countdown vivo | Home volta ao botão "Não vou voltar"; motorista reverte badge e contagem (`boarding.absence_cancelled`) | N/A |
| Fora da janela (UI) | Ausência com `notifiedAt`/`cancellableUntil` no passado (aging) | Card consolidado "Ausência registrada" SEM botão Cancelar e sem countdown | N/A |
| Fora da janela (API) | `POST /cancel-absence` com token do aluno sobre ausência expirada | Erro tipado `CANCELLATION_PERIOD_EXPIRED`; ausência persiste | Mensagem clara, sem 500 |
| Lembrete (scheduler real) | RETURN com `startedAt` há ~16 min (aging); aluno com check-in na ida, sem check-in/ausência na volta | Polling de `GET /reminder` → `{ data: { tripId, remindedAt } }` em ≤90s; após reload, banner "E a volta?" com "Não vou voltar"; confirmar registra a ausência (mesmo dialog/estado) e o banner some; motorista vê o badge | Banner ausente enquanto GET é `null` (assert intermediária) |
| Drift de contrato | `openapi.json` commitado vs gerado do código | `npm run openapi:check` exit 0 | Dif visível se divergir |

</frozen-after-approval>

## Code Map

- `api/tests/e2e/boarding-happy-path.e2e.spec.ts` -- template: guard de servers, retries,
  seed por fixture, `page.waitForResponse` + `request.timing()` para NFR, "Ver lista"
  (`trip.tsx:364`) como navegação do motorista.
- `api/tests/support/helpers/seed-helpers.ts` -- `seedEpic3Scenario` (:99-179) é o modelo;
  hoje NÃO retorna credenciais dos alunos (só `studentIds`) — o seed do épico 4 retorna
  `{ id, name, email, password }` por aluno e a cadeia OUTBOUND (check-ins + end) → RETURN.
- `api/tests/support/factories/student.factory.ts` -- alunos são logináveis
  (`{name,email,password≥8}`); reusar.
- `api/tests/support/helpers/e2e-driver.ts` -- `loginAsDriver` (:20-31) preenche
  `#login-email`/`#login-password` e clica "Entrar"; redirecionamento por papel leva aluno a
  `/(student)/home`. Adicionar `loginAsStudent` com o mesmo padrão.
- `api/tests/support/helpers/e2e-servers.ts` -- `e2eServersUnavailable()` :57,
  `API_URL`/`EXPO_WEB_URL`, `E2E_SERVERS_UP=1` :42-51. Reusar.
- `api/tests/support/{merged-fixtures,custom-fixtures}.ts` -- ponto único de import;
  fixture `epic3` :21-26 é o modelo da `epic4` nova.
- `api/prisma/seed.ts` -- padrão do cliente Prisma com adapter `PrismaPg` + dotenv (1.9)
  para o helper de aging.
- Timestamps de referência (values para aging): `Trip.startedAt`; `BoardingAbsence.notifiedAt`
  e `cancellableUntil` (o supertest semeia datas passadas em `boarding.e2e-spec.ts:1261-1270`).
- Telas / seletores (texto, sem testID): aluno `mobile/src/app/(student)/home.tsx` — botão
  "Não vou voltar" :315-324, banner "E a volta?" :269 com botão :274-281, card "Ausência
  registrada" :289, countdown :295-298, "Cancelar" :299-308, dialog "Não vou voltar?" com
  "Voltar"/"Confirmar" :336-351; motorista `mobile/src/app/(driver)/student-list.tsx` —
  contagem `${n}/${total} embarcados` :318-320, badge "! Não vai voltar"
  (`student-card.tsx:21-25`), toast ":name não vai voltar no ônibus" :356-364; SSE conecta
  no mount :190-198 e reconcile por refetch no reopen.
- `api/src/domains/trip/core/use-cases/get-active-student-trip.use-case.ts` -- home do aluno
  só resolve viagem RETURN ativa — por isso o seed encerra a OUTBOUND e abre a RETURN.
- `api/tests/README.md` -- runbook (:70-105): pré-requisitos, env do Expo Web
  (`EXPO_PUBLIC_USE_MOCKS=0 EXPO_PUBLIC_API_URL=http://localhost:3000 EXPO_PUBLIC_E2E=1`),
  auto-skip e caveats; ganha a seção do épico 4.

## Tasks & Acceptance

**Execution:**
- [x] `api/tests/support/helpers/seed-helpers.ts` -- adicionar `seedEpic4Scenario(request, opts?)`:
  empresa+admin, motorista, rota, N alunos COM credenciais, vínculos, OUTBOUND com check-ins
  opcionais (`opts.outboundCheckIns`), end da OUTBOUND, RETURN ativa com `relatedTripId`;
  retorna tokens, ids e credenciais dos alunos.
- [x] `api/tests/support/helpers/prisma-time.ts` -- NEW: `ageTrip(tripId, minutesAgo)` e
  `ageAbsence(notReturningId/locate, minutesAgo)` via cliente Prisma (adapter + dotenv);
  único ponto de escrita direta.
- [x] `api/tests/support/helpers/e2e-driver.ts` -- adicionar `loginAsStudent(page, creds)`.
- [x] `api/tests/support/custom-fixtures.ts` + `merged-fixtures.ts` -- fixture `epic4`
  exposta pelo ponto único de import.
- [x] `api/tests/e2e/absence-reminder.e2e.spec.ts` -- NEW, 3 testes: (1) notificar + NFR3 +
  cancelar na janela com reverter do motorista; (2) fora da janela: aging → card consolidado
  na UI + `CANCELLATION_PERIOD_EXPIRED` via API; (3) lembrete: aluno com check-in na ida,
  aging da RETURN, polling do GET, banner → confirmar → "Ausência registrada" + badge no
  motorista.
- [x] `api/tests/README.md` -- seção "E2E do Épico 4": cenário semeado, o helper de aging
  (única escrita direta no banco), o polling do scheduler real (por que o teste espera até
  ~90s) e a margem de ambiente do NFR3.

**Acceptance Criteria:**
- Given a infra de pé (compose + API :3000 + Expo Web :8081 com mocks off), when
  `npm run test:pw:e2e`, then os três testes novos passam contra a API real — sem nenhum
  handler MSW ativo — e as specs do épico 3 seguem verdes.
- Given o aluno confirma "não vou voltar" na home, when o motorista está na lista, then o
  badge "! Não vai voltar" e a contagem ajustada aparecem em <3000 ms, medidos e logados
  (`[NFR3]`).
- Given ausência registrada dentro da janela, when o aluno toca Cancelar, then a home volta
  ao estado "Não vou voltar" e a lista do motorista reverte badge e contagem.
- Given ausência com janela expirada (aging), when a UI renderiza e o aluno tenta cancelar
  via API, then o card aparece consolidado (sem Cancelar) e a API responde
  `CANCELLATION_PERIOD_EXPIRED` sem 500.
- Given aluno com check-in na ida sem posição na volta e RETURN iniciada há >15 min, when o
  scheduler real do dev server roda, then `GET /reminder` fica pendente (polling), o banner
  "E a volta?" aparece após reload e respondê-lo registra a ausência com o mesmo estado do
  botão da 4.1.
- Given o contrato do épico 4, when `npm run openapi:check`, then exit 0.
- Given `git diff main`, then nenhuma mudança em `api/src/` ou `mobile/src/` (story só de
  teste/docs); lint api na baseline (~147) e mobile lint sem erros novos.

## Implementation Notes

- **2026-09-09 — Gap de produção descoberto (CORS × SSE no web):** o stream do
  motorista é bloqueado no browser porque `react-native-sse` envia o header
  `cache-control` e a allowlist de CORS em `api/src/main.ts` (Content-Type,
  Authorization, X-Idempotency-Key) não o inclui. O servidor entrega o evento
  em <50 ms (verificado com stream cru) — não é latência, é preflight. A 4.5
  proíbe tocar em `api/src/`, então o spec remove o header na camada de
  transporte do contexto do motorista (`allowSseInBrowser`). Follow-up
  recomendado (nova story): acrescentar `cache-control` à allowlist e remover o
  shim. Sem isso, o motorista NÃO tem realtime em nenhuma implantação web
  cross-origin (nativo não é afetado — não há CORS em iOS/Android).
- **2026-09-09 — Aging da janela precisa incluir o cache do aluno:** a home
  renderiza o countdown exclusivamente do `cancellableUntil` persistido no
  cache do TanStack (não há GET de ausência). Envelhecer só o banco deixa a UI
  contando por até 2 min reais. O spec envelhece também o blob persistido
  (MMKV-web/localStorage, `ageAbsenceInClientCache`) — espelho client-side do
  helper Prisma, sem tocar em `mobile/src`. Extra descoberto no caminho: o
  persister descarrega com throttle de ~1s — recarregar a página antes disso
  perde a escrita.
- **2026-09-09 — Ambiente local:** porta 3000 está ocupada fora do repo
  (bind EADDRINUSE no WSL2 — provável listener do Windows host; é o motivo de
  `api/.env` usar `PORT=3001`). A suíte roda inalterada com os overrides
  previstos: API em :3001, Expo com `EXPO_PUBLIC_API_URL=http://localhost:3001`
  e `E2E_API_URL`/`BASE_URL` apontando para :3001.
- **2026-09-09 — staleTime global do app (1 min) afeta o banner do lembrete:**
  o remount só refaz o `GET /reminder` depois de o `null` persistido ficar
  velho; o spec remonta em loop (`expect.toPass`) até o banner aparecer, em vez
  de um único reload.

## Spec Change Log

## Review Triage Log

Review 1 (2026-09-09, pós-implementação; 3 camadas: Blind Hunter 14, Edge Case Hunter 10,
Verification Gap 2 — 26 achados, 7 patches, 1 defer, 18 rejeitados):

| # | Achado (camada) | Veredito | Evidência |
|---|-----------------|----------|-----------|
| 1 | BH: botão "Ver lista" não existe na UI; frozen Always/Code Map apontam seletor sem match | false | "Ver lista" EXISTE — é o botão na tela do Scanner (`scan.tsx:490`), usado com sucesso pela spec do épico 3 (verde na execução desta review). Da tela de Viagem o botão é "Alunos da Viagem" (`trip.tsx:370`), que a nova spec clica e documenta. O fluxo executado é o correto; a imprecisão é cosmética num resumo congelado → rejeitado (fix seria editar spec) |
| 2 | BH: refs de linha da Code Map defasadas (`seedEpic3Scenario` :99-179 → :128-208 etc.) | low | Verdadeiro: as refs estavam corretas no planejamento; as próprias adições desta story deslocaram as linhas. Code Map é regenerado por story no planejamento → rejeitado (fix seria editar esta spec) |
| 3 | BH/ECH/VG: `outboundCheckIns: 0` vira default 1 (guard `> 0`), contradizendo o doc "[0, studentCount]" | low | Verdadeiro (`seed-helpers.ts`, guard `requestedCheckIns > 0`): 0 explícito é engolido. Nenhum chamador passa opts hoje; risco latente de seed errado num teste negativo futuro → patch: guard `>= 0` |
| 4 | BH: comentário do teste 2 diz "~5 min no passado" mas faz aging de 10 | low | Verdadeiro (aritmética: `cancellableUntil` fica ~8 min no passado) → patch: corrigir o comentário |
| 5 | BH: `minutesAgo` com semântica oposta em `ageTrip` (absoluto) vs `ageAbsence` (delta) | low | Verdadeiro — mesmo nome, comportamentos distintos no módulo que se declara "ponto único auditable" → patch: renomear parâmetros |
| 6 | BH/ECH: teste 3 abre contexto do motorista sem o shim SSE, dependência implícita não documentada | false | O próprio teste documenta: "roster aberto depois reflete o servidor (reconcile por refetch no mount)" — as asserções vêm do refetch de mount, não do stream (comprovado pelo green) |
| 7 | BH: matriz promete "mensagem clara, sem 500", mas o teste não assevera `error.message` | low | "Sem 500" está coberto (409 + code); a mensagem existe no envelope de erro tipado do repo, mas a asserção é barata → patch: `expect(body.error?.message).toBeTruthy()` |
| 8 | BH: divergências pós-freeze (client-cache aging + shim) fora do Spec Change Log | false | Ambas estão documentadas em Implementation Notes + README (seções agent-owned); o Change Log é populado pela step-04 em loopbacks — não houve loopback; esta triagem é o registro do processo |
| 9 | BH: Change Log / Triage Log vazios com status in-review | false | Por design do template: Triage Log é populado por esta própria review (esta tabela); Change Log só em loopback |
| 10 | BH: falta cobertura negativa do lembrete (sem check-in na ida → null; sem re-disparo pós-ausência) | low | Elegibilidade e filtros do scan são exaustivamente provados no unit (TestClock) + supertest da 4.4; fix = cenário novo (> correção direta) → rejeitado |
| 11 | BH/ECH: `reminderOf` assevera 200 dentro do loop de polling; 5xx transitório aborta em vez de re-tentar | low | Verdadeiro mecanicamente; servidor local torna raro, mas o deadline de 90s existe para isso → patch: tolerar non-200 no loop até o deadline |
| 12 | BH: `waitForTimeout(1500)` viola "nunca sono" em espírito; estreita (não fecha) corrida do persister | low | A regra congelada mira janelas reais (2/15 min); os 1.5s drenam o throttle de 1s documentado, sem mutação de cache depois → rejeitado (alternativa determinística = mecanismo novo) |
| 13 | BH: ACAR hard-coded `'authorization'` no shim; URL do endpoint duplicada | low | Se o cliente SSE ganhar header novo, o teste FALHA alto (badge não chega → NFR3 estoura), não mascara nada; README documenta o shim → rejeitado |
| 14 | BH: `Epic4Scenario.driver` tipado como `Epic3Credentials` | low | Reuso cosmético de nome em support de teste (`{email,password}` genérico); fix = churn em arquivos do épico 3 → rejeitado |
| 15 | ECH: `react-native-sse` também envia X-Requested-With, não removido → stream seguiria bloqueado | false | Refutado empiricamente: o teste 1 passou 2x (subagente + orquestrador) com asserções SSE-dependentes em <3s (110ms medido) — o stream flui sob o shim como construído |
| 16 | ECH: reescrita de ACAR ignorada (main.ts usa allowedHeaders) → preflight bloquearia de qualquer forma | false | Mesma refutação empírica do #15: badge/contagem chegaram via stream em 110ms; o mecanismo funciona |
| 17 | ECH: toast (snackbar 4s) pode desmontar antes da asserção (badge pode consumir 3s do budget) | false | Se o assert NFR3 segura (badge <3s), count+toast rodam <3s+ε após o evento — dentro da janela de 4s; se o badge estourar 3s, o teste já falhou no assert de budget |
| 18 | ECH: flush do persister após a escrita envelhecida sobrescreveria o blob antes do reload | false | Os 1.5s de quiescência drenam o throttle de 1s; após isso não há mutação do cache (nenhum refetch disparado) — a escrita sobrevive até o reload (2 execuções verdes) |
| 19 | ECH: `request` com URL relativa resolve contra BASE_URL enquanto o guard sonda E2E_API_URL — override parcial quebra opacamente | low | Verdadeiro mecanicamente; `seed-helpers` usa `API_URL` absoluto e a nova spec não segue a convenção nos 2 calls diretos → patch: prefixar com `API_URL` |
| 20 | ECH: budget de 240s do teste 3 pode ser estourado (poll 90s + toPass 120s + seed/logins) | low | Pior caso mecânico > 240s; falha seria ruidosa (timeout), não falsa-passagem; correção de 1 linha → patch: 300s |
| 21 | ECH (claim): Always "duas páginas" não honrado no teste 2; lado do motorista da janela expirada nunca provado | false | Nenhuma linha da matriz/AC pede o motorista no fora-da-janela — a UI do motorista não muda com a expiração; o Always descreve o modo de operação da suíte, exercitado nos testes 1 e 3 |
| 22 | VG (pré-verificado): o shim normaliza o gap de CORS×SSE — a suíte não pode falhar no defeito de produção, nem protegerá o comportamento após o fix (shim esquecido seguiria mascarando) | defer | Evidência da camada VG (grep sem `cache-control` na allowlist de `main.ts:62`; `react-native-sse` EventSource.js:80; comentário da própria API em main.ts:54-56). Disposition defer — JÁ registrado em deferred-work.md pela decisão do Lucas nesta sessão (fix de 1 linha + remover shim + re-verificar preflight sem shim) |

## Design Notes

- **Aging via Prisma em vez de sono real:** janelas de 2 min e 15 min são inviáveis em
  tempo real; o supertest já semeia datas passadas direto no banco
  (`boarding.e2e-spec.ts:1261-1270`). A criação de dados continua 100% via API (padrão 3.6);
  o aging é exceção de timestamps, centralizada num helper para ser auditable.
- **Scheduler real, sem backdoor:** a 4.4 proibiu endpoint de trigger manual. O spec
  dependentemente espera o tick de 60s do dev server fazendo polling no GET do aluno —
  prova inclusive o requisito "derivável na abertura do app" (banner só aparece após o
  remount, pois não há polling no app).
- **NFR3 wall-clock:** NFR3 é cross-screen (toque do aluno → tela do motorista); medir só a
  rede não captura o AC. O trecho de rede puro já tem asserção <3s no supertest; o Playwright
  mede a experiência completa com budget folgado para ambiente local.
- **Seletores text/role-based:** convenção do repo (zero `testID` em `mobile/src`); as
  strings exatas estão listadas na Code Map para não caçar em implementação.

## Verification

**Commands:**
- `docker compose up -d` + API `npm run start:dev` (:3000) + Expo Web mocks-off (:8081)
  + `cd api && npm run test:pw:e2e` -- 3 testes novos verdes + specs do épico 3 verdes.
- `cd api && npm run openapi:check` -- exit 0.
- `cd api && npm run test:pw:api` -- verde.
- `cd api && npm test` e `cd mobile && npm test` -- sem regressão (nenhum src tocado).
- `cd api && npm run lint` -- baseline (~147), nenhum arquivo novo na saída;
  `cd mobile && npm run lint` -- 0 erros.

**Manual checks:**
- Console do browser nos testes sem `[mocks] MSW ativo`; log `[NFR3] ...ms` visível na
  saída do Playwright.
