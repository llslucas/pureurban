---
title: 'Story 3.6: Integração e E2E do Épico 3'
type: 'feature'
created: '2026-09-03'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'e19ea6787030191c3eeb6e8218f8d72a1e8ee006'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O Épico 3 foi construído em duas metades — backend real e mobile contra handlers MSW. Nada prova que o fluxo do produto (motorista inicia viagem → aluno exibe QR → motorista escaneia → check-in → lista atualiza com a contagem) funciona ponta a ponta contra a API real, nem que o `openapi.json` commitado ainda corresponde ao código, nem que NFR1/NFR4 se sustentam fora do mock.

**Approach:** Rodar o app web contra a API real (mocks já desligam por env), adicionar um drift check do `openapi.json` ao `package.json` da API, e construir uma suíte E2E Playwright (projeto `e2e` já configurado) que sobe Expo Web + API local, semeia dados via endpoints do Épico 2 e cobre caminho feliz, QR inválido / aluno não permitido, cenário offline (check-in sem rede → reconexão → sync sem duplicata) e as latências de NFR1 (< 2s) e NFR4 (< 1s com 50+ alunos).

## Boundaries & Constraints

**Always:**
- E2E em `api/tests/e2e/` no projeto Playwright `e2e` (Chrome), dirigindo Expo Web (`localhost:8081`) contra a API em `localhost:3000`.
- Cada spec semeia seus dados via API (`register` com e-mail único → `login` → CRUDs do Épico 2 → `POST /trips`); nenhum spec depende do seed do banco (Story 1.9 quebrada) nem de dados pré-existentes.
- A injeção de QR no E2E é um hook em `scan.tsx` gated por `__DEV__ && process.env.EXPO_PUBLIC_E2E === '1'` — nunca em bundle de produção.
- Latências medem só a chamada de rede (não o render) e têm margem de ambiente local documentada, como a Task 9.3 da 3.5a.
- Código/testes/comentários em inglês.

**Ask First:**
- Qualquer mudança em código de produção da API, ou em telas mobile além do hook de scan.
- `webServer` que rode migração/reset do banco, ou comando destrutivo contra o Postgres.
- Dependências novas.

**Never:**
- Não reabrir o escopo da Story 1.8 (nav shell, idempotência do `enableMocking`) — `done`.
- Não validar `sessionId` no backend nem assinar o QR (defer conhecido, fora do épico).
- Não corrigir aqui a falta de `ValidationPipe` global nem o `details` do 404 `TRIP_NOT_FOUND`; só afrouxar a asserção se atrapalhar.
- Não testar o caminho real câmera→`BarcodeDetector` (verificado à mão na 3.3b).
- Sem mock de banco. Sem Expo Go.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Caminho feliz | Motorista com rota + viagem ativa; aluno vinculado; QR válido injetado | `POST /boarding/check-in` 201; tela mostra sucesso; `GET /trips/:id/students` → aluno `CHECKED_IN`; contagem `{boarded,total}` incrementa; `trip.tsx`/`student-list.tsx` refletem sem reload |
| QR inválido | Raw que não decodifica para `{studentId,sessionId}` UUID | `decodeQrPayload` → `null`; feedback `INVALID_QR_CODE` local; nenhuma requisição de rede |
| Aluno não vinculado | QR com `studentId` UUID fora do roster | check-in 403 `STUDENT_NOT_ALLOWED`; feedback distinto |
| Offline → reconexão | `context.setOffline(true)`; escaneia QR válido; depois `setOffline(false)` | Check-in enfileirado (banner "Modo Offline"); ao voltar a rede, a fila drena e o check-in aparece na lista |
| Sem duplicata | Reenvio do mesmo check-in após o drain | Um único registro; mesma `X-Idempotency-Key` retorna o resultado anterior (201, sem duplicar) |
| Drift do contrato | `openapi.json` commitado ≠ gerado pelo código | `npm run openapi:check` sai ≠ 0 com o diff visível |
| NFR1 | Check-in online nominal | latência de `POST /boarding/check-in` < 2000 ms |
| NFR4 | Rota com 50+ alunos, metade com check-in | `GET /trips/:id/students` < 1000 ms |

</frozen-after-approval>

## Code Map

- `api/playwright.config.ts` -- projeto `e2e` (Desktop Chrome, `testDir: ./tests/e2e`, `baseURL` `localhost:3000`) já existe; sem `webServer`. Adicionar `webServer` (API + Expo Web) ou documentar pré-requisitos — decidir na Task.
- `api/tests/e2e/example.spec.ts` -- placeholder `test.skip`. Remover.
- `api/tests/support/merged-fixtures.ts` -- hoje só reexporta `base`; ponto único de import. Estender com a fixture de seed.
- `api/tests/support/custom-fixtures.ts`, `helpers/seed-helpers.ts` -- stubs "quando o endpoint existir"; os endpoints existem. Implementar.
- `api/tests/support/factories/{company,user}.factory.ts` -- `createCompany`/`createUser`/`createAdmin` com faker. Reusar; adicionar factory de rota/aluno se faltar.
- `api/scripts/export-openapi.ts` + `api/package.json` `openapi:export` -- base do drift check.
- `api/openapi.json` -- contrato commitado.
- `mobile/src/app/(driver)/scan.tsx` -- `handleScan` (l.258), `handleScanRef` (l.92-95), `<QrScanner onScan={handleScan}/>` (l.450). Adicionar hook de injeção E2E que chama `handleScanRef.current(raw)`.
- `mobile/src/utils/qr-payload.ts` -- `encodeQrPayload({studentId,sessionId})` = `JSON.stringify({studentId, sessionId})`; o teste reproduz essa string (`sessionId` = qualquer UUID v4, backend trata como opaco).
- `mobile/src/utils/constants.ts` -- `API_BASE_URL` ← `EXPO_PUBLIC_API_URL` em `__DEV__`. `mobile/src/mocks/index.ts` -- `MOCKS_ENABLED` no-op com `EXPO_PUBLIC_USE_MOCKS=0` (default de `.env.example`).
- `mobile/src/services/{trip,boarding}.service.ts` -- chamadas reais já implementadas; sem mudança esperada.
- **Endpoints do fluxo + seed:** `POST /api/v1/auth/{register,login}`; `POST /api/v1/{drivers,students}` (ADMIN, `{name,email,password≥8}`); `POST /api/v1/routes` (ADMIN, `{name,originCity,destinationCity,description?}`); `POST /api/v1/routes/:id/{students,drivers}` (`{studentId}`/`{driverId}`); `POST /api/v1/trips` (DRIVER, `{routeId,type:'OUTBOUND'|'RETURN',relatedTripId?}`); `PATCH /api/v1/trips/:id/end`; `GET /api/v1/trips/active`; `GET /api/v1/trips/:id/students`; `POST /api/v1/boarding/check-in` (`{studentId,tripId,occurredAt?}` + header `X-Idempotency-Key` UUID v4 obrigatório).
- **Perigos conhecidos** (deferred-work / review 3.5a): sem `ValidationPipe` global → payload inválido em `POST /trips` vira 500 (não exercitar entradas inválidas nesses endpoints); 404 `TRIP_NOT_FOUND` inclui `details` — não asseverar igualdade byte-a-byte de corpos de erro. CORS: API libera só `http://localhost:8081`.

## Tasks & Acceptance

**Execution:**
- [x] `api/package.json` -- adicionar `"openapi:check": "npm run openapi:export && git diff --exit-code openapi.json"`. Rodar uma vez já: se acusar diff, é bug de contrato pré-existente — HALT e reportar, não commitar "fix" do JSON dentro desta story.
- [x] `api/tests/support/factories/` -- factories de rota e aluno (dados únicos via faker).
- [x] `api/tests/support/helpers/seed-helpers.ts` -- `seedEpic3Scenario(request, opts?)`: cria empresa+admin (`register`), loga admin, cria motorista + N alunos, cria rota, vincula tudo, loga o motorista; retorna `{ driverToken, adminToken, routeId, studentIds }`. `opts.studentCount` default pequeno; 50+ para NFR4.
- [x] `api/tests/support/{merged-fixtures,custom-fixtures}.ts` -- fixture `epic3` que roda `seedEpic3Scenario` e entrega IDs/tokens; remover blocos comentados obsoletos.
- [x] `api/playwright.config.ts` -- projeto `e2e`: `webServer` iniciando API + Expo Web com env `EXPO_PUBLIC_USE_MOCKS=0`, `EXPO_PUBLIC_API_URL=http://localhost:3000`, `EXPO_PUBLIC_E2E=1`, `reuseExistingServer:true`. Se o duplo `webServer` for frágil, cair para pré-requisitos documentados + `test.skip` condicional a um env `E2E_SERVERS_UP`.
- [x] `mobile/src/app/(driver)/scan.tsx` -- `useEffect` que, sob `__DEV__ && process.env.EXPO_PUBLIC_E2E === '1'`, registra `globalThis.__E2E_INJECT_SCAN__ = (raw) => handleScanRef.current(raw)` (cleanup ao desmontar). Comentar o porquê (E2E só-web, sem câmera). Sem o env: efeito nulo.
- [x] `mobile/.env.example` -- documentar `EXPO_PUBLIC_E2E` (só testes; habilita a injeção de scan; nunca produção).
- [x] `api/tests/e2e/boarding-happy-path.e2e.spec.ts` -- fluxo completo pela UI: login do motorista, iniciar viagem, injetar QR (`page.evaluate`), ver sucesso, abrir a lista, ver `CHECKED_IN` + contagem. Asserção NFR1 via `page.waitForResponse` do `POST /boarding/check-in` (< 2s).
- [x] `api/tests/e2e/boarding-invalid-qr.e2e.spec.ts` -- raw inválido → `INVALID_QR_CODE`, nenhuma chamada a `/boarding/check-in`; e `studentId` UUID fora do roster → `STUDENT_NOT_ALLOWED`.
- [x] `api/tests/e2e/boarding-offline-sync.e2e.spec.ts` -- `setOffline(true)` → injetar QR → banner offline / enfileirado; `setOffline(false)` → aguardar drain → lista mostra 1 check-in; reenviar o mesmo → continua 1 (idempotência). Se OPFS/wa-sqlite não persistir headless, rodar headed e registrar no README.
- [x] `api/tests/{e2e,api}/roster-nfr4.spec.ts` -- seed 50+ alunos, metade com check-in; medir `GET /trips/:id/students` < 1000 ms (asserção direta, à la 3.5a Task 9.3). API-only se mais estável.
- [x] `api/tests/e2e/example.spec.ts` -- remover.
- [x] `api/tests/README.md` -- seção "E2E do Épico 3": pré-requisitos (`docker compose up -d`), como rodar (`npm run test:pw:e2e`), o hook `EXPO_PUBLIC_E2E`, caveats de headed/OPFS.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- ao fechar: `3-6-...: done`; avaliar `epic-3: done` e a retro.

**Acceptance Criteria:**
- Given o app web com `EXPO_PUBLIC_USE_MOCKS=0` apontando para a API local, when o fluxo roda pela UI, then motorista inicia viagem → QR → scan → check-in 201 → lista atualiza com `{boarded,total}`, contra a API real, sem nenhum handler MSW ativo.
- Given o código atual da API, when rodo `npm run openapi:check`, then passa (exit 0) sincronizado e falha com diff visível quando diverge.
- Given `npm run test:pw:e2e` com a infra de pé, then os specs de caminho feliz e de QR inválido / aluno não permitido passam.
- Given o cenário offline, when o motorista escaneia sem rede e a conexão volta, then o check-in sincroniza e aparece exatamente uma vez, sem `DUPLICATE_CHECK_IN` visível.
- Given os specs de NFR contra a API real, then `POST /boarding/check-in` < 2s e `GET /trips/:id/students` com 50+ alunos < 1s.
- Given `npm run lint` (api+mobile), `npm test` (mobile) e `npm run test:pw:api`, then continuam verdes.

## Design Notes

**Hook de scan:** a tela no web já usa `getUserMedia` + `BarcodeDetector`, verificado à mão na 3.3b. O E2E não tem câmera; injetar o raw em `handleScanRef.current` exercita tudo a partir de `decodeQrPayload` (validação local, gate `isBusy`, submit, feedback, invalidação do roster) — o que a story precisa provar. Gate duplo (`__DEV__` **e** `EXPO_PUBLIC_E2E`) porque `EXPO_PUBLIC_*` entra no bundle em build time.

**Seed por spec:** `register` com e-mail faker único → empresa/tenant isolado, sem cleanup frágil (o defer da suíte e2e do trip mostra que teardown é onde o repo escorrega). Aceita-se lixo no Postgres de teste local, como já em `trip.e2e-spec.ts`.

**Drift check primeiro:** rodar `openapi:check` no início. 3.5a/3.3a mexeram em decorators Swagger; JSON defasado é achado pré-existente para reportar, não um "fix" silencioso dentro desta story.

## Verification

**Commands:**
- `cd api && npm run openapi:check` -- exit 0 sincronizado; diff explícito se divergir.
- `docker compose up -d && cd api && npm run test:pw:e2e` -- specs de caminho feliz, QR inválido, offline-sync e NFR verdes.
- `cd api && npm run test:pw:api && npm run lint` -- verde.
- `cd mobile && npm run lint && npm test` -- verde (o hook não quebra render nem lint).

**Manual checks:**
- `cd mobile && EXPO_PUBLIC_USE_MOCKS=0 EXPO_PUBLIC_API_URL=http://localhost:3000 npm run web` com a API de pé: console **não** mostra `[mocks] MSW ativo`; login do motorista → iniciar viagem → check-in real 201; lista e contagem atualizam.

**Smoke manual — registro (2026-09-06):**
Executado no alvo web (Expo Web :8081, `EXPO_PUBLIC_USE_MOCKS=0`,
`EXPO_PUBLIC_API_URL=http://localhost:3001`, `EXPO_PUBLIC_E2E=1`) contra a API real
em :3001 + Postgres/Redis do compose, dirigido pelo chromium do pacote `playwright`
(o MCP exige `channel: chrome`, ausente — ver memória `mobile-web-runtime-verification`).
Seed do cenário via endpoints do Épico 2 + `POST /trips` (a tela de Viagem inicia
com `PLACEHOLDER_ROUTE_ID` — defer da 3.1 —, então a viagem entra por API e a UI a
reflete via `GET /trips/active`). 9/9 checks verdes:
- login do motorista → "Gestão de Viagem" com viagem ativa, `Alunos: 0/3`.
- scan de QR injetado → `POST /api/v1/boarding/check-in` **201**, ~20 ms de rede (NFR1 < 2s).
- overlay "Embarque confirmado".
- "Alunos da Viagem" → `1/3 embarcados`, aluno com status "Embarcou".
- `GET /trips/:id/students` → 1 `CHECKED_IN`, `summary.boarded = 1`.
- console **sem** `[mocks] MSW ativo`; **todas** as chamadas `/api/v1` para `localhost:3001` (nenhum handler MSW).

Não coberto pelo smoke (fora do escopo, já exercitado alhures): caminho real
câmera→`BarcodeDetector` (3.3b), cenário offline headless (spec `boarding-offline-sync`),
início de viagem pela UI (bloqueado pelo `PLACEHOLDER_ROUTE_ID` da 3.1).

## Suggested Review Order

**Fluxo ponta a ponta (comece aqui)**

- O épico inteiro num arquivo: login → viagem → scan injetado → check-in 201 → lista com a contagem.
  [`boarding-happy-path.e2e.spec.ts:33`](../../api/tests/e2e/boarding-happy-path.e2e.spec.ts#L33)

- NFR1 medido só pela rede via `response.request().timing()`, não wall-clock em volta do CDP.
  [`boarding-happy-path.e2e.spec.ts:66`](../../api/tests/e2e/boarding-happy-path.e2e.spec.ts#L66)

- Drift do contrato: regenera o `openapi.json` e falha se divergir de `HEAD`.
  [`package.json:27`](../../api/package.json#L27)

**Backdoor de scan (mobile) — o ponto de maior risco**

- Gate duplo `__DEV__ && EXPO_PUBLIC_E2E==='1'`; fora de teste o registro é no-op.
  [`e2e-scan-hook.ts:33`](../../mobile/src/utils/e2e-scan-hook.ts#L33)

- A tela só chama o helper num `useEffect` — uma linha, sem lógica de gate embutida.
  [`scan.tsx:332`](../../mobile/src/app/(driver)/scan.tsx#L332)

- Prova a invariante "nada vaza para produção": global fica `undefined` sem a env.
  [`e2e-scan-hook.test.ts:1`](../../mobile/src/utils/e2e-scan-hook.test.ts#L1)

**Seed do cenário (via API, sem seed de banco)**

- Empresa+admin+motorista+N alunos+rota vinculada, motorista logado — tudo por endpoints do Épico 2.
  [`seed-helpers.ts:98`](../../api/tests/support/helpers/seed-helpers.ts#L98)

- Guardas de shape do envelope `{data}` — drift de contrato vira erro legível, não `undefined`.
  [`seed-helpers.ts:74`](../../api/tests/support/helpers/seed-helpers.ts#L74)

- Fixture `epic3` que injeta o cenário no teste; ponto único de import.
  [`custom-fixtures.ts:22`](../../api/tests/support/custom-fixtures.ts#L22)

**Guarda de infraestrutura e serialização**

- Sem servidores, os specs auto-skipam; `E2E_SERVERS_UP=1` transforma ausência em falha.
  [`e2e-servers.ts:57`](../../api/tests/support/helpers/e2e-servers.ts#L57)

- `apiUnavailable()` é o guard API-only usado pelo NFR4 no gate `test:pw:api`.
  [`e2e-servers.ts:81`](../../api/tests/support/helpers/e2e-servers.ts#L81)

- Projeto `e2e`: serial (`fullyParallel:false`), câmera falsa e `navigationTimeout` para bundle frio do Metro.
  [`playwright.config.ts:49`](../../api/playwright.config.ts#L49)

**Demais cenários**

- QR inválido (sem rede) e aluno fora do roster (403); `waitForResponse` filtrado por POST para não casar o preflight.
  [`boarding-invalid-qr.e2e.spec.ts:58`](../../api/tests/e2e/boarding-invalid-qr.e2e.spec.ts#L58)

- Offline → fila → reconexão → um único `CHECKED_IN`; verificado pela API (o DOM não revalida sob CDP).
  [`boarding-offline-sync.e2e.spec.ts:48`](../../api/tests/e2e/boarding-offline-sync.e2e.spec.ts#L48)

- NFR4: 55 alunos, metade embarcada, `GET /trips/:id/students` < 1s.
  [`roster-nfr4.spec.ts:24`](../../api/tests/api/roster-nfr4.spec.ts#L24)

**Periféricos**

- Correção pré-existente: `health` assertava corpo cru, mas o `ResponseWrapperInterceptor` envelopa em `{data}`.
  [`health.api.spec.ts:16`](../../api/tests/api/health.api.spec.ts#L16)

- Pré-requisitos, hook `EXPO_PUBLIC_E2E`, caveats de OPFS/headed e medição de NFR.
  [`README.md:58`](../../api/tests/README.md#L58)

- Env só-teste documentada; default mantém o efeito nulo.
  [`.env.example:56`](../../mobile/.env.example#L56)
