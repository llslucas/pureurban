---
title: 'Wrap 1: Correções de comportamento pós-Épico 5'
type: 'bugfix'
created: '2026-09-12'
status: 'ready-for-dev'
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
