---
title: 'Wrap 2: Bateria de testes das fronteiras'
type: 'test'
created: '2026-09-12'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context:
  - _bmad-output/implementation-artifacts/epic-5-retro-2026-09-12.md
  - _bmad-output/implementation-artifacts/epic-4-retro-2026-09-11.md
  - _bmad-output/implementation-artifacts/epic-3-retro-2026-09-07.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Três retros consecutivas registraram o mesmo tipo de gap: fronteiras de
comportamento sem nenhum teste que as exercite, de modo que inverter uma regra do
produto deixa as suítes verdes. Casos concretos: o tie-break da descoberta de viagem do
aluno (R14 — inverter o `orderBy` para `asc` não quebra nada, e alunos seguiriam a perna
errada do ônibus); o gate de privacidade NFR10 do hook de captura GPS (R15 — remover
`&& permissionGranted` não quebra nenhum teste; todo contexto Playwright nasce com
permissão); a borda `accuracy ≥ 0` do contrato de ingestão (R16 — `accuracy: -5`
atravessa Redis/evento/tela com tudo verde); o pin "ping não alimenta o timer de 15s"
(R17 — hoje só probabilístico via e2e); as fronteiras do Épico 4 (2+ ausentes na mesma
viagem, 2+ elegíveis no mesmo scan, ADMIN nos endpoints, skip-vs-die no meio do scan);
e as regressões da fila offline da 3.4b (retry reenvia a mesma `X-Idempotency-Key`,
invalidação do roster pós-dreno, o SQL real do `QueueStorage` nunca roda em teste).

**Approach:** Um PR SOMENTE de testes — produto `api/src` e `mobile/src` intocados. Se
algum teste novo falhar, o teste está revelando um bug real: PARAR, registrar o achado
na story/spec (não "consertar" de passo lateral) e rotear para um wrap de correção ou
Spec Change Log. Exceção única e deliberada: o harness de SQLite real do `QueueStorage`
pode exigir extrair a bateria atual para `describeQueueStorage(makeStorage)` — mudança
confinada a `mobile/src` de teste (arquivo `*.test.ts`) + nova devDependency
(decisão abaixo).

</frozen-after-approval>

## Action items atendidos

| id (sprint-status) | Origem |
|---|---|
| `epic-5-retro-item-17` (AI4) | R14 (a), R15 (b), R16 (c), R17 (d) |
| `epic-4-retro-item-11` | fronteiras do Épico 4 |
| `epic-3-retro-item-6` | regressões da fila offline |

## Code Map (onde cada caso nasce)

- Tie-break da descoberta: `api/test/tracking.e2e-spec.ts:929-962` (bloco de descoberta)
  + `api/src/domains/tracking/shell/adapters/prisma-trip-access.adapter.ts:49-62`
  (regra: `startedAt desc, id desc`)
- Gate NFR10 do hook: `renderHook` em `mobile/src/hooks/use-trip-gps-capture.test.tsx`
  (hoje só `trip-screen.test.tsx:45-46` mocka o hook inteiro) — permissão negada ⇒ 0 POSTs
- Borda `accuracy`: `api/test/tracking.e2e-spec.ts:662-701` (bloco "body inválido")
- Pin do ping: `mobile/src/services/tracking-stream.service.test.ts:176-186`
- Fronteiras do Épico 4: specs supertest de ausência (`api/test/*.e2e-spec.ts` do
  boarding/absence) — contrato em `spec-4-0-contrato-de-api-ausencia.md`
- Fila offline: `mobile/src/utils/offline-queue.test.ts` (bateria atual, fake em memória)
  e `mobile/src/lib/offline-queue-storage.ts` (o SQL real, hoje sem teste)

## Tasks & Acceptance

**Task 1 — Fronteiras do Épico 5 (AI4).**
- AC1 (R14): e2e da descoberta com OUTBOUND e RETURN ativas na mesma rota/aluno ⇒
  `GET /tracking/trips/active` devolve a RETURN (pin: `startedAt desc, id desc`). Seed
  das duas viagens via API; sem tocar no adapter.
- AC2 (R15): teste do CORPO do hook de captura com permissão negada ⇒ 0 POSTs (NFR10),
  e com permissão concedida ⇒ cadência normal. Alternativa aceita: caso Playwright sem
  `permissions: ['geolocation']` provando 0 POSTs pela UI.
- AC3 (R16): clause no bloco "body inválido" — `accuracy: -5` ⇒ 400.
- AC4 (R17): pin determinístico no service test do cliente SSE — receber evento `ping`
  NÃO dispara `markSignal`/`onLocationUpdated` (assert no handler/listener, não por
  ausência de efeito colateral).

**Task 2 — Fronteiras do Épico 4 (item 11, retro 4).**
- AC5: 2 alunos ausentes na MESMA viagem ⇒ contagem/estado do motorista reflete 2.
- AC6: scan com 2+ alunos elegíveis na mesma viagem ⇒ desfecho determinístico
  documentado no contrato (3.3a) — pinar o comportamento atual correto.
- AC7: ADMIN nos 4 endpoints novos do Épico 4 (contrato spec-4-0) ⇒ 403 (ou o código
  declarado no contrato — ler a I/O Matrix antes de pinar).
- AC8: semântica skip-vs-die no meio do scan (item em processamento quando a viagem
  encerra) — pin do comportamento atual.

**Task 3 — Regressões da fila offline (item 6, retro 3).**
- AC9: retry do dreno reenvia a MESMA `X-Idempotency-Key` gravada em `offline_queue.id`
  (hoje só a 3.4b garante por leitura de código).
- AC10: dreno bem-sucedido invalida as queries de roster/`activeTrip` — pin do
  comportamento atual (se houver divergência com o AC11 do wrap-1, o teste do wrap-1
  vence; coordenar ordem de execução).
- AC11: bateria atual da fila extraída para `describeQueueStorage(makeStorage)` e rodada
  TAMBÉM contra SQLite real no Node (além do fake) — hoje remover
  `status = 'pending'` do `WHERE` de `listPending` passaria com tudo verde.

## Decisão necessária (default pré-aprovado)

SQLite real no teste do mobile exige um driver em Node. **Default: `better-sqlite3`
como devDependency do `mobile/`** (apenas teste; a lib é o driver SQLite mais direto em
Node e o `QueueStorage` é interface — o adapter de teste não toca em `expo-sqlite`).
Alternativa sem dep nova: manter apenas o fake e desistir do AC11 (o buraco real
registrado no defer da 3.4b permanece). Owner: Lucas.

## Boundaries & Constraints

- PROIBIDO mudar código de produto (`api/src`, `mobile/src` fora de `*.test.ts*` e do
  harness de extração do AC11). Teste que revelar bug ⇒ registra, não conserta.
- Specs Playwright seguem o padrão do repo (auto-skip sem infra; `E2E_SERVERS_UP=1` no
  gate). Seed 100% via API (padrão do boarding/absence).
- Imports da API com extensão `.js` (nodenext). Lint: zero erros novos.

## Verification

```bash
docker compose up -d
cd api && npm test && npm run test:e2e
cd mobile && npm test
cd api && npm run gate   # gate completo no fim; tudo verde, contagens só crescem
```

## Ordem de execução

DEPOIS do wrap-1 (os testes das Tasks 1d/3b pinam comportamento que o wrap-1 altera —
ping/explicit pollingInterval, invalidação pós-dreno). Independente do wrap-3/4/5.

## Implementation Notes

**Execução:** branch `chore/wrap-2-bateria-de-testes-das-fronteiras` (a partir da `main`
1e331e7, que já contém o PR #40 do wrap-1). Produto `api/src` e `mobile/src` INTOCADOS —
única exceção prevista no Intent: o harness de extração do AC11. Gate completo VERDE:
335 unit / 199 supertest / 2 pw:api / 10 pw:e2e / openapi:check limpo. Lint: API na
baseline documentada (147 erros pré-existentes, zero novos); mobile limpo.

**Decisões e interpretações:**

- **AC11 — driver SQLite:** seguido o default pré-aprovado do spec (`better-sqlite3` +
  `@types/better-sqlite3` como devDependency do `mobile/`, só teste). Em vez de replicar
  o SQL numa cópia de teste, o `jest.mock('@/lib/database')` troca APENAS o driver
  expo-sqlite por um handle better-sqlite3 `:memory:` e o `sqliteQueueStorage` REAL executa
  por cima — incluindo `runMigrations` real. Assim o SQL de produção é o testado.
- **AC11 — extração:** a bateria vive em `mobile/src/utils/describe-queue-storage.ts` com
  asserções SOMENTE pela interface `QueueStorage` (`count`, `listPending`, desfechos do
  dreno) — o que a interface não expõe (ex.: `last_error` de linha `failed`) fica por
  conta de cada implementação. Roda contra o fake (`offline-queue.test.ts`) e contra o
  SQLite real (`offline-queue-storage.test.ts`). Três casos foram reescritos de leitura de
  `rows` (específica do fake) para leitura via `listPending` — o de 5 tentativas agora
  verifica `attempts = 4` no item pendente ANTES do dreno final (depois ele já é `failed`
  e invisível para a interface).
- **AC10 — pin de baseline, não de desejo:** o comportamento ATUAL é o gap DS1 — o dreno
  bem-sucedido NÃO invalida roster/`activeTrip` (consumidor único das contagens é o
  banner; `use-offline-sync.ts` não toca no cache desde a 3.4b). O teste novo
  (`use-offline-sync.test.tsx`) pinA esse baseline com nome explícito ("PIN de baseline
  DS1... o fix é do wrap-5/AI3d"): quando o wrap-5 implementar a invalidação, o teste
  muda COM o fix — é o delta consciente que o AC pedia para coordenar. Teste que
  exigisse invalidação hoje falharia e "revelaria" um bug já roteado (AI3d), duplicando
  rastreamento.
- **AC8 — interpretação pela origem:** o texto do AC ("item em processamento quando a
  viagem encerra") descreve pior do que o achado de origem RV5 (`epic-4-retro`, com paths:
  `scan-checkin-reminders.use-case.ts:52-112`): a semântica die-vs-skip é da VARREDURA de
  lembretes — `create` de um aluno que morre (defect do adapter, orDie) derruba a fibra e
  os alunos seguintes ficam sem lembrete naquele tick; o scheduler loga e o tick seguinte
  se auto-cura sem duplicar. Pinnado exatamente isso (die, não skip; auto-cura).
- **AC2 — alternativa escolhida:** `renderHook` no corpo do hook (não o caso Playwright):
  permissão negada ⇒ nem o primeiro POST imediato parte; conceder com a viagem ativa
  arma a cadência (1º POST na hora + tick seguinte). O caso Playwright nasceria com
  permissão por default em todo contexto — é exatamente o cego do R15.
- **AC4 — pin estrutural:** além do dispatch de `ping` (que a suíte da 5.2 já tinha),
  o teste afirma que NÃO existe listener `'ping'` registrado no EventSource (as únicas
  inscrições são `open`, `location.updated`, `error`) — sem listener não há caminho
  nenhum do heartbeat até o timer de 15s da tela, determinístico por construção.
- **AC1 — dois casos:** (a) `startedAt desc` com startedAt explícitos via `prisma.trip.update`
  (o default `now()` das duas criações pode cair no mesmo microssegundo); (b) empate
  exato de `startedAt` com vencedor CALCULADO (`[idA, idB].sort()[1]`) — a ordem de
  criação não decide qual UUID é lexicograficamente maior. O `prisma.trip.update` é
  exceção CONSCIENTE ao Boundary "seed 100% via API": nenhum endpoint expõe `startedAt`
  arbitrário e o próprio arquivo já semeia viagens via Prisma (comentário do
  `seedActiveTrip`); para timestamps retroativos o precedente é o `prisma-time` da 4.5
  ("única escrita direta no banco").
- **AC5 — duas camadas (RV2a completa):** e2e supertest (2 ausências na mesma viagem ⇒
  2 `NOT_RETURNING` no roster, `summary` exclui ambos; segundo aluno semeado no próprio
  teste, pois o beforeAll do arquivo vincula só um) + tela mobile (2 eventos ⇒ contagem
  0/2 → 0/1 → 0/0 e 2 badges; Snackbar é único — o toast do 2º evento substitui o 1º,
  cada um é afirmado na sua janela).

**Arquivos:** `api/test/tracking.e2e-spec.ts` (AC1, AC3); `api/test/boarding.e2e-spec.ts`
(AC5-e2e, AC7); `api/src/domains/boarding/core/use-cases/scan-checkin-reminders.use-case.spec.ts`
(AC6, AC8); `mobile/src/utils/describe-queue-storage.ts` (novo — bateria AC9 inclusa);
`mobile/src/utils/offline-queue.test.ts` (lógica pura + sender; bateria via fake);
`mobile/src/lib/offline-queue-storage.test.ts` (novo — SQLite real); `mobile/src/hooks/
use-offline-sync.test.tsx` (novo — AC10); `mobile/src/hooks/use-trip-gps-capture.test.tsx`
(AC2); `mobile/src/services/tracking-stream.service.test.ts` (AC4); `mobile/src/
student-list.test.tsx` (AC5-tela); `mobile/package.json` (+2 devDeps de teste).

**Achados de ambiente (não-regressão):** um dev server da API em `:3001` (scheduler de
lembretes REAL, sem a kill-switch) roda desde antes deste trabalho; seu tick de 60s contra
o Postgres compartilhado flakou o bloco 4.4 no primeiro gate (o cenário exato documentado
no comentário de `ReminderSchedulerService.onModuleInit`) — o gate passou a verde
reutilizando esse servidor via `E2E_API_URL=http://localhost:3001 npm run gate` (padrão do
header do script). tsc: mobile com 2 erros pré-existentes (main tem 3 — o gêmeo do padrão
copiado no novo teste foi corrigido de passada); o TS4104 do spec de lembretes existe
idêntico na main; api tsc não é comparável entre worktrees (estado do client gerado) e não
é gate do repo. Dois outros "flakes" observados durante a bateria de execuções se
resolveram assim: a falha intermitente do teste de roster (2× sob gate) era um bug MEU de
asserção — `localeCompare` não ordena hex por codepoint e o id do segundo aluno é aleatório
por execução; a asserção virou mapa ordem-independente (o gate final pegou, correção
verificada). Já a falha única da suíte mobile completa (1/252 em 2 de ~21 execuções, nunca
reproduzida: 15× isolada na student-list e 12× seguidas na suíte completa depois disso)
fica registrada como não-reproduzida, sem teste apontado.

## Review Triage Log (blind-hunter, 14 achados)

- **Cobertura específica de implementação ausente no spec do SQLite real** (payload
  ilegível → `markFailed` nunca exercitado) — real/medium; **PATCH**: caso novo que lê o
  banco cru (linha corrompida na cabeça do FIFO → marcada `failed` com `last_error`, FIFO
  liberado).
- **Guard `operation = 'check_in'` do WHERE sem teste** (removê-lo fica verde) — real/medium;
  **PATCH**: caso novo com linha de outra operação via SQL cru (fora da `listPending` e do
  `count`).
- **"Settled não consome tentativa" caiu na extração** (a bateria não lê `attempts` de
  linha `sent`) — real/medium; **PATCH**: caso novo com leitura SQL crua (`status sent,
  attempts 0` após 409).
- **Comentário obsoleto no teste R15** ("não quebraria teste nenhum" — agora quebra) —
  real/low; **PATCH**: reescrito.
- **Direção revogada do gate de permissão sem caso** (granted→denied no meio da viagem) —
  real/low (o ramo `else stop` já é coberto pelo caso tripId null; a transição não);
  **PATCH**: caso estendido com revogação e retomada.
- **Lado inclusivo da borda accuracy sem pin** (0 ⇒ 200; derivar gte→gt ficaria verde) —
  real/low; **PATCH**: clause no e2e de ingestão.
- **`prisma.trip.update` vs Boundary "seed 100% via API"** — real/low (divulgação de
  exceção); **PATCH**: Implementation Notes agora registram a exceção consciente e o
  precedente (`prisma-time` da 4.5; seed de viagens via Prisma no próprio arquivo).
- **Caso de DIE no scheduler ausente** — **false**: o "loga e mantém o intervalo" é o
  MESMO try/catch já pinado pelo caso "error tolerant" (rejeição absorvida, intervalo
  continua); a meia-vida que faltava — die rejeita o `runPromise` — é pinada no use case
  (AC8).
- **Frontmatter `status: ready-for-dev` contraditório com notas de execução** — **false**:
  status é definido no passo Finalize do workflow, posterior à review (resolvido neste
  documento).
- **Typo "O fatia"** — real/low; **PATCH**.
- **Terceira cópia do fake da fila** (`use-offline-sync.test.tsx`) — real/**low
  REJEITADO**: o fix limpo exige módulo fixture novo (importar de `.test.ts` re-executaria
  os describes do arquivo importado); a duplicação é pequena, semanticamente idêntica e
  documentada — custo do fix maior que o dano.
- **`better-sqlite3` exige Node ≥22 sem hint no repo** — **false**: `mobile/.nvmrc` existe
  e vale 22 (o premise "só api/.nvmrc" está errado).
- **Handles nativos do better-sqlite3 vazados por caso de teste** — real/medium
  (dev-only; pior em `test:watch`); **PATCH**: registro de handles abertos + `afterAll`
  fechando todos.
- **Caminho obsoleto no Code Map do spec** (`.test.ts` → `.test.tsx`) — real/low; **PATCH**.
