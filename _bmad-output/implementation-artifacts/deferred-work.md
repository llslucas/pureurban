# Deferred Work

## Deferred from: code review of 1-3-setup-effect-ts-e-composition-root.md (2026-04-03)
- Query manual `SELECT 1 as health` no health-check pode ser frágil (aceito como prova de conceito inicial)
- `DomainEvent.occurredAt` é `string` genérica (poderia usar Branded Type no futuro para maior segurança de domínio)
- Missing Effect Composition Primitives in WithEvents
- Typed Errors are Eviscerated
- Reckless Synchronous Event Dispatching
- Potentially Hanging Module Teardown
- Sloppy, Untyped Domain Events payload
- queryResult array exists but lacks expected health shape
- Health check bypasses event dispatcher entirely — too much complexity for a simple health check program
- Apathetic Process Teardown — onModuleDestroy swallows runtime disposal failures into a log instead of failing loudly. — deferred: Unecessary now due to complexity

## Deferred from: code review of 1-5-setup-mobile-dependencias-e-configuracao-offline.md (2026-04-05)
- Omitted SafeAreaProvider Integration [`mobile/src/app/_layout.tsx`] — deferred, pre-existing

## Deferred from: code review of 2-2-autenticacao-login-e-refresh-token.md (2026-05-03)
- Tratar erro de rede no refresh token — Se `attemptTokenRefresh` encontrar um erro de rede (offline) ou 5xx, ele retorna `false`, forçando o logout do usuário. Devemos manter os tokens e tentar novamente quando a rede voltar? — deferred, pre-existing. Reason: Recurso não essencial para a fase do projeto.

## Deferred from: code review of 2-3-cadastro-e-gestao-de-motoristas.md (2026-05-03)
- N+1 double-fetch em `updateDriver`: `findByIdAndCompanyAndRole` no use-case + `findFirst` interno do `updatePartial` no adapter (3 queries onde 1 bastaria) — padrão pre-existente, otimização futura.
- Sem guard de empresa ativa: JWT válido de empresa desativada ainda permite criação/gestão de motoristas — gap sistêmico pré-existente, não causado por esta story.
- `UserData` carrega campo `password` no tipo de domínio (core layer expõe hashed password no tipo de retorno dos use-cases) — constraint de design pré-existente; service faz stripping correto em todos os métodos.

## Deferred from: code review of 2-4-cadastro-e-gestao-de-alunos.md (2026-05-06)
- Session Hijacking / Lack of Invalidation on Password Change — deferred: pre-existing limitation
- Active Session Persistence Post-Deactivation — deferred: pre-existing limitation
- Denial of Service via Unbounded Pagination — deferred: pre-existing limitation in list-drivers
- Denial of Service via bcrypt Hashing — deferred: rate limiting is a cross-cutting concern
- Missing Audit Trail (No Actor Tracking) — deferred: actor tracking is not specified

## Deferred from: code review of 2-5-crud-de-rotas-de-transporte (2026-05-10)
- Unbounded memory consumption or timeout [api/src/domains/routing/shell/adapters/prisma-route.adapter.ts] — deferred, pre-existing
- Dupla Busca no Banco de Dados (Anti-Pattern de Performance) [api/src/domains/routing/shell/adapters/prisma-route.adapter.ts] — deferred, pre-existing

## Deferred from: code review of 2-6-vinculos-aluno-rota-e-motorista-rota (2026-05-10)
- `Effect.orDie` em todos os adapters converte falhas infra recuperáveis em defects/500 sem retry/métrica — padrão pré-existente desde Story 1.3.
- Falta outbox transacional para eventos de domínio (eventos podem ser perdidos se processo crashar entre commit e dispatch) — arquitetural, fora do escopo.
- `Layer.merge` em `routing.module.ts` impede transações cross-aggregate (criar rota + assignar students atomicamente) — escolha arquitetural.
- `@Get('mine')` antes de `@Get(':id')` é forçado apenas por disciplina — adicionar teste de regressão que prove resolução de `mine` quando `:id` existe.
- `companyId` em `routeStudent.create`/`routeDriver.create` vem do parâmetro de input em vez de `route.companyId` verificado na tx — defense-in-depth.
- `sprint-status.yaml` tem comentários de timestamp divergentes do dado YAML — gerenciamento manual; trivial.

## Deferred from: code review of 3-0-contrato-de-api-embarque-digital (2026-07-12)
- Tipos gerados são inúteis para 11 dos request bodies existentes: `TypeLiteralClass`/`RefineClass` colapsam em `Record<string, never>` colidentes (o mesmo schema vazio é `$ref`'d por login, register, refresh, create-driver, create-student, create-route, assign-student, assign-driver) [mobile/src/types/api.d.ts] — pré-existente: classes Effect Schema usadas como `@Body` não produzem metadata Swagger. Só ficou visível agora porque esta story congelou o documento como artefato. Não bloqueia o Épico 3 (os 2 endpoints novos usam DTOs de classe e geram tipos corretos), mas bloqueia qualquer trilha futura que queira consumir os endpoints antigos via tipos gerados.
- Não existe `ValidationPipe` global na API — `@IsUUID()` no `check-in.dto.ts` e todo class-validator nos DTOs do shell é código morto [api/src/main.ts] — pré-existente (mesmo padrão em `create-trip.dto.ts`). A decisão entre registrar um `ValidationPipe` global e padronizar no `EffectSchemaPipe` existente é escopo da 3.3a, quando o endpoint deixar de ser stub.
- `api-client.ts` não expõe headers por requisição: `post<T>(path, body)` é estruturalmente incapaz de enviar o `X-Idempotency-Key` que o contrato agora declara obrigatório [mobile/src/services/api-client.ts] — pré-existente; o cliente HTTP é escopo da 3.3b/3.4b. Registrado aqui porque o contrato passou a depender disso. **Endereçado pela Story 3.4b (01/09/2026):** a 3.3b já havia acrescentado o parâmetro `headers` a `post`/`patch`; a 3.4b fecha o item extraindo `ApiClientError` para `mobile/src/services/api-error.ts` (módulo sem imports) e passando a mesma `X-Idempotency-Key` gravada em `offline_queue.id` no dreno da fila.

## Deferred from: code review of 3-3a-check-in-de-embarque (2026-08-14)
- Discriminador de `P2002` do domínio routing continua quebrado: `isExpectedUniqueViolation` inspeciona `e.meta?.target`, que vem `undefined` sob Prisma 7 + `@prisma/adapter-pg` — os campos do constraint só existem em `meta.driverAdapterError.cause.constraint.fields` [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts:24-31]. A função retorna `false` incondicionalmente, então `ASSIGNMENT_ALREADY_EXISTS` quase certamente sai como 500. A Story 3.3a corrigiu o padrão apenas no adapter novo do boarding (escopo correto). Fica invisível porque a única suite que o exporia (`route-assignment.e2e-spec.ts`) está vermelha no `beforeAll` por motivo alheio. Candidato a story técnica do domínio routing.
- `test/route-assignment.e2e-spec.ts` falha na baseline: `POST /api/v1/auth/login` retorna 201 (sem override de `@HttpCode`) mas o teste espera 200 [api/test/route-assignment.e2e-spec.ts] — pré-existente, confirmado revertendo as mudanças da 3.3a. Mascara o item acima; corrigir os dois juntos.
- TOCTOU entre validação e persistência do check-in: a viagem pode transicionar `ACTIVE → COMPLETED` entre `findActiveTrip` e `recordCheckIn`, gravando embarque contra viagem já encerrada [api/src/domains/boarding/core/use-cases/check-in.use-case.ts:40-62] — janela estreita; exigiria transação com `SELECT ... FOR SHARE` na trip, o que atravessa a fronteira de bounded context (schemas diferentes). Decisão arquitetural, não correção pontual.
- `ManagedRuntime` criado por módulo e nunca descartado (sem `OnModuleDestroy` chamando `runtime.dispose()`) e dispatch de eventos de domínio best-effort pós-commit, sem outbox nem retry [api/src/domains/boarding/shell/boarding.module.ts, api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.ts] — padrão pré-existente replicado em `trip.module.ts` e `routing.module.ts`; o boarding é a terceira cópia. O item do outbox já consta do defer da 2.6; registrado de novo porque a 3.3a é a primeira story em que o evento perdido tem consequência de segurança visível ao usuário (embarque de criança não notificado).

## Deferred from: code review of 3-5a-lista-de-alunos-da-viagem-com-status (2026-08-15)
- Suite e2e do trip não limpa dados: ~57 usuários, 2 empresas, rotas, viagens e 25 boarding records ficam no banco a cada execução [api/test/trip.e2e-spec.ts:160-166] — pré-existente: `boarding.e2e-spec.ts:206-212` tem exatamente o mesmo `afterAll` (só `app.close()`). Os specs de adapter da própria 3.5a limpam atrás de si, então a disciplina existe no repo — só não foi aplicada onde o volume é maior. Candidato a helper de teardown compartilhado em `test/`.
- JWT nunca é revalidado contra `isActive`/`role` do usuário: motorista desligado ou rebaixado continua listando alunos até o token expirar [api/src/domains/auth/shell/strategies] — pré-existente, decisão de design da autenticação (Épico 2). Ficou mais visível na 3.5a porque o dado exposto passou a ser nome de criança.
- `toInfraError` copiado para o terceiro e quarto adapters em vez de viver em `shared/shell` [api/src/domains/trip/shell/adapters/prisma-trip-roster.adapter.ts:9, prisma-boarding-status.adapter.ts:8] — a Task 5.4 prescreveu explicitamente copiar de `prisma-trip-access.adapter.ts`, então a duplicação foi intencional nesta story. Extrair junto com o item de `Effect.orDie` já registrado no defer da 2.6.
- `@Req() req: Request & { user: { userId: string } }` resolve para o `Request` global do DOM, não o do Express — funciona só porque a metade não usada nunca é checada estruturalmente [api/src/domains/trip/shell/http/trip.controller.ts:48,68,79,117] — pré-existente, copiado de `boarding.controller.ts`. Um `AuthenticatedRequest` em `shared/shell/http/` elimina as ocorrências repetidas em todos os controllers.
- Nada amarra a resposta em runtime ao DTO publicado: o service devolve objeto literal com tipo inferido, o controller não tem anotação de retorno, `@ApiDataResponse(...)` é só decoração e `ErrorBodyDto.code` é `string` cru [api/src/domains/trip/shell/trip.service.ts:54-67, api/src/domains/shared/shell/http/error-response.dto.ts:9] — pré-existente em todos os domínios. Prova de que já derivou: `BoardingStatusDto` declara `NOT_RETURNING` e o core só emite dois valores (divergência consciente da Task 3.4, mas que o compilador não vigia). Tipar `code` como union literal daria à trilha mobile algo melhor que comparar `string` com literal hardcoded.

## Deferred from: code review of 3-2b-geracao-e-exibicao-de-qr-code-do-aluno (2026-08-23)
- `onlineManager` do TanStack Query nunca foi conectado ao NetInfo — `grep -rn "onlineManager\|NetInfo" mobile/src` não retorna nada e nenhum dos dois está em `package.json` [mobile/src] — pré-existente (infra da story 1.5). O `OnlineManager` padrão inicializa `#online = true` e só instala listeners quando `window.addEventListener` existe, ou seja, é inerte em React Native: `isOnline()` fica permanentemente `true`. Consequência para toda query do app, não só a desta story: nenhuma query pausa offline (queima o `retry` ladder inteiro com backoff a cada mount) e nenhuma refaz fetch ao reconectar. A story 3.2b afirma que "o Tier 1 já está ligado — você não precisa configurar nada por query"; para a metade de reconexão isso não é verdade. Fica mais caro a cada story mobile que assume offline-first. Candidato a story técnica antes da 3.4b (fila de sincronização), que depende de detecção de conectividade real.
- `sessionId` nunca é lido, armazenado ou validado no backend — aparece em exatamente um lugar em toda a API, a declaração do campo no DTO [api/src/domains/boarding/shell/http/dtos/qr-code-payload.dto.ts:26] — tradeoff de MVP já documentado no contrato da 3.0 ("o backend trata como opaco"). O efeito é que o QR se reduz a um UUID de aluno em texto claro: fotografar o código de um aluno, ou simplesmente conhecer um `studentId`, é suficiente para o check-in aceitar. A regeneração por login (`auth.store.ts:25`) não revoga nada, porque o servidor nunca soube o valor anterior. Não é regressão desta story e não viola nenhuma AC dela — a 3.2b é mobile-only, sem contraparte backend. Registrado aqui porque a 3.2b é a primeira story que efetivamente coloca o valor em circulação, e porque o binding de sessão ponta-a-ponta precisa de decisão consciente na 3.3b/3.6 (assinar o payload, ou registrar o sessionId no login e validá-lo no check-in).
- **✅ FECHADO pela Story 1.8 (28/08/2026)** — por consequência do shell de navegação. Medido em browser real: um aluno autenticado que reabre o app com sessão hidratada (sem passar pela tela de login) chega a `/(student)/home` e alcança o QR em **1 toque** ("Meu QR Code"); a contagem é a mesma a partir de um login novo. Satisfaz o teto de 2 toques do NFR19 também na reabertura, que antes era inobservável. ~~O item original:~~ **AC #5/NFR19 não é demonstrável no produto: o navegador raiz não monta os grupos `(student)`/`(driver)`** [mobile/src/app/_layout.tsx:87, mobile/src/components/app-tabs.tsx:16-30, mobile/src/app/index.tsx:37] — decisão adiada para a story 3.6. `_layout.tsx` renderiza `{isDbReady && isMockReady && isAuthenticated && <AppTabs />}` e `AppTabs` é um `NativeTabs` com exatamente dois triggers, `index` e `explore`, ambos do template do Expo; `app/index.tsx` ainda é a tela "Welcome to Expo". A única entrada no grupo do aluno é `router.replace('/(student)/home')` no login, que só dispara em login novo — quem reabre o app com sessão hidratada não tem caminho de nenhum tamanho até o QR. Efeito colateral: a AC #2 ("sobrevivendo a reinício do app") também fica inobservável, porque o `sessionId` sobrevive no MMKV mas a tela que o exibiria não é alcançável. A contradição é da própria story 3.2b (*Questões Abertas #3* defere o nav shell enquanto as ACs 2 e 5 dependem dele), não um deslize de implementação. A 3.2b fica registrada com a **AC #5 parcialmente atendida**: o fluxo de 1 toque existe e está correto a partir do login, o que falta é o shell que torna o grupo alcançável fora dele.
- **Nenhuma AC da 3.2b tem evidência de runtime — Tasks 9.3 e 9.4 ficaram marcadas `[x]` sem execução** [_bmad-output/implementation-artifacts/3-2b-geracao-e-exibicao-de-qr-code-do-aluno.md:190-191] — decisão adiada para a story 3.6. O texto das próprias linhas e a Completion Note 349 declaram abertamente que o roteiro manual com `EXPO_PUBLIC_USE_MOCKS=1` e a decodificação num leitor de QR real não rodaram (sem emulador/device no ambiente; `expo start --web` quebra por um erro pré-existente de `expo-sqlite`/`wa-sqlite.wasm`). A substituição foi provada só por leitura de código contra a Tabela de Verdade. Continua valendo o que o dev recomendou: rodar o roteiro num device/emulador real. Fica junto do item acima porque os dois se resolvem na mesma passada — sem o nav shell, o roteiro manual não tem como ser executado de ponta a ponta de qualquer forma.
- **`eslint` + `eslint-config-expo` e `mobile/eslint.config.js` entraram fora da lista de dependências autorizada pela Task 3** [mobile/package.json, mobile/eslint.config.js] — decisão adiada para a story 3.6. A Task 3 autorizava exatamente 3 deps de runtime (`expo-crypto`, `react-native-qrcode-svg`, `react-native-svg`) e o cabeçalho do File List diz "+3 deps". O overrun está disclosed e justificado na Completion Note 350 — sem o toolchain a Task 9.2 (`npm run lint`) não roda —, então é um excesso documentado, não silencioso. Falta só a ratificação explícita do Lucas de que o lint do mobile passa a ser mantido a partir daqui.

## Deferred from: code review of 3-3b-escaneamento-de-qr-code (2026-08-23)
- **Segundo 401 após um refresh bem-sucedido não encerra a sessão** [mobile/src/services/api-client.ts:129-146] — pré-existente. O bloco de 401 é guardado por `!isRefreshRequest`, então o retry pós-refresh que volta 401 de novo (token revogado no servidor, clock skew, refresh que devolveu um access token já inválido) escapa para o tratamento genérico de erro: lança `ApiClientError` com o código do envelope e **não** chama `logout()` nem `router.replace('/(auth)/login')`. A sessão fica viva com um token morto e toda requisição seguinte repete o ciclo. Não é regressão da 3.3b — a Task 2.4 proibia explicitamente alterar qualquer coisa além do repasse de `extraHeaders`, e o repasse foi feito corretamente. Fica registrado porque a 3.3b é a primeira story em que o caminho tem consequência visível ao usuário: o overlay de erro da tela de scan aparece sobre uma tela que já deveria ter navegado para o login.
- **`CameraView` não tem gate de foco: a câmera continua ativa quando a tela sai de cena sem ser desempilhada** [mobile/src/components/qr-scanner.tsx:43-60] — não alcançável hoje. O `QrScanner` é montado incondicionalmente por `scan.tsx` e não há `useIsFocused` nem gate de `AppState`; navegar de `scan` para uma tela irmã do mesmo `Stack` deixaria a câmera segurando o hardware e drenando bateria pela viagem inteira. Hoje a única saída da tela de scan é o botão de voltar do header, que desempilha e desmonta, então o cenário não existe no produto. Vira real na Story 3.5b, quando `(driver)/student-list.tsx` deixar de ser placeholder e ganhar navegação a partir da tela de scan ou da viagem.
- **Check-in bem-sucedido não invalida o cache do roster** [mobile/src/app/(driver)/scan.tsx:176-199] — prematuro nesta story. `submit` atualiza `boardedCount` e `result` mas não chama `queryClient.invalidateQueries` para `GET /trips/:id/students`, e o comentário do próprio mock (`boarding.handlers.ts:31-32`) afirma que o estado compartilhado existe justamente para que "um check-in na tela de scan reflita na lista". A metade cliente desse contrato falta — mas `(driver)/student-list.tsx` ainda é o placeholder de 9 linhas (a própria story registra isso na *Questão Aberta #3*), então não há consumidor para ficar obsoleto. É escopo da Story 3.5b, que precisa criar a query e a invalidação na mesma passada.
- **O ramo `COMPLETED` de `(driver)/trip.tsx` é código morto contra o contrato real** [mobile/src/app/(driver)/trip.tsx:96-105] — escopo da Story 3.1, que está em `review`. A tela renderiza um card específico para `activeTrip.status === 'COMPLETED'`, mas o backend responde `/trips/active` com `findFirst({ where: { …, status: 'ACTIVE' } })` (`api/src/domains/trip/shell/adapters/prisma-trip.adapter.ts:128-129`): o endpoint só pode devolver `ACTIVE` ou `null`, nunca `COMPLETED`. O ramo só é alcançável hoje porque o mock da 3.3b mantinha a viagem encerrada em `currentTrip` — divergência que esta review corrigiu no mock. Consequência a decidir na 3.1: ou o ramo sai, ou o motorista precisa de um resumo pós-encerramento vindo de outro endpoint. Registrado aqui porque a correção do mock torna o ramo inalcançável também em desenvolvimento.

## Deferred from: dev of 1-6-ambiente-de-execucao-web-do-app-mobile (2026-08-27)

Os dois itens abaixo foram **executados e observados num browser real** (Chromium, dev
server em `http://localhost:8081`), não deduzidos por leitura. São a razão pela qual as
ACs #4, #5 e #7 da Story 1.6 foram fechadas como **diferidas** por decisão do Lucas: o
ambiente de execução existe e está provado, mas as telas do produto não são alcançáveis
dentro dele.

- **✅ RESOLVIDO pela Story 1.8 (28/08/2026).** `_layout.tsx` agora renderiza um `<Stack>` do Expo Router com `Stack.Protected` por papel; `index.tsx` e `+not-found.tsx` são redirecionadores de entrada que consomem `homeForRole()`. Verificado num browser real (Chromium headless, dev server `http://localhost:8081`, playwright-core): **deslogado**, `/`, `/scan`, `/qr-code`, `/trip` e `/student-list` renderizam a tela de login (4 elementos interativos, sem tela em branco, sem "unmatched route"); **login `admin@pureurban.dev`** navega para `/(admin)/home` com a requisição saindo para `localhost` e sem erro de CORS; **F5** mantém a sessão e volta direto para `/(admin)/home`; **aluno autenticado** que digita rota de motorista é redirecionado para `/(student)/home`. Console limpo (só warnings pré-existentes de RN-web). ~~O item original:~~ **O layout raiz não renderiza a saída do router — nenhuma tela do projeto é alcançável, em nenhum estado de autenticação** [mobile/src/app/_layout.tsx:87, mobile/src/components/app-tabs.tsx:16-30] — escopo da Story 3.6. Este é o mesmo item já registrado no defer da 3.2b ("o navegador raiz não monta os grupos `(student)`/`(driver)`"), mas o diagnóstico era mais brando do que a realidade: não é que faltem triggers no `AppTabs`, é que **não existe `<Slot />`, `<Stack />` nem `<Tabs />` no layout raiz**. O que ele renderiza é `<AnimatedSplashOverlay />` e, só sob `isAuthenticated`, `<AppTabs />` — um `NativeTabs` com os triggers `index` e `explore` do template do Expo. Medido no alvo web: **não autenticado**, `/login`, `/scan`, `/qr-code` e `/trip` devolvem tela em branco com 0 elementos interativos e **zero erro no console**; **autenticado** (sessão semeada nas chaves `mmkv.default\auth.*`), todas renderizam "Welcome to Expo / GET STARTED / Try editing src/app/index.tsx" e `/scan`/`/qr-code` redirecionam para `/`. Consequência direta: as Dev Notes da 1.6 afirmam que "no alvo web isso deixa de ser bloqueio de verificação: as rotas são alcançáveis pela barra de endereços" — **isso é falso e está agora verificado**. Enquanto este item não fechar, nenhuma story mobile (3.3b, 3.4b, 3.5b) consegue evidência de runtime, independentemente do ambiente de execução existir.

- **✅ RESOLVIDO pela Story 1.8 (28/08/2026).** `enableMocking()` agora memoiza a *promise* de inicialização numa chave de `globalThis` (`__pureurbanMswBoot`), que sobrevive à reavaliação de módulo do Fast Refresh; em caso de rejeição a chave é limpa, para não prender o app na tela de erro. A âncora `server.listening` prescrita pelo épico **não foi usada** — a propriedade não existe em `msw@2.15` (ver correção na Task 3 da Story 1.8). Verificado num browser real: boot sob `EXPO_PUBLIC_USE_MOCKS=1` chega à tela de login sem a tela "Falha ao inicializar os mocks (MSW)", `[mocks] MSW ativo` aparece uma vez por carga de página, e salvar `_layout.tsx` com o dev server no ar (Fast Refresh, rebuild incremental confirmado no log do Metro) **não** reabre o bug. ~~O item original:~~ **`enableMocking()` não é idempotente: o modo MSW derruba o app na segunda invocação do efeito** [mobile/src/mocks/index.ts:3-20, mobile/src/app/_layout.tsx:38-48] — escopo da Story 3.6 (ou de uma correção pontual antes dela). O `useEffect` que chama `enableMocking()` roda duas vezes, `enableMocking()` não guarda estado e o segundo `server.listen()` lança `Invariant Violation: Failed to call "configure()" on the network: cannot configure an already enabled network.`. O `catch` do layout seta `mockError` e o app renderiza a tela "Falha ao inicializar os mocks (MSW)" — comportamento deliberado da 3.0, que prefere parar a mandar requisições para a API real sem aviso. **A causa NÃO é StrictMode** — não existe `StrictMode` em `mobile/src/` nem no build do `expo-router` (grep vazio em 28/08/2026), e `_layout.tsx:37-49` é um efeito com deps `[]` sem wrapper. A causa provável é Fast Refresh / remount do componente. Isso muda a correção: uma guarda de módulo (`let started = false`) **não sobrevive** a um Fast Refresh, que reavalia o módulo e zera a flag — o bug reabriria no primeiro save. Use uma guarda ancorada no estado do próprio servidor MSW (`if (server.listening) return`), que sobrevive à reavaliação do módulo porque o `server` vem de outro módulo e mantém o estado real. **Registrar junto a boa notícia, para que ninguém re-investigue:** o risco que a Story 1.6 sinalizava — `src/mocks/server.ts` usa `setupServer` de `msw/native`, cujo subpath o `package.json` do msw mapeia para `null` na condição `browser` — **não se concretizou**. O MSW intercepta corretamente no browser: o bundle resolveu (246 módulos), o console imprimiu `[mocks] MSW ativo`, um `POST /api/v1/auth/login` com `motorista@pureurban.com` devolveu `200` com o DRIVER mockado, e **nenhuma requisição escapou para a rede real**. O único problema é a dupla invocação.

- **✅ RESOLVIDO pela Story 1.9 (07/09/2026).** O seed voltou a funcionar ponta a ponta: `prisma.config.ts` declara `migrations.seed: "tsx prisma/seed.ts"` (o Prisma 7 lê o comando de seed do arquivo de config, não do hook `prisma.seed` do `package.json` — chave confirmada nos tipos do `@prisma/config`), o `package.json` ganhou o script `npm run seed` → `prisma db seed`, e o `seed.ts` constrói o cliente com o adapter `PrismaPg` + `DATABASE_URL` (espelhando o `PrismaService`) mais `import 'dotenv/config'` e guarda com falha legível sem `DATABASE_URL`. O runner é `tsx` (novo devDependency) porque o `ts-node` em modo CJS não resolve o import `.js` → `client.ts` do cliente gerado sob nodenext (`MODULE_NOT_FOUND` provado em execução); `ts-node` e `tsconfig-paths`, sem consumidor, foram removidos. Verificação em execução (07/09/2026): dev DB (dados da 1.6) → skip idempotente; banco novo `pureurban_seed_check` → `prisma migrate deploy` + seed criou Company + Admin (hash `$2b$12$`), `bcrypt.compare('admin123456', hash) === true`; 2ª execução pula; 206 testes unitários verdes; banco de teste descartado. `mobile/README.md` trocou o workaround de curl pelo `npm run seed`. ~~O item original:~~ **`prisma/seed.ts` está quebrado sob Prisma 7 e não é alcançável por nenhum comando documentado** [api/prisma/seed.ts:22, api/package.json, api/prisma.config.ts] — pré-existente, fora do escopo da 1.6 (que fixa 6 arquivos na AC #8). Três camadas: (1) `npm run seed`, que a Story 1.6 e o README de várias stories prescrevem, **não existe** — `seed` é um hook em `package.json` → `prisma.seed`, não um script; (2) `npx prisma db seed` responde `No seed command configured`, porque o Prisma 7 moveu essa configuração para `prisma.config.ts` e ela não foi migrada; (3) rodando `prisma/seed.ts` direto, ele falha em `new PrismaClient()` sem `adapter`, obrigatório no Prisma 7 — exatamente o que o `@ts-ignore` do próprio arquivo antecipa ("tipos gerados exigem `adapter`"). Na 1.6 o admin foi criado por `POST /api/v1/auth/register` para não tocar no arquivo. Enquanto não for corrigido, qualquer story que dependa de "rodar o seed" não tem ambiente reproduzível.


## Deferred from: code review of story-1.6 (2026-08-28)

- **Falha de `initializeDatabase()` só é logada — o app segue sem fila offline e sem sinal** [mobile/src/app/_layout.tsx:30-34] — pré-existente, decisão deliberada da Story 1.5 ("Errors são logados mas não travam o app — modo degradado preferível a crash"). `initializeDatabase().catch(console.error).finally(() => setIsDbReady(true))` abre o portão de boot mesmo quando o banco não abriu, então o app roda sem Tier 2 e nada no produto indica isso — nem ao dev, nem ao motorista. No alvo web o gatilho mais provável é `crossOriginIsolated === false` (acesso por IP de LAN, ou `--https`, que contorna o patch do `metro.config.js`), onde o wa-sqlite rejeita a abertura. Não corrigido na 1.6 porque a AC #8 proíbe tocar em `_layout.tsx`. Contraste deliberado com o caminho do MSW, que na mesma tela **para o app** em caso de falha (`_layout.tsx:44-48`) — a assimetria é intencional hoje, mas vira dívida quando o Tier 2 for exercitado de verdade na 3.4b / Story 1.7.

---

## Reescopo e diferimentos — sprint-change-proposal-2026-08-28 (aprovado por Lucas, 28/08/2026)

### Itens reescopados da Story 3.6 para a Story 1.8

A Story 3.6 é a **última** do Épico 3, mas os dois primeiros itens abaixo bloqueiam as
stories que vêm **antes** dela (3.3b, 3.4b, 3.5b). Foram extraídos para a nova **Story 1.8
— Shell de Navegação e Remoção do Template Expo**, que executa a seguir.

| Item | Origem | Novo escopo | Desfecho |
|---|---|---|---|
| Layout raiz não renderiza saída de router — nenhuma tela alcançável | dev da 1.6 (27/08) | **Story 1.8** | ✅ **RESOLVIDO** — `<Stack>` + `Stack.Protected` por papel; verificado em browser real (Bloco A da Task 6) |
| `enableMocking()` não é idempotente; o modo MSW não sobe | dev da 1.6 (27/08) | **Story 1.8** | ✅ **RESOLVIDO** — guarda em `globalThis`; boot e Fast Refresh verificados sob `USE_MOCKS=1` (Bloco B da Task 6) |
| AC #5 da 3.2b não demonstrável (nav shell ausente) | code review da 3.2b (23/08) | **Story 1.8** — fecha por consequência | ✅ **FECHADO** — aluno reabre com sessão hidratada e alcança o QR em **1 toque** (medido: 1 toque tanto de login novo quanto de reabertura) |
| Ratificação de `eslint` + `eslint-config-expo` no mobile | code review da 3.2b (23/08) | **Story 1.8** — o lint passa a rodar sobre o código que sobrar | ⏳ **PENDENTE** — `npm run lint` roda limpo sobre a árvore pós-limpeza (portão da AC #6, re-verificado no code review de 28/08), mas ratificar o overrun de dependências é decisão do Lucas e segue aberta. Rodar o lint não é o mesmo ato que ratificá-lo. |

A Story 3.6 fica exclusivamente com a integração e o E2E do Épico 3.

### Diferido para a Fase 2 pela revisão de escopo

- **Avisos gerais do motorista (broadcast)** — FR36 e FR37, ex-stories 4.5a e 4.5b. Não
  aparece em nenhuma das quatro jornadas do PRD e está abaixo de todas as prioridades da
  Mitigação de Riscos. Sai junto o endpoint `POST /api/v1/boarding/broadcast` e o evento
  SSE `boarding.broadcast`.
- **Push notifications** — evolução do FR30. No MVP o lembrete automático é entregue in-app
  pelo evento `boarding.checkin_reminder` no stream do Épico 4, mais o estado lido na
  abertura do app. O scheduler e o use case do core da Story 4.4 são preservados
  integralmente; saem o registro de push token e as notification actions.
- **Mapa cartográfico com marcador animado** — evolução do FR32. No MVP a Story 5.2
  apresenta a última posição conhecida com distância e tempo estimado até o ponto do aluno.
  Fecha, sem ser pago, o risco aberto da Architecture §8 regra 14 (biblioteca de mapas com
  suporte web, nunca escolhida — `react-native-maps` não atende).
- **Badge de estado por item da fila offline** (`✓` / `⏳` / `✗`) e representação visual do
  teto de 500 itens — Story 3.4b. O mecanismo da fila, a idempotência e a persistência a
  crash (NFR11, NFR12, NFR14) permanecem no MVP; só a interface foi enxugada para o banner
  global "Modo Offline — dados serão sincronizados" (NFR13).

### Registro para a tese

A `architecture.md` §10 afirmava que o fatiamento em trilhas transformaria *"a arquitetura
hexagonal facilita trabalho paralelo em equipes pequenas"* de hipótese em **evidência
coletável**. Com o retorno ao modelo solo, isso deixa de ser coletável nos Épicos 4 e 5.
Reenquadramento adotado: o **Épico 3** é o estudo de caso do modelo de trilhas paralelas e
os **Épicos 4 e 5** são o grupo de comparação sob fatiamento vertical — observação
comparativa em vez de afirmação de viabilidade sem controle.

## Deferred from: code review of 1-8-shell-de-navegacao-e-remocao-do-template-expo (2026-08-28)

- **Três telas de produto ficam sem ponto de entrada in-app** [mobile/src/app/(driver)/routes.tsx, mobile/src/app/(driver)/student-list.tsx, mobile/src/app/(student)/track-bus.tsx] — as três estão declaradas como `Stack.Screen` nos layouts de grupo, mas nada navega até elas: as únicas navegações in-app que existem são `(student)/home.tsx:23` → `qr-code` e `(driver)/trip.tsx:158` → `scan`. A AC #1 declara vitória com "alcançáveis **pela barra de endereços no alvo web**" — mecanismo que não existe no alvo Android (Story 1.7). Enquanto isso o `deferred-work.md` registra o bloqueio como fechado para "toda story mobile subsequente". Em device, são três telas implementadas e mortas. Os pontos de entrada pertencem às stories que as especificam (3.4b, 3.5b), não a esta.
- **STUDENT e DRIVER não têm como sair da sessão no happy path** — `grep -rn logout mobile/src/app` só encontra `(admin)/home.tsx:17` (botão real), `(student)/qr-code.tsx:65` e `(driver)/scan.tsx:371` — os dois últimos dentro de estados de erro ("sessão corrompida", "acesso restrito"). Agora que o shell é toda a superfície de navegação do app, um aluno ou motorista no caminho feliz não consegue trocar de conta sem limpar o MMKV. Relevante para o próprio roteiro de teste manual, que loga três usuários diferentes no mesmo perfil de browser. Nenhuma AC desta story pede UI de logout.
- **`+not-found` perdeu permanentemente a capacidade de reportar rota inexistente** [mobile/src/app/+not-found.tsx:4] — `export { default } from './index'` faz qualquer URL digitada errada teleportar em silêncio o usuário autenticado para a home do seu papel, reescrevendo a barra de endereços. O comentário do arquivo justifica o aliasing só pelo caso `/scan` deslogado (AC #3); o efeito colateral não está declarado em lugar nenhum, e é o que vai fazer o próximo bug de divergência de guard aparecer como um redirect misterioso em vez de um erro. O aliasing é intencional e exigido pela AC #3 — revisitar quando houver um caso de erro real a mostrar.
- **Papel alterado no servidor não re-sincroniza numa sessão já persistida** [mobile/src/stores/auth.store.ts:39-40] — o estado hidrata do MMKV no load do módulo e o refresh de token nunca re-lê o usuário. Um motorista rebaixado no backend continua com o grupo `(driver)` montado até fazer logout manual. Pré-existente ao shell (o design de hidratação é da Story 2.2), mas o shell é o que torna a consequência visível: o papel stale agora escolhe qual árvore de telas monta.
- **`initialRouteName` como prop JSX não é de onde o expo-router lê a âncora** [mobile/src/app/(admin)/_layout.tsx:5] — `expo-router/build/useScreens.js:127` deriva a ordenação inicial do grupo de `node?.initialRouteName`, construído a partir do export `unstable_settings` do layout; a prop JSX só é repassada ao navegador do React Navigation por baixo. Inerte hoje porque `(admin)` tem exatamente uma tela, e o padrão é pré-existente — `(driver)/_layout.tsx` e `(student)/_layout.tsx` já fazem igual, com quatro e três telas, onde o comportamento de âncora seria observável.
- **Órfãos do template Expo: cluster de theming, deps sem importador e `reset-project.js`** [mobile/src/constants/theme.ts, mobile/src/hooks/use-theme.ts, mobile/src/hooks/use-color-scheme.ts, mobile/src/hooks/use-color-scheme.web.ts, mobile/src/global.css, mobile/scripts/reset-project.js, mobile/package.json] — são as *Questões Abertas #1/#2/#3* da própria Story 1.8, mantidas de propósito: a AC #6 exige diff vazio em `package.json`, então nada disso podia sair na 1.8. Cadeia morta confirmada por grep: `constants/theme.ts` → `global.css`, `hooks/use-theme.ts` → `constants/theme` + `use-color-scheme`, sem nenhum importador de produto (o app usa `@/lib/theme`, do Paper). Cinco deps perderam o último importador: `expo-device`, `expo-symbols`, `expo-image`, `expo-glass-effect`, `@react-navigation/bottom-tabs`. **Item de maior prioridade desta limpeza:** `scripts/reset-project.js:14` tem `oldDirs = ["src", "scripts"]` — enquanto o template existia isso apagava template, mas agora `npm run reset-project` move/apaga o código-fonte real do produto. Detalhe irônico do resto: `_layout.tsx:4` importa `useColorScheme` do `react-native` direto, então `use-color-scheme.web.ts` — que existe justamente para o caso de hidratação web — é o hook que ninguém usa. Resolver junto com uma decisão do Lucas sobre manter ou não `useTheme()`/`ThemeColor` como padrão declarado no `project-context.md`.
- **Mobile não tem runner de testes: a matriz de guards e `homeForRole` embarcam sem asserção** [mobile/package.json] — não há script `test` nem framework em `devDependencies`, e a Story 1.8 declara explicitamente que criar a suíte seria escopo novo. O custo ficou visível nesta review: `homeForRole` foi extraído para ser a fonte única de um mapeamento cuja divergência com os guards de `_layout.tsx` produz um loop de redirect **silencioso** (sem erro, sem log), e o code review fechou essa divergência derivando os guards do mapa — mas nada vigia a propriedade daqui em diante. Some-se a isso que toda a evidência de runtime das ACs #1-#4/#7/#8 é narrativa e não reproduzível (ver a ressalva de auditabilidade no Debug Log da story). Um único teste sobre `ROLE_ROUTES` × guards já pagaria o setup.

## Endereçado pela Story 1.10 — Setup do Test Runner no Mobile (2026-08-30)

- **Mobile não tinha runner de testes** (item do code review da 1.8, logo acima) —
  **endereçado**. A 1.10 instalou `jest-expo`, `@testing-library/react-native` e `jest`,
  criou `mobile/babel.config.js` e `mobile/jest.config.js`, expôs `npm test` /
  `npm run test:watch` e provou o harness com `role-routes.test.ts` (consistência
  `ROLES` × `ROLE_ROUTES` + `homeForRole`, incluindo colisão com chave de
  `Object.prototype`), `qr-payload.test.ts` e `smoke-render.test.tsx` (render de um
  primitivo `react-native`). Roda sem device/rede/`.env`, < 3s.
- **`decodeQrPayload` e o round-trip do QR verificados só no olho** (open question #1 das
  3.2b/3.3b) — **metade endereçada** por `qr-payload.test.ts`: round-trip, normalização de
  UUID maiúsculo, descarte de campos extras e tabela de entradas forjadas/malformadas (URL
  de cartaz, JSON truncado, array, campo ausente, UUID inválido, lixo binário), todas →
  `null` sem lançar.
- **Ainda aberto (fora do escopo da 1.10):** a outra metade da open question #1 — o mapa
  código-de-erro → feedback do motorista (`describeFailure`, inline e não exportado em
  `mobile/src/app/(driver)/scan.tsx`) continua sem cobertura. Extrair e testar é escopo da
  3.4b/3.5b (a própria 1.10 proíbe tocar em `scan.tsx`).
  **Endereçado pela Story 3.4b (01/09/2026):** `describeFailure` foi movido sem alteração do
  mapa para `mobile/src/utils/scan-feedback.ts` e exportado, e `scan-feedback.test.ts` cobre
  os 9 códigos com feedback distinto, a linha 16 da tabela (código não enumerado), o fallback
  `NETWORK_ERROR` e os dois estados novos da fila (`QUEUED_OFFLINE`, `QUEUE_FULL`).
- **Ainda aberto (fora do escopo da 1.10):** a fila offline da 3.4b (driver/mock do SQLite
  sob Jest) — decisão de design da própria 3.4b.
  **Endereçado pela Story 3.4b (01/09/2026):** não há mock de SQLite. A lógica (FIFO, backoff,
  teto de 500, 5 tentativas, classificação do desfecho de cada POST) vive em
  `mobile/src/utils/offline-queue.ts`, puro e sem import nativo, atrás da interface
  `QueueStorage`, e é exercitada contra um fake em memória. `expo-sqlite` fica isolado em
  `mobile/src/lib/offline-queue-storage.ts`, que nenhum teste importa e cuja verificação é o
  roteiro manual no alvo web.
- **Migração `@testing-library/react-native` v13 → v14** [mobile/package.json] — a 1.10
  fixou a v13 porque a v14 exige o peer `test-renderer@^1` (novo renderer dedicado do RN)
  que o Expo SDK 55 não traz, e a v13 depende de `react-test-renderer@19.2.0` — pacote que
  o React 19 marca como deprecado. Nenhuma quebra hoje. **Gatilho de revisão:** quando um
  Expo SDK trouxer `test-renderer@^1` no conjunto de deps, ou quando o RN remover o
  `react-test-renderer`, migrar para a v14 e trocar o `react-test-renderer` das devDeps.

## Deferred from: review of 1-10-setup-test-runner-mobile.md (2026-08-30)

- source_spec: `_bmad-output/implementation-artifacts/1-10-setup-test-runner-mobile.md`
  summary: Não há teste de integração dos guards de `mobile/src/app/_layout.tsx` nem do redirect login→home; o loop de redirect silencioso que motivou a 1.10 só está travado no nível do mapa `ROLE_ROUTES`, não no consumidor.
  evidence: A 1.10 fecha a divergência `ROLE_ROUTES` × guards via `role-routes.test.ts`, mas os guards de `_layout.tsx` (`Stack.Protected` derivado de `ROLES`) e o redirect de `index.tsx`/`+not-found.tsx` via `homeForRole()` nunca são renderizados sob `render()`. Uma regressão que quebre a derivação no `_layout.tsx` sem tocar o mapa passa verde. O runner agora existe, então o teste é barato — só ficou fora do escopo "funções puras + 1 render" da 1.10.

## Deferred from: review of 3-4b-check-in-offline-com-fila-de-sincronizacao.md (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md`
  summary: Linhas `sent` nunca são apagadas da `offline_queue`, então a tabela cresce sem limite pela vida da instalação.
  evidence: `markSent` só troca o status (`mobile/src/lib/offline-queue-storage.ts`), e o teto de `MAX_QUEUE_SIZE` conta apenas `pending`. Não há purga, TTL nem vacuum em nenhum ponto do app. Uma linha por embarque já enfileirado, com o payload JSON, acumula indefinidamente.

- source_spec: `_bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md`
  summary: `failedCount` nunca volta a zero: um único item `failed` prende o banner vermelho "Registre manualmente" em todas as telas do motorista, para sempre e através de reinícios.
  evidence: Nada transiciona `failed` para outro status, não há ação de dispensar/reconhecer, e o banner é global por decisão de escopo (badge por item foi cortado para a Fase 2). O motorista também não tem como saber QUAL embarque falhou. Precisa de uma decisão de produto sobre como se reconhece o registro manual.

- source_spec: `_bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md`
  summary: A `offline_queue` não tem `userId`/`companyId`; num aparelho compartilhado, o motorista B drena os itens do motorista A com o token de B.
  evidence: O schema criado em `mobile/src/lib/database-migrations.ts` tem só `id, operation, payload, status, created_at, attempts, last_error`, e `listPending` filtra apenas por status e operação. Os itens de A sairiam com `DRIVER_NOT_ASSIGNED`. Fora do escopo da 3.4b porque mudança incompatível no schema está na lista "Ask First" e não há versionamento de migração.

- source_spec: `_bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md`
  summary: O dreno não é acordado por foreground do app nem por conectividade nativa — só por boot, enfileiramento, timer de backoff e evento `online` do browser.
  evidence: `mobile/src/hooks/use-offline-sync.ts` registra `startConnectivityListeners()`, que é no-op fora do alvo web. Em device, timers JS são suspensos em background: o motorista que guarda o celular entre paradas só retoma o dreno quando uma tela do motorista volta a renderizar. `(driver)/scan.tsx` já usa `AppState.addEventListener('change')` exatamente por isso. Story verificada só no alvo web, então o impacto é futuro.

- source_spec: `_bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md`
  summary: `sqliteQueueStorage` — o único SQL do app — não roda em nenhum teste; toda a suíte da fila corre contra um fake reimplementado.
  evidence: Desvio consciente registrado nas Design Notes da story ("só o SQL fica para a verificação no browser"), mas permanece um buraco real: remover `status = 'pending'` do `WHERE` de `listPending` reenviaria itens já entregues em laço, com `npm test` verde. Caminho barato: extrair a bateria atual para `describeQueueStorage(makeStorage)` e rodá-la também contra um SQLite disponível no Node.

- source_spec: `_bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md`
  summary: Um scan offline paga o timeout completo de 30s antes de enfileirar quando a API está inalcançável sem RST.
  evidence: `submit` em `(driver)/scan.tsx` sempre tenta o POST e só enfileira no `catch`. `app.store.isOnline` passou a ser escrito nesta story mas o scan não o lê; poderia curto-circuitar para `enqueueCheckIn` e manter a promessa de feedback < 2s da 3.3b. Impacto restrito ao caso "API fora do ar com TCP pendurado" — sem rede o `fetch` rejeita rápido.

- source_spec: `_bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md`
  summary: `setBoardedCount` conta como embarcado um item enfileirado que ainda pode terminar `failed`, e não há caminho de correção.
  evidence: `(driver)/scan.tsx` incrementa o contador da sessão no ramo enfileirado, deliberadamente (o embarque foi aceito localmente), mas o dreno pode depois marcar o item `failed` por `INVALID_QR_CODE` fora da janela de 24h. O contador é local e informativo, então o erro é tolerável — mas fica divergente do servidor até a tela ser remontada.

- source_spec: `_bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md`
  summary: Um dreno bem-sucedido não invalida nenhuma query do TanStack Query.
  evidence: `runDrain` atualiza só os próprios contadores. Depois que embarques enfileirados chegam ao servidor, a lista de alunos da viagem (3.5a) e o `activeTrip` seguem servindo dados vencidos até o `staleTime` expirar.

- source_spec: `_bmad-output/implementation-artifacts/3-5b-lista-de-alunos-e-status-de-embarque.md`
  summary: A escada de 12 guardas de `(driver)/student-list.tsx`, a contagem real de `trip.tsx` e a invalidação do roster no `submit` de `scan.tsx` não têm nenhum teste que rode — só `student-card.test.tsx` (o leaf) é coberto.
  evidence: Decisão consciente da story (Testing Requirements + Questão Aberta #1): um render da tela puxa MMKV/persister e o MSW não está ligado ao jest hoje. Mas a própria story chama a Tabela de Verdade de "referência única" que "quebra a Story 3.6" se divergir. Reordenar as guardas, inverter `showStaleBanner`, trocar `summary` por `students.length` ou renomear a query key `['trip', id, 'students']` (repetida como literal em 3 arquivos) regride em silêncio com `npm test` verde. Precisa de decisão do Lucas sobre infra de teste de tela (QueryClientProvider + MSW-em-jest, ou extrair a key para um helper e testá-la).

- source_spec: `_bmad-output/implementation-artifacts/3-6-integracao-e-e2e-do-epico-3.md`
  summary: A suíte E2E do Épico 3 (`test:pw:e2e`), o `openapi:check` e a cobertura de render do `ScanScreen` só rodam se um humano lembrar de executá-los — não há CI.
  evidence: `CLAUDE.md` declara "Não há CI configurado". Os specs de `tests/e2e/boarding-*` auto-skipam sem os dois servidores de pé (a não ser sob `E2E_SERVERS_UP=1`, setado em lugar nenhum), `openapi:check` roda um `nest build` completo e não está preso a nenhum script de `test`/`lint`/pre-commit, e o `mobile npm test` não renderiza o `ScanScreen`. Uma regressão do fluxo do épico entra na main com o board verde. Fecha quando o projeto ganhar CI (ver 1.7 / pipeline planejado).

- source_spec: `_bmad-output/implementation-artifacts/3-6-integracao-e-e2e-do-epico-3.md`
  summary: `api/tests/api/health.api.spec.ts` afirmava `response.text() === 'Hello World!'` mas o `ResponseWrapperInterceptor` global envelopa a resposta em `{data,meta}` desde a Story 2.4 — o teste não podia passar há meses.
  evidence: A Story 3.6 corrigiu a asserção (era gate da AC "test:pw:api continua verde"), mas o fato de ter ficado vermelho/inexecutado tanto tempo indica que o projeto `api` do Playwright não vinha sendo rodado. Sem CI, nada força. Mesma raiz do item acima.

- source_spec: `_bmad-output/implementation-artifacts/3-6-integracao-e-e2e-do-epico-3.md`
  summary: `cd api && npm run lint` está vermelho na baseline (~147 erros, ~56 warnings), todos em `src/`/`test/` pré-existentes.
  evidence: Achado do subagente de implementação da 3.6, confirmado com as mudanças da story fora da árvore (`git stash`). O código novo da story (Playwright em `tests/`) nem entra no glob do ESLint da API. A AC da 3.6 sobre lint cobre só o mobile por isso. Candidato a story técnica de higiene do lint da API.

## Deferred from: fix of 3-5b (verificação manual da Task 7.5) — stale-roster banner offline (2026-09-06)

- source_spec: `_bmad-output/implementation-artifacts/3-5b-lista-de-alunos-e-status-de-embarque.md`
  summary: A linha "Ainda offline, F5: a lista volta do cache persistido em MMKV" da Task 7.5 (AC #3) não é verificável no alvo web de desenvolvimento — fica para verificação em device ou build standalone.
  evidence: No alvo web servido pelo dev server do Metro (`npm run web`, `http://localhost:8081`), um F5 offline rebaixa o próprio bundle JS — o browser não consegue rebaixar `localhost:8081` sem rede — e `web.output: "single"` (config do Expo) não gera service worker que sirva o app do cache HTTP. A persistência do TanStack Query via `mmkvPersister` reidrata o cache **depois** que o app carrega, então ela só ajuda se o app carregar. É limitação do ambiente de dev, não do código: o cache offline (Tier 1) em si está provado pela própria linha do Banner (estado 7) e pelo `roster-stale-banner.test.ts`. Comprovável num `expo export` servido estaticamente com service worker, ou em device (Story 1.7).

- source_spec: `_bmad-output/implementation-artifacts/3-5b-lista-de-alunos-e-status-de-embarque.md`
  summary: O estado 7 (Banner de dado desatualizado) só é demonstrável offline porque a query do roster força `networkMode: 'always'` — enquanto o `onlineManager` do TanStack não for ligado a um provedor de conectividade real, toda query offline-first do app precisa dessa escolha explícita por query.
  evidence: O fix da Task 7.5 pôs `networkMode: 'always'` na query `['trip', tripId, 'students']` (em `student-list.tsx` e `trip.tsx`) para que o refetch offline erre em vez de pausar. É o mesmo item já registrado no defer da 3.2b ("`onlineManager` nunca conectado ao NetInfo"): sem a conexão, `networkMode: 'online'` no alvo web pausa a query no evento `offline` do `window` e nenhum estado de erro é alcançável. A correção sistêmica (conectar o `onlineManager`, ou `networkMode` global no `query-client.ts`) continua adiada; cada tela offline-first paga a escolha por query até lá.

## Deferred from: code review of 3-1-iniciar-e-encerrar-viagem.md (2026-09-06)

- source_spec: `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md`
  summary: `startTrip` valida que uma RETURN traz `relatedTripId`, mas não que esse id aponta para uma viagem real da mesma empresa, do mesmo motorista, `type = OUTBOUND` e `status = COMPLETED`.
  evidence: Um `relatedTripId` arbitrário (mas UUID) passa pelo use case e chega ao banco. A FK `trips_relatedTripId_fkey` barra um id inexistente e a unique `trips_relatedTripId_key` barra reuso, mas ambos viram 500 via `Effect.orDie` no adapter, não 400/404. Vincular a volta a uma ida de outro motorista/rota também não é barrado. Precisa de um método novo no `TripRepository` (buscar a ida elegível) — mais que um patch trivial.

- source_spec: `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md`
  summary: A invariante "uma viagem ativa por motorista" é um check-then-create sem transação nem índice único parcial.
  evidence: `startTrip` chama `findActiveByDriver` e depois `create`; `@@index([driverId, status])` não é único. Dois POST /trips quase simultâneos (retry de cliente, dois aparelhos) podem passar os dois pela checagem e criar duas viagens ACTIVE. `get-active-trip` então usa `findFirst` sem `orderBy` e devolve uma arbitrária. Correção pede índice único parcial (`WHERE status = 'ACTIVE'`), que o Prisma não expressa no schema — migração com SQL cru. Risco real baixo no MVP (botão desabilita durante a mutação, um aparelho por motorista).

- source_spec: `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md`
  summary: **RESOLVIDO (06/09/2026) por `spec-3-1-rota-real-do-motorista.md`:** `PLACEHOLDER_ROUTE_ID` removido de `(driver)/trip.tsx`.
  evidence: A tela não manda mais `'route-placeholder-id'`: resolve o `routeId` de `GET /api/v1/routes/mine` (query key `['routes','mine']`, `enabled` só sem viagem ativa ou com uma RETURN COMPLETED na sessão) — 1 rota auto-selecionada, seletor com 2+, ação desabilitada sem rota resolvida, retry no erro; uma rota escolhida é descartada se sumir num refetch. `mobile/src/trip-screen.test.tsx` (novo, 9 casos) cobre a I/O Matrix. Único toque em `api/`: um comentário em `boarding-happy-path.e2e.spec.ts`.

- source_spec: `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md`
  summary: **ABERTO:** o fluxo "Iniciar Retorno" da tela `(driver)/trip.tsx` só sobrevive na sessão — some em qualquer reload do app.
  evidence: `GET /trips/active` → `findActiveByDriver` filtra `status: 'ACTIVE'`. Depois que `endMutation` grava a ida COMPLETED no cache via `setQueryData`, a tela mostra "Iniciar Retorno" (branch `isReturn`), mas um reload refaz `GET /trips/active`, recebe `null` e volta a "Iniciar Viagem" — o botão de retorno desaparece. Não há endpoint para buscar a última viagem encerrada. Persistir AC #2/#3 pela ponta do cliente precisa de decisão de contrato de API (endpoint novo, ou `/trips/active` devolver a recém-encerrada dentro de um TTL, ou outro fluxo). Nenhum arquivo de `api/` muda até essa decisão. Registrado como carve-out da AC #3 na story e nas Decisions do spec.

- source_spec: `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md`
  summary: Não existe DTO de resposta para `POST /trips` nem `PATCH /trips/:id/end`; `openapi.json` documenta essas rotas sem corpo de resposta e o `interface Trip` do mobile é escrito à mão.
  evidence: O controller retorna o objeto do service sem `@ApiResponse({ type })` e não há `TripResponseDto`. `mobile/src/services/trip.service.ts` declara `Trip` manualmente (já diverge de `TripData` do port — sem `createdAt`/`updatedAt`), contradizendo o comentário no próprio arquivo que diz que os tipos vêm do contrato gerado. `npm run openapi:types` não tem o que gerar. Alinha com a regra 11 da architecture.md.

- source_spec: `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md`
  summary: **ENDEREÇADO (06/09/2026) por `spec-3-1-rota-real-do-motorista.md`:** `(driver)/trip.tsx` ganhou teste de render.
  evidence: `mobile/src/trip-screen.test.tsx` (novo, 9 casos) monta a tela sob `QueryClientProvider` (retry só com delay zerado, `client.clear()` no `afterEach`) + mocks jest de `trip.service`/`routes.service`, sem MSW — cobre loading/erro+retry/vazio/1 rota/2+ rotas da resolução de rota, o alerta de `DRIVER_NOT_ASSIGNED`, "viagem ativa não chama `/routes/mine`", o ciclo encerrar→"Iniciar Retorno" e encerrar uma RETURN → volta ao seletor (nunca o estado "sem rota").

- source_spec: `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md`
  summary: **ABERTO:** a query `['activeTrip']` não distingue `isError` de "sem viagem ativa".
  evidence: `(driver)/trip.tsx` trata `!activeTrip` como "sem viagem" — um erro de rede em `GET /trips/active` (`isError`, `data` undefined) cai no mesmo branch e renderiza "Iniciar Viagem". O motorista pode então disparar um `POST /trips` que o backend barra com 409 `TRIP_ALREADY_ACTIVE`, mas a tela mostra o alerta de erro em vez do estado certo. Fora do escopo do spec-3-1 (que congela o estado ACTIVE da tela e `api/`). Mesma raiz do defer de infra de teste de tela da 3.5b.

- source_spec: `_bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md`
  summary: `test/route-assignment.e2e-spec.ts` está vermelho na baseline — o `beforeAll` faz `POST /api/v1/auth/login` com `.expect(200)`, mas a rota responde 201; as 19 asserts do arquivo ficam skipped.
  evidence: Surgiu incidentalmente ao rodar `npm run test:e2e` na revisão da 3.1. `POST /auth/login` retorna 201 (sem `@HttpCode(200)`) — quirk pré-existente que o próprio `trip.e2e-spec.ts` documenta e contorna. Correção de 1 caractere (`200` → `201` na linha 78), mas fora do escopo da 3.1. Mesma raiz do defer "sem CI" da 3.6: nada força a suíte e2e a rodar verde.

## Deferred from: fix of 1-9-corrigir-seed-do-banco-sob-prisma-7 (2026-09-07)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-corrigir-seed-do-banco-sob-prisma-7.md`
  summary: Gate de idempotência do seed só confere a empresa — se o admin `admin@pureurban.dev`
    for apagado, o seed pula em silêncio sem recriá-lo; se o e-mail existir sob outra empresa,
    o `user.create` morre com P2002 cru.
  evidence: Pré-existente, não causado pela story (Intent congelada manda manter "escopo de
    dados inalterado"). `prisma/seed.ts` faz `findFirst({ name: 'PureUrban Dev' })` e retorna
    antes de olhar o usuário; `User.email` é `@@unique([email])` global (schema.prisma:49).
    Correção mínima exige decidir a semântica de re-seed parcial (recriar só o que falta?
    upsert? qual registro vence?) — decisão, não patch de uma linha. Raro no uso normal: o
    banco de dev carrega empresa+admin desde a 1.6.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-corrigir-seed-do-banco-sob-prisma-7.md`
  summary: AGENTS.md não lista `npm run seed` na seção Comandos → API — o comando que a story
    restaura é justamente o ausente da superfície de onboarding de agentes.
  evidence: Verificado no AGENTS.md (Comandos → API constam start:dev, test, e2e, playwright,
    lint, format, openapi:export; nada de seed). O loop de review do bmad-build não edita
    AGENTS.md; fica para edição avulsa aprovada pelo Lucas.

## Deferred from: review of 4-0-contrato-de-api-ausencia (2026-09-07)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-0-contrato-de-api-ausencia.md`
  summary: Bordas do ciclo de vida da ausência não declaradas no contrato — o que acontece quando
    o aluno já fez check-in e registra ausência (regra last-write-wins), re-registro com nova key
    após cancelamento, e a fronteira exata de `cancellableUntil` (inclusiva/exclusiva).
  evidence: Review (BH/ECH) da 4.0. A regra "check-in do motorista tem autoridade sobre a
    ausência" vive no epic-4-context, mas o contrato não declara o desfecho HTTP; a semântica
    exata (erro vs aceitar; fronteira do relógio) é decisão das fatias 4.1/4.3, com relógio
    injetado. Fechar na spec de 4.1 e, se nascer código de erro novo, ajustar o contrato no
    mesmo PR (drift discipline, Architecture §12).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-0-contrato-de-api-ausencia.md`
  summary: Transporte de autenticação do SSE não decidido — EventSource nativo (web) não envia
    header Authorization; contrato declara bearer sem dizer como o token chega ao stream.
  evidence: Review (BH/ECH) da 4.0. No nativo há polyfills de EventSource com suporte a header;
    no alvo web do Expo é preciso query param ou fetch-event-source. É decisão de design da
    Story 4.2 (e pode exigir ajuste consciente do contrato — ex.: token por query param — no
    mesmo PR da fatia).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-0-contrato-de-api-ausencia.md`
  summary: Semântica de replay de ERRO sob idempotência não especificada (409/404 ficam pinados
    na key? cancelamento reenviado com a key original após expirar a janela retorna 200 ou 409?).
  evidence: Review (BH) da 4.0. Mesmo tema do action item `epic-3-retro-item-3` (desfecho da
    fila offline, incluindo expiração alinhada à janela de 24h do occurredAt). Decidir na
    implementação da 4.1/4.3 junto com a fila offline e documentar nas descriptions.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-0-contrato-de-api-ausencia.md`
  summary: Premissa de viagem única ativa por motorista herdada por `GET /events` — seleção de
    stream indefinida se um driver tiver 2 viagens ativas.
  evidence: Review (ECH) da 4.0. Preexistente: `get-active-trip` (Story 3.1) já assume uma
    viagem ativa por motorista. Se o produto um dia permitir 2 rotas simultâneas, o fix é no
    domínio trip (não no contrato de boarding); nada a fazer na 4.0.

## Deferred from: review of 4-1-registro-de-ausencia-nao-vou-voltar (2026-09-07)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-registro-de-ausencia-nao-vou-voltar.md`
  summary: Replay de ausência CANCELADA (após a 4.3) retorna 201 com a linha original — o
    cliente voltaria a "Ausência registrada" para uma ausência que o aluno desfez; o desfecho
    de replay de estado cancelado é decisão de contrato da 4.3.
  evidence: Review (BH) da 4.1. Inalcançável nesta fatia (`cancel-absence` segue stub 501);
    o design append-only torna o cenário real a partir da 4.3. Decidir lá a semântica (erro
    vs resposta com cancelamento representado) junto do tema de desfecho da fila offline
    (`epic-3-retro-item-3`); se nascer campo/código novo, ajustar o contrato no PR da 4.3
    (drift discipline).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-registro-de-ausencia-nao-vou-voltar.md`
  summary: Mock MSW do roster (`mobile/src/mocks/handlers/boarding.handlers.ts:311`) calcula
    `summary.total` incluindo alunos NOT_RETURNING — diverge da API real, que agora os exclui.
  evidence: Review (VG) da 4.1. O congelado da 4.1 proíbe tocar em `mobile/src/mocks/`
    (intenção aprovada pelo humano); qualquer consumidor rodando contra mocks vê semântica
    pré-4.1 do resumo. Alinhar quando a era dos mocks for encerrada de vez (os handlers já
    não participam do desenvolvimento das fatias).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-lembrete-automatico-de-check-in-pendente.md`
  summary: Ligar o focusManager do TanStack Query ao AppState no RN para que refetch-on-focus
    funcione de verdade (hoje o banner do lembrete só refresca em mount/remount pós-staleTime).
  evidence: Review da 4.4 (achados BH5/ECH8, verificados por grep) — nenhum wiring de
    focusManager/AppState existe em mobile/src e o comentário da home foi corrigido para
    refletir isso. Limitação app-wide (atinge activeTrip, roster etc.), vizinha do defer
    onlineManager→NetInfo já documentado em student-list.tsx:109 e do action item
    epic-3-retro-item-5. Comportamento da 4.4 conforme a intenção congelada (sem polling).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-5-e2e-do-epico-4.md`
  summary: Adicionar `cache-control` à allowlist de CORS em `api/src/main.ts` e remover o
    shim de teste `allowSseInBrowser` do spec `absence-reminder.e2e.spec.ts` — hoje o
    stream SSE do motorista é bloqueado pelo preflight no browser (o cliente
    `react-native-sse` envia o header `cache-control`, que não está na allowlist), deixando
    o motorista SEM realtime em qualquer implantação web cross-origin (nativo não é
    afetado; a entrega server-side é <50ms, verificada com stream cru).
  evidence: Gap de produção pré-existente descoberto pela E2E da 4.5 (Story 4.2 não o
    cobriu — seu e2e é supertest, sem browser). A spec congelada da 4.5 proíbe tocar em
    `api/src/`, então o spec remove o header na camada de transporte só no contexto do
    motorista. Decisão do Lucas (09/09/2026): registrar em deferred (não é story imediata).
    Fix é 1 linha na allowlist + deletar o shim; pedir verificação do preflight no
    `test:pw:e2e` sem o shim.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-ingestao-e-transmissao-de-gps.md`
  summary: Verificar timeout de `Location.getCurrentPositionAsync` (eh-8): se a promise
    puder nunca resolver (Geolocation API web sem fix, timeout default Infinity), o
    `inFlight` do gps-capture fica preso e a transmissão morre em silêncio pelo resto da
    viagem.
  evidence: Achado maybe-false da review da 5.1 (edge-case-hunter), não verificado —
    o comportamento real do expo-location quanto a timeout default não está decidido.
    Se verdadeiro, medium (feature morre sem erro visível). Assentaria: rodar o app web
    com GPS sem fix (spoofing desligado) observando se a captura para após o primeiro
    tick, ou ler o source do expo-location quanto a timeout default; se confirmado,
    cercar o `getLocation` do hook com `Promise.race` + rejectAfter (~10s) e teste.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-acompanhamento-do-onibus-em-tempo-real.md`
  summary: Resolver a divergência entre AGENTS.md ("comentários de código em inglês") e a
    prática repo-wide (comentários em português em boarding, tracking, e2e specs).
  evidence: Achado low (BH-12) da review da 5.2 — os comentários novos seguem a prática
    existente do repositório; alinhar exige editar o AGENTS.md (arquivo de contexto de
    agente), rota defer por regra.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-acompanhamento-do-onibus-em-tempo-real.md`
  summary: Reentrância do handleError do cliente SSE (mobile tracking-stream e boarding
    events): um segundo evento 'error' durante o await do refresh/reconnect poderia abrir
    duas conexões (ECH-4).
  evidence: maybe-false, não verificado — dependeria do comportamento do react-native-sse
    após close() (se emite segundo 'error' pós-abort). Se real, medium (conexões órfãs
    duplicando handlers); boarding tem o mesmo shape desde a 4.2. Assentaria: ler o source
    da lib quanto a emissão pós-close e instrumentar o cliente com duas dispatches
    encadeadas num teste.
- source_spec: `_bmad-output/implementation-artifacts/spec-wrap-1-correcoes-de-comportamento.md`
  summary: **✅ ENDEREÇADO pelo wrap-3 (PR #43, 13/09/2026).** Atualizar a descrição do 403 de PATCH /trips/:id/end no Swagger (e regenerar
    openapi.json) para nomear DRIVER_NOT_ASSIGNED — roteado ao wrap-3.
  evidence: O AC12 do wrap-1 mudou o comportamento para 403 DRIVER_NOT_ASSIGNED (mesmo
    disclosure do get-trip-students, DS6), dentro do status 403 já declarado no contrato —
    nenhuma regeneração foi permitida pelas Boundaries do wrap-1. A descrição do 403 ficou
    "FORBIDDEN — somente motoristas", sem nomear o código de negócio que o endpoint agora
    também devolve. Regenerar openapi.json + tipos (se houver drift) pertence ao wrap-3
    (item 18 do sprint-status, mesma mecânica). **O PR #43 nomeou o código com a MESMA
    redação do get-trip-students e regenerou openapi.json + tipos no mesmo PR.**
- source_spec: `_bmad-output/implementation-artifacts/spec-wrap-1-correcoes-de-comportamento.md`
  summary: Domínio de relógio do resync do aluno — servidor carimbar o last-known com o
    instante de recebimento (receivedAt) para a guarda monotônica comparar maçãs com maçãs.
  evidence: Hoje capturedAt (REST) é eco do relógio do DEVICE do motorista e o timestamp do
    evento SSE é hora do SERVIDOR (ingest-location.use-case.ts) — a comparação entre eles na
    tela do aluno é sensível a skew de relógio (limitada a 1 deslocamento por resync após o
    anti-flap do wrap-1, mas não eliminada). Exige DTO/cache change (rota wrap-3, item 18) ou
    a extração do broadcaster (wrap-4). Detectado na review do wrap-1 (achado F3).
    **Atualização (13/09/2026): o wrap-3 resolveu o lado CONTRATO (staleness declarado
    por chegada de dado, nunca pela idade do capturedAt — decisões congeladas do spec);
    o carimbo do servidor no last-known segue ABERTO, rota wrap-4 (broadcaster) ou
    decisão de produto.**

## Deferred from: build of spec-wrap-3-reconciliacao-de-contrato-e-documentos.md (2026-09-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-wrap-3-reconciliacao-de-contrato-e-documentos.md`
  summary: `npx tsc --noEmit` do mobile vermelho na baseline em 2 arquivos de teste do wrap-1 — `use-trip-gps-capture.test.tsx:92` (TS2554) e `tracking-stream.service.test.ts:172` (TS2339 `pollingInterval`).
  evidence: Verificado pré-existente via stash contra a árvore limpa da main (13/09/2026); `npm test` passa (252/252) e o gate não roda o tsc do mobile, então só checagem manual expõe. Fix de ~2 linhas (tipar o argumento no teste do classify; ler a config exportada no teste do cliente), sem comportamento.

## Deferred from: review of spec-wrap-4-divida-de-forma-sse-e-e2e.md (2026-09-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-wrap-4-divida-de-forma-sse-e-e2e.md`
  summary: Add a unit case asserting the SSE terminal-signal failure log fires — the log is the ONLY diagnostic when the sentinel publish to Redis fails.
  evidence: Verification-gap layer (pré-verificado): os 23 casos unit dos services SSE nunca tocam o caminho de falha do publish (deletar o `.catch`/`logger.error` deixa o gate inteiro verde); nenhum e2e força falha de publish. O wrap-4 mudou o shape do log (canal em vez de tripId) — mudança divulgada no risco #1 do spec. Follow-up barato: 1 caso unit com spy no logger e `redis.publish` rejeitando.

## Deferred from: review of spec-wrap-5-desfecho-da-fila-offline.md (2026-09-13)

- source_spec: `_bmad-output/implementation-artifacts/spec-wrap-5-desfecho-da-fila-offline.md`
  summary: Copy do banner vermelho discriminada por motivo — para itens EXPIRED (D1), "Registre manualmente" é instrução impossível (a janela de 24h fechou também para o registro manual); o texto certo seria "dispense este embarque".
  evidence: Rejeitado como patch no wrap-5 (triagem: low — a copy atual é a NFR13 literal e a bateria é a interface aprovada "banner global", sem badge por item); o fix depende de expor o motivo por item, que é o corte consciente da Fase 2 (sprint-change-proposal-2026-08-28). Registrado para quando o badge ✗/⏳/✗ existir.

- source_spec: `1-11-revisao-da-paleta-de-cores.md`
  summary: Dar consumo real ao tema escuro (telas consomem useTheme/darkPalette) ou desligar dark no alvo web — hoje só os widgets Paper flipam e o render fica misto.
  evidence: Triagem da review da 1.11, iteração 1 (rows BH4+VG-outro, verdict low, verificado): useTheme/Colors sem consumidores em mobile/src; telas light-locked antes e depois da story; incoerências do render misto (título do login, botão outlined da trip) pré-existentes.
- source_spec: `1-11-revisao-da-paleta-de-cores.md`
  summary: Sobrescrever os papéis MD3 remanescentes (elevation/surfaceContainer*) com tons da paleta — o Banner de dado velho renderiza o violeta default (#F7F3F9 light / #25232A dark).
  evidence: Triagem da review da 1.11, iteração 1 (row 10, verdict low, verificado por probe de estilo computado); resíduo pré-existente à story.
- source_spec: `1-11-revisao-da-paleta-de-cores.md`
  summary: Apontar a paleta (mobile/src/lib/palette.ts) e o DESIGN.md no project-context.md como fonte única de cor do app.
  evidence: Triagem da review da 1.11, iteração 1 (row 9, verdict low): o invariante "cor nova = token novo na paleta" não tem ponteiro no documento que o AGENTS.md manda consultar; roteado a defer porque o fix edita arquivo de contexto de agentes.
- source_spec: `1-11-revisao-da-paleta-de-cores.md`
  summary: Dívida editorial do DESIGN.md — peso 575 órfão, aritmética do touch target 48px inconsistente, cross-ref "Step 6" errada, Known Gaps sem o gap de texto-sobre-escuro, token button-secondary-on-dark duplicado.
  evidence: Triagem da review da 1.11, iteração 1 (rows 11–15, verdict low cada): fatos reais verificados no documento; a story 1.11 não pode tocá-lo (frozen: DESIGN.md intocado).
