---
baseline_commit: d317f152d5b7daeeaa006c6908cf2496cb683acf
---

# Story 1.6: Ambiente de Execução Web do App Mobile

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero executar o app mobile no alvo web,
Para que exista um ambiente onde as stories mobile possam ser desenvolvidas e verificadas.

---

## ⚠️ Leia isto antes de qualquer coisa

Esta story é **configuração de ambiente**, não feature. Ela existe porque hoje **não há nenhum lugar onde o app mobile rode** (`sprint-change-proposal-2026-08-23.md`). Enquanto ela não fechar, as stories 3.3b, 3.4b, 3.5b e 3.6 ficam bloqueadas.

**A cadeia real de bloqueios foi executada e verificada em 27/08/2026** — não é dedução. São **quatro** bloqueios, não um. O épico e a Architecture só conheciam o primeiro:

| # | Bloqueio | Como se manifesta | Correção |
|---|---|---|---|
| 1 | `metro.config.js` não existe | `expo export --platform web` → `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm` | `resolver.assetExts.push('wasm')` |
| 2 | `app.json` tem `web.output: "static"` | Depois do #1: `Tried to access storage on the server` em `auth.store.ts:18` | `web.output: "single"` |
| 3 | Headers COOP/COEP não chegam no **documento HTML** | `window.crossOriginIsolated === false` → `SharedArrayBuffer is not defined` no wa-sqlite | patch de `http.createServer` no `metro.config.js` (§ Bloqueio 3) |
| 4 | `API_BASE_URL` aponta para `10.0.2.2` e a API não tem CORS | Login falha no browser | ler `EXPO_PUBLIC_API_URL` + `app.enableCors()` |

**A receita oficial da documentação do Expo resolve apenas os bloqueios #1 e #2 e resolve o #3 pela metade.** Isso está detalhado na seção *Bloqueio 3* — leia antes de escrever o `metro.config.js`, ou você vai entregar um arquivo que passa no `expo export` e falha em runtime.

---

## Acceptance Criteria

**AC #1 — Metro resolve o WASM do wa-sqlite**
**Given** o app mobile sem `mobile/metro.config.js`
**When** o arquivo é criado estendendo `expo/metro-config`
**Then** `wasm` está registrado em `config.resolver.assetExts`
**And** `getDefaultConfig(__dirname)` é a base (nunca um config escrito do zero)

**AC #2 — O dev server entrega cross-origin isolation**
**Given** o `SharedArrayBuffer` que o `WorkerChannel` do wa-sqlite exige
**When** `npm run web` está no ar
**Then** `curl -sI http://localhost:8081/` mostra `Cross-Origin-Opener-Policy: same-origin` **e** `Cross-Origin-Embedder-Policy: credentialless`
**And** os mesmos headers aparecem nas rotas de bundle (`/_expo/static/...`)
**And** `window.crossOriginIsolated` é `true` no console do browser

> A verificação no **documento HTML** (`/`) não é redundante com a do bundle. Foi exatamente aí que a receita oficial falhou na verificação desta story.

**AC #3 — O bundle web exporta sem erro**
**Given** os bloqueios #1 e #2 corrigidos
**When** executo `npx expo export --platform web`
**Then** o comando termina com `Exported: dist` e código de saída 0
**And** `dist/assets/` contém o arquivo `wa-sqlite.<hash>.wasm` (~621KB)
**And** `dist/_expo/static/js/web/` contém um bundle `worker-*.js`

**AC #4 — Login ponta a ponta contra a API local**
**Given** `docker compose up`, `npx prisma migrate deploy`, um admin criado via `POST /api/v1/auth/register` (o seed está quebrado sob Prisma 7 — Story 1.8) e `npm run start:dev` no ar
**When** abro `http://localhost:8081` e faço login com o admin do seed (`admin@pureurban.dev` / `admin123456`)
**Then** a requisição sai para a API local (não para `10.0.2.2`) e não é bloqueada por CORS
**And** o app navega para `/(admin)/home`
**And** o mesmo fluxo também funciona com `EXPO_PUBLIC_USE_MOCKS=1` (MSW), incluindo uma role DRIVER

**AC #5 — Tier 1: MMKV sobre `localStorage` sobrevive a reload**
**Given** uma sessão autenticada no browser
**When** recarrego a página (F5)
**Then** a sessão continua autenticada — sem voltar para a tela de login
**And** `localStorage` contém as chaves prefixadas `mmkv.default\auth.accessToken`, `...\auth.refreshToken` e `...\auth.user`
**And** o cache do TanStack Query persistido pelo `mmkvPersister` é reidratado (a tela não refaz fetch do zero)

**AC #6 — Tier 2: expo-sqlite abre em wa-sqlite/OPFS**
**Given** o app carregado com cross-origin isolation ativa
**When** `initializeDatabase()` roda no `_layout.tsx`
**Then** nenhum erro de `SharedArrayBuffer` ou de abertura de banco aparece no console
**And** a tabela `offline_queue` existe (verificável via `getDatabase()` no console de dev)

**AC #7 — Leitura de QR pela webcam**
**Given** um usuário DRIVER autenticado (via MSW — ver § *Que usuário usar em cada AC*)
**When** navego para `/scan` e concedo a permissão de câmera do browser
**Then** a webcam abre dentro da moldura do `QrScanner`
**And** apontar um QR code de aluno dispara o fluxo de check-in de `(driver)/scan.tsx`

**AC #8 — Escopo fechado: só configuração**
**Given** o objetivo de habilitar ambiente, não de mudar comportamento
**When** a story termina
**Then** nenhum arquivo de **UI, store, service, hook ou componente** do mobile foi alterado
**And** as únicas edições fora de `metro.config.js` são as declaradas nas Tasks 2, 3, 4 e 7 (`app.json`, `src/utils/constants.ts`, `.env.example`, `README.md`, `api/src/main.ts`) — 6 arquivos no total, verificados na Task 8.4
**And** nenhuma dependência foi adicionada, removida ou atualizada

**AC #9 — README documenta comando e limitações**
**Given** um segundo desenvolvedor entrando no projeto
**When** ele lê `mobile/README.md`
**Then** encontra como subir o alvo web, o pré-requisito de `http://localhost` (contexto seguro) e a lista de limitações da § *Limitações do alvo web*

---

### Nota de escopo — ACs #4, #5 e #7 fechadas como DIFERIDAS (27/08/2026)

Decisão do Lucas ao fim da implementação, registrada aqui em vez de reescrever as ACs
acima, que ficam preservadas como foram escritas.

A verificação em execução revelou **dois bloqueios que a story não conhecia** e que não
são do ambiente web — são do app, e valem igualmente no alvo nativo:

- **Bloqueio 5:** `src/app/_layout.tsx` não renderiza saída de router (`<Slot />` /
  `<Stack />` / `<Tabs />`). Nenhuma tela do projeto é alcançável, autenticado ou não.
- **Bloqueio 6:** `enableMocking()` não é idempotente; a segunda invocação do efeito
  derruba o modo MSW.

Corrigi-los exigiria editar `_layout.tsx`, `app-tabs.tsx` e `mocks/index.ts` — código de
aplicação que a **AC #8 proíbe** e que as Dev Notes desta story atribuem à Story 3.6
("Não construa o shell de navegação aqui").

| AC | Situação |
|---|---|
| **#4** Login ponta a ponta | **Metade servidor ATENDIDA e verificada** (CORS, preflight, `X-Idempotency-Key`, `API_BASE_URL`). Metade cliente **diferida** — a tela de login não renderiza. |
| **#5** MMKV sobrevive a reload | **Mecanismo ATENDIDO e verificado** (chaves `mmkv.default\...` hidratam o `auth.store`). Ciclo real (login → F5) **diferido**. |
| **#7** QR pela webcam | **Diferida** — `/scan` não renderiza. |

ACs plenamente atendidas e verificadas em execução: **#1, #2, #3, #6, #8, #9**.
Os dois bloqueios estão registrados em `deferred-work.md` com a evidência de runtime.

---

## Tasks / Subtasks

### Task 1 — Criar `mobile/metro.config.js` (AC: #1, #2)

- [x] 1.1 Criar `mobile/metro.config.js` a partir de `getDefaultConfig(__dirname)` de `expo/metro-config`. **Não** escrever um config do zero: o default do Expo já traz `assetExts` com `db`/`heic`/`avif`, `sourceExts`, `blockList` e o `transformerPath` do Expo. Sobrescrever isso quebra o bundle inteiro.
- [x] 1.2 `config.resolver.assetExts.push('wasm')` — resolve o Bloqueio 1.
- [x] 1.3 Aplicar o patch de `http.createServer` **antes** de `getDefaultConfig` (ver § *Bloqueio 3* para o código e o porquê) — resolve o Bloqueio 3.
- [x] 1.4 Manter o arquivo em CommonJS (`require` / `module.exports`), igual a `mobile/eslint.config.js`. O `package.json` do mobile não tem `"type": "module"`.
- [x] 1.5 Comentar no arquivo **por que** cada bloco existe (wa-sqlite importa `.wasm` como asset; `SharedArrayBuffer` exige isolation). Sem isso o próximo dev remove o patch por parecer gambiarra.

### Task 2 — Trocar `web.output` para `single` (AC: #3, #4)

- [x] 2.1 Em `mobile/app.json`, `expo.web.output`: `"static"` → `"single"`. **Única** alteração no arquivo.
- [x] 2.2 Confirmar por leitura que nada mais no repo depende de renderização estática (`grep -rn "output" mobile/app.json`; não existe `+html.tsx` nem API routes no projeto).

### Task 3 — `API_BASE_URL` a partir do ambiente (AC: #4)

- [x] 3.1 Em `mobile/src/utils/constants.ts`, fazer `API_BASE_URL` ler `process.env.EXPO_PUBLIC_API_URL` quando definido, mantendo o valor atual como fallback. `.env.example` **já declara** essa variável desde a 3.0 — nada é inventado aqui, só ligado.
- [x] 3.2 Preservar o comportamento nativo: sem a variável, `__DEV__` continua resolvendo para `http://10.0.2.2:3000` (emulador Android) e produção para `https://api.pureurban.com`. Isto **não** pode virar uma quebra da Story 1.7.
- [x] 3.3 Criar/ajustar `mobile/.env` local com `EXPO_PUBLIC_API_URL=http://localhost:3000`. **Nunca commitar `.env`** (`project-context.md`, Regras Críticas).
- [x] 3.4 Atualizar o comentário de `.env.example` registrando que no alvo web o valor precisa ser `http://localhost:3000`.

### Task 4 — Habilitar CORS na API para o dev server (AC: #4)

- [x] 4.1 Em `api/src/main.ts`, adicionar `app.enableCors()` antes do `app.listen(...)`. Restringir a origem por variável de ambiente (default `http://localhost:8081`) em vez de liberar `*`.
- [x] 4.2 Confirmar que o header customizado `X-Idempotency-Key` passa no preflight. O `cors` do NestJS reflete `Access-Control-Request-Headers` por padrão; se a origem for restringida à mão, `allowedHeaders` precisa incluí-lo — sem isso o check-in da 3.3b volta `400 MISSING_IDEMPOTENCY_KEY` no browser.
- [x] 4.3 Verificar o preflight de fato: `curl -i -X OPTIONS http://localhost:3000/api/v1/auth/login -H "Origin: http://localhost:8081" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,x-idempotency-key"` → `204` com `Access-Control-Allow-Origin`.
- [x] 4.4 **Nada mais** em `api/` é tocado. Nenhum controller, guard, filter ou DTO.

### Task 5 — Smoke test de bundle (AC: #3)

- [x] 5.1 `cd mobile && npx expo export --platform web` → sai com `Exported: dist`.
- [x] 5.2 Confirmar `find mobile/dist/assets -name '*.wasm'` (o arquivo fica aninhado em `assets/node_modules/expo-sqlite/web/wa-sqlite/` — um `ls | grep` não-recursivo não o encontra) e `ls mobile/dist/_expo/static/js/web | grep worker`.
- [x] 5.3 Registrar a saída no Debug Log. Este comando é a regra 16 da Architecture §8 (smoke test de CI) — a story prova que ele passa; **ligar a pipeline de CI é escopo de outra story**, não desta.
- [x] 5.4 Apagar `mobile/dist/` ao final (já está no `.gitignore`, mas não deixe lixo na árvore).

### Task 6 — Verificação em execução (AC: #2, #4, #5, #6, #7)

Roteiro manual. **Nenhuma linha pode ser marcada `[x]` sem ter sido executada** — Architecture §8, regra 15. A story 3.3b está `in-progress` justamente por causa disso.

**Bloco A — contra a API real** (`EXPO_PUBLIC_USE_MOCKS=0`)

- [x] 6.1 `docker compose up`; `cd api && npx prisma migrate deploy && npm run start:dev`. **[DESVIO — o seed prescrito não existe]** `npm run seed` não é script (`api/package.json:51-53` tem `seed` só como hook do Prisma), `npx prisma db seed` responde `No seed command configured` e `prisma/seed.ts` falha sem `adapter` sob Prisma 7. O admin foi criado por `POST /api/v1/auth/register`. Registrado em `deferred-work.md` e endereçado pela Story 1.8.
- [x] 6.2 `cd mobile && npm run web`. Abrir **`http://localhost:8081`** — nunca o IP de LAN (ver § *Contexto seguro*).
- [x] 6.3 `curl -sI http://localhost:8081/ | grep -i cross-origin` → as duas linhas presentes. **(AC #2)**
- [x] 6.4 No console do browser: `window.crossOriginIsolated` → `true`. **(AC #2)**
- [x] 6.5 **[DIFERIDA (Bloqueio 5) — NÃO EXECUTADA]** ~~Login com `admin@pureurban.dev` / `admin123456`. Na aba Network: a chamada vai para `localhost:3000`, o preflight passa, o app navega para `/(admin)/home`. **(AC #4)**~~
- [x] 6.6 Console limpo de erros de `SharedArrayBuffer` / abertura de banco; `offline_queue` existe. **(AC #6)**
- [x] 6.7 **[DIFERIDA PARCIAL (Bloqueio 5) — mecanismo MMKV verificado, ciclo real NÃO EXECUTADO]** ~~F5. Sessão preservada; `localStorage` com as chaves `mmkv.default\...`; cache do Query reidratado. **(AC #5)**~~

**Bloco B — contra o MSW** (`EXPO_PUBLIC_USE_MOCKS=1`, reiniciar o dev server)

- [x] 6.8 **[DIFERIDA PARCIAL (Bloqueio 6) — MSW comprovadamente intercepta, app NÃO SOBE]** ~~Login com `motorista@pureurban.com` (senha livre). Confirmar no console a linha `[mocks] MSW ativo` — o MSW precisa interceptar **no browser**, não só no runtime nativo. **(AC #4)**~~
- [x] 6.9 **[DIFERIDA (Bloqueios 5 e 6) — NÃO EXECUTADA]** ~~Navegar para `/scan` → conceder permissão → webcam abre na moldura → apontar um QR de aluno (gere um em `/qr-code` com `aluno@pureurban.com` noutra aba, ou num leitor qualquer com o payload da 3.2b) e ver o fluxo de check-in reagir. **(AC #7)**~~
- [x] 6.10 Registrar no Debug Log **o que foi executado e o que não foi**, com a evidência de cada linha.

> **Se o MSW não interceptar no browser**, pare e registre em vez de improvisar. `src/mocks/server.ts` usa `setupServer` de `msw/native`, e o `package.json` do msw mapeia a condição `browser` desse subpath para `null`. O bundle **compilou** na verificação desta story (a resolução caiu no fallback file-based), mas o comportamento em runtime não foi exercitado. Se falhar, é achado novo: documente e trate como questão para o Lucas — **não** reescreva a camada de mocks aqui (AC #8).

### Task 7 — Documentar em `mobile/README.md` (AC: #9)

- [x] 7.1 `mobile/README.md` ainda é o template do `create-expo-app` e cita o **Expo Go**, que a Architecture §1 declara fora do alvo. Substituir a seção "Get started" por instruções reais do projeto.
- [x] 7.2 Documentar: pré-requisitos (docker + api), `npm run web`, obrigatoriedade de `http://localhost:8081`, e a flag `EXPO_PUBLIC_USE_MOCKS`.
- [x] 7.3 Incluir a seção *Limitações do alvo web* copiando a tabela de § *Limitações a documentar* desta story.
- [x] 7.4 Registrar que servir `mobile/dist/` estático exige os mesmos headers COOP/COEP — o `enhanceMiddleware`/patch só vale para o dev server.

### Task 8 — Regressão e portões (AC: #8)

- [x] 8.1 `cd mobile && npx tsc --noEmit` → 0 erros (baseline atual é 0).
- [x] 8.2 `cd mobile && npm run lint` → limpo, sem `eslint-disable` novo.
- [x] 8.3 `cd api && npm run lint; npm test; npm run test:e2e` → **sem regressão contra o baseline** (critério corrigido no review de 28/08/2026: o texto original dizia "verde", que nunca foi verdade — o lint tem 203 problemas pré-existentes e 1 arquivo e2e falha, ambos idênticos com e sem a alteração, medidos com `git stash`. Note também que a cadeia `&&` original abortaria no lint e nunca chegaria aos testes; por isso `;`). O `enableCors` não pode quebrar os e2e (eles montam a app a partir do `AppModule` e não executam o `bootstrap`, então tendem a ser indiferentes — confirme, não presuma).
- [x] 8.4 `git status --porcelain` → os **6 arquivos de produto** declarados: `mobile/metro.config.js` (novo), `mobile/app.json`, `mobile/src/utils/constants.ts`, `mobile/.env.example`, `mobile/README.md`, `api/src/main.ts`. Qualquer arquivo além destes é violação da AC #8 e precisa ser justificado explicitamente na Completion Note. **Justificativa dos caminhos adicionais (review de 28/08/2026):** a árvore tem 9 caminhos, não 6 — os 3 extras são artefatos do próprio workflow BMAD, não código de produto: este story file (novo), `sprint-status.yaml` (transição de status) e `deferred-work.md` (registro dos Bloqueios 5, 6 e do seed quebrado, exigido pelo próprio processo de defer). Nenhum deles é UI, store, service, hook ou componente, então a proibição material da AC #8 continua intacta.
- [x] 8.5 Confirmar `git diff mobile/package.json mobile/package-lock.json` **vazio**. Nenhuma dependência muda nesta story.

### Review Findings

_Code review adversarial de 28/08/2026 — 3 camadas (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Todos os achados abaixo foram confirmados por leitura do código, não apenas relatados._

_**Todos os 22 patches foram aplicados em 28/08/2026.** As 3 decisões foram ratificadas pelo Lucas (opção (a) nas três). Portões após a aplicação: `mobile: tsc --noEmit` 0 erros; `mobile: npm run lint` limpo; `api: tsc --noEmit` 31 erros, todos em `*.spec.ts`, nenhum em `main.ts` (baseline); `api: npm test` 183/201 passando, **idêntico ao baseline medido com `git stash`** — as 18 falhas são testes de integração contra banco real, com o Docker fora do ar._

**Decisões resolvidas pelo Lucas em 28/08/2026 — viram patches**

- [x] [Review][Patch] `EXPO_PUBLIC_API_URL` agora sobrescreve produção — `__DEV__` deixou de ser garantia — `mobile/src/utils/constants.ts:6-8` põe a variável ACIMA do ternário, e `@expo/env` carrega `.env` em todos os modos, produção inclusa (`node_modules/@expo/env/build/index.js:103` — a lista é `[.env.${mode}.local, .env.local, .env.${mode}, .env]` para qualquer `NODE_ENV`). O `README.md:26` manda `cp .env.example .env` e o `.env.example:8` traz `http://localhost:3000`. Consequência: qualquer `expo export` na máquina de um dev que seguiu o README embute `localhost:3000` no bundle e `https://api.pureurban.com` nunca é usado — sem erro, sem aviso. Antes desta mudança era estruturalmente impossível. Inconsistência interna: `src/mocks/index.ts:1` protege a flag de mocks com `__DEV__ &&`; a URL da API, o dado mais perigoso dos dois, não tem proteção equivalente. **Opções:** (a) `__DEV__ ? (env || 10.0.2.2) : (env || api.pureurban.com)` — preserva a precedência em dev e mantém o fallback de produção; (b) `__DEV__ && env` — produção ignora a variável por completo; (c) aceitar como está e tratar por disciplina de build. **→ Decisão do Lucas (28/08/2026): opção (a)** — `__DEV__ ? (env || '10.0.2.2:3000') : (env || 'api.pureurban.com')`, preservando a precedência da variável em dev e o fallback de produção.
- [x] [Review][Patch] Política de CORS: porta fixa e allowlist de headers fixa — `api/src/main.ts:16,20`. Dois pontos: (1) o default `http://localhost:8081` assume uma porta que o Expo não garante — quando 8081 está ocupada o CLI sobe em outra (a própria verificação desta story rodou em **8084**, ver Debug Log), e aí `crossOriginIsolated` continua `true`, o app carrega, e só o login falha por CORS; (2) `allowedHeaders` é uma lista fechada de 3 headers, e `src/services/api-client.ts:171-174` expõe `extraHeaders` em `post`/`patch` — um quarto header futuro (`X-Request-Id`, `X-Client-Version`) passa em `npm test` e `test:e2e` (que montam o `AppModule` e nunca executam o `bootstrap`) e morre no preflight só no browser. **Opções:** (a) fixar a porta em `npm run web` (`expo start --web --port 8081`) e manter a allowlist explícita; (b) aceitar `origin: /^http:\/\/localhost:\d+$/` quando `NODE_ENV !== 'production'`; (c) deixar o `cors` refletir `Access-Control-Request-Headers` em vez da lista fixa. **→ Decisão do Lucas (28/08/2026): opção (a)** — fixar a porta em `npm run web` (`expo start --web --port 8081`) e manter a allowlist explícita de headers.
- [x] [Review][Patch] O seed quebrado sob Prisma 7 não tem dono no rastreamento — `deferred-work.md` ganhou 3 itens neste diff; `sprint-status.yaml:87-91` atribui os Bloqueios 5 e 6 à Story 3.6 e **não menciona o terceiro**. Consequência: a 3.6 fecha os dois bloqueios, alguém declara o ambiente desbloqueado, e a primeira story que precise de dados semeados descobre que continua sem ambiente reproduzível. **Opções:** (a) story técnica própria antes do Épico 4; (b) anexar à 3.6; (c) deixar registrado apenas em `deferred-work.md` sem dono. **→ Decisão do Lucas (28/08/2026): opção (a)** — story técnica própria antes do Épico 4.

**Correções**

- [x] [Review][Patch] `CORS_ORIGIN` é variável nova e não existe em lugar nenhum além do código [api/.env.example, mobile/README.md, docker-compose.yml] — `grep -rn CORS_ORIGIN` fora de `node_modules` retorna só `api/src/main.ts:11,16`. Deploy sem a variável faz a API anunciar `Access-Control-Allow-Origin: http://localhost:8081` em produção e bloquear todo cliente web real.
- [x] [Review][Patch] `CORS_ORIGIN` vazia ou com barra final quebra tudo em silêncio [api/src/main.ts:16-19] — `''.split(',').map(trim).filter(Boolean)` produz `[]`; verificado em `node_modules/cors/lib/index.js:36-58`: `[]` é truthy, cai no ramo `isOriginAllowed`, o loop não roda, e o header nunca é emitido. Idem `http://localhost:8081/` — o `Origin` do browser nunca tem barra final e a comparação é por igualdade estrita. Sem `throw` e sem log da lista resolvida.
- [x] [Review][Patch] O README documenta o MSW como modo utilizável, e o Bloqueio 6 prova que não é [mobile/README.md:51-56] — arquivo **entregue** e alvo direto da AC #9. Com a flag ligada, `enableMocking()` roda duas vezes, o segundo `server.listen()` lança e o app renderiza "Falha ao inicializar os mocks (MSW)". O README manda ligar a flag sem nenhum aviso.
- [x] [Review][Patch] O README apresenta o alvo web como "verificação do dia a dia" sem dizer que nenhuma tela do produto renderiza [mobile/README.md:13,46-47,72] — confirmado em `src/app/_layout.tsx:87`: o layout raiz renderiza `{isDbReady && isMockReady && isAuthenticated && <AppTabs />}`, sem `<Slot />`/`<Stack />`/`<Tabs />`. A tabela de contexto seguro ainda diz que pelo IP de LAN "o **login** falha" e "a câmera não abre" — implicando que em `localhost` funcionam. A AC #7 foi fechada como **diferida** e a webcam nunca foi aberta em contexto nenhum.
- [x] [Review][Patch] O README não leva um segundo dev a um login funcional [mobile/README.md:18-27] — os pré-requisitos param em `docker compose up -d` + `npm run start:dev` + `.env`. Faltam `npx prisma migrate deploy` (o Debug Log registra migração pendente na verificação) e a criação de usuário (o seed está quebrado; o admin teve de sair de `POST /api/v1/auth/register`). É exatamente o que a AC #9 promete.
- [x] [Review][Patch] `cp .env.example .env` quebra o alvo emulador Android [mobile/README.md:23-27, mobile/.env.example:8] — o código de `constants.ts:6-8` preserva o fallback quando a variável está **ausente**, mas o README instrui todo dev a criar um `.env` que a define como `localhost:3000`, que não resolve dentro do emulador. O fallback `10.0.2.2` fica inalcançável por quem segue o README. Contraria a Task 3.2 ("não pode virar uma quebra da Story 1.7").
- [x] [Review][Patch] `expo start --web --https` contorna o patch de COOP/COEP [mobile/metro.config.js:27-36] — só `http.createServer` é patchado. `node_modules/expo/node_modules/@expo/cli/.../runServer-fork.js:92-95` escolhe `https.createServer(secureServerOptions, ...)` quando TLS está ativo. Como o próprio README diz que a câmera exige secure context, `--https` é a saída natural para testar fora de `localhost` — e nesse modo `SharedArrayBuffer` some e `initializeDatabase()` quebra sem pista de origem.
- [x] [Review][Patch] Servir `dist/` estático precisa de rewrite catch-all, não só dos headers [mobile/README.md:77-83, mobile/app.json:23] — `web.output: "single"` (mudança deste mesmo commit) elimina o HTML por rota. Quem seguir a seção à risca sobe um estático com COOP/COEP corretos e recebe 404 em todo acesso direto a `/scan`, `/qr-code` ou `/login`.
- [x] [Review][Patch] `.env.example` dá o diagnóstico errado para erro de CORS [mobile/.env.example:4-5] — o texto atrela CORS à `EXPO_PUBLIC_API_URL` ("a API só libera CORS para a origem do dev server"). CORS é decidido pela origem do **documento** (`localhost:8081`), não pela URL da API. Manda o dev mexer no campo errado em vez de `CORS_ORIGIN`.
- [x] [Review][Patch] Robustez do `metro.config.js` — três itens de uma linha cada [mobile/metro.config.js:20,28,45]: (a) o comentário ancora a ordem em "ANTES de `getDefaultConfig`", que não cria servidor nenhum — a restrição real é antes de `runServer()`, e um dev que reorganize confiando no comentário quebra o patch em silêncio; (b) sem guarda de idempotência (`http.__coopPatched`), uma segunda avaliação do módulo no mesmo processo faz `originalCreateServer` capturar a função já patchada e empilhar listeners; (c) `assetExts.push('wasm')` sem `includes` duplica a extensão e marca `.wasm` como asset também em builds nativos.
- [x] [Review][Patch] As Completion Notes ainda dizem que a story não está pronta para review [1-6-...md:610] — "**Status: implementação completa, verificação parcial.** _(Atualizado em 27/08/2026: o cabeçalho original dizia "não está pronta para review"; a decisão do Lucas de diferir as ACs #4, #5 e #7 — registrada no Change Log — fechou a story para review assim mesmo.)_" contra o front matter `Status: review` (linha 7) e `sprint-status.yaml:65`. O Change Log registra a reversão; o cabeçalho das Completion Notes não.
- [x] [Review][Patch] As Dev Notes ainda afirmam o que o próprio Debug Log falsifica [1-6-...md:351-358] — "No alvo web isso deixa de ser bloqueio de verificação: as rotas são alcançáveis pela barra de endereços", seguido da tabela de URLs. As linhas 560-562 e o `deferred-work.md` dizem que isso é falso e verificado como falso. Quem lê de cima para baixo bate na orientação errada ~200 linhas antes da correção.
- [x] [Review][Patch] `deferred-work.md` atribui o Bloqueio 6 ao StrictMode, que não existe no projeto — `grep -rn StrictMode mobile/src/` e em `expo-router/build/` não retornam nada; `_layout.tsx:37-49` é um efeito com deps `[]` sem wrapper. A causa provável é Fast Refresh / remount. Não é academicismo: a correção sugerida na própria entrada — guarda de módulo (`let started = false`) — **não sobrevive** a um Fast Refresh que reavalia o módulo, enquanto a alternativa citada (`if (server.listening) return`) sobrevive. Do jeito que está, a Story 3.6 implementa a guarda errada e o bug reabre.
- [x] [Review][Patch] Subtask 6.1 marcada `[x]` com um comando que não existe [1-6-...md:170, AC #4 na linha 61] — manda `cd api && npm run seed`; `api/package.json:51-53` tem `seed` apenas como hook do Prisma, não como script. O desvio está honestamente documentado no Debug Log (linhas 474-479), mas as duas linhas normativas nunca foram corrigidas e a 6.1 não tem rótulo de desvio, ao contrário de 6.5/6.7/6.8/6.9. A 3.4b/3.5b vai reusar o roteiro e reabrir a mesma investigação.
- [x] [Review][Patch] Subtask 8.3 marcada `[x]` embora o portão que ela define não esteja verde [1-6-...md:197,591-593] — o texto pede `npm run lint && npm test && npm run test:e2e` → **verde**; o Debug Log reporta 203 problemas no lint e 1 arquivo e2e falhando. "Idêntico ao baseline, zero regressão" é uma decisão de engenharia defensável, mas não é o que a subtask diz — e a cadeia `&&` abortaria no lint sem nunca chegar aos testes. Amarrar o critério a "sem regressão vs. baseline".
- [x] [Review][Patch] Task 8.4 e File List não batem com a árvore [1-6-...md:198,594,626-635] — `git status` mostra 9 caminhos, não 6. A linha de auditoria justifica "os 2 artefatos do próprio workflow BMAD (o story file e `sprint-status.yaml`)" e **nunca nomeia `deferred-work.md`**, que é uma adição real de 15 linhas. A justificativa que a Task 8.4 exige "na Completion Note" não está nas Completion Notes.
- [x] [Review][Patch] A story se contradiz sobre o próprio raio de alcance [1-6-...md:90,198 vs 307,318] — AC #8 e Task 8.4 dizem **6 arquivos**; as Dev Notes dizem **5** duas vezes.
- [x] [Review][Patch] O comando de verificação da Task 5.2 não acha o artefato que ela diz ter achado [1-6-...md:160,497] — `ls mobile/dist/assets | grep wasm` é não-recursivo, e o arquivo está em `dist/assets/node_modules/expo-sqlite/web/wa-sqlite/`. A AC #3 continua atendida; o comando registrado é que não produz a evidência registrada.
- [x] [Review][Patch] A tabela de contexto seguro omite o consumidor mais crítico [mobile/README.md:44-47] — lista `crypto.randomUUID` e `getUserMedia`, e não menciona que `crossOriginIsolated`/`SharedArrayBuffer` e o OPFS do wa-sqlite também exigem secure context. Pelo IP de LAN o dev perde o Tier 2 inteiro — exatamente o que o `metro.config.js` existe para viabilizar.

**Diferidos**

- [x] [Review][Defer] Falha de `initializeDatabase()` só é logada — o app segue sem fila offline e sem sinal [mobile/src/app/_layout.tsx:30-34] — diferido, pré-existente. `.catch(console.error).finally(() => setIsDbReady(true))` abre o portão mesmo com o banco fechado. É decisão deliberada da 1.5 ("modo degradado preferível a crash") e a AC #8 proíbe tocar em `_layout.tsx` nesta story. Vira relevante quando o Tier 2 for exercitado de verdade (3.4b / Story 1.7).


---

## Dev Notes

### Bloqueio 1 — `wasm` em `assetExts` (verificado)

`node_modules/expo-sqlite/web/worker.ts:22` faz `import wasmModule from './wa-sqlite/wa-sqlite.wasm'`. O `assetExts` default do Expo (`@expo/metro-config/build/ExpoMetroConfig.js:213-219`) inclui `db`, `heic` e `avif`, **não** `wasm`.

Falha reproduzida em 27/08/2026, idêntica à registrada nos Debug Logs da 3.2b e da 3.3b:

```
Unable to resolve module ./wa-sqlite/wa-sqlite.wasm from
  node_modules/expo-sqlite/web/worker.ts
Import stack: … → src/lib/database.ts → src/app/_layout.tsx
```

A cadeia começa em `src/lib/database.ts:1` (`import * as SQLite from 'expo-sqlite'`), importado por `_layout.tsx` para o `initializeDatabase()` do boot. **Não é opcional nem lazy** — está no caminho de inicialização.

### Bloqueio 2 — `web.output: "static"` vs. MMKV (verificado, não documentado em lugar nenhum)

Corrigido o Bloqueio 1, o export falha de novo — agora em runtime de prerender:

```
Metro error: Tried to access storage on the server. Did you forget to call this in useEffect?
  at getLocalStorage (react-native-mmkv/lib/web/getLocalStorage.js:16)
  at Object.getString (react-native-mmkv/lib/createMMKV/createMMKV.web.js:65)
  at Object.getAccessToken (src/lib/storage.ts:13)
  at factory (src/stores/auth.store.ts:18)
  at factory (src/app/_layout.tsx:14)
```

**Causa:** `app.json` declara `web.output: "static"`, que faz o Expo Router renderizar cada rota em Node no build. `auth.store.ts:18-19` lê o MMKV em **escopo de módulo** (`const hasPersistedToken = Boolean(tokenStorage.getAccessToken())`) — hidratação de sessão, decisão deliberada da 3.2b. No servidor não existe `localStorage`, e o shim web do MMKV lança.

**Correção correta é `"single"`, não mexer no `auth.store.ts`:**

- `single` é o **default** do Expo e produz um SPA — que é o que este produto é. `static` existe para indexação em buscadores, irrelevante para um app de transporte escolar atrás de login.
- `static` e `server` afetam **`expo start` e `expo export` igualmente** (docs do Expo). Ou seja, o Bloqueio 2 derrubaria também o `npm run web`, não só o export.
- Mexer no `auth.store.ts` seria alteração de código de aplicação — proibido pela AC #8 — e pioraria o design: mover a hidratação para `useEffect` introduz um frame autenticado-como-anônimo que a store hoje não tem.

Com `wasm` + `single`, o export foi executado e **passou**: 9 bundles web, `wa-sqlite.<hash>.wasm` (621KB) emitido, `worker-*.js` gerado.

### Bloqueio 3 — Os headers COOP/COEP precisam chegar no **documento HTML** ⚠️

`node_modules/expo-sqlite/web/WorkerChannel.ts:104-106` cria `new SharedArrayBuffer(...)`. Todo browser moderno só expõe `SharedArrayBuffer` sob **cross-origin isolation**, que exige os dois headers **na resposta do documento**.

A documentação oficial do Expo (SDK / SQLite) manda usar `config.server.enhanceMiddleware`. **Isso não basta neste projeto, e foi verificado com `curl`:**

| Recurso | `enhanceMiddleware` | patch de `createServer` |
|---|---|---|
| `/_expo/static/...` (bundle) | ✅ headers presentes | ✅ |
| `/` (documento HTML) | ❌ **headers ausentes** | ✅ |

**Por quê:** `@expo/cli/build/src/start/server/metro/instantiateMetro.js:295-301` faz `middleware.use(metroMiddleware)` — o middleware customizado entra no **fim** da pilha connect do Expo. O HTML do SPA é servido por um middleware anterior, que nunca chega até lá. Verificado também que o Expo chama `enhanceMiddleware` **sem** o argumento `server`, então `server.prependListener` a partir dali não é opção.

**Abordagem verificada como funcional** — patch de `http.createServer` no topo do `metro.config.js`, antes de `getDefaultConfig`:

```js
const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');

// O wa-sqlite (expo-sqlite no alvo web) usa SharedArrayBuffer, que só existe sob
// cross-origin isolation — e a isolation é decidida pelos headers do DOCUMENTO.
// `server.enhanceMiddleware`, que a doc do Expo prescreve, entra no fim da pilha
// connect do Expo e alcança só as rotas de bundle: o index.html sai sem headers e
// `crossOriginIsolated` fica false. Patchar `createServer` põe o listener antes de
// toda a pilha, então vale para o documento também.
const originalCreateServer = http.createServer;
http.createServer = function patchedCreateServer(...args) {
  const server = originalCreateServer.apply(this, args);
  server.prependListener('request', (_req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  });
  return server;
};

const config = getDefaultConfig(__dirname);

// wa-sqlite importa o .wasm como asset (expo-sqlite/web/worker.ts:22).
config.resolver.assetExts.push('wasm');

module.exports = config;
```

Resultado medido com esse arquivo: `curl -sI http://localhost:8084/` devolveu `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: credentialless` no documento **e** nas rotas de bundle.

**Por que `credentialless` e não `require-corp`:** `require-corp` exige header `CORP` em todo subrecurso cross-origin; `credentialless` não. É o valor que a doc do Expo prescreve. Safari não suporta `credentialless` — irrelevante aqui (o ambiente do dev é Windows/WSL), mas entra nas limitações do README.

**COEP não bloqueia as chamadas à API.** COEP governa subrecursos; `fetch` em modo CORS não é afetado. O `api-client.ts` usa `fetch` com header `Authorization`, portanto modo CORS. Se ainda assim aparecer bloqueio, o remédio é `Cross-Origin-Resource-Policy: cross-origin` nas respostas da API — **não** afrouxar o COEP, que desligaria o `SharedArrayBuffer` e derrubaria o AC #6.

> Se preferir tentar primeiro a receita oficial (`server.enhanceMiddleware`), tudo bem — mas **valide com o `curl` da Task 6.3 no `/`**, não só no bundle. Se o documento vier sem headers, use o patch acima. Não declare a AC #2 atendida com base no bundle.

### Bloqueio 4 — A API não é alcançável do browser (verificado)

Dois problemas independentes, ambos no caminho do AC #4:

**4a. `API_BASE_URL` aponta para um alias de emulador.** `mobile/src/utils/constants.ts` é uma linha:

```ts
export const API_BASE_URL = __DEV__ ? 'http://10.0.2.2:3000' : 'https://api.pureurban.com'
```

`10.0.2.2` é o alias do host visto de dentro do emulador Android. No browser não resolve. `mobile/.env.example` **já declara** `EXPO_PUBLIC_API_URL=http://localhost:3000` desde a 3.0, mas **nada no código lê essa variável** (`grep -rn "EXPO_PUBLIC_API_URL" mobile/src` não retorna nada). A Task 3 fecha essa lacuna.

**4b. A API não tem CORS.** `api/src/main.ts` tem 12 linhas e não chama `app.enableCors()`. O browser em `localhost:8081` chamando `localhost:3000` é cross-origin: o preflight falha e nenhuma requisição sai. A Task 4 corrige.

**Sobre a AC #8 do épico ("nenhuma alteração em código de aplicação").** As Tasks 3 e 4 tocam código. A leitura correta: o épico proíbe **redesenhar telas, stores e services para acomodar o web** — e nada disso acontece aqui. As duas edições são de bootstrap/configuração, mínimas, e nenhuma inventa design novo: a 3a apenas liga uma variável que o `.env.example` já promete, a 4b é configuração de servidor. **Sem elas o AC #4 do épico é literalmente impossível.** A AC #8 desta story fixa o limite exato em 6 arquivos e a Task 8.4 o verifica.

### Que usuário usar em cada AC

`api/prisma/seed.ts` cria **um único usuário**: `admin@pureurban.dev` / `admin123456`, role `ADMIN`, empresa "PureUrban Dev". Não há motorista nem aluno no seed. Isso divide a verificação em dois blocos, e a Task 6 já está organizada assim:

| Objetivo | Ambiente | Usuário |
|---|---|---|
| Provar CORS + `API_BASE_URL` (**AC #4**) | API real (`USE_MOCKS=0`) | `admin@pureurban.dev` / `admin123456` |
| Provar webcam + QR (**AC #7**) | MSW (`USE_MOCKS=1`) | `motorista@pureurban.com`, senha livre |

**Não crie um motorista no seed** para facilitar o teste — seria alteração de código fora dos 6 arquivos da AC #8. Se quiser um DRIVER real, crie via `POST /api/v1/drivers` autenticado como admin (Story 2.3, `done`) e registre no Debug Log; é opcional e não é requisito de nenhuma AC.

### Contexto seguro — use `http://localhost`, nunca o IP de LAN

Duas APIs do caminho crítico só existem em **secure context** (HTTPS ou `localhost`):

| API | Onde é usada | Quebra se… |
|---|---|---|
| `crypto.randomUUID()` | `expo-crypto` → `auth.store.ts:44` (`qrSessionStorage.setSessionId`) no **login** | acesso por `http://192.168.x.x:8081` |
| `navigator.mediaDevices.getUserMedia` | `expo-camera` web → `QrScanner` | idem |

`localhost` é tratado como contexto seguro mesmo em HTTP. Abrir pelo IP de LAN faz o **login** falhar (não a câmera só) — sintoma confuso o bastante para custar uma tarde. Vai na Task 7.2 e na tabela de limitações.

### Substituições nativo → web (Architecture §3, verificadas nas dependências instaladas)

| Nativo | Web | Verificação |
|---|---|---|
| MMKV (mmap, Nitro) | `localStorage` | `react-native-mmkv/src/createMMKV/createMMKV.web.ts` — chaves prefixadas `mmkv.default\<key>`. Sem criptografia; `encrypt`/`recrypt` lançam |
| expo-sqlite (SQLite nativo) | wa-sqlite (WASM/OPFS) | `expo-sqlite/build/ExpoSQLite.web.js` + `web/worker.ts`. Exige `assetExts` e COOP/COEP |
| expo-camera (nativo) | `getUserMedia` + `useWebBarcodeScanner` | `expo-camera/build/web/useWebBarcodeScanner.js` |

**A resolução `.web.ts`/`.web.tsx` é automática** no Metro para `platform=web` (`unstable_conditionsByPlatform.web: ['browser']`, `resolverMainFields: ['react-native','browser','main']`). **Não** crie variantes `.web.tsx` nesta story — nenhuma é necessária, e criar uma viola a AC #8.

### QR na webcam — o que já foi verificado (não re-investigue)

- **A detecção funciona em qualquer browser.** `WebBarcodeScanner.js:40-47` usa `globalThis.BarcodeDetector` quando existe e cai em `await import('barcode-detector')` quando não. `barcode-detector@^3.0.0` é **dependência real** do `expo-camera` e já está em `node_modules`. Chrome no Windows/Linux não expõe `BarcodeDetector` nativo — o polyfill cobre. **Não adicione nenhuma lib de QR.**
- **`facing="back"` não é bloqueio.** `qr-scanner.tsx:45` passa `facing="back"` → `facingMode: 'environment'` (`WebConstants.js`). Notebook só tem webcam frontal, mas `getAnyUserMediaAsync` (`WebUserMediaManager.js:15-27`) repete a chamada com `ignoreConstraints = true` quando a constraint falha. Degrada para a webcam disponível. **Não altere o `facing`** — é código da 3.3b e mudá-lo viola a AC #8.
- **Permissão:** `scan.tsx` usa `useCameraPermissions` e trata promise rejeitada de `Linking.openSettings()` (commit `845503b`). No browser a permissão é um prompt nativo; "abrir configurações" não tem equivalente e o caminho já está defendido.

### Como chegar nas telas — o shell de navegação ainda não existe

`app-tabs.tsx` e `app-tabs.web.tsx` **são os dois do template do Expo** (abas `Home` / `Explore`). Os grupos `(driver)` e `(student)` não estão no shell. Isso está registrado em `deferred-work.md` (review da 3.2b) e é **escopo da 3.6, não desta story**.

> ### ⚠️ CORRIGIDO EM 27/08/2026 — o parágrafo abaixo está ERRADO
>
> A verificação em execução provou o contrário: **as rotas NÃO são alcançáveis**.
> `src/app/_layout.tsx:87` não renderiza saída de router (`<Slot />` / `<Stack />` /
> `<Tabs />`), então `/login`, `/scan`, `/qr-code` e `/trip` devolvem tela em branco
> deslogado, e o template "Welcome to Expo" logado — sem erro no console. É o
> **Bloqueio 5**, registrado em `deferred-work.md` e escopo da Story 3.6. A tabela de
> URLs abaixo fica preservada como referência do que *deveria* funcionar depois da 3.6.

~~**No alvo web isso deixa de ser bloqueio de verificação:** as rotas são alcançáveis pela barra de endereços.~~

| Tela | URL |
|---|---|
| Login | `http://localhost:8081/login` |
| Viagem (driver) | `http://localhost:8081/trip` |
| Scan de QR (driver) | `http://localhost:8081/scan` |
| QR do aluno | `http://localhost:8081/qr-code` |

O login já redireciona por role (`login.tsx:40-47`), então o caminho normal também funciona. **Não construa o shell de navegação aqui.**

### Não faça (armadilhas desta story)

- ❌ **Não rode `npx expo install --check` nem atualize pacotes.** O `expo start` imprime ~17 avisos de versão (`expo-camera@55.0.22` vs esperado `~55.0.23`, `react-native@0.83.2` vs `0.83.10`, …). É drift **pré-existente**, sem relação com o alvo web — o export passa como está. Atualizar seria uma mudança enorme e não pedida, e arriscaria toda a base já entregue. A AC #8 proíbe.
- ❌ **Não troque o MMKV por AsyncStorage.** `project-context.md`, Anti-Patterns Proibidos. O shim web já resolve.
- ❌ **Não crie variantes `.web.tsx` de nada.** Nenhuma é necessária.
- ❌ **Não mexa em `auth.store.ts`, `storage.ts`, `database.ts` nem em tela alguma.** O Bloqueio 2 se resolve no `app.json`.
- ❌ **Não configure o CI.** A regra 16 da Architecture §8 é satisfeita provando que o comando passa; ligar o workflow é outra story.
- ❌ **Não feche a Story 3.3b.** Verificar o QR em execução é o passo 3 do handoff do sprint change proposal, uma ação separada e posterior. Aqui você só prova que o ambiente existe.
- ❌ **Não gere `openapi:types`.** `src/types/api.d.ts` é gerado e nada nesta story mexe no contrato (Architecture §8, regra 11).

### Limitações a documentar no README (AC #9)

| Limitação | Consequência |
|---|---|
| Suporte web do `expo-sqlite` é **alpha** (doc oficial) | Tier 2 (fila offline) é validado de verdade só no development build da Story 1.7 |
| MMKV vira `localStorage` | Sem criptografia; perfil de performance diferente; cota do browser (~5-10MB) |
| Exige `http://localhost:8081` | IP de LAN quebra **login** (`crypto.randomUUID`) e câmera (`getUserMedia`) |
| `COEP: credentialless` não é suportado no Safari | O alvo web é Chrome/Edge/Firefox. Não é restrição de produto — é ambiente de desenvolvimento |
| Câmera é webcam, não câmera de device | Ergonomia de embarque (NFR18-NFR20) não é avaliável aqui |
| Push (Story 4.4b), GPS em background e Tier 2 real | Exigem a Story 1.7 (Architecture §8, regra 15) |
| Servir `dist/` estático | Precisa dos mesmos headers COOP/COEP no servidor estático |

---

### Project Structure Notes

Arquivos desta story, e só estes:

| Arquivo | Ação | Papel |
|---|---|---|
| `mobile/metro.config.js` | **NEW** | `wasm` em `assetExts` + headers COOP/COEP |
| `mobile/app.json` | UPDATE | `web.output`: `static` → `single` (uma linha) |
| `mobile/src/utils/constants.ts` | UPDATE | `API_BASE_URL` lê `EXPO_PUBLIC_API_URL` |
| `mobile/.env.example` | UPDATE | Nota sobre o valor no alvo web |
| `mobile/README.md` | UPDATE | Comando + limitações (AC #9) |
| `api/src/main.ts` | UPDATE | `app.enableCors()` |

Convenções que continuam valendo (`project-context.md`): kebab-case nos arquivos mobile, alias `@/*` nos imports internos, 2 espaços, `.env` nunca commitado. `metro.config.js` fica na raiz de `mobile/` por convenção do Expo — não em `src/`.

**Sem testes automatizados nesta story.** O mobile não tem runner de testes configurado, e a AC #8 proíbe adicionar dependências. Os portões são `tsc --noEmit`, `npm run lint`, `expo export` e o roteiro manual da Task 6. Do lado da API, a suíte existente (`npm test`, `npm run test:e2e`) é a rede de proteção do `enableCors`.

---

### Inteligência da story anterior e do trabalho recente

**Story 1.5 (`done`)** entregou toda a infra que agora precisa de ambiente: `storage.ts` (MMKV v4 via `createMMKV`, `remove()` e não `delete()`), `database.ts` + `database-migrations.ts`, `query-client.ts` (`gcTime` 24h ≥ `maxAge`), `mmkv-persister.ts`, `api-client.ts` e `constants.ts`. A Completion Note da 1.5 já registrava `expo-doctor` 16/17 com falha "esperada por módulos nativos (MMKV requer dev build)" — **esse era o sinal do problema que esta story resolve**, cinco meses antes de ele ser nomeado.

**Stories 3.2b e 3.3b** foram implementadas e revisadas **sem nenhuma evidência de runtime**. Os dois Debug Logs registram a mesma falha de `wa-sqlite.wasm`. A 3.3b permanece `in-progress` de propósito, e a recomendação do dev continua de pé: rodar o roteiro da Task 9.3 daquela story (rajada, permissão negada, sem rede) antes de fechá-la. **Esta story cria o lugar onde isso passa a ser possível.**

**`deferred-work.md`** tem dois itens que o alvo web torna acionáveis e que **não são escopo aqui**: o shell de navegação (3.6) e o `onlineManager` do TanStack Query nunca ligado ao NetInfo (candidato a story técnica antes da 3.4b — no web o `OnlineManager` padrão até funciona, porque `window.addEventListener` existe; no nativo é inerte). Registre no Debug Log se observar comportamento relacionado, mas **não corrija aqui**.

**Padrão dos commits recentes** (`git log`): Conventional Commits, um commit por correção, escopo estreito, mensagem explicando o *porquê*. Ex.: `fix(boarding): handle rejected permission and settings promises (story 3.3b)`. Sugestão para esta story: `feat(mobile): enable the web execution target (story 1.6)`.

---

### Informação técnica atual (verificada em 27/08/2026)

- **Expo SDK 55.0.8**, Metro **0.83.3**, `@expo/metro-config` **55.0.11**, React Native **0.83.2**, React **19.2.0**.
- **`web.output`** aceita `single` (default, SPA), `static` (SSG por rota, Expo Router) e `server` (SSG + API routes). `static` e `server` afetam `expo start` **e** `expo export`.
- **`server.enhanceMiddleware`** está marcado como deprecated no próprio código do Expo CLI (`instantiateMetro.js:292`, "currently used to unify the middleware stacks"), continua funcional, e **não recebe o argumento `server`** — confirmado por probe.
- **`expo-sqlite` no web:** alpha. Requer `assetExts: ['wasm']` e `COEP: credentialless` + `COOP: same-origin`. Issues conhecidas de `SharedArrayBuffer is not defined` no repositório do Expo são exatamente o sintoma do Bloqueio 3.
- **`react-native-mmkv@4.3.0`** + **`react-native-nitro-modules@0.35.3`**: Nitro ausente do Expo Go em qualquer versão — reduzir o SDK não resolve nada (alternativa já avaliada e descartada no sprint change proposal).

---

### Referências

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 1.6: Ambiente de Execução Web do App Mobile`]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-23.md#4.3`] — origem da story, evidências e alternativa descartada
- [Source: `_bmad-output/planning-artifacts/architecture.md#1. Visão Geral & Restrições`] — "Expo Go não é alvo"
- [Source: `_bmad-output/planning-artifacts/architecture.md#Ambiente de Execução e Validação (Mobile)`] — dois ambientes e tabela de substituições
- [Source: `_bmad-output/planning-artifacts/architecture.md#8. Regras Obrigatórias para Agentes de IA`] — regras 14, 15 e 16
- [Source: `_bmad-output/project-context.md#Regras Criticas — Nao Ignorar`] — MMKV obrigatório, `.env` nunca commitado
- [Source: `_bmad-output/implementation-artifacts/1-5-setup-mobile-dependencias-e-configuracao-offline.md#Dev Agent Record`]
- [Source: `_bmad-output/implementation-artifacts/3-3b-escaneamento-de-qr-code.md#Debug Log References`] — falha do `wa-sqlite.wasm` e roteiro da Task 9.3
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md`] — shell de navegação e `onlineManager`
- [Source: https://docs.expo.dev/versions/latest/sdk/sqlite/] — headers COOP/COEP e status alpha do web
- [Source: https://docs.expo.dev/versions/latest/config/app/] — valores de `web.output`

---

## Questões em aberto para o Lucas

1. **AC #8 vs. Tasks 3 e 4.** O épico diz "apenas configuração"; `constants.ts` e `api/src/main.ts` são código. Sem eles o AC #4 do épico (login ponta a ponta contra a API local) é impossível. A story trata as duas como edições de bootstrap, mínimas e enumeradas — confirme se concorda, ou se prefere fatiar o CORS numa story separada da API.
2. **Origem do CORS.** Restringir a `http://localhost:8081` por variável de ambiente (proposto) ou liberar geral em dev? O primeiro é mais seguro e igualmente prático.
3. **Patch de `http.createServer`.** É a única forma verificada de colocar COOP/COEP no documento HTML com este Expo CLI. É invasivo o bastante para merecer sua ratificação — a alternativa seria aceitar `crossOriginIsolated: false` e perder o Tier 2 no web (o que esvaziaria a AC #6 e adiaria a 3.4b para a Story 1.7).
4. **Drift de versões.** `expo start` reporta ~17 pacotes atrás do esperado para o SDK 55. Esta story deliberadamente **não** mexe nisso. Vale uma story de manutenção antes do Épico 4?

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, workflow `bmad-dev-story`) — 27/08/2026.

### Debug Log References

Ratificações do Lucas antes de começar (§ *Questões em aberto*): (1) usar o patch de
`http.createServer`; (2) fazer as Tasks 3 e 4 nesta story; (3) origem do CORS restrita
por variável de ambiente.

**Ambiente usado na verificação.** `docker compose up -d` (postgres 16 + redis 7),
`npx prisma migrate deploy` (aplicou `20260814211717_add_boarding_records`, pendente),
`npx prisma generate`, `cd api && npm run start:dev`. A API local do Lucas roda em
`PORT=3001` (`api/.env`), não 3000 — por isso o `mobile/.env` **local** aponta para
`http://localhost:3001`. O `.env.example` mantém `3000`, que é o default de `main.ts`.

**Desvio 1 — o comando de seed da story não existe.** A story manda `npm run seed`;
não há esse script. O `seed` é um hook do Prisma (`package.json` → `prisma.seed`), e
`npx prisma db seed` responde `No seed command configured` porque o Prisma 7 moveu essa
configuração para `prisma.config.ts`. Rodando `prisma/seed.ts` direto, ele falha em
`new PrismaClient()` sem `adapter` — obrigatório no Prisma 7, exatamente o que o
`@ts-ignore` do próprio arquivo antecipa. **O seed está quebrado por drift do Prisma 7,
pré-existente e fora dos 6 arquivos da AC #8.** Para não tocá-lo, o admin do seed foi
criado pela própria API, que não é mudança de código:
`POST /api/v1/auth/register {"name":"PureUrban Dev","email":"admin@pureurban.dev","password":"admin123456"}`
→ `201`, role `ADMIN`, company `5284cf79-3e37-4a04-8eb4-8dbf4f09aa87`.

**Task 4.3 — preflight (AC #4, parte servidor).** Contra `localhost:3001`:

```
OPTIONS /api/v1/auth/login   Origin: http://localhost:8081
  → HTTP/1.1 204 No Content
    Access-Control-Allow-Origin: http://localhost:8081
    Access-Control-Allow-Headers: Content-Type,Authorization,X-Idempotency-Key
    Vary: Origin
OPTIONS /api/v1/boarding/check-in (content-type,authorization,x-idempotency-key) → 204
OPTIONS /api/v1/auth/login   Origin: http://evil.example
  → 204 SEM Access-Control-Allow-Origin  (browser bloqueia — restrição funcionando)
POST /api/v1/auth/login  Origin: http://localhost:8081
  → 201 + Access-Control-Allow-Origin: http://localhost:8081 + accessToken
```

**Task 5 — `npx expo export --platform web` (AC #3).** `Exported: dist`, exit 0.
9 bundles web; `dist/assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.7ca566fbbc2ec2a172c5aefa63a20f4b.wasm`
= **621.492 bytes**; `dist/_expo/static/js/web/worker-608afd3b273d320ee9acdf8cd257054b.js`
= 133KB. `dist/` apagado depois (5.4).

**Task 6.3 — headers COOP/COEP (AC #2).** O patch de `createServer` entrega nos dois
lugares, incluindo o documento HTML onde a receita oficial falha:

```
curl -sI http://localhost:8081/         → 200 + COOP: same-origin + COEP: credentialless
curl -sI http://localhost:8081/login    → 200 + os dois headers
curl -sI /node_modules/expo-router/entry.bundle?platform=web&...  → 200 + os dois headers
```

**Task 6.4 — cross-origin isolation em runtime (AC #2).** Verificado em Chromium
(Playwright 1.58.2, browser baixado para `~/.cache/ms-playwright` — não altera
`package.json`; scripts de verificação ficaram no scratchpad, fora da árvore do repo):

```
window.crossOriginIsolated      → true
typeof SharedArrayBuffer        → "function"
erros de SharedArrayBuffer no console → nenhum
```

**Task 6.6 — Tier 2 abriu de verdade (AC #6).** `initializeDatabase()` roda no boot do
`_layout.tsx` e gravou em OPFS (`navigator.storage.getDirectory()` → `expo-sqlite/`,
6 arquivos). Lendo os bytes do arquivo de 16.384 bytes, a DDL está lá:

```
CREATE TABLE offline_queue ( id TEXT PRIMARY KEY, operation TEXT NOT NULL,
  payload TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TEXT NOT NULL,
  attempts INTEGER DEFAULT 0, last_error TEXT )
```

Console sem nenhum erro. **wa-sqlite/OPFS funciona no alvo web.**

**MMKV sobre `localStorage` funciona (AC #5, parte do mecanismo).** Semeando
`mmkv.default\auth.accessToken`, `...\auth.refreshToken` e `...\auth.user` no
`localStorage` e recarregando, `auth.store.ts` hidratou e `isAuthenticated` virou
`true` — o prefixo é exatamente o documentado. O que **não** foi possível verificar é o
ciclo real (login → F5 → sessão preservada → cache do Query reidratado), pelo Bloqueio 5
abaixo.

---

#### ⚠️ Dois bloqueios NOVOS, além dos quatro que a story mapeou

Ambos são **código de aplicação do mobile**, que a AC #8 proíbe tocar aqui. Foram
verificados em execução, não deduzidos.

**Bloqueio 5 — `src/app/_layout.tsx` nunca renderiza a saída do router.**
O layout raiz não tem `<Slot />`, `<Stack />` nem `<Tabs />`. Ele renderiza
`<AnimatedSplashOverlay />` e, só quando autenticado, `<AppTabs />` — que é o
`NativeTabs` do template do Expo, com os triggers `index` e `explore` apenas. Nenhum
dos grupos `(auth)`, `(admin)`, `(driver)`, `(student)` entra em cena em estado nenhum:

| Estado | `/login` | `/scan` | `/qr-code` | `/trip` |
|---|---|---|---|---|
| Não autenticado | tela em branco, 0 elementos interativos | idem (redireciona p/ `/login`) | idem | idem |
| Autenticado (sessão semeada no MMKV) | "Welcome to Expo / GET STARTED / Try editing src/app/index.tsx" | redireciona p/ `/` e mostra o mesmo template | idem | idem |

Sem erro nenhum no console — a tela simplesmente não existe.

**Isto invalida uma premissa explícita das Dev Notes desta story:** "No alvo web isso
deixa de ser bloqueio de verificação: as rotas são alcançáveis pela barra de endereços."
Elas **não** são. O item de `deferred-work.md` sobre o shell de navegação é mais grave
do que registrado: não é só falta de abas, é a ausência da saída do router.

**Bloqueio 6 — `enableMocking()` não é idempotente; o modo MSW não sobe.**
Boa notícia primeiro: **o MSW intercepta no browser.** O risco que a Task 6 sinalizava
(`msw/native` mapeado para `null` na condição `browser`) **não se concretizou** —
`src/mocks/server.ts` bundlou (246 módulos), o console imprimiu `[mocks] MSW ativo` e um
`POST http://localhost:3001/api/v1/auth/login` com `motorista@pureurban.com` devolveu
`200` com o DRIVER mockado (Carlos Ferreira), **sem nenhuma requisição escapando para a
rede real**.

O que quebra é outra coisa: o `useEffect` de `_layout.tsx` roda duas vezes (StrictMode),
`src/mocks/index.ts` não tem guarda de idempotência, e o segundo `server.listen()` lança

```
Invariant Violation: Failed to call "configure()" on the network:
  cannot configure an already enabled network.
```

O `catch` do layout seta `mockError` e o app renderiza — deliberadamente, por design da
3.0 — a tela "Falha ao inicializar os mocks (MSW)". Ou seja: o MSW está ativo e correto,
mas o app se recusa a seguir. Correção seria uma guarda em `src/mocks/index.ts`
(código de aplicação, AC #8).

**Task 8 — portões.**

| Portão | Resultado |
|---|---|
| 8.1 `mobile: npx tsc --noEmit` | **0 erros** |
| 8.2 `mobile: npm run lint` | **limpo**, nenhum `eslint-disable` novo |
| 8.3 `api: npm run lint` | 203 problemas (147 err / 56 warn) — **idêntico com e sem a alteração** (medido com `git stash`). Zero regressão. Baseline pré-existente. |
| 8.3 `api: npm test` | **201 testes / 44 arquivos, todos passando** |
| 8.3 `api: npm run test:e2e` | 88 passando, 19 skipped, **1 arquivo falhando**: `test/route-assignment.e2e-spec.ts:78` (login de motorista no `beforeAll`). **Idêntico no baseline sem `enableCors`** — pré-existente. |
| 8.4 `git status --porcelain` | exatamente os 6 arquivos declarados + os 2 artefatos do próprio workflow BMAD (o story file e `sprint-status.yaml`). `mobile/.env` ausente (gitignored), `mobile/dist/` removido. |
| 8.5 diff de dependências | **vazio** em `mobile/package.json`, `mobile/package-lock.json`, `api/package.json`, `api/package-lock.json` |

**Task 6.10 — o que NÃO foi executado, e por quê.**

| Subtask | Situação |
|---|---|
| 6.5 login ponta a ponta → `/(admin)/home` | **bloqueada** pelo Bloqueio 5 — a tela de login não renderiza. O lado servidor do AC #4 (CORS + `API_BASE_URL`) está provado por curl. |
| 6.7 F5 preserva sessão + cache do Query reidratado | **parcial** — MMKV/`localStorage` provado; o ciclo real depende de conseguir logar (Bloqueio 5). |
| 6.8 login MSW com `[mocks] MSW ativo` | **parcial** — MSW comprovadamente intercepta e o log aparece; o app não sobe por causa do Bloqueio 6. |
| 6.9 webcam + QR em `/scan` | **bloqueada** pelos Bloqueios 5 e 6 — `/scan` não renderiza. |

**Nada foi improvisado nesses pontos**, conforme a instrução da Task 6.

### Completion Notes List

**Status: implementação completa, verificação parcial.** _(Atualizado em 27/08/2026: o cabeçalho original dizia "não está pronta para review"; a decisão do Lucas de diferir as ACs #4, #5 e #7 — registrada no Change Log — fechou a story para review assim mesmo.)_

O ambiente de execução web **existe e funciona**: os quatro bloqueios que a story mapeou
foram corrigidos e verificados em execução. O que não foi possível é exercitar as telas
do produto dentro dele, porque o app não renderiza tela nenhuma no browser — nem no
alvo nativo, pelo mesmo motivo.

ACs atendidos e verificados: **#1, #2, #3, #6, #8, #9**.
ACs bloqueados: **#4** (metade servidor provada; metade cliente não), **#5** (mecanismo
provado; ciclo real não), **#7** (não exercitável).

Os Bloqueios 5 e 6 exigem editar `src/app/_layout.tsx` / `src/components/app-tabs.tsx`
e `src/mocks/index.ts` — código de aplicação, o que a AC #8 proíbe explicitamente e que
as Dev Notes atribuem à Story 3.6 ("Não construa o shell de navegação aqui"). **A decisão
de escopo é do Lucas** e está registrada abaixo.

### File List

- `mobile/metro.config.js` — **novo**: `wasm` em `assetExts` + patch de `http.createServer` para COOP/COEP
- `mobile/app.json` — `expo.web.output`: `static` → `single`
- `mobile/src/utils/constants.ts` — `API_BASE_URL` lê `EXPO_PUBLIC_API_URL`, fallback nativo preservado
- `mobile/.env.example` — nota sobre o valor exigido no alvo web
- `mobile/README.md` — substitui o template do `create-expo-app`: comando, contexto seguro, mocks, limitações
- `api/src/main.ts` — `app.enableCors()` com origem por `CORS_ORIGIN` e `X-Idempotency-Key` no `allowedHeaders`

Não versionado (gitignored), criado localmente: `mobile/.env`.

**Artefatos de processo BMAD alterados junto (não são código de produto — ver Task 8.4):**

- `_bmad-output/implementation-artifacts/1-6-ambiente-de-execucao-web-do-app-mobile.md` — **novo**: este arquivo
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — transição de status da story
- `_bmad-output/implementation-artifacts/deferred-work.md` — Bloqueios 5 e 6 + seed quebrado sob Prisma 7

**Adicionados pelo code review de 28/08/2026** (fora dos 6 originais, com ratificação do Lucas):

- `api/.env.example` — declara `CORS_ORIGIN`, que o código introduziu e nada documentava
- `mobile/package.json` — `web` fixa `--port 8081`, para casar com o default de `CORS_ORIGIN`

### Change Log

| Data | Mudança |
|---|---|
| 2026-08-27 | Tasks 1–5, 7 e 8 concluídas. Alvo web habilitado e verificado: `crossOriginIsolated: true`, `expo export` verde, `offline_queue` aberta em wa-sqlite/OPFS, CORS com preflight verificado. Task 6 parcial: 6.5, 6.7, 6.8 e 6.9 bloqueadas por dois achados novos (Bloqueios 5 e 6) que exigem código de aplicação vetado pela AC #8. Story mantida `in-progress` aguardando decisão de escopo. |
| 2026-08-28 | Code review adversarial (3 camadas). 3 decisões ratificadas pelo Lucas e 22 patches aplicados: `CORS_ORIGIN` declarada em `api/.env.example` + fallback e normalização de origem em `main.ts`; `--port 8081` fixado em `npm run web`; `constants.ts` passa a rejeitar host local em build de produção; `metro.config.js` ganha patch de `https`, guarda de idempotência e `includes` no `assetExts`; README documenta o estado real (nenhuma tela renderiza, MSW quebrado), migrations, criação de usuário e rewrite SPA; atribuição do Bloqueio 6 corrigida (não é StrictMode, é Fast Refresh — muda a correção); seed quebrado sob Prisma 7 vira a Story 1.8. Status → `done`. |
| 2026-08-27 | Decisão do Lucas: fechar a 1.6 com as ACs #4, #5 e #7 **diferidas** para a Story 3.6, em vez de ampliar o escopo para corrigir os Bloqueios 5 e 6 (código de aplicação vetado pela AC #8). Bloqueios 5 e 6 registrados em `deferred-work.md` com evidência de runtime, junto do seed quebrado sob Prisma 7. Subtasks 6.5, 6.7, 6.8 e 6.9 fechadas como diferidas, rotuladas para não serem lidas como executadas. Status → `review`. |
