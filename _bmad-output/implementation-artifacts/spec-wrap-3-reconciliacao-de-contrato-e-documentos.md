---
title: 'Wrap 3: Reconciliação de contrato e documentos'
type: 'docs'
created: '2026-09-12'
status: 'ready-for-dev'
route: 'oneshot'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-5-retro-2026-09-12.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/implementation-artifacts/spec-3-5b-lista-de-alunos-e-status-de-embarque.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O contrato publicado e os documentos de planejamento divergem do que o
código faz, em quatro pontos acumulados: (1) o `LastKnownLocationDto` diz que "a idade
deste ponto é o que a tela usa para o estado degradado 'Sem sinal GPS'", mas a tela arma
o timer de 15s pela CHEGADA do dado (`markSignal()`), nunca compara `capturedAt` com
relógio algum — efeito real: ponto capturado há ≤60s semeia com chip "Em tempo real" por
mais 15s (R4); (2) o regex do `capturedAt` aceita só até 3 casas fracionárias enquanto o
DTO promete "ISO 8601 UTC" — rejeita com 400 quem segue o contrato documentado (R11);
(3) handlers reais do tracking ainda documentam `501 NOT_IMPLEMENTED` herdado dos stubs
da 5.0 — segunda fatia que carrega o doc obsoleto (open question 4 da retro 5);
(4) item 8 da retro 3 (owner Lucas/PM): reconciliar o AC #4 da 3.5b (online vs
pós-dreno) e REEMITIR a seção Production Readiness no PRD/Architecture, que a retro 2
apontou sem evidência de pouso.

**Approach:** Alinhar DOCUMENTO ao CÓDIGO nos pontos 1 e 2 (decisões abaixo), limpar o
doc obsoleto no ponto 3, e reemitir a seção de readiness no ponto 4 — tudo num único PR
com `openapi.json` + tipos do mobile regenerados NO MESMO PR (drift discipline,
Architecture §12). Exceção que cria código: ampliar o pattern do `capturedAt` (schema
Effect + DTO + caso de e2e com >3 casas).

**Decisões pré-aprovadas por default (owner: Lucas pode sobrepor):**
- R4: staleness declarado por CHEGADA do dado (o código prova isso; comparar idade do
  `capturedAt` acoplaria o relógio do aluno ao do motorista).
- R11: AMPLIAR o pattern do `capturedAt` para aceitar precisão fracionária arbitrária
  (GPS nativo comum manda >3 casas; rejeitar quem segue o contrato é o pior dos mundos).

</frozen-after-approval>

## Action items atendidos

| id (sprint-status) | Origem |
|---|---|
| `epic-5-retro-item-18` (AI5) | R4, R11 + open question 4 (501 obsoleto) |
| `epic-3-retro-item-8` | AC #4 da 3.5b + reemissão de Production Readiness |

## Code Map

- `api/src/domains/tracking/shell/http/dtos/last-known-location.dto.ts:41` — descrição
  do staleness a corrigir
- `api/src/domains/tracking/core/schemas/location-ingest.schema.ts:30-38` — regex do
  `capturedAt` (3 casas) e borda `accuracy ≥ 0` (intacta — só o pattern muda)
- `api/src/domains/tracking/shell/http/dtos/location-ingest.dto.ts` — texto "ISO 8601"
  a explicitar a precisão ilimitada
- Handlers `@Sse`/controllers do tracking — entradas `501`/`NOT_IMPLEMENTED` no Swagger
  a remover onde o handler é real (cruzar com `openapi.json` atual)
- `api/openapi.json` + `mobile/src/types/api.d.ts` — regenerados no mesmo PR
- `_bmad-output/planning-artifacts/prd.md` + `architecture.md` — seção Production
  Readiness a reemitir; AC #4 da 3.5b em
  `_bmad-output/implementation-artifacts/spec-3-5b-lista-de-alunos-e-status-de-embarque.md`

## Tasks & Acceptance

**Task 1 — Descrição do staleness (R4).**
- AC1: o texto do `LastKnownLocationDto` declara que o estado degradado é avaliado pela
  RECEPÇÃO no cliente (timer de 15s sem chegada de `location.updated`/ping), não pela
  idade do `capturedAt`. Comportamento de código intocado.
- AC2: comentários da tela (`track-bus.tsx`) coerentes com o texto do contrato (se o
  wrap-1 já os corrigiu, apenas conferir consistência).

**Task 2 — Pattern do `capturedAt` (R11).**
- AC3: schema aceita 0..N casas fracionárias (`2026-09-12T12:00:00Z`,
  `...T12:00:00.1Z`, `...T12:00:00.123456789Z`) e continua rejeitando não-ISO.
- AC4: DTO/Swagger declara a precisão ilimitada; `openapi:export` + `openapi:types`
  regenerados no mesmo PR; `openapi:check` verde.
- AC5: caso de e2e com >3 casas fracionárias ⇒ 201/200 (o que a I/O Matrix da 5.0 pina)
  e o ponto atravessa Redis/evento/tela.

**Task 3 — Doc obsoleto 501 (open question 4).**
- AC6: nenhuma entrada `NOT_IMPLEMENTED`/501 resta no Swagger para handlers reais do
  tracking (stubs que continuam stub, se houver, permanecem documentados como tais).

**Task 4 — AC #4 da 3.5b + Production Readiness (item 8, retro 3; owner PM/Lucas).**
- AC7: o texto do AC #4 da 3.5b descreve o desfecho real (comportamento online vs
  pós-dreno), com referência ao fix do PR #19 e ao que segue diferido para device.
- AC8: PRD/Architecture reemitem a seção Production Readiness com evidência de pouso:
  gate completo da retro 5 (unit/supertest/pw + NFRs medidos: NFR1 13ms, NFR2 25ms,
  NFR3 101ms, NFR4 33ms), riscos fechados vs abertos (deferred-work.md como fonte),
  e o que fica para device/Story 1.7.

## Boundaries & Constraints

- Único wrap autorizado a regenerar `openapi.json`/`api.d.ts` — e obrigado a fazê-lo no
  mesmo PR que mudar qualquer texto de contrato.
- Nenhuma mudança de comportamento: timer da tela, TTL do Redis, validações existentes
  (exceto o pattern do `capturedAt` no sentido de ACEITAR mais).
- `_bmad-output/` em português; comentários de código seguem a prática do arquivo.

## Verification

```bash
cd api && npx prisma generate 2>/dev/null; npm run openapi:check   # deve falhar antes do export se pattern mudou sem regen
cd api && npm run openapi:export
cd mobile && npm run openapi:types
cd api && npm test && npm run test:e2e      # caso novo de >3 casas verde
cd api && npm run gate                       # completo, verde
```

## Ordem de execução

Independente. Idealmente DEPOIS do wrap-1 (evita conflito nos comentários de
`track-bus.tsx`) e ANTES do wrap-4 (a extração do broadcaster não deve cruzar com diff
de contrato).
