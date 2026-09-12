---
title: 'Story 5.3: E2E do Épico 5'
type: 'feature'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c0186fd5081ef26ee947eb0ba9817e08e7d0f21d'
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O Épico 5 está funcionalmente completo (5.0–5.2 `done`): o supertest
(`api/test/tracking.e2e-spec.ts`) já prova a matriz de API — ingestão, autorização,
primeiro evento do stream em <5s, 2 alunos num só subscribe, sentinela de fim de viagem
e descoberta de viagem ativa. Mas nada prova a experiência ponta a ponta pela UI, contra
a API real: o motorista iniciar a viagem e o GPS transmitir sozinho, o aluno abrir
"Acompanhar ônibus" e ver a posição com distância/ETA se atualizando em <5s (NFR2), o
degradado "Sem sinal GPS" após ~15s sem eventos com recuperação automática, e o
encerramento da viagem parar a transmissão e fechar o stream do aluno. Sem essa prova e
sem o drift check do `openapi.json`, o marco de entrega do épico — a demonstração do
pipeline SSE + Redis Pub/Sub da tese — não se sustenta.

**Approach:** Nova suíte Playwright (projeto `e2e` da 3.6/4.5, sem `webServer` —
pré-requisitos manuais + auto-skip) dirigindo Expo Web com mocks desligados contra a API
local. Dois contextos de browser com geolocation mockada do Playwright
(`permissions: ['geolocation']` + coordenadas fixas): a captura do motorista
(expo-location → `navigator.geolocation` no alvo web) e a posição do aluno no
track-bus são ambas dirigíveis assim — zero mudança de código de produção. Seed via
API; no caminho feliz a viagem é iniciada pela UI. A janela degradada de 15s é esperada
em tempo real — o timer é `setTimeout` no browser, não há relógio de banco a envelhecer
— dentro do precedente de espera longa da 4.5 (polling de 90s do scheduler real).
`openapi:check` fecha o AC de contrato.

## Boundaries & Constraints

**Always:**
- Specs em `api/tests/e2e/` (projeto `e2e`, Desktop Chrome, serial), importando
  `test`/`expect` de `merged-fixtures`; guard `e2eServersUnavailable()` no `beforeAll`
  (auto-skip sem infra; `E2E_SERVERS_UP=1` transforma ausência em falha).
- Seed via API, tenant faker isolado, sem cleanup (padrão 3.6/4.5): empresa+admin,
  motorista, rota com vínculos, aluno COM credenciais. Viagem: o teste feliz inicia via
  UI ("Iniciar Viagem"); os testes degradado e de fim recebem OUTBOUND ACTIVE criada
  pelo seed via API (`opts`).
- Geolocation mockada em AMBOS os contextos, coordenadas fixas deterministicamente
  escolhidas: aluno parado; motorista em 2 pontos (A próximo, B distante) cujas
  distâncias/ETAs exatos são computáveis (haversine + `formatDistance`/`formatEta`).
  Movimentar o motorista = `context.setGeolocation` — o tick de captura (~5s) lê o que
  estiver setado.
- NFR2 medido como wall-clock da RESPOSTA do `POST /tracking/location` do motorista até
  o texto de distância/ETA atualizado ficar visível na tela do aluno — budget 5000 ms em
  const, log `[NFR2] ...ms`, margem de ambiente documentada no README. A latência de
  captura (tick ≤5s do produtor) fica FORA da conta: NFR2 fala da entrega
  (Redis Pub/Sub → SSE → render); a prova de entrega pura <5s já vive no supertest.
- Degradado: motorista offline via `context.setOffline(true)` após posição conhecida →
  POSTs cessam; chip "Sem sinal GPS" com o último ponto mantido em ≤25s (espera real de
  15s + margem; pings NÃO contam como sinal); `setOffline(false)` → próximo tick
  transmite → "Em tempo real" retorna com texto reatualizado.
- Fim de viagem pela UI ("Encerrar Viagem") com aluno assistindo: tela do aluno vira
  "Nenhuma viagem ativa no momento" (sentinela `trip.ended` → stream fecha
  elegantemente); tela do motorista volta ao estado "Iniciar Viagem"; zero
  `POST /tracking/location` numa janela de 7s pós-fim (prova da parada da captura).
- Console do browser sem `[mocks] MSW ativo`; toda chamada `/api/v1` contra a API real.

**Never:**
- Não mudar código de produção (`api/src/`, `mobile/src/`): sem `testID` (convenção
  text/role-based), sem hook de injeção de GPS (o `setGeolocation` do Playwright basta —
  precede o precedente `__E2E_INJECT_SCAN__`, aqui desnecessário), sem tocar no timer de
  15s nem no intervalo de 5s.
- Não tocar em `api/test/tracking.e2e-spec.ts`, nas specs Playwright dos épicos 3/4, em
  `playwright.config.ts` nem em `mobile/src/mocks/`.
- Sem mock da API de tracking (o que se prova é o pipeline real), sem `webServer` no
  Playwright, sem migração/reset de banco, sem Expo Go, sem mapa cartográfico.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Feliz (UI) | Motorista logado com geolocalização A; inicia viagem pela UI; aluno logado abre "Acompanhar ônibus" | `POST /tracking/location` a cada ~5s; tela do aluno mostra posição + chip "Em tempo real" com distância/ETA de A | N/A |
| NFR2 | Motorista movido A→B (`setGeolocation`); t0 = resposta do POST | texto de distância/ETA do aluno muda para o valor de B em <5000 ms (log `[NFR2]`) | N/A |
| Degradado | Motorista offline (`setOffline(true)`) com última posição entregue | POSTs cessam; ≤25s depois: chip "Sem sinal GPS" com último ponto mantido | pings do servidor não resetam o indicador |
| Recuperação | Motorista volta (`setOffline(false)`) | próximo tick transmite; "Em tempo real" retorna e o texto reatualiza | — |
| Fim de viagem (UI) | Motorista clica "Encerrar Viagem" com aluno assistindo | stream do aluno fecha → "Nenhuma viagem ativa no momento"; motorista volta a "Iniciar Viagem"; 0 POSTs em 7s | — |
| Drift de contrato | `openapi.json` commitado vs gerado do código | `npm run openapi:check` exit 0 | Dif visível se divergir |

</frozen-after-approval>

## Code Map

- `api/tests/e2e/absence-reminder.e2e.spec.ts` -- template estrutural: guard de servers,
  `test.setTimeout` por teste (:122/:198/:269), fixture por tenant, duas páginas em
  contextos separados, padrão de medição NFR wall-clock (:148-167: t0, `waitForResponse`,
  `toBeVisible({ timeout: BUDGET })`, log).
- `api/tests/support/helpers/seed-helpers.ts` -- `seedEpic4Scenario` (:254) é o modelo:
  100% API, credenciais retornadas. `seedEpic5Scenario` segue o padrão SEM check-ins e
  com trip opcional (`opts.createActiveTrip` → `POST /trips` OUTBOUND).
- `api/tests/support/custom-fixtures.ts` + `merged-fixtures.ts` -- fixture `epic4` (:32)
  é o modelo da `epic5`; ponto único de import.
- `api/tests/support/helpers/e2e-driver.ts` -- `loginAsDriver` (:20) e `loginAsStudent`
  (:47) reusados; sem helper novo (abrir "Acompanhar ônibus" é um locator inline).
- `api/tests/support/helpers/e2e-servers.ts` -- `e2eServersUnavailable()`, `API_URL`,
  `EXPO_WEB_URL`.
- `mobile/src/utils/gps-capture.ts` + `mobile/src/hooks/use-trip-gps-capture.ts` --
  captura do motorista: `getCurrentPositionAsync` a cada `GPS_CAPTURE_INTERVAL_MS=5000`,
  falhas descartadas; no web expo-location delega a `navigator.geolocation`
  (`node_modules/expo-location/build/ExpoLocation.web.js`) -- é o que o Playwright
  dirige.
- `mobile/src/app/(driver)/trip.tsx` -- gate da captura via cache react-query
  (`activeTrip?.status === 'ACTIVE'`, :274-337); "Iniciar Viagem" :191/:219,
  "Encerrar Viagem" :499; permissão `useForegroundPermissions`.
- `mobile/src/app/(student)/track-bus.tsx` -- textos/estados: entrada "Acompanhar ônibus"
  (home do aluno :265); chips "Em tempo real" / "Sem sinal GPS"; "Nenhuma viagem ativa no
  momento"; "Aguardando a primeira posição"; `GPS_SIGNAL_TIMEOUT_MS = 15_000` (:25) com
  `markSignal` reiniciado por evento E por seed last-known (ping não conta).
- `mobile/src/lib/geo.ts` -- `formatDistance` ("X m" / "X,Y km") e `formatEta`
  ("Chegando" / "~N min" a 25 km/h): asserts usam os valores exatos computados das
  coordenadas fixas.
- `api/src/domains/tracking/shell/http/tracking.controller.ts` -- superfície provada
  (POST `location`, GET `trips/:id/stream`, GET `trips/:id/location`, GET
  `trips/active`); CORS de SSE já liberado em `main.ts` (herança do fix da 4.5).
- `api/tests/README.md` -- runbook (:70-85) de boot manual; ganha a seção do épico 5.
  Nota de ambiente da 4.5: porta 3000 ocupada fora do repo (WSL2) -- API em `PORT=3001`
  com `E2E_API_URL`/`EXPO_PUBLIC_API_URL` apontando :3001.

## Tasks & Acceptance

**Execution:**
- [x] `api/tests/support/helpers/seed-helpers.ts` -- adicionar `seedEpic5Scenario(request,
      opts?)`: empresa+admin, motorista, rota com vínculos (driver + aluno), 1 aluno com
      credenciais; `opts.createActiveTrip` (default `false`) cria OUTBOUND ACTIVE via
      `POST /trips`; retorna credenciais driver/student + `routeId`/`tripId`.
- [x] `api/tests/support/custom-fixtures.ts` + `merged-fixtures.ts` -- fixture `epic5`
      exposta pelo ponto único de import.
- [x] `api/tests/e2e/tracking-live.e2e.spec.ts` -- NEW, 3 testes: (1) feliz: iniciar
      viagem via UI → POSTs a cada ~5s → aluno vê posição/ETA → motorista A→B → texto
      atualiza com `[NFR2]` medido; (2) degradado + recuperação: offline → "Sem sinal
      GPS" ≤25s com último ponto → volta → "Em tempo real"; (3) fim: "Encerrar Viagem" →
      aluno "Nenhuma viagem ativa no momento" + motorista de volta a "Iniciar Viagem" +
      0 POSTs em 7s. Contextos com `permissions: ['geolocation']` + `setGeolocation`;
      `test.setTimeout` ≥120s onde couber.
- [x] `api/tests/README.md` -- seção "E2E do Épico 5": mecanismo de geolocation mock,
      por que a espera real de 15s (timer no browser, não há o que envelhecer), ponto de
      medição do NFR2 + margem de ambiente.

**Acceptance Criteria:**
- Given a infra de pé (compose + API + Expo Web mocks off), when `npm run test:pw:e2e`,
  then os três testes novos passam contra a API real — sem nenhum handler MSW ativo — e
  as specs dos épicos 3/4 seguem verdes.
- Given o motorista inicia a viagem pela UI, when o aluno abre "Acompanhar ônibus", then
  posição + distância/ETA ficam visíveis e atualizam quando o motorista muda de ponto,
  com NFR2 <5000 ms medido do POST à tela e logado (`[NFR2]`).
- Given o motorista offline com posição conhecida, when 15s sem `location.updated`, then
  chip "Sem sinal GPS" com o último ponto mantido; when o motorista volta, then "Em tempo
  real" retorna com o texto reatualizado.
- Given "Encerrar Viagem" com aluno assistindo, then o stream fecha elegantemente
  ("Nenhuma viagem ativa no momento"), o motorista volta a "Iniciar Viagem" e nenhum
  `POST /tracking/location` ocorre numa janela de 7s.
- Given o contrato do épico 5, when `npm run openapi:check`, then exit 0.
- Given `git diff main`, then nenhuma mudança em `api/src/` ou `mobile/src/` (story só de
  teste/docs); lint da API na baseline (~148) sem arquivos novos; mobile lint sem erros
  novos; `npm run gate` verde.

## Implementation Notes

## Spec Change Log

- 2026-09-12 (implementação): a mecânica "movimentar o motorista =
  `context.setGeolocation`" da seção Always precisou de UM complemento
  descoberto em prova empírica: o expo-location web chama `getCurrentPosition`
  com `maximumAge: Infinity` e o cache de posição do Chromium é por documento —
  o `setGeolocation` sozinho troca o mock, mas o tick de captura segue lendo a
  primeira fix para sempre (o motorista nunca "chega" em B). O spec faz
  `setGeolocation(B)` + `reload()` na página do motorista: continua sendo
  geolocation mockada do Playwright dirigindo a captura (zero mudança em
  `mobile/src`, nenhum hook de injeção); o reload só expira o cache. Documentado
  no spec (`tracking-live.e2e.spec.ts`) e em `api/tests/README.md`. Nenhum
  ponto do Intent, dos Boundaries/Never ou da matriz I/O foi alterado. Motivo
  secundário da primeira rodada vermelha: o Banner do track-bus ("Dados podem
  estar desatualizados — sem atualização em tempo real") fica montado oculto e
  `getByText('Em tempo real')` SEM `exact: true` colide com ele — chips agora
  são localizados com `exact: true`.
- 2026-09-12 (implementação): a matriz (linha "Fim de viagem") e o AC dizem
  "motorista volta a 'Iniciar Viagem'", mas a produção mostra **"Iniciar
  Retorno"** após encerrar uma OUTBOUND — `trip.tsx:388` (`isReturn`) oferta a
  próxima perna (feature deliberada do Épico 3); o estado "Iniciar Viagem" puro
  só existe antes da primeira viagem do dia. O teste verifica o semântico da
  matriz, e com mais rigor que o literal: "✅ Concluída" visível, "Encerrar
  Viagem" sumido, captura parada (0 POSTs em 7s) e o botão da próxima perna
  presente. O literal da matriz estava factualmente errado sobre a UI; nenhuma
  linha da matriz foi editada. Detalhado no caveat do README.
- 2026-09-12 (review): o assert direto de "POSTs cessam" no degradado (achado
  de review, roteado como patch) revelou uma segunda imprecisão literal da
  matriz: com o motorista offline, a cadência de 5s CONTINUA por design da 5.1
  (`gps-capture.ts`: "falha de captura OU de envio descarta a posição e mantém
  a cadência — sem fila, sem retry"), então requests seguem sendo INICIADOS; o
  que cessa é o ack do servidor. O teste agora assertiona zero POSTs ACEITOS
  (`succeededAt`, status <400) na janela offline — o semântico de "nada chega
  ao servidor" — e mantém `startedAt` no teste de fim (ali `stop()` cancela o
  tick inteiro, NFR10). Matriz inalterada.

## Review Triage Log

- **[blind-hunter+verification-gap] "O diff omite `tracking-live.e2e.spec.ts` / o
  entregável principal não está na mudança" — false.** Refutado: o diff
  preparado estava MALFORMADO por erro do orquestrador (CWD persistiu num
  subdiretório; o loop de untracked pegou só o doc do spec). Diff regenerado no
  mesmo caminho temporal contém o hunk new-file completo (445 linhas) de
  `api/tests/e2e/tracking-live.e2e.spec.ts`; o arquivo existe na árvore, é
  descoberto pelo projeto `e2e` (`testDir: ./tests/e2e`) e rodou verde (3/3).
- **[blind-hunter+verification-gap] "Doc do spec criado na raiz do repo" —
  false.** Mesmo artefato do diff malformado; o diff corrigido mostra
  `a/_bmad-output/implementation-artifacts/spec-5-3-e2e-do-epico-5.md`.
- **[verification-gap] "Nenhum comando falha se o arquivo do spec de teste
  sumir; `git commit -am` o perderia" — false** como defeito da mudança: o
  arquivo está completo na árvore e no diff corrigido; todo arquivo novo nasce
  untracked até o `git add` explícito (o fluxo do repo nunca usa `commit -am`).
  NOTA operacional registrada: o commit desta story deve incluir
  `api/tests/e2e/tracking-live.e2e.spec.ts` e o doc do spec.
- **[edge-case+blind-hunter] "AC/task dizem 'Iniciar Viagem' mas o teste
  assertiona 'Iniciar Retorno'" — low, REJEITADO.** A divergência é real
  (`trip.tsx:388` prova a produção), mas é documentação, não código: o teste
  cobre o semântico com MAIS rigor ("✅ Concluída", "Encerrar Viagem" sumido,
  0 POSTs, botão da próxima perna) e o desvio já está tripdocumentado (Spec
  Change Log, caveat do README, comentários no spec de teste). O único fix
  direto é editar a spec desta build — rejeitado por regra; a matriz congelada
  fica intocada por design.
- **[blind-hunter] "Bullet frozen 'setGeolocation sozinho' refutado sem marker
  in-loco" — low, REJEITADO.** O texto frozen é read-only por construção; a
  correção sancionada já existe (Spec Change Log + comentário de topo do
  spec de teste + README). Anotar o bullet exigiria editar bloco congelado.
- **[blind-hunter] "Teste degradado nunca assertiona diretamente 'POSTs
  cessam'" — low, PATCH.** Verificado: o teste 2 não anexa `trackLocationPosts`;
  a aparição do chip prova a cessação transitivamente (chip ⇒ nenhum
  `location.updated` entregue), mas a 1ª cláusula literal da linha "Degradado"
  da matriz merece assert direto, no padrão do teste de fim.
- **[blind-hunter] "Linha 'Recuperação' da matriz promete reatualização que o
  cenário não produz" — false.** O chip só retorna via `location.updated`
  entregue (`markSignal`), provando a retomada ponta a ponta; a capacidade de
  reatualizar texto é provada no mesmo fluxo (reload→B: `bTexts.distance`+
  `bTexts.eta` assertionados). Com posição inalterada na reconexão, re-render
  do mesmo texto é o único comportamento correto.
- **[blind-hunter] "Teste 2 assertiona menos textos que o teste 1 (coords de B,
  saída de coords de A)" — false/rejeitado.** A substituição de coords na
  troca de posição é provada pelo teste 1 pelo MESMO caminho de render; as
  linhas da matriz do teste 2 (sinal + último ponto mantido: coords+distância+
  ETA de A visíveis) estão assertionadas. Simetria redundante não cobre nada.
- **[blind-hunter] "`catch {}` vazio no clique de 'Iniciar Viagem' engole
  falhas" — low, REJEITADO.** O teste falha alto de todo jeito (asserção
  seguinte de "Encerrar Viagem" com locator preciso); a corrida que motiva o
  catch levanta erros de desanexação/contexto (NÃO TimeoutError), então o
  "conserto" exigiria classificação frágil de classes de erro — mais que uma
  correção direta, para ganho diagnóstico marginal.
- **[blind-hunter] "Gaps de 3000–8000ms contradizem a doutrina de margem" —
  false.** A cadência assertiona comportamento de PRODUÇÃO (tick de 5s); teto
  de 8s = 60% de folga sobre o tick, e timers steady-state do browser não
  derivam 60% por GC/Metro (Metro afeta carga, não setInterval rodando). Gap
  >8s seria regressão real de captura — apertado aqui é o propósito do assert,
  diverso dos budgets user-facing que a doutrina cobre.
- **[blind-hunter] "Textos com timeout default enquanto o chip tem 20s" —
  false.** O default do projeto é 15s (`playwright.config.ts:75`), não 5s; os
  textos renderizam no mesmo commit React do chip (mesmo processamento de
  evento) e a geolocation mockada do aluno já está disponível.
- **[blind-hunter] "Réplicas de geo.ts podem divergir silenciosamente" —
  false.** Divergência NÃO é silenciosa: asserts de texto exato falharam alto e
  apontam o formato mudado — forçar o recálculo das expectativas É a resposta
  correta a uma mudança de algoritmo. O cross-comment em `geo.ts` viola o
  Never (arquivo de produção); o pin unitário duplicaria cobertura que o e2e
  já força.
- **[blind-hunter] "Epic5Scenario com superfície morta / reuso de
  Epic3Credentials" — false.** `Epic3Credentials` é `{email,password}` genérico
  já reusado por `Epic4Scenario.driver` (:222) — o épico 5 segue o formato
  irmão (o épico 4 é o modelo da spec); adminToken/companyId são campos de
  completude do formato da família; a task exige routeId/tripId (presentes).
  Nenhum caller diverge, nenhum invariante é erodido.
- **[blind-hunter] "sprint-status in-progress vs spec in-review;
  review_loop_iteration 0" — false.** O vocabulário do sprint-status.yaml não
  tem `in-review` — convenção do repo: in-progress até fechar done no merge
  (precedente 5.2); o `status` fino vive na spec. `review_loop_iteration`
  conta LOOPBACKS de review (nenhum ocorreu → 0 correto); a "primeira rodada
  vermelha" foi retry de implementação dentro do step-03.
- **[blind-hunter] "Verification sem resultados observados (NFR2 real)" — low,
  REJEITADO.** Fix é editar a spec; a evidência observada fica no registro de
  review (NFR2 medido 8–21ms vs budget 5000ms; suítes todas verdes) e vai na
  descrição do PR.
- **[blind-hunter] "Fixture epic5 serve só 1 de 3 testes" — false.** A regra
  "importe daqui" é sobre o objeto `test`, não sobre chamadas de seed; o
  comentário da fixture sanciona explicitamente seed direto para opções; os
  Boundaries frozen prescrevem exatamente essa divisão (feliz via UI, demais
  via `opts`); a fixture do épico 4 tem a mesma forma sem opções.
- **[blind-hunter] "Code Map '(:32)' obsoleto" — low, REJEITADO.** Referência
  de navegação em doc; fix é editar a spec; a referência continua inequívoca
  (uma única fixture `epic4` no arquivo).
- **[blind-hunter] "Seções vazias (Implementation Notes / Review Triage Log)"
  — false.** O Triage Log está sendo preenchido por este passo (seções de
  template); Implementation Notes vazia = sem notas adicionais, por design.
- **[blind-hunter] "Colisão de 'spec' no change log" — low, REJEITADO.**
  Wording cosmético em entrada já escrita; fix é editar a spec; o caminho do
  arquivo entre parênteses desambigua no próprio trecho.
- **[blind-hunter] "last_updated DD-MM-YYYY ambíguo" — low, REJEITADO.**
  Convenção pré-existente do arquivo (o valor anterior já usava o formato); a
  regra de sync manda preservar estrutura.
- **[blind-hunter] "'Aguardando a primeira posição' catalogado mas não
  exercitado" — low, REJEITADO (fora do intent).** O Intent frozen enumera as
  provas (feliz/NFR2/degradado+fim/drift); o estado pré-primeira-fix não está
  entre elas; o Code Map cataloga textos para localização, não contrato de
  cobertura.

**Roteamento:** 1 grupo **patch** (assert direto de "POSTs cessam" no teste 2).
Sem intent_gap/bad_spec/defer.

## Design Notes

- **Geolocation do Playwright em vez de hook de injeção:** expo-location no web delega a
  `navigator.geolocation`, então `context.setGeolocation` + `permissions` dirige a
  captura do motorista E a posição do aluno sem tocar em produto. O precedente
  `__E2E_INJECT_SCAN__` existe, mas aqui é desnecessário — mantém o Never de produção
  intacto.
- **Espera real de 15s em vez de aging:** o timer de staleness é `setTimeout` no browser;
  não há timestamp de banco a envelhecer (prisma-time não se aplica). A espera de ≤25s
  (15s + margem) segue o precedente das esperas longas já aceitas na 4.5 (polling de 90s
  do scheduler real). Janelas de 2/15 MINUTOS seriam inviáveis; 15 segundos não.
- **NFR2 ancorado no POST:** o tick de captura (≤5s) é latência do produtor, não da
  entrega; NFR2 fala da entrega ao aluno (Redis Pub/Sub → SSE → render). t0 = resposta do
  POST do motorista; fim = texto novo visível no aluno. A prova de entrega pura <5s já
  vive no supertest da 5.2.
- **Asserts exatos, não regex frouxa:** com coordenadas fixas, distância/ETA são funções
  puras (haversine + formatadores) — os textos esperados são computados das coords
  escolhidas na hora de escrever o teste.

## Verification

**Commands:**
- `docker compose up -d` + API `npm run start:dev` + Expo Web mocks-off (:8081) +
  `cd api && npm run test:pw:e2e` -- expected: 3 testes novos verdes + specs dos épicos
  3/4 verdes.
- `cd api && npm run openapi:check` -- expected: exit 0.
- `cd api && npm test` e `cd mobile && npm test` -- expected: sem regressão (nenhum src
  tocado).
- `cd api && npm run lint` -- expected: baseline (~148), nenhum arquivo novo na saída;
  `cd mobile && npm run lint` -- expected: 0 erros.
- `cd api && npm run gate` -- expected: GATE-EXIT=0.

**Manual checks:**
- Console do browser sem `[mocks] MSW ativo`; log `[NFR2] ...ms` visível na saída do
  Playwright.
