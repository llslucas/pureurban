---
title: 'Story 3.4b: Check-in Offline com Fila de Sincronização (Mobile Motorista)'
type: 'feature'
created: '2026-09-01'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done
review_loop_iteration: 0
baseline_commit: 'bf63219e4459cc4af82c96ad2f46dc207e897dcc'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trechos da rota sem cobertura interrompem o embarque digital. Hoje a `scan.tsx`
mostra "Sem conexão — Tentar novamente" e o check-in existe só em memória: sair da tela ou o
app cair perde o embarque. A tabela `offline_queue` é criada no boot e nunca foi lida nem escrita.

**Approach:** Persistir na `offline_queue` o check-in que falhou por transporte e drenar em FIFO
com backoff, reusando a `X-Idempotency-Key` que o servidor honra desde a 3.3a — o `id` do item
É a chave. Sem dependência nova: conectividade derivada do desfecho das requisições.

## Boundaries & Constraints

**Always:**
- `offline_queue.id` = `X-Idempotency-Key` = UUID v4 de `expo-crypto` (architecture §5).
- `created_at` é o instante do **escaneamento** e vai como `occurredAt` no dreno — senão o
  check-in registra a hora do dreno.
- Enfileirar **só** falha de transporte: `!(err instanceof ApiClientError)` ou `err.status === 0`.
  Qualquer `status >= 400` é resposta determinística: feedback imediato, nunca fila.
- FIFO por `created_at`; teto 500; backoff 1s/2s/4s/8s/máx 30s. O limite de 5 tentativas conta
  **só falha do servidor (5xx)**; falha de **transporte não consome tentativa** — o item segue
  `pending` e retenta no teto de 30s até a rede voltar. Renegociado em 01/09: desvio consciente
  da architecture.md §5, cujas duas regras juntas matavam a fila 15s após a primeira falha.
- No dreno, 2xx e 4xx encerram o item — só transporte e 5xx retentam. Mas o 4xx de **validação**
  (`INVALID_QR_CODE`, tipicamente `occurredAt` fora da janela de 24h) encerra como `failed` e
  visível; o 4xx de **negócio** encerra como `sent`. Nenhum item some em silêncio.
- Lógica da fila atrás de `QueueStorage`, exercitada contra fake em memória.
- Story 100% mobile, verificada no alvo web (`npm run web`).

**Ask First:**
- Qualquer dependência nova (NetInfo, better-sqlite3, lib de fila) — decisão de 01/09 foi não adicionar.
- Alterar `api/`, regenerar `openapi.json` ou editar `src/types/api.d.ts`.
- Mudança incompatível no schema da `offline_queue` (não há versionamento de migração).

**Never:**
- Badge por item e teto de 500 na UI — cortados em 28/08 para a Fase 2. A UI da fila é **um banner global**.
- Lista de alunos, roster ou `{ boarded, total }` — Story 3.5b.
- `operation` diferente de `'check_in'`.
- Reescrever as guardas anti-rajada da 3.3b (`isBusy`, `isSubmitting`, `lastSuccessStudentId`)
  ou o mutex de refresh do `api-client`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Escaneia sem rede | QR válido, `fetch` rejeita | item `pending`; overlay "Salvo — será sincronizado"; scanner volta a ler | nunca lança para a UI |
| Rede volta | 1 item `pending` | POST com key `= id` e `occurredAt = created_at` → 201 → `sent` | — |
| Dreno de lote | 3 `pending` | ordem de `created_at`, um por vez | falha interrompe o lote, ordem mantida |
| Mesma chave reenviada | item já aceito | 201 do resultado anterior → `sent`, sem duplicata | — |
| Drenado após viagem encerrar | `pending` de 7h05, dreno 7h40 | replay → 201 → `sent` | não vira `failed` |
| Aluno já embarcado | dreno recebe 409 `DUPLICATE_CHECK_IN` | encerra como `sent` | terminal, não retenta |
| Tentativas esgotadas | servidor devolve 500 5× | `status='failed'`, banner avisa | não retenta mais |
| Túnel longo | transporte falha 20× seguidas | segue `pending`, retentando no teto de 30s | tentativa não é consumida |
| Fila cheia | 500 `pending`, novo scan | rejeita o enfileiramento e informa | não descarta item existente |
| Crash com fila pendente | app reinicia | `pending` e `attempts` sobrevivem; dreno retoma | — |
| API 5xx | dreno recebe 500 | retenta com backoff, conta tentativa | após a 5ª, `failed` |
| Item mais velho que 24h | `pending` de ontem, dreno hoje | servidor rejeita `occurredAt` → 400 | encerra como `failed` e visível, não `sent` |
| Erro determinístico online | 403 `STUDENT_NOT_ALLOWED` | feedback imediato da 3.3b | **não** enfileira |

</frozen-after-approval>

## Code Map

- `mobile/src/lib/database-migrations.ts:5-13` -- `runMigrations` já cria `offline_queue`
  (`id, operation, payload, status, created_at, attempts, last_error`), schema idêntico ao da
  architecture §5. Sem `user_version` nem array de migrações: acrescentar índice é
  `CREATE INDEX IF NOT EXISTS` no mesmo `execAsync`.
- `mobile/src/lib/database.ts:9,19` -- `getDatabase(): Promise<SQLiteDatabase>`, singleton via
  `initPromise` module-level **irreiniciável**; `initializeDatabase()`. Hoje `getDatabase()` não
  tem nenhum consumidor.
- `mobile/src/app/_layout.tsx:27-34` -- `initializeDatabase().catch(console.error).finally(setIsDbReady(true))`:
  boota sem Tier 2 e sem sinal disso (`deferred-work.md:93`).
- `mobile/src/app/(driver)/scan.tsx` -- tela da 3.3b, 729 linhas. `ScanResult` union (`:25-39`,
  `code` já preservado "para a fila da 3.4b"); `describeFailure` (`:67-178`, **não exportada**,
  fallback `NETWORK_ERROR` em `:171-177`); `submit` (`:252-288`); `handleScan` (`:290-348`,
  `Crypto.randomUUID()` em `:342`); `handleRetry` (`:350-355`); guardas `isBusy` (`:196`),
  `isSubmitting` (`:208`), `lastSuccessStudentId` (`:202`).
- `mobile/src/services/api-client.ts:113-119` -- **o discriminante**: só o `fetch` está no `try`.
  Timeout → `ApiClientError('REQUEST_TIMEOUT', …, 0)`; transporte cru → `throw err` sem envelopar;
  negócio → `ApiClientError` com `status >= 400`. `post(path, body, headers)` em `:176`.
- `mobile/src/services/boarding.service.ts:18-21` -- `checkIn(input, idempotencyKey)` já recebe a
  chave de fora. `CheckInRequestDto.occurredAt` em `src/types/api.d.ts:503-520` (janela +5min/−24h).
- `mobile/src/stores/app.store.ts:10-15` -- `isOnline`, `setOnline`, `isOfflineModeActive`,
  `setOfflineMode` já existem e **ninguém escreve neles**. Destino do sinal derivado.
- `mobile/src/mocks/handlers/boarding.handlers.ts:72-204` -- replay via `idempotentSuccesses`
  (`:134-144`, só sucessos), `IDEMPOTENCY_KEY_CONFLICT` em par divergente, `occurredAt` validado
  (`:113-124`), `resetBoardingMocks()` (`:46-52`).
- `mobile/jest.config.js` -- `jest-expo` puro, sem `moduleNameMapper` nem `transformIgnorePatterns`:
  nenhum teste pode importar `expo-sqlite`. Molde de suíte pura: `mobile/src/utils/qr-payload.test.ts`.
- Previstos por `architecture.md:592,598` e inexistentes: `hooks/use-offline-sync.ts`,
  `utils/offline-queue.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/utils/offline-queue.ts` -- novo: `QueuedCheckIn`, interface `QueueStorage`
  (`insert`/`listPending`/`markSent`/`markFailed`/`bumpAttempt`/`count`), `MAX_QUEUE_SIZE = 500`,
  `MAX_ATTEMPTS = 5`, `backoffDelayMs(attempt)`. Puro, sem import nativo.
- [x] `mobile/src/lib/offline-queue-storage.ts` -- novo: `QueueStorage` sobre `getDatabase()`.
  Único arquivo com SQL; `ORDER BY created_at ASC` para o FIFO.
- [x] `mobile/src/lib/database-migrations.ts` -- índice
  `idx_offline_queue_pending ON offline_queue(status, created_at)`.
- [x] `mobile/src/lib/connectivity.ts` -- novo: `reportSuccess()`/`reportTransportFailure()`
  escrevendo em `app.store.setOnline`, mais listener `online`/`offline` do browser no web.
- [x] `mobile/src/services/api-client.ts` -- chamar os dois reports nos ramos de `:113-119` e da
  resposta OK. Cirúrgico: não tocar no mutex de refresh, no timeout nem no unwrap de `{ data }`.
- [x] `mobile/src/utils/scan-feedback.ts` -- novo: mover `describeFailure` de `scan.tsx:67-178`
  sem alterar o mapa, exportar, e acrescentar o estado "enfileirado" (`deferred-work.md:167`).
- [x] `mobile/src/hooks/use-offline-sync.ts` -- novo: dreno FIFO um item por vez agendado por
  `backoffDelayMs`, disparado também quando `isOnline` volta a `true`; expõe
  `{ pendingCount, failedCount }`.
- [x] `mobile/src/components/offline-banner.tsx` -- novo: "Modo Offline — dados serão
  sincronizados" (NFR13) + variante de falha definitiva. Global, sem badge por item.
- [x] `mobile/src/app/(driver)/_layout.tsx` -- montar `useOfflineSync` e o banner.
- [x] `mobile/src/app/(driver)/scan.tsx` -- no ramo de transporte, enfileirar em vez de oferecer
  "Tentar novamente"; consumir `scan-feedback.ts`; preservar as três guardas.
- [x] `mobile/src/utils/offline-queue.test.ts` -- novo: a matriz de I/O contra fake em memória.
- [x] `mobile/src/utils/scan-feedback.test.ts` -- novo: mapa código→feedback, fallback
  `NETWORK_ERROR` e estado enfileirado.
- [x] `mobile/src/lib/connectivity.test.ts` -- novo (step-04): sinal derivado, notificação só
  na transição e os listeners do alvo web.
- [x] `mobile/src/components/offline-banner.test.tsx` -- novo (step-04): render da AC de NFR13,
  precedência da faixa de falha e anúncio por leitor de tela.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-4b…: in-progress`, remover a
  nota de bloqueio pela 1.10, atualizar `last_updated`.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append "Endereçado pela Story
  3.4b" (linhas 48, 167, 170). Não editar entradas existentes.

**Acceptance Criteria:**
- Given o motorista sem rede, when escaneia 3 alunos e mata o app, then ao reabrir os 3 seguem
  `pending` com `attempts` preservado e o dreno retoma sozinho (NFR11).
- Given a fila drenada, when o servidor é consultado, then há exatamente um check-in por aluno,
  com `occurredAt` do escaneamento e não do dreno (NFR12).
- Given item `pending`, when a tela do motorista está visível, then o banner "Modo Offline —
  dados serão sincronizados" aparece (NFR13).
- Given a API fora do ar, when o motorista escaneia, then escanear e enfileirar seguem
  funcionando (NFR14).
- Given `cd mobile`, when `npm test`, `npx tsc --noEmit` e `npm run lint`, then tudo verde, sem
  `eslint-disable` novo.

## Spec Change Log

- **01/09 — auditoria da matriz (step-03).** A linha "Túnel longo" não tinha teste e o código a
  contradizia: `classifySendError` devolvia `retryable` para transporte, então `drainNext` chamava
  `bumpAttempt` e 5 falhas de rede marcavam o item como `failed` — exatamente o que a Boundary
  "falha de transporte não consome tentativa" proíbe. Correção no código (a matriz é congelada):
  novo desfecho `offline`, que não toca na linha da tabela; o escalonamento do backoff passou a
  vir de uma contagem de falhas consecutivas em memória (`DrainSummary.transportFailures`, ref no
  `use-offline-sync`), zerada por qualquer resposta do servidor e pela volta do `isOnline`. O teste
  "esgota exatamente 5 tentativas" usava `transportError()` e codificava o comportamento errado —
  passou a usar 500, e a linha "Túnel longo" ganhou teste próprio (20 falhas: `attempts` em 0,
  `pending`, backoff saturando em 30s).
- **01/09 — patches do step-04 (review adversarial).** Quatro correções de código, nenhuma delas
  tocando o bloco congelado: (1) `classifySendError` virou allowlist de códigos de negócio, para
  que um 4xx desconhecido fique visível em vez de virar `sent`; (2) `UNAUTHORIZED` ganhou desfecho
  próprio que aborta o lote, em vez de marcar toda a fila como `failed` numa passada; (3)
  `use-offline-sync` ganhou `wakeRequested` — um `notifyQueueChanged()` durante um dreno em voo
  era descartado, e o item enfileirado nesse intervalo podia ficar `pending` sem timer nenhum;
  (4) `buildCheckInSender` saiu do hook para `@/utils/offline-queue`, porque o mapeamento da NFR12
  (`occurredAt` do escaneamento, chave = `id`) só era afirmado por fakes escritos dentro dos
  próprios testes. Mais três suítes novas (`connectivity`, `offline-banner`, `buildCheckInSender`),
  `accessible`/`accessibilityRole="alert"` no banner, `MAX_QUEUE_SIZE` interpolado no texto de fila
  cheia e os status HTTP dos testes corrigidos para os que a API de fato devolve. Os demais achados
  do review foram para `deferred-work.md`.

## Design Notes

- **`classifySendError` é allowlist, não denylist (step-04).** Só os códigos comprovadamente de
  negócio encerram como `sent`; qualquer outro 4xx encerra como `failed` e visível. Como denylist,
  `MISSING_TENANT`/`FORBIDDEN` (guards) e `HTTP_ERROR` (filtro de exceção) cairiam no ramo benigno
  e apagariam o embarque em silêncio — o oposto da Boundary "nenhum item some em silêncio".
- **401 encerra o item e ABORTA o lote.** O item ainda termina como manda a regra congelada
  ("2xx e 4xx encerram o item"), mas o laço para: sem isso, uma sessão expirada percorreria a fila
  inteira marcando cada item `failed` contra um 401 garantido — 500 embarques perdidos de uma vez.
  Os demais ficam `pending` e voltam a drenar depois do próximo login.

- **Conectividade derivada, não sondada.** NetInfo/`navigator.onLine` dizem que o rádio está
  ligado, não que a API responde — e a NFR14 trata "API fora" como offline. O `api-client` já
  separa transporte de negócio (`:113-119`), então o desfecho real é o sinal mais honesto. O
  backoff é o gatilho autoritativo; o evento `online` do browser só o antecipa.
- **Por que abstrair o storage.** `initPromise` module-level é irreiniciável e `jest-expo` não tem
  SQLite nem OPFS. Com `QueueStorage`, FIFO/backoff/teto/tentativas viram lógica pura testável;
  só o SQL fica para a verificação no browser.
- **4xx no dreno encerra o item.** Contraintuitivo, mas é o contrato da 3.3a: o replay vem *antes*
  das regras de negócio, então um item de 7h05 drenado às 7h40 sai com 201 mesmo com a viagem
  encerrada. E `DUPLICATE_CHECK_IN` quer dizer que o aluno embarcou — retentar só gastaria as 5
  tentativas para chegar ao mesmo 409.
- **Teto de 500 rejeita o novo, não descarta o antigo.** O item antigo é um embarque que já
  aconteceu; o novo ainda pode ser reescaneado.
- **Transporte não consome tentativa (desvio da architecture.md §5).** A §5 pede backoff até 30s
  *e* máximo de 5 tentativas. Juntas, as duas regras gastam as 5 tentativas em 1+2+4+8 = 15s e
  tornam o teto de 30s inalcançável: um túnel de 20s marcaria todo check-in enfileirado como
  `failed` permanente, que é o oposto da razão de existir da story. O limite de 5 passa a valer
  para o que ele de fato protege — um servidor que responde 5xx sem parar. Sem rede, o item
  espera. Precedente: a 3.3a já registrou desvio consciente da §5 no escopo da chave de idempotência.

## Verification

**Commands:**
- `cd mobile && npm install` -- este worktree não tem `node_modules`.
- `cd mobile && npm test` -- expected: verde, incluindo as duas suítes novas.
- `cd mobile && npx tsc --noEmit` -- expected: 0 erros.
- `cd mobile && npm run lint` -- expected: limpo, 0/0.
- `git diff --stat` -- expected: nenhum arquivo sob `api/`.

**Manual checks (alvo web, `npm run web`):**
- DevTools → Network → Offline: escanear mostra "Salvo — será sincronizado", scanner volta a ler,
  e Application → Storage mostra a linha em `offline_queue`.
- Voltar a Online: a fila drena sozinha, o banner some, o contador de embarcados sobe.
- Recarregar a página com `pending` na fila: os itens sobrevivem (prova do OPFS).

## Suggested Review Order

**O discriminante: o que vai para a fila**

- Entrada. Separa transporte de resposta do servidor — tudo depende desta linha.
  [`offline-queue.ts:73`](../../mobile/src/utils/offline-queue.ts#L73)
- Allowlist, não denylist: 4xx desconhecido fica visível em vez de virar `sent`.
  [`offline-queue.ts:87`](../../mobile/src/utils/offline-queue.ts#L87)
- 401 tem desfecho próprio porque não é sobre o embarque, é sobre a sessão.
  [`offline-queue.ts:142`](../../mobile/src/utils/offline-queue.ts#L142)

**Desfecho de cada item e do lote**

- Transporte não toca a linha; 5xx conta tentativa. É a regra da story.
  [`offline-queue.ts:263`](../../mobile/src/utils/offline-queue.ts#L263)
- O `break` que impede uma sessão expirada de apagar a fila inteira.
  [`offline-queue.ts:333`](../../mobile/src/utils/offline-queue.ts#L333)
- Backoff escalona por contagem em memória, sem consumir as 5 tentativas.
  [`offline-queue.ts:310`](../../mobile/src/utils/offline-queue.ts#L310)

**As duas garantias da NFR12**

- `occurredAt` do escaneamento e chave = `id`: fora do hook para ser testável.
  [`offline-queue.ts:195`](../../mobile/src/utils/offline-queue.ts#L195)

**Agendamento e conectividade derivada**

- Um dreno em voo por vez, com `wakeRequested` para não perder sinal.
  [`use-offline-sync.ts:68`](../../mobile/src/hooks/use-offline-sync.ts#L68)
- Reagenda pelo backoff do próprio desfecho; a volta da rede antecipa.
  [`use-offline-sync.ts:93`](../../mobile/src/hooks/use-offline-sync.ts#L93)
- Sinal derivado do desfecho real das requisições, sem dependência nova.
  [`api-client.ts:112`](../../mobile/src/services/api-client.ts#L112)

**Escrita e persistência**

- Único arquivo com SQL; `ORDER BY created_at ASC` é o FIFO.
  [`offline-queue-storage.ts:59`](../../mobile/src/lib/offline-queue-storage.ts#L59)
- Índice que sustenta a consulta do dreno.
  [`database-migrations.ts:18`](../../mobile/src/lib/database-migrations.ts#L18)

**UI do motorista**

- Falha de transporte enfileira em vez de oferecer "Tentar novamente".
  [`scan.tsx:207`](../../mobile/src/app/(driver)/scan.tsx#L207)
- Enfileirado é sucesso para a câmera — sem isso o mesmo QR gera chave nova.
  [`scan.tsx:148`](../../mobile/src/app/(driver)/scan.tsx#L148)
- Banner global, anunciado por leitor de tela, com a falha tendo precedência.
  [`offline-banner.tsx:44`](../../mobile/src/components/offline-banner.tsx#L44)
- Montado no layout do grupo, acima das três telas do motorista.
  [`_layout.tsx:25`](../../mobile/src/app/(driver)/_layout.tsx#L25)

**Testes e periféricos**

- A matriz de I/O inteira contra o fake em memória.
  [`offline-queue.test.ts:1`](../../mobile/src/utils/offline-queue.test.ts#L1)
- Mapa código→feedback da 3.3b, que nunca tinha cobertura.
  [`scan-feedback.test.ts:1`](../../mobile/src/utils/scan-feedback.test.ts#L1)
- O sinal de conectividade e a notificação só na transição.
  [`connectivity.test.ts:1`](../../mobile/src/lib/connectivity.test.ts#L1)
- Render da AC de NFR13.
  [`offline-banner.test.tsx:1`](../../mobile/src/components/offline-banner.test.tsx#L1)
