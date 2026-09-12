---
title: 'Wrap 2: Bateria de testes das fronteiras'
type: 'test'
created: '2026-09-12'
status: 'ready-for-dev'
route: 'oneshot'
review_loop_iteration: 0
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
- Gate NFR10 do hook: novo `renderHook` em `mobile/src/hooks/use-trip-gps-capture.test.ts`
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
