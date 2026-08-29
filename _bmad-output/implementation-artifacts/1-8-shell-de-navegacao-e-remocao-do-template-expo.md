---
baseline_commit: ac959e06b6ff6642904736c3730087b58f218b66
---

# Story 1.8: Shell de Navegação e Remoção do Template Expo

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero que o app monte um navegador funcional e roteie por papel de usuário,
Para que as telas do produto sejam alcançáveis e as stories mobile possam ser verificadas.

---

## Por que esta story existe (leia antes de codar)

O código de produto mobile das stories 3.2b, 3.3a/3.3b e 3.5a **já existe e já passou por
review** — mas **nenhuma linha dele jamais rodou**. `mobile/src/app/_layout.tsx` não
renderiza `<Slot />`, `<Stack />` nem `<Tabs />`: o Expo Router monta o layout raiz e o
layout raiz não devolve saída de rota nenhuma. Medido em Chromium na Story 1.6:

| Estado | Rota | Resultado observado |
|---|---|---|
| Deslogado | `/login`, `/scan`, `/qr-code`, `/trip` | Tela em branco, 0 elementos interativos, **zero erro no console** |
| Logado (MMKV semeado) | idem | "Welcome to Expo / GET STARTED", e `/scan`+`/qr-code` redirecionam para `/` |

Esta story é o desbloqueio de **toda story mobile subsequente** (3.3b, 3.4b, 3.5b, 3.6).
Ela não entrega FR nenhum — entrega alcançabilidade.

> **A afirmação das Dev Notes da 1.6 de que "no alvo web as rotas são alcançáveis pela
> barra de endereços" é FALSA e está verificada como falsa.** Não confie nela.

---

## Acceptance Criteria

**AC #1 — O layout raiz renderiza saída de router**
**Given** `mobile/src/app/_layout.tsx` sem `<Slot />`, `<Stack />` nem `<Tabs />`
**When** implemento o shell de navegação
**Then** o layout raiz renderiza um navegador do Expo Router
**And** as rotas dos grupos `(auth)`, `(driver)`, `(student)` e `(admin)` são alcançáveis
pela barra de endereços no alvo web
**And** os portões de boot (`isDbReady`, `isMockReady`) continuam existindo, mas exibem um
estado de carregamento visível — **nunca tela em branco**

**AC #2 — Roteamento por papel, no login e na reabertura**
**Given** um usuário autenticado
**When** ele faz login **ou** reabre o app com a sessão hidratada do MMKV
**Then** ele é levado ao grupo correspondente ao seu `role`
(`DRIVER` → `/(driver)/trip`, `STUDENT` → `/(student)/home`, `ADMIN` → `/(admin)/home`)
**And** o mapeamento `role → rota inicial` existe em **um único lugar** do código, consumido
tanto pela tela de login quanto pelo shell
**And** um `role` não suportado continua sendo tratado como hoje em `login.tsx`: tokens
limpos e mensagem "Perfil de usuário não suportado neste aplicativo."

**AC #3 — Usuário não autenticado cai em `(auth)/login`**
**Given** nenhuma sessão no MMKV
**When** abro `/`, ou digito diretamente `/scan`, `/qr-code`, `/trip` ou `/student-list`
**Then** o app renderiza a tela de login
**And** em nenhum desses casos aparece tela em branco ou "unmatched route"

**AC #4 — `enableMocking()` é idempotente**
**Given** o Fast Refresh reavaliando módulos e remontando o layout raiz
**When** o efeito que chama `enableMocking()` roda mais de uma vez
**Then** `server.listen()` é executado no máximo uma vez por processo, e o app **não** cai
na tela "Falha ao inicializar os mocks (MSW)"
**And** a guarda está ancorada em estado que **sobrevive à reavaliação do módulo** — uma
guarda de módulo (`let started = false`) NÃO resolve, porque o Fast Refresh reavalia o
módulo e zera a flag
**And** salvar um arquivo com o dev server no ar (Fast Refresh) não reabre o bug

> ⚠️ **Correção ao texto do épico:** o épico prescreve `server.listening` como âncora.
> **Essa propriedade não existe.** Verificado em `msw@2.15.0`: `grep -c listening` em
> `node_modules/msw/lib/node/index.mjs` e `.../native/index.mjs` devolve `0`, e a interface
> `SetupServerCommon` expõe apenas `listen`, `close`, `use`, `resetHandlers`,
> `restoreHandlers`, `listHandlers`, `events` e `boundary`. Use a âncora prescrita na Task 3.

**AC #5 — O cluster de template do Expo sai da árvore**
**Given** ~930 linhas de template `create-expo-app` sem nenhum importador de produto
**When** removo o cluster
**Then** estes arquivos não existem mais:
`src/app/explore.tsx`, `src/components/animated-icon.tsx`, `animated-icon.web.tsx`,
`animated-icon.module.css`, `app-tabs.tsx`, `app-tabs.web.tsx`, `themed-text.tsx`,
`themed-view.tsx`, `ui/collapsible.tsx`, `hint-row.tsx`, `web-badge.tsx`, `external-link.tsx`
**And** `src/app/index.tsx` deixa de ser a tela "Welcome to Expo" e passa a ser o
redirecionador de entrada
**And** os assets órfãos são removidos: `expo-logo.png`, `logo-glow.png`, `react-logo.png`,
`react-logo@2x.png`, `react-logo@3x.png`, `expo-badge.png`, `expo-badge-white.png`,
`tutorial-web.png` e o diretório `tabIcons/`
**And** nenhum arquivo referenciado por `app.json` é removido
(`icon.png`, `favicon.png`, `splash-icon.png`, `android-icon-*.png`, `assets/expo.icon/`)

**AC #6 — Portões de regressão**
**Given** a árvore após a limpeza
**When** rodo os portões
**Then** `npx tsc --noEmit` → **0 erros** (baseline medido em 28/08/2026: 0)
**And** `npm run lint` → **limpo, sem `eslint-disable` novo** (baseline: limpo)
**And** `npx expo export --platform web` termina com `Exported: dist` e código de saída 0
**And** `git diff mobile/package.json mobile/package-lock.json` está **vazio** — nenhuma
dependência é adicionada, removida ou atualizada nesta story

**AC #7 — Fechamento das ACs diferidas da Story 1.6**
**Given** as ACs #4, #5 e #7 da Story 1.6 fechadas como diferidas por causa dos Bloqueios 5 e 6
**When** o shell existe e o MSW sobe
**Then** **AC #4 (1.6)**: login com `admin@pureurban.dev` / `admin123456` contra a API local
navega até `/(admin)/home`, com a requisição saindo para `localhost:3000` e sem erro de CORS
**And** **AC #5 (1.6)**: após F5 a sessão continua autenticada, sem voltar ao login
**And** **AC #7 (1.6)**: com `EXPO_PUBLIC_USE_MOCKS=1` e `motorista@pureurban.com`, `/scan`
abre a webcam dentro da moldura do `QrScanner`

**AC #8 — A AC #5 da Story 3.2b passa a ser demonstrável**
**Given** um aluno autenticado
**When** ele reabre o app com sessão hidratada (sem passar pela tela de login)
**Then** ele chega a `/(student)/home` e alcança o QR code em **1 toque** — satisfazendo o
teto de 2 toques do NFR19, que hoje só é observável a partir de um login novo

**AC #9 — Registro de fechamento**
**Given** o `deferred-work.md` com os Bloqueios 5 e 6 abertos
**When** a story fecha
**Then** os itens "Layout raiz não renderiza saída de router" e "`enableMocking()` não é
idempotente" estão marcados como resolvidos por esta story, com a evidência de runtime
**And** o bloco de alerta "⚠️ Estado atual: o ambiente sobe, mas nenhuma tela do produto
renderiza" saiu do `mobile/README.md`, junto das referências à Story 3.6 como escopo destes bloqueios

---

## Tasks / Subtasks

### Task 1 — Centralizar o mapeamento `role → rota inicial` (AC: #2)

O ternário de destino vive hoje só em `src/app/(auth)/login.tsx:39-46`. O shell precisa da
mesma decisão na reabertura com sessão hidratada. **Duplicar o ternário é o erro a evitar.**

- [x] 1.1 Criar `src/utils/role-routes.ts` exportando `homeForRole(role: AuthUser['role']): Href | null`,
  com o mesmo mapa de hoje: `DRIVER → '/(driver)/trip'`, `STUDENT → '/(student)/home'`,
  `ADMIN → '/(admin)/home'`, qualquer outro → `null`.
  Importe `Href` de `expo-router` para não perder a tipagem de `typedRoutes`.
- [x] 1.2 Reescrever `login.tsx` para consumir `homeForRole(result.user.role)`.
  **Preserve exatamente o comportamento atual do caminho `null`**: `tokenStorage.clearTokens()`
  + `setErrorMessage('Perfil de usuário não suportado neste aplicativo.')` + `return`, **antes**
  de chamar `login(result.user)`. O comentário em `login.tsx:36-38` explica por quê — a role é
  validada ANTES de autenticar, senão sobra sessão persistida numa role sem destino.
- [x] 1.3 Não mudar mais nada em `login.tsx`. A tela em si está correta e revisada.

### Task 2 — Implementar o shell de navegação (AC: #1, #2, #3)

- [x] 2.1 Criar `src/app/(admin)/_layout.tsx` — **o grupo `(admin)` não tem layout hoje**,
  é o único dos quatro nessa situação. Siga o padrão dos irmãos
  (`(student)/_layout.tsx` é o modelo mais próximo): `<Stack initialRouteName="home">` com
  `<Stack.Screen name="home" options={{ title: 'Painel' }} />`.
- [x] 2.2 Reescrever `src/app/_layout.tsx`:
  - Manter **intactos**: `PersistQueryClientProvider` + `mmkvPersister` + `maxAge` de 24h,
    `PaperProvider` com `darkTheme`/`lightTheme` de `@/lib/theme`, o efeito de
    `initializeDatabase()`, o efeito de `enableMocking()` e a tela de erro de `mockError`.
  - **Remover**: o import e o uso de `AnimatedSplashOverlay` (o arquivo some na Task 4;
    no alvo web ele já retorna `null`, e a splash nativa continua vindo do plugin
    `expo-splash-screen` do `app.json` — não há perda funcional), o import e o uso de `AppTabs`,
    e o `useEffect` de redirect imperativo das linhas 52-57.
  - **Substituir** `{isDbReady && isMockReady && isAuthenticated && <AppTabs />}` por um
    navegador. Enquanto `!isDbReady || !isMockReady`, renderize um estado de carregamento
    visível (`<ActivityIndicator />` do Paper centralizado) — **nunca `null`**, que é
    exatamente o bug que esta story existe para matar.
- [x] 2.3 Desenho do navegador — **abordagem primária**, `Stack.Protected`
  (disponível em `expo-router@55.0.7`, verificado em
  `node_modules/expo-router/build/layouts/StackClient.d.ts:141`):

  ```tsx
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!isAuthenticated}>
      <Stack.Screen name="(auth)" />
    </Stack.Protected>
    <Stack.Protected guard={isAuthenticated && user?.role === 'DRIVER'}>
      <Stack.Screen name="(driver)" />
    </Stack.Protected>
    <Stack.Protected guard={isAuthenticated && user?.role === 'STUDENT'}>
      <Stack.Screen name="(student)" />
    </Stack.Protected>
    <Stack.Protected guard={isAuthenticated && user?.role === 'ADMIN'}>
      <Stack.Screen name="(admin)" />
    </Stack.Protected>
  </Stack>
  ```

  `headerShown: false` no raiz porque **cada grupo já tem o próprio `<Stack>` com títulos**
  (`(driver)/_layout.tsx` e `(student)/_layout.tsx`) — sem isso o app ganha dois headers empilhados.
- [x] 2.4 Criar o redirecionador de entrada em `src/app/index.tsx` (substituindo a tela
  "Welcome to Expo"): lê `useAuthStore()` e devolve
  `<Redirect href={homeForRole(user.role) ?? '/(auth)/login'} />` quando autenticado, e
  `<Redirect href="/(auth)/login" />` quando não. Este é o caminho que fecha a AC #2 na
  **reabertura com sessão hidratada** — hoje inexistente.
- [x] 2.5 Criar `src/app/+not-found.tsx` com a mesma lógica de redirect da 2.4. Com
  `Stack.Protected`, uma rota fora do guard sai da árvore e o router cai no `+not-found`;
  sem este arquivo, `/scan` deslogado renderiza "unmatched route" e **a AC #3 falha**.
- [x] 2.6 **Se `Stack.Protected` não se comportar como acima na verificação da Task 6**
  (rota protegida ainda alcançável, ou loop de redirect): troque pela abordagem imperativa —
  `<Stack screenOptions={{ headerShown: false }} />` simples, mais um efeito no layout raiz
  usando `useSegments()` que faz `router.replace()` quando o grupo atual não bate com o
  estado de auth. **Guarde esse efeito com `useRootNavigationState()?.key`**, senão o
  primeiro `replace()` roda antes do navegador montar e lança
  *"Attempted to navigate before mounting the Root Layout"*. Registre no Debug Log qual
  das duas abordagens ficou e por quê.

### Task 3 — Tornar `enableMocking()` idempotente (AC: #4)

- [x] 3.1 Ler o diagnóstico completo em `deferred-work.md` (seção *Deferred from: dev of 1-6*,
  item do `enableMocking`). Resumo do que **já está descartado**, para não re-investigar:
  - **Não é `StrictMode`** — não existe `StrictMode` em `mobile/src/` nem no build do
    `expo-router` (grep vazio em 28/08/2026), e o efeito tem deps `[]` sem wrapper.
  - **Não é o `msw/native`** — o MSW **intercepta corretamente no browser** (bundle resolveu
    246 módulos, console imprimiu `[mocks] MSW ativo`, `POST /api/v1/auth/login` com
    `motorista@pureurban.com` devolveu 200 com o DRIVER mockado, e nenhuma requisição escapou
    para a rede real). A causa é Fast Refresh / remount do componente.
- [x] 3.2 Em `src/mocks/index.ts`, ancorar a guarda em `globalThis` — o único escopo que
  sobrevive à reavaliação de módulo do Fast Refresh. Memoize **a promise**, não um booleano,
  para que duas invocações concorrentes compartilhem a mesma inicialização:

  ```ts
  const GUARD = '__pureurbanMswBoot' as const
  type MswGlobal = typeof globalThis & { [GUARD]?: Promise<void> }

  export function enableMocking(): Promise<void> {
    if (!MOCKS_ENABLED) return Promise.resolve()
    const g = globalThis as MswGlobal
    // globalThis, e não uma flag de módulo: o Fast Refresh reavalia o módulo e
    // zeraria a flag, reabrindo o bug no primeiro save.
    g[GUARD] ??= startMocking()
    return g[GUARD]
  }
  ```

  com `startMocking()` contendo o corpo atual (import dos polyfills, import do server,
  `server.listen({ onUnhandledRequest: 'warn' })`, o `console.log`).
  **Limpe a entrada em caso de rejeição** (`.catch(err => { delete g[GUARD]; throw err })`):
  se `listen()` falhou, a rede nunca foi configurada e a próxima tentativa é legítima —
  cachear a promise rejeitada prenderia o app na tela de erro até reiniciar o dev server.
- [x] 3.3 **Preservar `onUnhandledRequest: 'warn'`** e o comentário que o justifica —
  `bypass` transforma path errado em requisição silenciosa à rede real.
- [x] 3.4 Não alterar `src/mocks/server.ts` nem nenhum handler. O problema é só a dupla invocação.

### Task 4 — Remover o cluster de template (AC: #5)

O cluster é **auto-contido**: a única referência de fora vem do `_layout.tsx`
(`AnimatedSplashOverlay` e `AppTabs`), já removida na Task 2. Verificado por grep em 28/08/2026.

- [x] 4.1 Apagar os arquivos: `src/app/explore.tsx`, `src/components/animated-icon.tsx`,
  `src/components/animated-icon.web.tsx`, `src/components/animated-icon.module.css`,
  `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`,
  `src/components/themed-text.tsx`, `src/components/themed-view.tsx`,
  `src/components/ui/collapsible.tsx`, `src/components/hint-row.tsx`,
  `src/components/web-badge.tsx`, `src/components/external-link.tsx`.
  (`src/app/index.tsx` é **reescrito** na Task 2.4, não apagado.)
- [x] 4.2 Apagar os assets órfãos: `assets/images/expo-logo.png`, `logo-glow.png`,
  `react-logo.png`, `react-logo@2x.png`, `react-logo@3x.png`, `expo-badge.png`,
  `expo-badge-white.png`, `tutorial-web.png` e o diretório `assets/images/tabIcons/`.
- [x] 4.3 **NÃO apagar** — todos referenciados por `app.json`: `assets/images/icon.png`,
  `favicon.png`, `splash-icon.png`, `android-icon-background.png`,
  `android-icon-foreground.png`, `android-icon-monochrome.png`, `assets/expo.icon/`.
- [x] 4.4 **NÃO apagar** `src/constants/theme.ts`, `src/hooks/use-theme.ts`,
  `src/hooks/use-color-scheme.ts`, `src/hooks/use-color-scheme.web.ts` e `src/global.css`.
  Eles ficam sem importador após a limpeza, mas `project-context.md` (§Expo Router) declara
  `useTheme()` consumindo `ThemeColor` como o padrão de theming do mobile. Removê-los
  contradiz a fonte de verdade e está fora da lista da AC #5 — ver *Questões Abertas #1*.
- [x] 4.5 Confirmar por grep que nenhum import quebrou:
  `grep -rn "themed-text\|themed-view\|animated-icon\|app-tabs\|hint-row\|web-badge\|external-link\|collapsible\|explore" mobile/src`
  → só pode sobrar ocorrência dentro dos próprios arquivos removidos (ou seja: vazio).
- [x] 4.6 **Não tocar em `package.json`.** Várias deps ficam órfãs (`expo-device`,
  `expo-web-browser`, `expo-symbols`, `expo-glass-effect`, `@react-navigation/bottom-tabs`),
  mas remover dependência aqui arrisca o bundle do Expo por ganho zero. Ver *Questões Abertas #2*.

### Task 5 — Atualizar a documentação (AC: #9)

- [x] 5.1 `mobile/README.md`: remover o bloco de alerta "⚠️ Estado atual: o ambiente sobe,
  mas nenhuma tela do produto renderiza" (linhas ~16-31) e as duas referências à Story 3.6
  como escopo dos bloqueios. Substituir por uma frase curta dizendo que as telas do produto
  são alcançáveis e por qual rota se entra em cada papel.
- [x] 5.2 `mobile/README.md`: manter **intacta** a seção de pré-requisitos que manda criar o
  admin via `POST /api/v1/auth/register` — o seed continua quebrado, e o conserto é a
  **Story 1.9**, não esta. Corrigir apenas a referência de "Story 1.8" para "Story 1.9" se
  aparecer (a renumeração de 28/08/2026 moveu o seed de 1.8 para 1.9).
- [x] 5.3 `deferred-work.md`: marcar como **resolvidos por esta story** os itens
  "O layout raiz não renderiza a saída do router" e "`enableMocking()` não é idempotente",
  citando a evidência de runtime da Task 6. Atualizar a tabela *Itens reescopados da Story
  3.6 para a Story 1.8* com o desfecho de cada linha.
- [x] 5.4 `deferred-work.md`: marcar o item "AC #5 da 3.2b não demonstrável (nav shell
  ausente)" como fechado por consequência, com a contagem de toques medida na Task 6.

### Task 6 — Verificação em execução (AC: #1, #2, #3, #4, #7, #8)

> **Architecture §8, regra 15: nenhuma story mobile é `done` sem execução verificada.**
> A 3.3b está `in-progress` até hoje exatamente por ter pulado isto.
> **Nenhuma linha abaixo pode ser marcada `[x]` sem ter sido executada.**

**Preparação**

- [x] 6.1 `docker compose up -d` na raiz; `cd api && npx prisma migrate deploy && npm run start:dev`.
- [x] 6.2 Criar o admin (o seed **não funciona** — Story 1.9):
  `curl -X POST http://localhost:3000/api/v1/auth/register -H 'Content-Type: application/json' -d '{"name":"PureUrban Dev","email":"admin@pureurban.dev","password":"admin123456"}'`
- [x] 6.3 `cd mobile && cp .env.example .env` (se ainda não existir) e garantir
  `EXPO_PUBLIC_API_URL=http://localhost:3000`.

**Bloco A — API real (`EXPO_PUBLIC_USE_MOCKS=0`)**

- [x] 6.4 `npm run web`, abrir **`http://localhost:8081`** — nunca o IP de LAN
  (contexto seguro: fora de `localhost` o `crossOriginIsolated` cai e o wa-sqlite não abre).
- [x] 6.5 Deslogado, digitar na barra de endereços `/`, `/scan`, `/qr-code`, `/trip` e
  `/student-list`: **todas** devolvem a tela de login. Nenhuma tela em branco, nenhum
  "unmatched route". **(AC #1, #3)**
- [x] 6.6 Login com `admin@pureurban.dev` / `admin123456`. Na aba Network: a chamada sai para
  `localhost:3000`, o preflight passa, o app navega para `/(admin)/home`.
  **(AC #2 · fecha a AC #4 da Story 1.6)**
- [x] 6.7 F5. A sessão continua autenticada, o app volta direto para `/(admin)/home` sem passar
  pela tela de login, e o `localStorage` mostra as chaves `mmkv.default\auth.*`.
  **(AC #2 na reabertura · fecha a AC #5 da Story 1.6)**
- [x] 6.8 Console limpo: nenhum erro de `SharedArrayBuffer`, de abertura de banco ou de navegação.

**Bloco B — MSW (`EXPO_PUBLIC_USE_MOCKS=1`, reiniciar o dev server)**

- [x] 6.9 O app **sobe** — a tela "Falha ao inicializar os mocks (MSW)" **não** aparece, e o
  console imprime `[mocks] MSW ativo` exatamente uma vez. **(AC #4)**
- [x] 6.10 Com o dev server no ar, salvar um arquivo qualquer de `src/` para disparar o Fast
  Refresh. O app **continua de pé** e a tela de erro do MSW **não** aparece. Esta linha é o
  teste que a guarda de módulo falharia. **(AC #4)**
- [x] 6.11 Login com `motorista@pureurban.com` (senha livre) → `/(driver)/trip`. Navegar para
  `/scan`, conceder a permissão de câmera: a webcam abre dentro da moldura do `QrScanner`.
  **(fecha a AC #7 da Story 1.6)**
- [x] 6.12 Login com `aluno@pureurban.com` (senha livre) → `/(student)/home`. **Contar os toques
  até o QR na tela** (esperado: 1, o botão "Meu QR Code"). Depois dar F5 e **contar de novo a
  partir da reabertura** — é este segundo caminho que não existia. Registrar as duas contagens.
  **(AC #8 · NFR19)**
- [x] 6.12b **(adicionada pelo code review, 28/08 — EXECUTADA)** Verificar o caminho de **logout**, que o
  roteiro original não cobria — é a única direção em que os guards novos nunca foram
  exercitados. Como ADMIN, usar o botão "Sair" de `(admin)/home.tsx:17` (que não faz
  `router.replace`, confia só no flip do guard) e confirmar que o app chega à tela de login
  sem tela em branco e sem passar por "unmatched route". Depois forçar o caminho do
  `api-client.ts:144` (refresh falhando) e confirmar o mesmo. Se a volta pelo `+not-found`
  aparecer como flicker, o follow-up é remover os três `router.replace` pós-`logout()`
  (`api-client.ts`, `(student)/qr-code.tsx`, `(driver)/scan.tsx`) e deixar os guards dirigirem.
- [x] 6.13 Registrar no Debug Log **o que foi executado e a evidência de cada linha**. Se algo
  não rodar, rotule como não executado — não marque `[x]` em cima de suposição.

### Task 7 — Portões de regressão (AC: #6)

- [x] 7.1 `cd mobile && npx tsc --noEmit` → **0 erros** (baseline medido em 28/08/2026: 0).
- [x] 7.2 `cd mobile && npm run lint` → limpo, **sem nenhum `eslint-disable` novo**
  (baseline medido em 28/08/2026: limpo). Este é também o ponto em que o toolchain de lint do
  mobile (`eslint` + `eslint-config-expo`, adicionado fora de escopo na 3.2b) passa a valer
  sobre o código que sobrou — a ratificação pendente no `deferred-work.md`.
- [x] 7.3 `cd mobile && npx expo export --platform web` → `Exported: dist`, exit 0.
  Apagar `mobile/dist/` ao final (está no `.gitignore`, mas não deixe lixo na árvore).
- [x] 7.4 `git diff mobile/package.json mobile/package-lock.json` → **vazio**.
- [x] 7.5 `git status --porcelain` → conferir que a árvore contém só os arquivos declarados no
  File List. Artefatos do workflow BMAD (este story file, `sprint-status.yaml`,
  `deferred-work.md`) são esperados e não são código de produto.
- [x] 7.6 A API **não é tocada** nesta story — `git status api/` deve estar limpo.

### Review Findings

_Code review de 28/08/2026 — três camadas adversariais (Blind Hunter, Edge Case Hunter,
Acceptance Auditor), todas concluídas. Portões da AC #6 re-executados de forma independente
pelo revisor: `tsc` 0 erros, `lint` limpo, `expo export --platform web` exit 0, diff de
`package.json`/`package-lock.json` vazio, `api/` intocada._

**Decisões resolvidas no review (28/08/2026) — todas delegadas pelo Lucas ao revisor:**

- [x] [Review][Decision] Mapa papel→rota em dois lugares (AC #2) — **resolvido: derivar os guards do mapa.** `role-routes.ts` passou a exportar `ROLE_ROUTES` (grupo + home por papel) e `ROLES`; `_layout.tsx:88-104` gera os `Stack.Protected` por `map` sobre `ROLES`. A AC #2 agora vale literalmente: um papel novo é uma edição só. Verificado que `React.Children.forEach` achata arrays (`expo-router/build/layouts/withLayoutContext.js:95`), então filhos gerados por `map` são traversados normalmente.
- [x] [Review][Decision] Caminho de logout nunca verificado — **resolvido: manter os `replace`, documentar e verificar.** Remover código do caminho de auth sem execução verificada repetiria o erro que esta story existe para corrigir; o buraco real era a verificação ausente. `api-client.ts:144` ganhou o comentário explicando que o `replace` é redundante com os guards e chega ao login pela volta do `+not-found`, e a Task 6 ganhou a linha **6.12b** (aberta) cobrindo logout por botão e por refresh falho. Se a verificação mostrar flicker, o follow-up é remover os três `replace`.
- [x] [Review][Decision] Guarda do MSW congela os handlers sob Fast Refresh — **resolvido: documentar o trade-off.** `mocks/index.ts:23-34` passou a declarar a consequência (editar um handler só vale após reload) e por que a alternativa foi recusada: rastrear a identidade do server para re-`listen()` reabriria o risco de duplo `listen` que esta guarda acabou de fechar, em código só-de-dev, para poupar um F5.
- [x] [Review][Decision] `deferred-work.md` auto-ratificava o lint — **resolvido: registro tornado verdadeiro.** A linha da tabela passou de "✅ RATIFICADO" para "⏳ PENDENTE", explicitando que o lint roda limpo (portão da AC #6, re-verificado) mas que ratificar o overrun de dependências é decisão do Lucas e segue aberta. O bullet de origem (`:68`) já dizia isso e agora não é mais contradito.
- [x] [Review][Decision] Órfãos do template — **resolvido: diferido para story própria.** O cluster de theming e as cinco deps órfãs são as Questões Abertas #1/#2 do Lucas, e removê-las agora violaria a AC #6 (diff de `package.json` deve ser vazio). Registrado em `deferred-work.md` com o `scripts/reset-project.js` como item de maior prioridade — `oldDirs = ["src", "scripts"]` agora aponta para o código-fonte real.
- [x] [Review][Decision] `epics.md:372` prescrevia `server.listening` — **resolvido: corrigido.** O texto canônico do épico agora prescreve a âncora em `globalThis` e registra por que a anterior era inválida (a propriedade não existe em `msw@2.15`). Sem isso, quem re-derivasse a AC a partir do épico receberia a instrução errada de volta.
- [x] [Review][Decision] Evidência não reproduzível e zero cobertura automatizada — **resolvido: dividido.** O Debug Log ganhou uma ressalva de auditabilidade explicitando que as evidências dos Blocos A/B são narrativas e não re-verificáveis, e listando os portões da Task 7 que o revisor de fato re-executou. Adicionar um runner de testes ao mobile é escopo novo — diferido.

**Correções aplicadas (28/08/2026):**

- [x] [Review][Patch] Papel sem destino cai em loop de redirect em vez de tela de erro [mobile/src/app/index.tsx:12] — `homeForRole(user.role) ?? '/(auth)/login'` só dispara com `isAuthenticated && user` verdadeiro; nesse exato estado `_layout.tsx:88` guarda `(auth)` com `!isAuthenticated`, então `/(auth)/login` **não está na árvore**. O router cai em `+not-found`, que é `export { default } from './index'` — o mesmo componente, que redireciona de novo. `Redirect` chama `router.replace` dentro de `useFocusEffect` e renderiza `null`: tela em branco e/ou ping-pong, exatamente o modo de falha que as ACs #1 e #3 proíbem. Hoje é latente (`lib/storage.ts:39` valida a união de papéis na hidratação e `login.tsx:42-46` bloqueia antes do `login()`), mas o comentário de `role-routes.ts:14-16` afirma que o caso é alcançável em runtime — código e documentação discordam sobre qual ramo importa. **Aplicado:** `index.tsx` passou a derrubar a sessão num `useEffect` quando `isAuthenticated` é true e `homeForRole` devolve `null` — é o que torna `(auth)` alcançável, espelhando o tratamento de `login.tsx`. O ciclo agora termina em vez de repetir.
- [x] [Review][Patch] `homeForRole` devolve função em vez de `null` para chave de `Object.prototype` [mobile/src/utils/role-routes.ts:18] — `HOME_BY_ROLE['constructor']` (ou `toString`, `valueOf`) devolve a função herdada, que é truthy: escapa do ramo `?? null` e chega a `router.replace` como `Href`. Alcançável só se a API devolver `role: "constructor"` (a resposta é tipada, não validada). **Aplicado:** `Object.hasOwn(ROLE_ROUTES, role) ? ROLE_ROUTES[role].home : null`.
- [x] [Review][Patch] A tela de login passa a renderizar um header espúrio intitulado "login" [mobile/src/app/(auth)/_layout.tsx:4] — é um `<Stack />` pelado, sem `screenOptions` nem título, então o `headerShown: true` default do native-stack vale. O `screenOptions={{ headerShown: false }}` do raiz (`_layout.tsx:87`) cobre só as telas do navegador raiz, não as de um navegador aninhado. O comentário logo acima ("cada grupo já tem o próprio `<Stack>` com títulos") é falso para `(auth)`. É novo na prática: antes deste diff nenhuma tela renderizava. A evidência da AC #3 ("4 elementos interativos") não pegaria um header. **Aplicado:** `screenOptions={{ headerShown: false }}` no layout do grupo, com o comentário explicando que o `screenOptions` do raiz não desce para navegador aninhado.
- [x] [Review][Patch] `sprint-status.yaml` contradiz a si mesmo após o flip de status [_bmad-output/implementation-artifacts/sprint-status.yaml:75-78, 113-118] — o diff muda a linha 79 para `review` mas deixa o comentário acima afirmando no presente "`_layout.tsx` não renderiza saída de router — nenhuma tela do projeto é alcançável … **EXECUTA A SEGUIR** — bloqueia 3.3b, 3.4b, 3.5b", e as linhas 113-118 seguem dizendo que "3-3b em diante continuam bloqueadas" pelos Bloqueios 5 e 6 — os dois que este commit afirma ter resolvido. O CLAUDE.md designa esse arquivo como o estado corrente do sprint: o próximo agente vai concluir que a 3.3b continua bloqueada. **Aplicado:** os dois blocos de comentário passaram a descrever os Bloqueios 5 e 6 como fechados e a story como desbloqueadora da 3.3b/3.4b/3.5b/3.6.
- [x] [Review][Patch] Evidência falsa registrada num portão marcado `[x]` [story, Debug Log linha 7.4] — "vazio (não há `package-lock.json` no mobile)". O arquivo existe (532 KB) e é rastreado: `git ls-files mobile/package-lock.json` o devolve. O portão de fato passa, mas a AC #6 faz desse lockfile a guarda contra drift de dependências, e a evidência escrita ao lado do `[x]` descreve uma árvore que não é esta. **Aplicado:** a linha 7.4 do Debug Log foi corrigida.
- [x] [Review][Patch] O comentário do `delete g[GUARD]` descreve um retry que não existe [mobile/src/mocks/index.ts:29-31] — a justificativa é "cachear a promise rejeitada prenderia o app na tela de erro até reiniciar o dev server". Mas o único chamador, `_layout.tsx:35-47`, roda num `useEffect` com deps `[]` e, em falha, seta `mockError`, que curto-circuita o componente inteiro em `_layout.tsx:51`. Nada chama `enableMocking()` uma segunda vez nesse estado: o app **fica** preso na tela de erro até um reload completo, com ou sem o `delete`. Mesma raiz do fato de `mockError` nunca ser limpo. **Aplicado:** comentário reescrito para dizer o que o código faz — a limpeza existe para que a guarda não seja o que impede um retry, não porque haja um hoje.

**Diferidos (pré-existentes ou fora do escopo desta story) — registrados em `deferred-work.md`:**

- [x] [Review][Defer] Três telas de produto ficam sem ponto de entrada in-app [mobile/src/app/(driver)/routes.tsx, (driver)/student-list.tsx, (student)/track-bus.tsx] — deferred, pre-existing
- [x] [Review][Defer] STUDENT e DRIVER não têm como sair da sessão no happy path [mobile/src/app/(student)/, mobile/src/app/(driver)/] — deferred, pre-existing
- [x] [Review][Defer] `+not-found` perdeu permanentemente a capacidade de reportar rota inexistente [mobile/src/app/+not-found.tsx:4] — deferred, pre-existing
- [x] [Review][Defer] Papel alterado no servidor não re-sincroniza numa sessão já persistida [mobile/src/stores/auth.store.ts:39-40] — deferred, pre-existing
- [x] [Review][Defer] `initialRouteName` como prop JSX não é de onde o expo-router lê a âncora [mobile/src/app/(admin)/_layout.tsx:5] — deferred, pre-existing
- [x] [Review][Defer] Órfãos do template Expo: cluster de theming, cinco deps sem importador e `scripts/reset-project.js` apontando para o código real [mobile/src/constants/theme.ts, mobile/src/hooks/use-theme.ts, mobile/scripts/reset-project.js:14] — deferred, Questões Abertas #1/#2/#3 do Lucas; remover deps violaria a AC #6
- [x] [Review][Defer] Mobile não tem runner de testes: nenhuma asserção cobre `homeForRole` nem a matriz de guards [mobile/package.json] — deferred, escopo novo

**Dispensados como ruído (4):** desvio da porta 3000→3001 na Task 6 (disclosed, intenção da AC atendida — o CORS depende da origem `localhost:8081`, não da porta da API); tensão de redação da AC #1 ("todas as rotas alcançáveis" só vale por papel, que é justamente a intenção das ACs #2/#3); `mockError` nunca limpo (mesma raiz do patch do `delete g[GUARD]`, sem retry existente); rejeição de `startMocking` depois de `server.listen()` já ter habilitado a rede (não alcançável — `listen()` é a última instrução real da função).

---

## Dev Notes

### Arquitetura de arquivos — o que existe hoje

A Architecture §7 desenha o mobile com `app/` na raiz. **A árvore real é `mobile/src/app/`**
(alias `@/*` → `./src/*`, `tsconfig.json`). Siga a árvore real, não o desenho.

```
mobile/src/app/
├── _layout.tsx           ← REESCRITO (Task 2.2) — hoje não renderiza router
├── index.tsx             ← REESCRITO (Task 2.4) — hoje é "Welcome to Expo"
├── explore.tsx           ← APAGADO (Task 4.1)
├── +not-found.tsx        ← NOVO (Task 2.5)
├── (auth)/
│   ├── _layout.tsx       ← intacto (`<Stack />`)
│   └── login.tsx         ← EDITADO só na escolha de destino (Task 1.2)
├── (driver)/
│   ├── _layout.tsx       ← intacto (Stack com 4 telas, initialRouteName="trip")
│   ├── trip.tsx  scan.tsx  student-list.tsx  routes.tsx   ← intactos
├── (student)/
│   ├── _layout.tsx       ← intacto (Stack com 3 telas, initialRouteName="home")
│   ├── home.tsx  qr-code.tsx  track-bus.tsx               ← intactos
└── (admin)/
    ├── _layout.tsx       ← NOVO (Task 2.1) — único grupo sem layout
    └── home.tsx          ← intacto
```

### Estado atual de `_layout.tsx` (o arquivo central desta story)

`mobile/src/app/_layout.tsx:87` — a linha que causa tudo:

```tsx
{isDbReady && isMockReady && isAuthenticated && <AppTabs />}
```

O que **precisa ser preservado** ao reescrever, e por quê:

| Trecho | Linhas | Por que preservar |
|---|---|---|
| `PersistQueryClientProvider` + `mmkvPersister`, `maxAge` 24h | 78-84 | Tier 1 offline (Story 1.5). O comentário `deve ser <= gcTime` é invariante. |
| `PaperProvider` com `darkTheme`/`lightTheme` | 85 | Tema do produto (`@/lib/theme`, azul `#208AEF`). Não confundir com `@/constants/theme`, que é do template. |
| Efeito `initializeDatabase()` com `.catch().finally()` | 27-35 | Decisão deliberada da 1.5: modo degradado > crash. **Não "conserte"** — está registrado como diferido no `deferred-work.md`. |
| Efeito `enableMocking()` que **não** abre o portão em falha | 37-49 | Decisão da 3.0: parar o app é melhor que mandar requisição para a API real sem aviso. |
| Tela de erro de `mockError` **abaixo de todos os hooks** | 59-75 | Um early return acima dos hooks quebra as Rules of Hooks no render em que `mockError` deixa de ser `null`. |

### O que a limpeza mexe e o que não mexe

Verificação de importadores feita por grep em 28/08/2026. **O cluster é fechado:**

| Arquivo removido | Quem importava | Situação após a Task 2 |
|---|---|---|
| `animated-icon.*` | `index.tsx`, `_layout.tsx` | ambos reescritos |
| `app-tabs.*` | `_layout.tsx` | reescrito |
| `themed-text`, `themed-view` | `index.tsx`, `explore.tsx`, `hint-row`, `web-badge`, `collapsible`, `app-tabs.web` | todos removidos/reescritos |
| `hint-row`, `web-badge` | `index.tsx`, `explore.tsx` | idem |
| `external-link`, `ui/collapsible` | `explore.tsx`, `app-tabs.web` | idem |

Contagem: 932 linhas nos 13 arquivos; `index.tsx` (98) é reescrito, então saem ~834 linhas
líquidas mais os assets.

**Atenção ao `AnimatedSplashOverlay`.** É a única peça do cluster com função real no boot
nativo (um overlay animado de 600ms). No alvo web a variante `.web.tsx` já retorna `null`.
Removê-lo é intencional e está na AC #5; a splash de verdade vem do plugin
`expo-splash-screen` declarado em `app.json`. Não invente um substituto.

### Padrões que a story deve respeitar

- **Zustand** (`project-context.md`): `useAuthStore` já expõe `user` e `isAuthenticated`,
  hidratados do MMKV no load do módulo (`auth.store.ts:18-27`). O shell **lê** esse estado —
  não crie store nova nem contexto de auth paralelo.
- **`typedRoutes: true`** (`app.json`): rotas são tipadas. Use `Href` do `expo-router` no
  `homeForRole`, não `string`, senão o `tsc` reclama no `<Redirect href={...} />`.
- **Loading states** (Architecture §6): sem TanStack Query, use union types
  (`'idle' | 'loading' | ...`), nunca booleanos soltos. Os dois portões de boot existentes já
  são booleanos — **não os refatore nesta story**, apenas garanta que a combinação renderize
  um indicador visível em vez de `null`.
- **Comentários** (CLAUDE.md): comente só o não-óbvio — o *porquê*. Ao editar um arquivo,
  remova os comentários redundantes que encontrar. Os comentários longos de `_layout.tsx`
  listados na tabela acima **não** são redundantes: preserve-os.
- **Idioma**: commits, PRs e comentários de código em **inglês**; docs em português.

### Testes

Não há suíte de testes automatizados no mobile (`mobile/package.json` tem `lint`, sem `test`),
e esta story **não** cria uma — seria escopo novo. A verificação é o roteiro manual da Task 6
mais os portões estáticos da Task 7. Isso é o que a Architecture §8 regra 15 exige.

### Ambiente e credenciais

| Objetivo | Ambiente | Usuário |
|---|---|---|
| Login real, CORS, `API_BASE_URL` | API real (`USE_MOCKS=0`) | `admin@pureurban.dev` / `admin123456` (criar via `/auth/register`) |
| Webcam + QR, grupo DRIVER | MSW (`USE_MOCKS=1`) | `motorista@pureurban.com`, senha livre |
| Contagem de toques até o QR | MSW (`USE_MOCKS=1`) | `aluno@pureurban.com`, senha livre |

Todas as sentinelas de mock (aluno sem rota, motorista sem viagem, sessão expirada…) estão
documentadas em `mobile/.env.example`. **Não crie usuários no seed** para facilitar o teste —
o seed está quebrado e é escopo da Story 1.9.

**Contexto seguro:** use `http://localhost:8081`. Fora de `localhost`,
`window.crossOriginIsolated` fica `false`, o wa-sqlite não abre o banco e o
`initializeDatabase()` falha em silêncio (por decisão da 1.5).

### Project Structure Notes

- `metro.config.js` (COOP/COEP + `assetExts: ['wasm']`) é infraestrutura da Story 1.6.
  **Não toque.** O comentário do arquivo explica que o patch de `createServer` não é gambiarra;
  sem ele o Tier 2 não abre no browser.
- A API não entra nesta story. `api/src/main.ts` já ganhou `enableCors()` na 1.6.
- `scripts/reset-project.js` e o script npm `reset-project` são resíduo do
  `create-expo-app` e ficam sem menção após a remoção do `hint-row`. **Não estão na lista da
  AC #5** — ver *Questões Abertas #3*.

### Intelligence da Story 1.6 (anterior)

O que a 1.6 provou e o que ela **não** provou — não repita a investigação:

**Provado e fechado:** bundle web com `wasm`, headers COOP/COEP no documento (via patch de
`createServer`, porque `enhanceMiddleware` chega ao bundle mas nunca ao `index.html`),
`crossOriginIsolated === true`, MMKV sobre `localStorage` hidratando o `auth.store`,
`offline_queue` criada em wa-sqlite/OPFS, `expo export --platform web` verde, CORS na API,
`EXPO_PUBLIC_API_URL` ligada em `constants.ts`, e **MSW interceptando de verdade no browser**.

**Não provado (é o que esta story fecha):** qualquer coisa que exija renderizar uma tela.

**Armadilhas registradas pela 1.6, ainda válidas:**
- O `.wasm` fica aninhado em `dist/assets/node_modules/expo-sqlite/web/wa-sqlite/` — um
  `ls | grep` não-recursivo não o encontra; use `find`.
- O baseline de lint/test da **API** não é verde (203 problemas de lint pré-existentes,
  1 arquivo e2e falhando). Irrelevante aqui porque a API não é tocada, mas não se assuste.
- `npm run seed` **não existe**. Story 1.9.

### Git Intelligence

`17ba236 feat(mobile): enable the web execution target (story 1.6)` é o commit imediatamente
anterior no mobile — leia o diff dele antes de começar: mostra o padrão de comentário longo e
justificado que o projeto adota em código de infraestrutura, e o formato de mensagem de commit
com escopo e story (`feat(mobile): ... (story 1.8)`).

`c36dd69` fechou os achados de review da 3.3b — o código de `scan.tsx` que esta story torna
alcançável está revisado e **não deve ser alterado** aqui.

**Fluxo obrigatório (CLAUDE.md):** branch `feat/1-8-shell-de-navegacao` a partir da `main`
atualizada, commits atômicos (sugestão: 1. `homeForRole` + login; 2. shell de navegação;
3. idempotência do MSW; 4. remoção do template; 5. docs), e **PR só com a aprovação explícita
do Lucas** — nunca `gh pr create` sem ela.

### Verificações de biblioteca (feitas em 28/08/2026 nesta árvore)

| Verificação | Resultado |
|---|---|
| `expo-router` | `55.0.7` — `Stack.Protected` **existe** (`build/layouts/StackClient.d.ts:141`) |
| `msw` | `2.15.0` — **`server.listening` NÃO existe**; `grep -c listening` nos builds `node` e `native` devolve `0` |
| `npx tsc --noEmit` | 0 erros (baseline) |
| `npm run lint` | limpo (baseline) |

---

## Questões Abertas (para o Lucas, após a implementação)

1. **Órfãos de theming.** Depois da limpeza, `src/constants/theme.ts`, `src/hooks/use-theme.ts`,
   `src/hooks/use-color-scheme*.ts` e `src/global.css` ficam sem nenhum importador — o produto
   usa o tema do React Native Paper (`@/lib/theme`). A story os **mantém** porque
   `project-context.md` declara `useTheme()`/`ThemeColor` como o padrão de theming do mobile.
   Remover os quatro e atualizar o `project-context.md`, ou manter?

2. **Dependências órfãs.** `expo-device`, `expo-web-browser`, `expo-symbols`,
   `expo-glass-effect` e `@react-navigation/bottom-tabs` perdem o último importador. A story
   **não** mexe em `package.json` (AC #6 exige diff vazio). Vale uma passada de limpeza de
   dependências em story própria?

3. **`scripts/reset-project.js`.** Resíduo do `create-expo-app`, sem menção após a remoção do
   `hint-row`. Fora da lista da AC #5. Remover junto do resto do template?

4. **Correção do épico.** A AC do épico prescreve `server.listening`, que não existe em
   `msw@2.15`. Vale corrigir o texto em `epics.md` e no `deferred-work.md` para a âncora em
   `globalThis`, para que a próxima leitura não repita a prescrição inválida.

---

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8: Shell de Navegação e Remoção do Template Expo]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6 / #Story 1.9 / #Story 3.2b]
- [Source: _bmad-output/planning-artifacts/epics.md#NonFunctional Requirements] — NFR19
- [Source: _bmad-output/planning-artifacts/architecture.md#Ambiente de Execução e Validação (Mobile)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Estrutura do Mobile (Expo Router)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Padrões Mobile]
- [Source: _bmad-output/planning-artifacts/architecture.md#8. Regras Obrigatórias para Agentes de IA] — regras 14, 15, 16
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-28.md]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from: dev of 1-6-ambiente-de-execucao-web-do-app-mobile (2026-08-27)]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Itens reescopados da Story 3.6 para a Story 1.8]
- [Source: _bmad-output/implementation-artifacts/1-6-ambiente-de-execucao-web-do-app-mobile.md] — ACs #4, #5, #7 e Task 6
- [Source: _bmad-output/project-context.md] — Expo Router, Zustand, MMKV, naming
- [Source: CLAUDE.md] — comandos do mobile, fluxo branch → commits atômicos → PR

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Code, bmad-dev-story workflow)

### Debug Log References

**Abordagem do navegador — Task 2.3 vs 2.6.** Ficou a **abordagem primária** (`Stack.Protected`
por papel). Verificada em browser real: um aluno autenticado que digita `/scan`, `/trip`,
`/student-list` ou uma rota inexistente é redirecionado para `/(student)/home` via `+not-found`,
sem "unmatched route" e sem loop de redirect. A fallback imperativa da Task 2.6
(`useSegments()` + `router.replace()` guardado por `useRootNavigationState()?.key`) **não foi
necessária**.

**`+not-found.tsx`** reexporta o default de `index.tsx` (`export { default } from './index'`) —
fonte única da decisão de destino, sem duplicar a lógica de redirect.

**MSW — âncora da guarda.** O épico prescrevia `server.listening`; a propriedade **não existe
em `msw@2.15`**. Usada a âncora da Task 3: promise memoizada em `globalThis['__pureurbanMswBoot']`,
com limpeza da chave em caso de rejeição.

**Verificação em execução (Task 6).** Feita com `playwright-core` dirigindo o Chromium do
próprio Playwright (o canal `chrome` do MCP não estava instalado e exige root). Infra:
`docker compose up -d` + `api` em `npm run start:dev` (Node 22 via nvm) + `mobile` em
`npm run web` (porta 8081). Screenshots e logs salvos no scratchpad da sessão.

> **Ressalva de auditabilidade (code review, 28/08/2026).** O scratchpad da sessão não é versionado e não sobrevive a ela: nenhum artefato citado abaixo é recuperável hoje. As evidências do Bloco A, do Bloco B e das ACs #7/#8 são, na prática, **narrativas** — internamente consistentes e coerentes com o código lido no review, mas não re-verificáveis por um terceiro. Os únicos portões independentemente reproduzidos são os da Task 7, re-executados pelo revisor em 28/08/2026: `tsc --noEmit` 0 erros, `npm run lint` limpo, `expo export --platform web` exit 0 com `Exported: dist`, diff de `package.json`/`package-lock.json` vazio, `git status api/` limpo, nenhum `eslint-disable` novo.

- **Desvio de porta:** o `api/.env` local fixa `PORT=3001` (não commitado) e o `mobile/.env`
  local já apontava para `http://localhost:3001`. A story assume 3000. Mantida a
  consistência local em 3001 — a intenção da Task 6.3 (env aponta para a API no ar) está
  satisfeita e nenhum dos dois `.env` é versionado.

**Bloco A — API real (`EXPO_PUBLIC_USE_MOCKS=0`):**
| Linha | Resultado |
|---|---|
| 6.4 | `npm run web` no ar em `http://localhost:8081`, bundle web OK |
| 6.5 | Deslogado, `/`, `/scan`, `/qr-code`, `/trip`, `/student-list` → **todas** renderizam a tela de login (4 elementos interativos). Sem tela em branco, sem "unmatched route". |
| 6.6 | Login `admin@pureurban.dev` → navega para `/(admin)/home` ("Painel Administrativo"). Única requisição de API: `POST http://localhost:3001/api/v1/auth/login`. Sem erro de CORS. |
| 6.7 | F5 → continua em `/(admin)/home`, sem passar pelo login. `localStorage` com `mmkv.default\auth.accessToken`, `…\auth.refreshToken`, `…\auth.user`, `…\qr.sessionId`. |
| 6.8 | Console: só warnings pré-existentes de RN-web (`pointerEvents` deprecated, `useNativeDriver` ausente, `shadow*` deprecated) e o info do React DevTools. Nenhum erro de `SharedArrayBuffer`, de abertura de banco ou de navegação. Nenhum `pageerror`. |

**Bloco B — MSW (`EXPO_PUBLIC_USE_MOCKS=1`):**
| Linha | Resultado |
|---|---|
| 6.9 | App sobe até a tela de login. Tela "Falha ao inicializar os mocks (MSW)" **não** aparece. `[mocks] MSW ativo` no console **uma vez por carga de página**. |
| 6.10 | Com o dev server no ar, dois saves em `_layout.tsx` (rebuild incremental de `entry.js` confirmado no log do Metro). App **continua de pé**, tela de erro do MSW **não** aparece, contador de `[mocks] MSW ativo` **não** incrementa durante o Fast Refresh. É o cenário que a guarda de módulo falharia. |
| 6.11 | Login `motorista@pureurban.com` → `/(driver)/trip` ("Gestão de Viagem", viagem ativa mockada). `/scan` → moldura do `QrScanner` com `<video>` 640×480 `playing:true` (webcam fake do Chromium). Observação: o `expo-camera` web busca `zxing_reader.wasm` de `fastly.jsdelivr.net`; o MSW loga um aviso de request sem handler (`onUnhandledRequest: 'warn'`, comportamento esperado) — não afeta a abertura da câmera, que é o que a AC #7 da 1.6 pede. |
| 6.12 | Login `aluno@pureurban.com` → `/(student)/home` ("Olá, Ana Souza"). **1 toque** ("Meu QR Code") → `/(student)/qr-code` com o QR renderizado ("Mostre este código ao motorista"). Após F5: reabre direto em `/(student)/home` (sem login) e **1 toque** chega ao QR de novo. **Contagem: 1 toque em ambos os caminhos.** |

**Bloco C — caminho de logout (Task 6.12b, executada no code review de 28/08/2026):**

Chromium do Playwright (headless, `crossOriginIsolated: true`), API real na 3001,
`EXPO_PUBLIC_USE_MOCKS=0`. Scripts e screenshots no scratchpad da sessão — mesma ressalva de
auditabilidade dos Blocos A e B: a evidência abaixo é o que foi observado, não um artefato
versionado.

| Cenário | Resultado |
|---|---|
| **C1 — logout por botão** (`(admin)/home.tsx:17`, sem `router.replace`, só o flip do guard) | Login `admin@pureurban.dev` -> `/home` ("Painel Administrativo"). Clique em "Sair" -> trilha de navegação **`/home -> /login`**, direta. Tela de login com 4 elementos interativos, sem tela em branco, sem "unmatched route". `localStorage` sem nenhuma chave `auth.*`/`qr.*` remanescente. Zero erros de console, zero `pageerror`. |
| **C2 — logout forçado por refresh falho** (`api-client.ts:144`) | Sessão envenenada no MMKV (tokens inválidos + `role: DRIVER`) e reload. Chamadas observadas: `401 GET /api/v1/trips/active` -> `401 POST /api/v1/auth/refresh`. Trilha: **`/ -> /trip -> /login`**, direta. Login limpo, sem tela em branco, sem "unmatched route", sessão zerada. Os dois únicos erros de console são os 401 do próprio browser, esperados. |

**Conclusão:** os guards e os `router.replace` pós-`logout()` **convergem sem conflito** —
nenhum desvio pelo `+not-found` e nenhum frame em branco em nenhum dos dois caminhos. A
hipótese levantada no review (de que o `replace` só chegaria ao login pela volta do
`+not-found`) **não se confirmou**; o comentário em `api-client.ts:144` foi corrigido para
registrar o comportamento observado em vez da especulação. O follow-up de remover os três
`replace` fica sem motivo — eles são redundantes, não nocivos.

**Task 7 — portões estáticos:**
| Linha | Resultado |
|---|---|
| 7.1 | `npx tsc --noEmit` → 0 erros |
| 7.2 | `npm run lint` → limpo, nenhum `eslint-disable` novo (diff verificado) |
| 7.3 | `npx expo export --platform web` → `Exported: dist`, exit 0. `dist/` removido. |
| 7.4 | `git diff mobile/package.json mobile/package-lock.json` → vazio. **Correção do code review (28/08):** a nota original dizia "não há `package-lock.json` no mobile" — é falso, o arquivo existe (532 KB) e é rastreado (`git ls-files mobile/package-lock.json`). O portão passa, mas por diff realmente vazio, não por ausência do lockfile. |
| 7.5 | `git status --porcelain` → só os arquivos do File List + artefatos BMAD |
| 7.6 | `git status api/` → limpo |

### Completion Notes List

- **Task 1** — `src/utils/role-routes.ts` novo, exporta `homeForRole(role: UserRole): Href | null`
  (mapa `Record<UserRole, Href>` + `?? null` como guarda de runtime para papel fora da união).
  `login.tsx` passou a consumir `homeForRole`; o caminho `null` (tokens limpos + mensagem
  "Perfil de usuário não suportado…" **antes** de `login()`) foi preservado exatamente.
- **Task 2** — `(admin)/_layout.tsx` novo (`<Stack initialRouteName="home">`, único grupo que
  não tinha layout). `_layout.tsx` reescrito: `<Stack>` do Expo Router com `Stack.Protected`
  por papel, `headerShown: false` no raiz (cada grupo tem header próprio). Portões de boot
  preservados; enquanto `!isDbReady || !isMockReady` renderiza `<ActivityIndicator />`
  centralizado — nunca `null`. `AnimatedSplashOverlay`, `AppTabs` e o `useEffect` de redirect
  imperativo removidos. `index.tsx` reescrito como redirecionador de entrada.
  `+not-found.tsx` novo, reexporta `index.tsx`.
- **Task 3** — `src/mocks/index.ts`: `enableMocking()` memoiza a promise de `startMocking()`
  em `globalThis['__pureurbanMswBoot']`; limpa a chave em rejeição. `onUnhandledRequest: 'warn'`
  e o comentário preservados. `server.ts` e handlers intocados.
- **Task 4** — 12 arquivos de template + 14 assets órfãos removidos (`git rm`); diretórios
  `src/components/ui/` e `assets/images/tabIcons/` sumiram junto. `src/constants/theme.ts`,
  `src/hooks/use-theme.ts`, `src/hooks/use-color-scheme*.ts`, `src/global.css` **mantidos**
  (padrão de theming declarado no `project-context.md`; ver Questões Abertas #1). `package.json`
  intocado (ver Questões Abertas #2). Grep pós-limpeza: nenhum import quebrado.
- **Task 5** — `mobile/README.md`: bloco de alerta "⚠️ Estado atual…" e as referências à Story
  3.6 removidos; nota de "Mocks quebrado" substituída pela descrição da guarda idempotente.
  Seção de pré-requisitos (criar admin via `/auth/register`) intacta. `deferred-work.md`:
  itens do layout raiz, da idempotência do MSW, da AC #5 da 3.2b e da ratificação do lint
  marcados como resolvidos, com a evidência de runtime; tabela de reescopo atualizada com o
  desfecho de cada linha.
- **Task 6** — verificação em execução completa (Blocos A e B) — ver Debug Log. Fecha as ACs
  #4, #5 e #7 da Story 1.6 e torna a AC #5 da Story 3.2b demonstrável.
- **Questões Abertas #3 (`scripts/reset-project.js`)** — deixado como está; fora da lista da
  AC #5. **Questão Aberta #4 (texto do épico com `server.listening`)** — corrigido no
  `deferred-work.md`; o `epics.md` não foi tocado (fora do escopo de modificação da story).

### File List

**Mobile — novos:**
- `mobile/src/utils/role-routes.ts`
- `mobile/src/app/(admin)/_layout.tsx`
- `mobile/src/app/+not-found.tsx`

**Mobile — modificados:**
- `mobile/src/app/_layout.tsx`
- `mobile/src/app/index.tsx`
- `mobile/src/app/(auth)/login.tsx`
- `mobile/src/mocks/index.ts`
- `mobile/README.md`

**Adicionados pelo code review de 28/08/2026:**
- `mobile/src/app/(auth)/_layout.tsx` — `headerShown: false` no grupo (header espúrio "login")
- `mobile/src/services/api-client.ts` — comentário sobre a redundância do `replace` pós-`logout()`
- `_bmad-output/planning-artifacts/epics.md` — âncora do MSW corrigida (`server.listening` não existe)

**Mobile — removidos (template `create-expo-app`):**
- `mobile/src/app/explore.tsx`
- `mobile/src/components/animated-icon.tsx`
- `mobile/src/components/animated-icon.web.tsx`
- `mobile/src/components/animated-icon.module.css`
- `mobile/src/components/app-tabs.tsx`
- `mobile/src/components/app-tabs.web.tsx`
- `mobile/src/components/themed-text.tsx`
- `mobile/src/components/themed-view.tsx`
- `mobile/src/components/ui/collapsible.tsx`
- `mobile/src/components/hint-row.tsx`
- `mobile/src/components/web-badge.tsx`
- `mobile/src/components/external-link.tsx`
- `mobile/assets/images/expo-logo.png`
- `mobile/assets/images/logo-glow.png`
- `mobile/assets/images/react-logo.png`
- `mobile/assets/images/react-logo@2x.png`
- `mobile/assets/images/react-logo@3x.png`
- `mobile/assets/images/expo-badge.png`
- `mobile/assets/images/expo-badge-white.png`
- `mobile/assets/images/tutorial-web.png`
- `mobile/assets/images/tabIcons/` (6 arquivos: `home*.png`, `explore*.png`)

**Planejamento (BMAD):**
- `_bmad-output/implementation-artifacts/1-8-shell-de-navegacao-e-remocao-do-template-expo.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/deferred-work.md`

## Change Log

| Data | Mudança |
|---|---|
| 2026-08-28 | **Code review** (3 camadas adversariais): 7 decisões resolvidas, 6 patches aplicados, 7 itens diferidos, 4 dispensados. Guards do shell passaram a ser derivados de `ROLE_ROUTES` (AC #2 agora literal); loop de redirect para papel sem destino fechado em `index.tsx`; `Object.hasOwn` em `homeForRole`; `headerShown: false` no grupo `(auth)`; registros de `sprint-status.yaml`, `deferred-work.md`, `epics.md` e Debug Log corrigidos. Aberto: Task 6.12b (verificação do caminho de logout). Status → in-progress. |
| 2026-08-28 | Implementação da Story 1.8: shell de navegação (`<Stack>` + `Stack.Protected` por papel), `homeForRole` como fonte única do mapa papel→rota, `enableMocking()` idempotente via guarda em `globalThis`, remoção de ~930 linhas do template Expo (12 arquivos + 14 assets). Verificação em execução em browser real fecha as ACs #4/#5/#7 da Story 1.6 e a AC #5 da Story 3.2b. Status → review. |
