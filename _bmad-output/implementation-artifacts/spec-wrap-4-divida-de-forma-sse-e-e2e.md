---
title: 'Wrap 4: Dívida de forma — broadcaster SSE e specs e2e gigantes'
type: 'refactor'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
baseline_commit: 'f05c93ac247625b9446f4569df5d617a6b3921ab'
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

## Implementation Notes (13/09/2026)

Branch `refactor/wrap-4-sse-broadcaster-e-e2e-slice` a partir de `main` (`f05c93a`,
o `baseline_commit` do frontmatter). Commits atômicos, Conventional Commits, sem push
nem PR (instrução da janela). Status segue `in-progress` aguardando o loop de review.

**Task A — broadcaster API (AC1–AC3).** A maquinaria vive em UMA classe nova,
`api/src/domains/shared/shell/sse/sse-broadcaster.service.ts` (canal ref-counted +
heartbeat 30s + sentinela `__trip_ended__` + `handleMessage` com o guard de tipo do
wrap-1 e o catch de parse). Não é `@Injectable` singleton de propósito: cada service
de domínio instancia o seu (`new SseBroadcaster(redis, <Context>)`), preservando a
conexão subscriber dedicada e o mapa de canais POR domínio — o desenho exato das
cópias extraídas. Os services mantêm só o que é deles: `boardingChannel` + whitelist
dos 3 eventos + `publish` no boarding; `trackingChannel` (que segue no
`redis-location-bus.adapter`) + o `@OnEvent('trip.ended')` no tracking. O lock de
"0 cópias novas" (AC3) está no comentário de cabeçalho da classe.

**Task B — cliente mobile (AC4–AC5).** Cliente único `mobile/src/services/sse-client.ts`
(`connectSseStream({ url, events, onOpen, onTripEnded, onUnrecoverable })`): escada
1s..30s, 409 como fechamento contratado, 401 → refresh single-flight com 3 falhas ⇒
`onUnrecoverable`, `parsePayload` defensivo, e `pollingInterval: SSE_REPOLL_INTERVAL_MS`
(5000) explícito para AMBOS os domínios — o boarding dependia do default 5000 da lib
(R6); pinar o mesmo valor não muda timing algum, só tira o default de terceiro do
caminho. `boarding-events.service.ts` e `tracking-stream.service.ts` viram facades de
config (URL + eventos nomeados + callbacks); API pública preservada (tipos de handler,
`BoardingEventsConnection`/`TrackingEventsConnection`, re-export de
`SSE_REPOLL_INTERVAL_MS`), então os consumidores (`student-list.tsx`, `track-bus.tsx`)
não mudam uma linha.

**Task C — fatiamento (AC6–AC7).** `api/test/boarding.e2e-spec.ts` (1.753 linhas) →
`api/test/boarding/`: `check-in` (3.3a/3.4b, 22 casos), `roles-matrix` (4.0, 7),
`events-stream` (4.2, 4), `not-returning` + roster (4.1, 13), `cancel-absence` (4.3,
13), `checkin-reminder` (4.4, 11). `api/test/tracking.e2e-spec.ts` (995 linhas) →
`api/test/tracking/`: `roles-matrix` (5.0, 4), `ingestion-last-known` (5.1, 16),
`stream-discovery` (5.2, 17). Setup compartilhado em `api/test/support/` (padrão
`tests/support/`): `supertest-app.ts` (boot/teardown + bind explícito do server,
antes só comentado nos god-specs), `sse-stream.ts` (parser `openStream` — a versão
tolerante a frame vazio de heartbeat do tracking, agora servindo o boarding também),
`company-scenario.ts` (seed de empresa/rota/motorista/alunos/viagens, com prefixo por
arquivo para não colidir email). Nenhum "misc.spec": cada arquivo é um bloco de story.

**Task D — monitoria (AC8).** Medições de 13/09/2026 registradas no comentário do
item `epic-4-retro-item-13` do sprint-status: `home.tsx` 419 linhas, `scan.tsx` 745 —
sem ação (mesmos valores da retro 5).

**Fronteiras respeitadas.** Zero diff em DTOs, guards, semântica de erro ou timing;
`openapi.json` intocado (sem regeneração — contrato não muda). O guard do wrap-1 já
existia nas 2 cópias e foi herdado pela implementação única (nada foi absorvido —
nota desnecessária no sprint-status). Ítem 13 da retro 4 fica com o mesmo desenho de
fechamento do item 19: comentário de execução agora, `done` só quando o PR mergear
(convenção registrada na triage #3 do wrap-3).

## Verificação (13/09/2026)

- **Evidência central da extração mecânica: ZERO asserção editada.** Os 23 casos unit
  dos 2 services SSE da API (`boarding-events.service.spec.ts`,
  `tracking-events.service.spec.ts`) e os 20 casos mobile dos 2 clientes
  (`boarding-events.service.test.ts`, `tracking-stream.service.test.ts`) passam
  contra as implementações únicas SEM UM CARACTERE de mudança nos arquivos de teste —
  a prova de AC2/AC5 mais forte disponível.
- Contagem de casos por bloco preservada exatamente (AC7): boarding 70→70
  (22+7+4+13+13+11), tracking 36→36 (4+16+17 totalizando os mesmos blocos), suíte
  e2e completa 200→200 em 14 arquivos (antes 7).
- API unit: **335/335** (59 arquivos); supertest e2e: **200/200** (14 arquivos).
- Mobile: jest **253/253** (23 suítes, contagem idêntica à `main` via stash);
  `tsc --noEmit` do mobile com a MESMA baseline de 4 linhas de antes (2 erros
  pré-existentes do wrap-1 em arquivos de teste — defer registrado no
  `deferred-work.md` pelo wrap-3); `npm run lint` limpo.
- API: `tsc --noEmit` com a mesma baseline da `main` (42 erros, todos pré-existentes
  em specs alheios; 0 nos arquivos tocados); ESLint limpo nos arquivos novos/tocados
  (os 3 erros restantes em `test/` são os pré-existentes de `app.e2e-spec.ts`).
- **Gate completo (`npm run gate` sob `E2E_API_URL=http://localhost:3001` — a `PORT`
  do `api/.env` local é 3001): VERDE, exit 0** no HEAD da branch — 335 unit /
  200 supertest / 2 pw:api (NFR4 41ms, budget 1s) / 10 pw:e2e (NFR1 11ms,
  NFR2 8ms, NFR3 103ms) / `openapi:check` limpo contra o contrato commitado.

## Riscos e ressalvas abertas

1. **Logs da sentinela mudam de contexto**: o "Failed to publish terminal signal"
   agora loga no contexto do broadcaster com o CANAL (`boarding:trip:{id}`) em vez do
   `tripId` cru. Nenhuma asserção nem contrato depende disso; registrado por
  transparência da "extração mecânica".
2. **14 arquivos e2e em paralelo** (antes 7) bootam mais AppModule contra o mesmo
   Postgres/Redis. Verde em 3 execuções seguidas nesta branch; os asserts do bloco
   4.4 já eram desenhados para sweep system-wide com arquivos paralelos.
3. **`tsc --noEmit` do mobile continua vermelho na baseline** (2 erros do wrap-1 em
   arquivos de teste, incluindo o TS2339 de `pollingInterval` em
   `tracking-stream.service.test.ts:172`) — pré-existente, deferido pelo wrap-3;
   NÃO foi "aproveitado" para corrigir aqui porque AC5 exigia as suítes migradas
   zero-edited (a correção do tipo do mock é 1 linha, fica para a story que pegar
   o defer).
4. **Rota wrap-4 ainda aberta no deferred-work**: o carimbo do servidor no last-known
   (`receivedAt`) citava "extração do broadcaster (wrap-4)" como caminho barato — a
   extração NÃO implementou o carimbo (fora do escopo congelado deste wrap); o item
   segue aberto para decisão de produto.

## Review Triage Log

Review em 3 camadas (blind-hunter, edge-case-hunter, verification-gap) sobre o diff
`f05c93a..HEAD` (284 KB, 7.684 linhas). 26 findings, vereditos um a um (verificação
feita no código, além das linhas alteradas):

| # | Camada | Finding | Veredito | Evidência |
|---|---|---|---|---|
| 1 | blind | Notas dizem "stream-discovery (5.2, 17)" / "4+16+17" | rejected | Erro real — grep conta 16 `it(` (8 stream + 8 discovery); mas o fix edita o próprio spec (Implementation Notes). Regra: finding cujo fix edita o spec é rejeitado. Sinalizado ao humano. |
| 2 | blind | Nomes de linha 1753/995 "stale" (deletados tinham 1826/1165) | rejected (low) | Os números citam a baseline da retro, consistentes com o Code Map do spec e a retro; os arquivos não existem mais, ninguém é induzido a erro sobre o estado atual. |
| 3 | blind | Log diz "for trip ${channel}" mas interpola o canal | **low** | Real (sse-broadcaster.service.ts:58). Fix de uma palavra. → patch (entrada A). |
| 4 | blind | `publishTripEnded` carrega semântica de domínio na classe compartilhada | rejected (low) | Todo stream do produto fecha em `trip.ended` (os 2 domínios); o nome casa com o conceito de produto e o header da classe já manda compor em vez de copiar. |
| 5 | blind | Falta suíte dedicada para SseBroadcaster/sse-client | false | verification-gap rodou as suítes: os 23 casos API + 20 mobile exercitam o código compartilhado diretamente (mocks só na fronteira react-native-sse/Redis). Cantos antes sem cobertura (heartbeat 30s) continuam como eram. |
| 6 | blind | Comentário do 4.4 raciocina sobre o mundo monólito | rejected (low) | Imprecisão pré-existente: `trip.e2e-spec.ts:511` já semeava RETURN com relatedTripId em paralelo ANTES do slice; o comentário foi movido verbatim. O determinismo dos testes não depende dele (asserções sweep-tolerant por desenho); reescrever exigiria reenunciar as condições de elegibilidade — mais que correção direta. |
| 7 | blind | `ApiResponse.data` tipado não-nulo mas endpoints devolvem null | rejected (low) | Os casts são por uso (`as ApiResponse` no call site); o "conserto" cascata — re-inserir `!` em vários acessos nos specs fatiados. Dano: leve imprecisão em helper de teste. |
| 8 | blind | `tripId` morto em `connectBoardingEvents` | rejected (low) | Pré-existente (o client antigo também ignorava); preservar a assinatura foi decisão de desenho para não tocar os consumidores (`student-list.tsx`). |
| 9 | blind | Dois estilos de request no mesmo PR (company-scenario usa `request()` cru) | **low** | Real — 4 ocorrências de `request(app.getHttpServer())` no support enquanto os specs usam `http(app)`. Fix direto. → patch (entrada B). |
| 10 | blind | Árvore bilíngue (novos arquivos EN, specs movidos PT) | rejected (low) | Norma pré-existente do repositório (suítes sempre em PT); os arquivos NOVOS seguem o AGENTS.md (inglês); traduzir os movidos violaria a preservação zero-edit que serve de prova. |
| 11 | blind | `prisma` morto em tracking/roles-matrix.e2e-spec | false | `prisma` É usado na linha 52 — argumento de `seedCompanyScenario(app, prisma, 'tracking-roles')`. O comentário "no trip is seeded" é defensável (nenhuma viagem é semeada PARA as asserções destes testes). |
| 12 | blind | `bootApp` devolve `module` não usado; `bindHttpServer` exportado à toa | rejected (low) | Dano especulativo (ninguém mal-usa hoje); o retorno pode servir a specs futuros (pegar outros services do módulo). |
| 13 | blind | Wrappers `const checkIn = (...) => checkInRequest(...)` não agregam | rejected (low) | Deliberados: mantêm os corpos de teste byte-a-byte idênticos ao god-spec (mesma assinatura local); inline exigiria reescrever call sites — churn, não correção. |
| 14 | blind | Typo "Ítem 13" e redação das notas | rejected | Fix edita o próprio spec. |
| 15 | blind | AC8 sem threshold numérico ("além do padrão atual") | false | A nota cumpre o AC8 verbatim — o próprio AC usa essa linguagem; inventar um número excede o que foi aprovado. |
| 16 | blind | Assinatura `seedActiveTrip(driver: string \| undefined = undefined)` barulhenta | rejected (low) | Correta e explícita; a alternativa (default `driver = driverId`) lê variável de closure — cosmético sem dano nomeado. |
| 17 | edge | subscribe() rejeita → entrada morta no mapa, streams sem evento | false | ioredis resubscreve os canais ao reconectar — a entrada recupera; janela transitória, comportamento idêntico ao das cópias substituídas (mesmo catch-log). |
| 18 | edge | Envelope sem `data` → `JSON.stringify(undefined)` no frame | false | Inalcançável: todo publisher real envia `{type, data}` e a sentinela é interceptada antes do caminho `next()`. Idêntico ao código antigo. |
| 19 | edge | publish da sentinela falha → streams nunca completam | rejected (low) | Pré-existente preservado mecanicamente; exige falha de Redis exatamente no instante do trip-end; o fix adicionaria fallback novo — mudança de comportamento, proibida pelo escopo congelado. |
| 20 | edge | 2º evento de error durante refresh → conexão dupla | rejected (low) | Corrida pré-existente, idêntica nas cópias; `handleError` fecha a source sincronamente antes do primeiro await; fix adicionaria guard de reentrância (complexidade nova). |
| 21 | edge | xhrStatus fora de 401/409 → backoff infinito, sem give-up | false | Desenho intencional: backoff sem teto É o caminho de recuperação de falha transitória (RV1); `onUnrecoverable` é só para sessão morta. Capar mudaria comportamento publicado — proibido. |
| 22 | edge | Parser do support quebra em frame nomeado não-JSON | rejected (low) | Só teste; exige bug do servidor para disparar; padrão idêntico aos parsers antigos (pré-existente). |
| 23 | v-gap | Log de falha da sentinela sem NENHUMA cobertura (pré-verificado) | low → **defer** | Pré-verificado pela camada (deletar o catch/log deixa o gate verde; 23 unit não tocam o caminho). Mudança já divulgada no risco #1; follow-up barato: 1 caso unit afirmando que o log dispara. Disposition arquivada: defer. |
| 24 | v-gap | = finding 1 (mesma raiz) | rejected | Ver linha 1. |
| 25 | v-gap | Pings agora aparecem em `messages` do boarding (parser antigo quebraria) | false | Nenhum teste de boarding mantém stream ≥30s hoje; parser tolerante documentado no header do support; estritamente uma melhoria. |
| 26 | edge | = finding 3 (mesma raiz) | **low** | Ver linha 3. |

**Agrupamento e roteamento** (sem `intent_gap`/`bad_spec` → sem loopback;
`review_loop_iteration` permanece 0):

- **Entrada A (patch)** — findings 3 + 26: wording do log de falha da sentinela.
- **Entrada B (patch)** — finding 9: `company-scenario.ts` passa a usar o helper
  `http(app)` do harness.
- **Entrada C (defer)** — finding 23: registrado em `deferred-work.md`.
