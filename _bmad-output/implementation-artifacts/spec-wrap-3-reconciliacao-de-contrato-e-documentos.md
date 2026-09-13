---
title: 'Wrap 3: Reconciliação de contrato e documentos'
type: 'docs'
created: '2026-09-12'
status: 'done'
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
  `_bmad-output/implementation-artifacts/3-5b-lista-de-alunos-e-status-de-embarque.md`

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

## Implementation Notes

- **Task 1 (AC1) — decisão de redação:** o AC pedia "timer de 15s sem chegada de
  `location.updated`/ping", mas o código provado desde a 5.2 é que **ping não reseta o
  timer** (honestidade do dado; pin estrutural do wrap-2, R17). O texto do contrato
  declara a mecanica real: "evento `location.updated` ou resposta deste endpoint".
  Escrever "/ping" no contrato seria recriar o drift no sentido oposto.
- **Task 1 (AC2):** o comentário de `track-bus.tsx` que mandava o "fix de contrato
  (servidor carimbar o last-known) para o wrap-3" ficou stale — o wrap-3 (por decisão
  congelada) resolveu o lado DOCUMENTO; o server-stamp segue registrado no
  `deferred-work.md` (entry F3 do wrap-1). Comentário atualizado para apontar ao defer.
  Nenhuma mudança de comportamento na tela.
- **Task 2:** regex do schema ampliado para `(\.\d+)?` (0..N casas), agora também
  declarado como `pattern` nos DOIS DTOs de `capturedAt` (ingest e last-known) — a regra
  que o código impõe passa a viver no contrato publicado, não só na prosa. E2E novo no
  describe do stream prova a travessia completa pela API: ingest com 9 casas ⇒ 200,
  posição sai no evento SSE (que NÃO carrega `capturedAt` — o timestamp do fio é o
  `receivedAt` do servidor) e o last-known ecoa o `capturedAt` verbatim; caso negativo
  ganhou âncora (fractional SEM `Z` continua 400) e o caso inclusivo de 0 casas está
  pinado no "body inválido". A perna "tela" tem teste próprio agora:
  `track-bus-screen.test.tsx` semeia o last-known com 9 casas e prova ponto + relógio
  válido (nunca `--:--:--`). A suíte Playwright live ficou intocada (o GPS que ela
  injeta usa `toISOString()`, 3 casas — ampliar é backward-compatible).
- **Task 3:** os três handlers do `TrackingController` são reais (5.1/5.2) — as três
  entradas 501 saíram; não resta stub no domínio tracking. O comentário de cabeçalho do
  controller, que PROTEGIA o doc 501 como "contrato histórico" (decisão de drift da
  5.1), foi reescrito — contradizia o AC6.
- **Extra dobrado (defer do wrap-1 roteado ao wrap-3):** a descrição do 403 de
  `PATCH /trips/:id/end` agora nomeia `DRIVER_NOT_ASSIGNED` com a MESMA redação do
  `get-trip-students` (comportamento existe desde o AC12 do wrap-1; só o texto do
  Swagger mudou). Entrada correspondente do `deferred-work.md` fica intocada; a
  anotação de "endereçado" pertence ao commit de fechamento pós-merge, no padrão
  docs/wrap-N-close. **Os dois action items atendidos (`epic-3-retro-item-8` e
  `epic-5-retro-item-18`) seguem `open` no `sprint-status.yaml` de propósito — a
  convenção do arquivo é flipar para `done` só quando o PR mergear com evidência
  verificada (mesmo padrão dos wraps 1 e 2).**
- **Task 4 (AC7):** AC #4 da 3.5b anotado in place com o desfecho real (online vs
  pós-dreno), marcado como reconciliação do wrap-3 para a história ficar legível. Sem
  outros toques na story.
- **Task 4 (AC8):** seção emitida em DOIS níveis — tabela completa com evidência de
  pouso em `architecture.md` §11 (novas subseções: evidência do gate da retro 5, débitos
  fechados desde a retro 2, débitos abertos com categoria/mitigação, o que fica para
  device/1.7) e resumo de produto no fim do `prd.md`, ambos apontando `deferred-work.md`
  como fonte viva. Os "Gaps conhecidos" do §11 que a Fase 1 já fechou (1.8, 1.9, schema)
  foram marcados ✅ — mesma Natureza de doc obsoleto que este wrap existe para limpar.
- **Surpresas (sem ação neste escopo):** (1) `npx tsc --noEmit` do mobile está vermelho
  na `main` em 2 arquivos de teste do wrap-1 (`use-trip-gps-capture.test.tsx:92` —
  TS2554; `tracking-stream.service.test.ts:172` — TS2339 `pollingInterval`); verificado
  pré-existente via stash contra a árvore limpa — `npm test` passa (252/252), o gate não
  roda tsc do mobile. (2) Uma execução do jest mobile falhou 1 teste de forma flaky
  (warning `act()` em `student-list`); 3 execuções seguintes 252/252 — não reproduzido.

### Verificação (13/09/2026)

- `openapi:export` + `openapi:types` regenerados NESTE PR: `openapi.json` (padrão
  fracionário + descrições + remoção dos 501), `api.d.ts` idem; `openapi:check` dentro
  do gate.
- API unit: **335/335**; supertest e2e: **200/200** (199 + 1 novo; spec do tracking
  36/36 com os casos de precisão).
- Mobile: jest **253/253** (novo caso de 9 casas em `track-bus-screen.test.tsx`); lint
  limpo.
- Gate completo (`npm run gate` sob `E2E_API_URL=http://localhost:3001` — a `PORT` do
  `api/.env` local é 3001, e o default do script é 3000): receipt registrado no commit
  de fechamento deste spec.

## Review Triage Log

Blind hunter (12 achados brutos, 13/09/2026). Veredictos após verificação contra os
arquivos; patches aplicados e re-verificados (e2e do tracking 36/36, tela 18/18,
regen do contrato refeito).

| # | Achado | Veredicto | Desfecho |
|---|---|---|---|
| 1 | Code Map do spec aponta `spec-3-5b-*.md`, que não existe (o arquivo é `3-5b-*.md`, sem prefixo) | low (doc enganosa num wrap sobre docs stale) | **patch** — caminho corrigido |
| 2 | Frontmatter `ready-for-dev` com notes de conclusão | false — estado de fluxo, não defeito: o oneshot finaliza o status (done) após a triagem e antes do commit; feito nesta finalização | — |
| 3 | `sprint-status.yaml` mantém itens 8/18 `open` enquanto o spec diz "atendidos" | false — convenção registrada no próprio sprint-status ("só vira `done` quando o PR mergear"); clareza melhorada com nota explícita no spec | **patch (nota)** |
| 4 | Precisão ilimitada do `capturedAt` era prosa-only no contrato publicado (sem `pattern` no Swagger) | low real — a regra que o código impõe não era legível por consumidor machine-readable; mesma classe de drift do wrap | **patch** — `pattern` adicionado aos 2 DTOs + regen |
| 5 | DTO hard-coda "timer de 15s" (constante privada da tela) | false — o número é exigido pelo texto do AC1 congelado; trocar por "timer curto" desviaria da intenção aprovada | — |
| 6 | Três redações diferentes para o mesmo disclosure 403/DRIVER_NOT_ASSIGNED no trip controller | low real — o texto novo do end referenciava o get-trip-students mas com redação diversa da dele | **patch** — end usa a MESMA redação do get-trip-students (a do create descreve regra distinta: vínculo à rota) |
| 7 | Nota afirmava cobertura de tela inexistente (nenhum teste com >3 casas) | medium real — AC5 declara a perna "tela" e a nota citava suítes que não a exercitam | **patch** — caso novo em `track-bus-screen.test.tsx` (9 casas ⇒ ponto + relógio válido) e nota corrigida |
| 8 | Forma com 0 casas fracionárias (AC3) sem teste nenhum | low real — a forma ISO mais comum à mão estava sem pino | **patch** — caso inclusivo no teste "body inválido" |
| 9 | Seção Verificação sem o resultado do gate (comando epônimo) | false em curso — o gate só fica verde pós-commit (`openapi:check` compara worktree×HEAD); receipt registrado no commit de fechamento | **resolvido** |
| 10 | Tabela de débitos abertos omite o server-stamp do last-known — o item para o qual o próprio changeset aponta | low real — inconsistência interna da fotografia | **patch** — linha adicionada (Confiabilidade, wrap-1 F3) + qualificador "principais itens" |
| 11 | Comentário de cabeçalho do tracking controller perdeu a regra de drift que o antigo carregava | low real — a obrigação regen-no-mesmo-PR ficou só na Architecture, longe do arquivo editado | **patch** — cláusula restaurada no comentário |
| 12 | Comentário em `track-bus.tsx` aponta ao defer sem identificá-lo (~90 entries no deferred-work) | low real — o propósito do patch era torná-lo encontrável | **patch** — "entry do wrap-1, 'servidor carimbar o last-known'" |
