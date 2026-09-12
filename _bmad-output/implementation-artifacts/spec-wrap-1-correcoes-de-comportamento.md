---
title: 'Wrap 1: Correções de comportamento pós-Épico 5'
type: 'bugfix'
created: '2026-09-12'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-5-retro-2026-09-12.md
  - _bmad-output/implementation-artifacts/deferred-work.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** As retros 3, 4 e 5 deixaram action items abertos que são correções de
comportamento com risco real, hoje sem dono de execução: (1) o resync do last-known
desenhado na 5.0 nunca executa — eventos publicados durante uma janela de stream morto
nunca chegam ao aluno, e o banner "Atualizar" reabre o stream sem reconciliar nada (R1,
medium; o comentário do código descreve comportamento inexistente); (2) mensagem
não-objeto no canal Redis derruba o processo API dentro do listener do ioredis —
`JSON.parse('null')` não lança e `parsed.type` explode (R2; o comentário do catch alega
a proteção que não existe); (3) a captura GPS engole 409 determinístico via
`.catch(() => {})` e posta a cada 5s para uma viagem encerrada fora do device, sem log
nem sinal (R3); (4) baratas de 1 linha: "NaN:NaN:NaN" na tela, `pollingInterval` refém do
default 5000ms da lib, descoberta sem `isActive` enquanto stream e last-known exigem
(R5/R6/R7); (5) inconsistências de contrato entre mock, dreno e disclosure de erro
(item 4 da retro 3); (6) em produção, `CORS_ORIGIN` ausente cai no default de dev em vez
de falhar rápido (item 7 da retro 3).

**Approach:** Um PR de correções cirúrgicas com testes — sem refatoração estrutural
(a extração do broadcaster SSE é o wrap-4) e sem mudança de contrato publicado. Se
qualquer fix exigir mudança de DTO/openapi.json, PARAR e registrar em Spec Change Log —
isso pertence ao wrap-3.

**Decisão pré-aprovada por default (R1):** implementar o resync via GET com guarda
monotônica de `capturedAt` — o contrato da 5.0 o promete e a guarda elimina de graça a
corrida R13. Se o Lucas preferir aceitar formalmente "o próximo evento (~5s) corrige",
a Task 1 vira correção de comentários + texto de contrato e o restante migra ao wrap-3.

</frozen-after-approval>

## Action items atendidos

| id (sprint-status) | Origem |
|---|---|
| `epic-5-retro-item-14` (AI1) | R1, R13 — resync do last-known |
| `epic-5-retro-item-15` (AI2) | R2 — guard no handleMessage das 2 cópias |
| `epic-5-retro-item-16` (AI3) | R3 — classificação de falha no hook de captura |
| `epic-5-retro-item-20` (AI7) | R5, R6, R7 — baratas de 1 linha |
| `epic-3-retro-item-4` | consistência mock/dreno/disclosure |
| `epic-3-retro-item-7` | CORS fail-fast + preflight test |

## Implementation Notes

- **AC12 — direção do alinhamento escolhida: `end-trip` 404 → 403 `DRIVER_NOT_ASSIGNED`** (e não o contrário). O app mobile trata `DRIVER_NOT_ASSIGNED` como estado de tela (`student-list.tsx`), o mock MSW espelha o 403 e o `SETTLED_CODES` da fila o conhece — alinhar `get-trip-students` para 404 exigiria mexer no mock, proibido pelas Boundaries. Ambos os endpoints já declaram 403 e 404 no openapi.json (nenhuma regeneração necessária — drift check verde). A decisão de não-disclosure da review 3.1 ficou registrada como substituída pelo critério de consistência (DS6 oferecia "alinhamento barato ou decisão registrada").
- **AC10 — reordenação no mock = replay ANTES da janela de `occurredAt`** (DS4: "reordenar para espelhar o use case"). O texto do AC10 no spec era ambíguo; o DS4 da retro é inequívoco: o mock validava `occurredAt` antes do lookup de replay e o use case real faz replay antes de qualquer regra — item drenado >24h depois recebia 400 no mock e 201 replayado na API. Validação de shape continua antes do replay (pipe do @Body).
- **Descoberta do implementador (Task 1):** `lastKnown.data` lido só dentro de `useEffect` é propriedade NÃO-rastreada pelo react-query v5 — o refetch do resync atualizava o cache sem re-renderizar a tela (prova: cache atualizado + effect sem reexecutar). Fix: desestruturar `data`/`isError` no render (o acesso ao getter é o que rastreia). Nota deixada em comentário no código.
- **Task 3 — forma do fix:** o classificador vive no controlador puro (`classifySendError` opcional; default = tudo transitório, comportamento da 5.1 preservado nos testes existentes). O hook classifica 409/403 como fatal, invalida `['activeTrip']` e loga warning em toda falha. Suíte nova do hook (`use-trip-gps-capture.test.tsx`) finge o MMKV da cadeia `trip-queries → api-client` (Nitro não carrega sob jest-expo).
- **Task 6 — extração mínima:** `resolveCorsOrigins` + allowlist saíram do `main.ts` para `shared/shell/http/cors-config.ts` (o bootstrap nunca roda nos testes). `@types/cors` adicionado como devDependency para o teste de preflight usar o MESMO pacote `cors` do Nest. Assinatura `env: Record<string, string | undefined>` (default `process.env`) para testabilidade sem mutar env.
- **Contrato:** nenhuma mudança de DTO/rota; `openapi:check` verde; `openapi.json` intocado.
- **Ambiente:** o gate requer `E2E_API_URL=http://localhost:3001` nesta máquina (`api/.env` tem `PORT=3001`; default do script é 3000 e ele quase bateu TIMEOUT por causa disso). Servidores dev pré-existentes (Metro 8081 sem o env do gate) foram derrubados para o gate subir os dele.
- **Correção pós-gate:** o primeiro gate completo FALHOU no e2e Playwright de sync offline — o guard do AC11 validava o envelope `{ data, meta }`, mas o `api-client` já desenvolve e entrega só o `data` (registro puro). O guard virou `isCheckInRecord` (id+status strings) e o fake do teste passou ao shape real. É exatamente o cenário que o AC11 queria prevenir, do lado oposto: validação contra um contrato imaginado em vez do wiring real.

## Spec Change Log

- **Desvio de contrato-documento roteado ao wrap-3:** a descrição do 403 de `PATCH /trips/:id/end` (Swagger/openapi.json) continua "FORBIDDEN — somente motoristas" e não nomeia `DRIVER_NOT_ASSIGNED`, que agora também ocorre nesse status (AC12). O status 403 já estava declarado — nenhum DTO ou regeneração foi necessária — mas o TEXTO da documentação ficou incompleto; as Boundaries deste spec proíbem regenerar `openapi.json`. Registrado em `deferred-work.md`.

## Review Triage Log

Review blind-hunter (subagente, contexto zerado): 12 achados, floor N=9. Triagem verificado contra o código:

- **F1 — guard do envelope validava shape que a produção nunca entrega (high, real):** `api-client` desenvolve `{ data, meta }` e o sender recebia o registro puro; todo dreno real viraria `offline` eterno. Pegado pelo e2e Playwright antes da review; corrigido (`isCheckInRecord` id+status) e fake do teste no shape real. Commit `fix(boarding)` (amend) + evidência: gate VERDE após o fix.
- **F2 — comentário do DS5 descrevia mecânica errada (`{}` vs `undefined` pós-unwrap) (low, real):** corrigido no mesmo patch do F1.
- **F3 — guard monotônico comparava relógios de domínios diferentes (high, real):** timestamp do evento é hora do SERVIDOR (`ingest-location.use-case.ts`) e `capturedAt` é eco do relógio do device; clock adiantado faria a tela flappar de volta ao ponto REST velho a cada evento. PATCH: cada resposta do last-known é consumida UMA vez (`dataUpdatedAt`) — a comparação passa a ser feita no máximo uma vez por fetch. Limite residual (skew pode aceitar/rejeitar 1 deslocamento por resync) documentado no código; fix de contrato (servidor carimbar o last-known) roteado ao wrap-3 via deferred-work.
- **F4 — onOpen invalida o last-known no primeiro open (duplica o fetch do mount) (low real, REJEITADO):** 1 GET extra por (re)conexão; custo desprezível perto do custo da própria reconexão, e a semântica "reconciliar sempre que o stream abre" é a do AI1.
- **F5 — log do hook chama falha de CAPTURA de "transmissão" (low, real):** patch de 1 linha ("falha de captura/transmissão").
- **F6 — 401 deixaria POSTs a cada 5s em sessão morta (FALSE):** no caminho 401 o `api-client` desloga e redireciona ANTES de lançar o erro ao hook; o layout autenticado desmonta a tela do motorista e o cleanup do hook para a cadência. Não há tempestade.
- **F7 — e2e do aluno desativado cobria 2 dos 3 endpoints (low, real):** patch: asserção de stream 403 `STUDENT_NOT_ON_TRIP` adicionada (guard rejeita antes de qualquer byte de stream).
- **F8 — descrição 403 de `PATCH :id/end` obsoleta no Swagger/openapi.json (real, DEFER):** texto de contrato — Boundaries proíbem regenerar `openapi.json`; roteado ao wrap-3 (Spec Change Log + deferred-work).
- **F9 — bloco parse/guard duplicado nas 2 cópias + warn idêntico para falhas distintas (duplicação: DEFER implícito ao wrap-4, item 19 já registrado; mensagem: PATCH):** guard de shape agora loga "Non-object message", distinto do "Malformed message" sintático.
- **F10 — branches do `isStrictlyNewer` sem teste (low, real):** patch: testes de anti-flap e de capturedAt inválido não deslocar ponto vivo.
- **F11 — `findActiveTripForStudent` com 3 queries sequenciais (low, real):** patch: aluno + links em `Promise.all`, mesma convenção do `isStudentOnRoute` logo abaixo.
- **F12 — linha em branco extra no EOF do teste de tela (trivial):** corrigida.


## Code Map

- `mobile/src/app/(student)/track-bus.tsx:111-123` — seed-once do last-known
  (`seededFromLastKnownRef`), comentários descrevendo reconciliação inexistente;
  `:129` `bumpStreamEpoch`; `:42-47` `formatClock`
- `mobile/src/lib/track-bus-queries.ts:14-15` — query key `trackingLastKnown`
  (nunca invalidada)
- `api/src/domains/tracking/shell/tracking-events.service.ts:127-164` — `handleMessage`
  (`JSON.parse` no try, `parsed.type` fora, linha 141/160)
- `api/src/domains/boarding/shell/events/boarding-events.service.ts` — mesma estrutura
  (blueprint pré-existente)
- `mobile/src/utils/gps-capture.ts:73-78` — `.catch(() => {})` engole toda rejeição
  do POST de posição
- `mobile/src/hooks/use-trip-gps-capture.ts:40-56,65-73` — gate de permissão + cadência
- `mobile/src/services/tracking-stream.service.ts:87-91` — cliente SSE sem
  `pollingInterval`
- `api/src/domains/tracking/shell/adapters/prisma-trip-access.adapter.ts:34-63` vs
  `73-99` — `findActiveTripForStudent` (sem `isActive`) vs `isStudentOnRoute` (com)
- `mobile/src/mocks/handlers/boarding.handlers.ts` — replay valida occurredAt após
  marcar sent (reordenar)
- `mobile/src/hooks/use-offline-sync.ts` — dreno marca sent antes de validar envelope 2xx
- `api/src/main.ts` — `resolveCorsOrigins()` com default de dev (linhas ~29-62)
- `api/test/` — disclosure 403/404 divergente entre `get-trip-students` e `end-trip`

## Tasks & Acceptance

**Task 1 — Resync do last-known (AI1).** No banner "Atualizar" e no `onOpen` do stream,
refazer o fetch do last-known (`trackingLastKnown`) com guarda monotônica: aplicar o
ponto só se `capturedAt` for estritamente mais novo que o exibido. Corrigir os dois
comentários que descrevem a reconciliação inexistente.
- AC1: com stream morto e ≥1 evento perdido, "Atualizar" traz a última posição publicada
  (teste do cliente/tela com a lib mockada provando a chamada e a aplicação).
- AC2: resposta REST com `capturedAt` mais velho que o ponto SSE já exibido NÃO regredir
  a posição (pin da guarda — elimina R13).
- AC3: comentários de `track-bus.tsx` e da query descrevem o comportamento real.

**Task 2 — Guard de tipo no handleMessage (AI2).** Antes de `parsed.type`, rejeitar
mensagem não-objeto (`typeof parsed !== 'object' || parsed === null || typeof
parsed.type !== 'string'`) nas DUAS cópias (tracking + boarding).
- AC4: unit tests — `null`, array, string e objeto sem `type` são ignorados sem lançar;
  mensagem válida segue fluindo (regressão).

**Task 3 — Classificação de falha no hook de captura GPS (AI3).** Em
`gps-capture`/`use-trip-gps-capture`: erro 409/403 determinístico PARA a captura e
invalida a query `['activeTrip']`; falha transitória de rede mantém a cadência
(comportamento congelado da 5.1 preservado); toda falha loga aviso.
- AC5: viagem encerrada fora do device ⇒ o hook para de postar após o primeiro 409 e a
  tela volta ao estado "sem viagem" (teste do hook).
- AC6: falha de rede isolada NÃO interrompe a cadência (teste).

**Task 4 — Baratas de 1 linha (AI7).**
- AC7: `formatClock` com `capturedAt` calendaricamente inválido renderiza "--:--:--"
  (nunca "NaN:NaN:NaN") — teste.
- AC8: cliente SSE declara `pollingInterval` explícito (valor documentado no código;
  hoje depende do default 5000 da lib) — pin por asserção de config.
- AC9: `findActiveTripForStudent` exige `isActive: true` do aluno — os 3 endpoints
  (descoberta, stream, last-known) concordam; aluno desativado recebe o MESMO desfecho
  nos 3 (teste no e2e/supertest da descoberta).

**Task 5 — Consistência de contrato interno (item 4, retro 3).**
- AC10: mock MSW valida `occurredAt` antes de marcar sent no replay (reordenação);
- AC11: dreno da fila valida envelope 2xx antes de `markSent` (teste: envelope de erro
  não marca sent);
- AC12: disclosure 403 vs 404 de `GET /trips/:id/students` e `PATCH /trips/:id/end`
  alinhados (mesma semântica para viagem de outra empresa/inexistente) — ajustar o que
  estiver divergente e pinar nos e2e supertest.

**Task 6 — CORS fail-fast (item 7, retro 3).**
- AC13: em produção (`NODE_ENV=production`), boot sem `CORS_ORIGIN` válida falha rápido
  com erro legível (não cai no default de dev); em dev, o default atual permanece.
- AC14: teste de preflight cobrindo `X-Idempotency-Key`, `cache-control` e
  `X-Requested-With` na allowlist.

## Boundaries & Constraints

- Proibido: extrair broadcaster SSE, mudar schema Prisma, mudar DTOs publicados,
  regenerar `openapi.json` (se um fix parecer exigir, pare — wrap-3).
- Proibido: mexer em `api/prisma/` e em `mobile/src/mocks/` além da reordenação do AC10.
- Lint da API tem baseline vermelha pré-existente (~147 erros): não corrigir os antigos,
  não introduzir novos.
- Imports relativos na API exigem extensão `.js` (nodenext). Mobile usa `@/*`.

## Verification

```bash
docker compose up -d
cd api && npm test && npm run test:e2e && npm run lint -- --max-warnings 0  # só erros novos devem ser zero
cd mobile && npm test && npm run lint
# Gate completo (padrão do projeto):
cd api && npm run gate   # E2E_SERVERS_UP=1 incluso; 293+ unit / 161+ supertest / 12 pw
```

Suítes novas somam às contagens da baseline da retro 5 (320 unit / 193 supertest /
12 Playwright) sem quebrar nenhuma existente. `openapi:check` deve permanecer verde
(nenhuma mudança de contrato esperada).

## Open decisions (defaults pré-aprovados)

1. R1: implementar resync (default) vs aceitar "próximo evento corrige" — ver Intent.
   Owner: Lucas (pode sobrepor o default antes/durante a execução).
2. Valor do `pollingInterval` (AC8): sugerido 5000ms explícito (mantém comportamento
   observado e testado) ou outro valor consciente.
