# Testes — PureUrban API

## Estrutura

```
api/
├── test/                        # NestJS e2e tests (Vitest + Supertest)
│   └── app.e2e-spec.ts
├── tests/                       # Playwright API & E2E tests
│   ├── api/                     # Testes de integração API (sem browser)
│   │   └── health.api.spec.ts
│   ├── e2e/                     # Testes E2E (com browser, futuro)
│   │   └── example.spec.ts
│   └── support/                 # Infraestrutura de teste
│       ├── merged-fixtures.ts   # Fixtures combinadas (mergeTests)
│       ├── custom-fixtures.ts   # Fixtures customizadas PureUrban
│       ├── auth/                # Auth provider JWT
│       ├── factories/           # Data factories (@faker-js/faker)
│       └── helpers/             # Seed helpers
├── vitest.config.ts             # Config unitária (src/**/*.spec.ts)
├── vitest.config.e2e.ts         # Config e2e NestJS (test/**/*.e2e-spec.ts)
└── playwright.config.ts         # Config Playwright (tests/**)
```

## Scripts

| Script | Descrição |
|---|---|
| `npm test` | Roda testes unitários (Vitest) |
| `npm run test:watch` | Testes unitários em modo watch |
| `npm run test:cov` | Testes unitários com cobertura |
| `npm run test:e2e` | Testes e2e NestJS (Supertest) |
| `npm run test:pw` | Todos os testes Playwright |
| `npm run test:pw:api` | Apenas testes API (sem browser) |
| `npm run test:pw:e2e` | Apenas testes E2E (com browser) |
| `npm run test:pw:debug` | Playwright em modo debug |

## Factories

```typescript
import { createUser, createAdmin, createCompany } from './support/factories';

// Criar usuário com defaults aleatórios
const user = createUser();

// Criar admin com empresa específica
const admin = createAdmin({ companyId: 'abc-123' });

// Override qualquer campo
const driver = createUser({ role: 'driver', name: 'João Silva' });
```

## Padrões

- **Given/When/Then** para estrutura de teste
- **Factories com overrides** para dados de teste (nunca hardcoded)
- **API seeding** para setup (nunca UI)
- **merged-fixtures.ts** como ponto único de importação do Playwright

## E2E do Épico 3 (integração real, sem MSW)

Os specs em `tests/e2e/boarding-*.e2e.spec.ts` (projeto Playwright `e2e`, Chrome)
dirigem o **Expo Web do motorista** contra a **API real** e provam o fluxo do
produto ponta a ponta: login → viagem ativa → scan de QR → check-in 201 → a
lista de alunos atualiza com `{boarded, total}`. Cobrem também QR inválido /
aluno não permitido, o cenário offline (check-in sem rede → reconexão → sync sem
duplicata) e as latências de NFR1 (< 2s) e NFR4 (< 1s com 50+ alunos, este em
`tests/api/roster-nfr4.spec.ts`, API-only).

### Pré-requisitos (dois servidores de pé)

Não há `webServer` no Playwright: subir API + Expo Web juntos pelo runner é
frágil (o bundle inicial do Metro leva minutos e não sinaliza "pronto"). Suba os
dois à mão antes:

```bash
# 1. Infra
docker compose up -d              # Postgres 16 + Redis 7

# 2. API em :3000  (terminal separado, dentro de api/)
npm run start:dev

# 3. Expo Web em :8081  (terminal separado, dentro de mobile/)
EXPO_PUBLIC_USE_MOCKS=0 EXPO_PUBLIC_API_URL=http://localhost:3000 EXPO_PUBLIC_E2E=1 npm run web
```

`EXPO_PUBLIC_E2E=1` liga, só sob `__DEV__`, o hook `globalThis.__E2E_INJECT_SCAN__`
em `(driver)/scan.tsx` — o E2E injeta a string do QR por aí, já que roda no web
sem câmera. Sem essa env o hook é nulo e nada é exposto.

### Rodar

```bash
cd api && npm run test:pw:e2e
```

Com os servidores no ar os specs rodam; **sem eles, auto-skipam** (não falham):
`e2eServersUnavailable()` checa `:3000` + `:8081` (specs `e2e`) e
`apiUnavailable()` checa só `:3000` (`tests/api/roster-nfr4.spec.ts`, que semeia
via API real). Ambos com timeout de 3s por probe. Para exigir a infra (CI), rode
com `E2E_SERVERS_UP=1` e a ausência vira falha.

Os specs `e2e` rodam **seriais** — dividem um único Expo dev server
(`playwright.config.ts`: `fullyParallel:false` no projeto + `--workers=1` nos
scripts `test:pw`, `test:pw:e2e`, `test:pw:headed`).

### Caveats

- **OPFS / wa-sqlite headless:** `boarding-offline-sync.e2e.spec.ts` passou
  headless na verificação da 3.6. A persistência da fila offline usa wa-sqlite;
  se algum ambiente não servir os headers COOP/COEP, o `SyncAccessHandle` do OPFS
  fica indisponível em headless e o spec precisa de `npm run test:pw:headed`.
- **Revalidação do roster no spec offline:** `context.setOffline` do Playwright é
  CDP puro e não redispara os eventos DOM que o app usa para revalidar queries;
  além disso o dreno da fila não invalida o cache do roster (só o caminho ONLINE
  do scan faz — AC #4 da 3.5b). Por isso `boarding-offline-sync` prova o "aparece
  exatamente uma vez" pela API (`GET /trips/:id/students`), que é a fonte da
  contagem que a lista renderiza, e não pelo DOM da lista.
- **Latências:** as asserções de NFR medem só a chamada de rede, nunca o render.
  NFR1 lê o `timing()` do resource (`responseEnd - requestStart`), não um
  `Date.now()` em volta da injeção. NFR4 mede o `GET` direto. Números reais no
  `console.log` (`[NFR1]` / `[NFR4]`); a folga de ambiente local está nos tetos.
- **Sem cleanup:** cada spec semeia um tenant isolado via `seedEpic3Scenario`
  (e-mail faker único). Lixo no Postgres de teste local é aceito.

## E2E do Épico 4 (ausência e lembrete — Story 4.5)

`tests/e2e/absence-reminder.e2e.spec.ts` (mesmo projeto `e2e`, mesmos
pré-requisitos da seção acima) prova o Épico 4 pela UI, em **duas páginas em
contextos separados sobre a mesma viagem RETURN**: o aluno na home (botão "Não
vou voltar", banner "E a volta?", card "Motorista avisado") e o motorista na
lista de embarque (chip "Não vai voltar", contagem pelo `aria-label` "B de T
embarcados" do `roster-counter`, toast). Cobre quatro fluxos: notificar (com NFR3), cancelar dentro
da janela, fora da janela (UI + API) e o lembrete respondido pelo aluno.

### Cenário semeado

`seedEpic4Scenario` (fixture `epic4`) cria, 100% via API e sem cleanup: empresa
+ admin, motorista, rota, 3 alunos **com credenciais e token** (logináveis),
vínculos, OUTBOUND com check-in real (header `X-Idempotency-Key`), end da
OUTBOUND e RETURN ativa com `relatedTripId` — a RETURN é a única viagem ativa,
que é exatamente o que a home do aluno e a lista do motorista resolvem.

### Aging de timestamps (única escrita direta no banco)

As janelas de 2 min (cancelamento) e 15 min (lembrete) são inviáveis em tempo
real, e a API não aceita datas no passado. Os timestamps são então "envelhecidos"
direto no Postgres por `tests/support/helpers/prisma-time.ts` (`ageTrip`,
`ageAbsence`) — cliente Prisma com adapter `PrismaPg` + dotenv, mesmo padrão do
`prisma/seed.ts`, rodando no processo do Playwright (precisa de `api/.env` com
`DATABASE_URL`). Este helper é a ÚNICA exceção à regra "dados só via API": a
crição continua toda via endpoints; só o relógio é reescrito (precedente do
supertest `test/boarding.e2e-spec.ts`, que semeia ausências com datas passadas).

### Lembrete: scheduler real, polling de até ~90s

Não há endpoint de trigger manual do scan (decisão da 4.4). O teste envelhece o
`startedAt` da RETURN e **espera o tick de 60s do scheduler do dev server**
(`:3000` sobe SEM `REMINDER_SCAN_ENABLED=false` — a kill-switch só existe nos
testes Vitest), fazendo polling de `GET /api/v1/boarding/reminder` com o token
do aluno por até 90s. Por isso o teste do lembrete pode demorar ~1–2 min. O
banner "E a volta?" só aparece depois de um reload: o app não faz polling — o
lembrete é derivado na abertura do app (requisito da 4.4). Detalhe: o
`staleTime` GLOBAL do app é de 1 minuto (`mobile/src/lib/query-client.ts`), então
o reload precisa acontecer DEPOIS de o `null` persistido ficar velho — por isso
o spec remonta em loop (`expect.toPass`) em vez de recarregar uma vez.

### NFR3 e margem de ambiente

O NFR3 (< 3s) é medido como **wall-clock do clique em "Confirmar" até o
badge/contagem estar visível na página do motorista** — cross-screen (rede +
SSE + render), então inclui o round-trip dos dois browsers. O número real vai
no `console.log` (`[NFR3] ...ms`, visível na saída do Playwright). A prova de
rede pura <3s já vive no supertest; o budget de 3000ms aqui é folgado de
propósito para variação do ambiente local (Metro, CDP, primeiro paint).

### Caveats específicos do Épico 4

- **CORS do stream SSE no web (RESOLVIDO):** o cliente SSE do mobile
  (`react-native-sse`) envia `cache-control: no-cache` e
  `X-Requested-With: XMLHttpRequest` em toda conexão de stream — nenhum dos
  dois é safelisted do CORS, e a allowlist de `api/src/main.ts` não os
  incluía: o preflight real do browser negava e o stream nunca conectava (o
  servidor entregava o evento em <50 ms; a rede nunca foi o problema). A 4.5
  provou o fluxo com um shim de teste (`allowSseInBrowser`) que reescrevia o
  preflight para só `authorization` — mascarando os DOIS headers de uma vez.
  O fix real (ambos na allowlist) e a remoção do shim pousaram no hardening
  pré-Épico 5; o spec hoje prova o preflight real. Armadilha de verificação:
  um curl de preflight pedindo só parte dos headers passa mesmo com a
  allowlist incompleta — reproduza a lista que o browser pede
  (`accept,authorization,cache-control,x-requested-with`). Qualquer header
  novo no cliente SSE continua sujeito à regra do comentário em `main.ts`:
  header novo no cliente ⇒ allowlist na mesma PR.
- **Aging também no cache do aluno (fora da janela):** a home renderiza o
  countdown exclusivamente do `cancellableUntil` em cache — não há GET de
  ausência. Para o card sair do estado "com countdown" para o consolidado sem
  esperar os 2 min reais, o spec envelhece o timestamp no banco (Prisma) E no
  cache persistido do app (`ageAbsenceInClientCache`: blob do TanStack no
  MMKV-web/localStorage, chave `mmkv.default\REACT_QUERY_OFFLINE_CACHE`).
  O persister sincroniza com throttle de 1s — o spec espera a descarga antes
  de recarregar a página, senão a escrita se perde no reload.

## E2E do Épico 5 (localização em tempo real — Story 5.3)

`tests/e2e/tracking-live.e2e.spec.ts` (mesmo projeto `e2e`, mesmos
pré-requisitos das seções acima) prova o pipeline inteiro pela UI —
REST → Redis Pub/Sub → SSE → render — sem nenhum mock de tracking: o motorista
inicia a viagem e o GPS transmite sozinho (`POST /tracking/location` a cada
~5s); o aluno abre "Onde está o ônibus" e vê posição + distância/ETA; o
motorista muda de ponto e o texto do aluno atualiza em <5s (NFR2); ~15s sem
sinal, o chip "Sem sinal GPS" aparece com o último ponto mantido e volta a
"Em tempo real" com o texto reatualizado na recuperação; e "Encerrar Viagem"
fecha o stream do aluno ("Nenhuma viagem ativa no momento") e para a captura
(0 POSTs numa janela de 7s).

O cenário é semeado pela fixture `epic5` / `seedEpic5Scenario`: empresa+admin,
motorista, rota com vínculos e 1 aluno COM credenciais, sem check-ins e sem
cleanup (padrão 3.6/4.5). No caminho feliz a viagem é iniciada PELA UI; os
testes degradado e de fim recebem OUTBOUND ACTIVE do seed
(`opts.createActiveTrip`).

### Geolocation mockada nos DOIS contextos

No alvo web o expo-location delega à Geolocation API do browser
(`node_modules/expo-location/build/ExpoLocation.web.js`), então o Playwright
dirige a captura do motorista E a posição do aluno sem hook de injeção e sem
tocar em `mobile/src`: os contextos nascem com `permissions: ['geolocation']`
+ coordenadas fixas. As coordenadas são escolhidas para que distância/ETA
sejam funções puras das posições: aluno parado em S, motorista em A (~222 m do
aluno) e B (~55,6 km); os asserts usam os textos EXATOS que
`mobile/src/lib/geo.ts` produz para esses pontos (haversine +
`formatDistance`/`formatEta` replicados no spec).

**Movimentar o motorista é `setGeolocation(B)` + `reload()` na página dele.**
Armadilha do Chromium: o expo-location web chama `getCurrentPosition` com
`maximumAge: Infinity`, e o cache de posição do browser é POR DOCUMENTO — o
`setGeolocation` sozinho troca o mock, mas o tick de captura continua lendo a
primeira fix (em cache) para sempre. O reload abre um documento novo (cache
vazio), o app reidrata o login do MMKV e retoma a captura sozinho, agora já em
B — o `waitForResponse` do spec só aceita o POST cujo body carrega a latitude
de B, então o NFR2 nunca começa num POST velho.

### Por que a espera REAL de 15s no degradado

O timer de staleness do chip é `setTimeout` no browser
(`GPS_SIGNAL_TIMEOUT_MS = 15_000` em `track-bus.tsx`): não há timestamp de
banco a envelhecer, então o aging de `prisma-time` (Épico 4) NÃO se aplica —
o spec espera os 15s reais + margem (chip visível em ≤25s), dentro do
precedente das esperas longas da 4.5 (polling de 90s do scheduler). A
recuperação também é real: `setOffline(false)` e o próximo tick transmite. Os
pings (`heartbeat` do SSE) chegam durante o degradado e NÃO resetam o
indicador — o chip aparecer com a conexão viva é a prova de que só
`location.updated` conta como sinal.

### NFR2: âncora no POST e margem de ambiente

O NFR2 (< 5s) fala da ENTREGA (Redis Pub/Sub → SSE → render), não da captura:
o tick de ≤5s do produtor fica FORA da conta. O spec marca t0 na RESPOSTA do
`POST /tracking/location` que já carrega o ponto novo (o predicado do
`waitForResponse` confere a latitude no body) e termina quando o texto de
distância/ETA atualizado fica visível na tela do aluno. O número real vai no
`console.log` (`[NFR2] ...ms`, visível na saída do Playwright). A prova de
entrega pura <5s já vive no supertest (`test/tracking.e2e-spec.ts`); o budget
aqui é folgado de propósito para o ambiente local (Metro, CDP, primeiro
paint), mesmo critério do NFR3.

Caveat: o "estado inicial" do motorista após encerrar uma OUTBOUND é o botão
"Iniciar Retorno" (branch `isReturn` de `trip.tsx`) — é isso que o spec de fim
de viagem assertiona, junto com o chip "Concluída" e o sumiço de
"Encerrar Viagem". Desde a story 6.5, "Encerrar Viagem" abre um ConfirmDialog e o
PATCH só sai do "Encerrar" do dialog (`end-trip-dialog-confirm`).
