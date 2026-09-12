---
title: 'Wrap 4: Dívida de forma — broadcaster SSE e specs e2e gigantes'
type: 'refactor'
created: '2026-09-12'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-5-retro-2026-09-12.md
  - _bmad-output/implementation-artifacts/epic-4-retro-2026-09-11.md
  - _bmad-output/implementation-artifacts/deferred-work.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A maquinaria SSE vive hoje em 4 cópias — API: `tracking-events.service.ts`
(164 linhas) é cópia estrutural de `boarding-events.service.ts` (197): mesmo mapa de
canais ref-counted, mesmo heartbeat de 30s, mesma sentinela `trip.ended`, mesmo
`handleMessage`; mobile: `tracking-stream.service.ts` (174) espelha
`boarding-events.service.ts` (193). Foi decisão documentada das specs ("o blueprint"),
mas é a segunda história a copiar o bloco inteiro — o mesmo padrão que gerou 11 cópias
de `toInfraError` antes da extração do PR #31. O custo já se materializou: o guard de
tipo do `handleMessage` (wrap-1) tem de ser aplicado 2×. Em paralelo, os dois god-specs
e2e continuam crescendo: `boarding.e2e-spec.ts` (1.753 linhas) e
`tracking.e2e-spec.ts` (995 linhas, 0→995 num único épico) acumulam as matrizes de
várias stories num arquivo só.

**Approach:** Extração mecânica com comportamento preservado — um broadcaster SSE
compartilhado em `api/src/domains/shared/shell/` (canal ref-counted + heartbeat +
sentinela + `handleMessage` COM o guard do wrap-1) e um cliente SSE compartilhado em
`mobile/src/services/` (reconexão em escada + `onUnrecoverable` após 3 refreshes falhos
+ `pollingInterval` explícito), ambos adotados pelas 2 cópias de cada lado; depois,
fatiar os 2 specs e2e por bloco de story. `home.tsx` (419 linhas) segue apenas
MONITORADA (sem ação — mesmo precedente de `scan.tsx` 745). Este spec pode ser dividido
em 2 janelas: (A) extração dos broadcasters, (B) fatiamento dos specs.

</frozen-after-approval>

## Action items atendidos

| id (sprint-status) | Origem |
|---|---|
| `epic-5-retro-item-19` (AI6) | R9, AV3 — broadcaster compartilhado + fatiar tracking.e2e-spec |
| `epic-4-retro-item-13` (restante) | fatiar boarding.e2e-spec (o `toInfraError`/TestClock já pousaram no PR #31) |

## Code Map

- API (fusão): `api/src/domains/tracking/shell/tracking-events.service.ts` ×
  `api/src/domains/boarding/shell/events/boarding-events.service.ts` →
  `api/src/domains/shared/shell/sse/` (nome sugerido: `sse-broadcaster.service.ts` +
  tipos de canal). Destino do resultado: cada domínio mantém só a declaração dos SEUS
  canais/eventos.
- Mobile (fusão): `mobile/src/services/tracking-stream.service.ts` ×
  `mobile/src/services/boarding-events.service.ts` → cliente único
  (`mobile/src/services/sse-client.ts` ou similar) com config por domínio (URL, canais,
  callbacks).
- Specs a fatiar: `api/test/boarding.e2e-spec.ts` (por bloco de story: 3.0/3.3a/3.4b/
  3.5a/3.5b/4.x — ler os `describe` atuais) e `api/test/tracking.e2e-spec.ts`
  (5.0 matriz de roles / 5.1 ingestão+last-known / 5.2 stream+descoberta).
- Precedente de extração: `api/src/domains/shared/shell/infra/to-infra-error.ts` e
  `api/src/domains/shared/testing/test-clock.ts` (PR #31).

## Tasks & Acceptance

**Task A — Broadcaster SSE compartilhado (API).**
- AC1: existe UMA implementação de canal ref-counted + heartbeat 30s + sentinela +
  `handleMessage` (com o guard de tipo do wrap-1) em `shared/shell`; os 2 services de
  domínio a compõem/estendem sem redefinir a maquinaria.
- AC2: comportamento observável idêntico: ordem 409→403→404 dos guards, envelope
  `{type, data}`, heartbeat, sentinela fora do mapa antes do complete, TTL — todos os
  testes existentes passam SEM alteração de asserção (se alguma asserção precisar mudar,
  a extração mudou comportamento: parar e explicar).
- AC3: 0 cópias novas no futuro é travado por teste/comentário no arquivo compartilhado.

**Task B — Cliente SSE compartilhado (mobile).**
- AC4: existe UM cliente (escada de retry, 3 refreshes falhos ⇒ `onUnrecoverable`,
  `pollingInterval` explícito do wrap-1); tracking e boarding passam config.
- AC5: suítes existentes (`tracking-stream.service.test.ts`,
  `boarding-events.service.test.ts`) passam contra o cliente único — migradas, não
  duplicadas.

**Task C — Fatiar os god-specs.**
- AC6: `boarding.e2e-spec.ts` e `tracking.e2e-spec.ts` divididos por bloco de story em
  arquivos coesos (nada de "misc.spec.ts"); setup compartilhado vai para helper em
  `test/` (padrão `api/tests/support/`).
- AC7: contagem de casos preservada (193 supertest na baseline da retro 5 — pode variar
  só por reorganização de `describe`, zero casos perdidos); `npm run gate` verde.

**Task D — Monitoria (sem código).**
- AC8: nota no spec/sprint-status registrando o tamanho de `home.tsx`/`scan.tsx` na
  data — ação só se crescerem além do padrão atual.

## Boundaries & Constraints

- Refatoração pura: ZERO mudança de comportamento. Qualquer diff em DTOs, guards,
  semântica de erro ou timing = fora de escopo (parar e registrar).
- O guard de tipo do `handleMessage` (wrap-1) deve EXISTIR nas cópias antes desta
  extração; preservá-lo na implementação única. Se o wrap-1 ainda não pousou, aplicar o
  guard aqui diretamente (uma vez, na implementação única) e anotar no sprint-status
  que o item 15 foi absorvido.
- Proibido aproveitar para "melhorar" heartbeat/TTL/nomes de evento — contrato publicado
  não muda (sem regeneração de openapi esperada).
- Imports da API com extensão `.js` (nodenext); mobile usa `@/*`.

## Verification

```bash
docker compose up -d
cd api && npm test && npm run test:e2e && npm run openapi:check
cd mobile && npm test
cd api && npm run gate   # completo: 320+ unit / 193 supertest / 2 pw:api / 10+ pw:e2e
```

## Ordem de execução

DEPOIS do wrap-1 (guard já pousado nas cópias — a extração só o herda) e idealmente
depois do wrap-3 (sem diff de contrato concorrente). Pode rodar em paralelo ao wrap-5.
Route `dispatch`: se a janela única não der conta, entregar Task A+B e Task C como PRs
separados, nesta ordem.
