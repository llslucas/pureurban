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
- `api-client.ts` não expõe headers por requisição: `post<T>(path, body)` é estruturalmente incapaz de enviar o `X-Idempotency-Key` que o contrato agora declara obrigatório [mobile/src/services/api-client.ts] — pré-existente; o cliente HTTP é escopo da 3.3b/3.4b. Registrado aqui porque o contrato passou a depender disso.

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
- **AC #5/NFR19 não é demonstrável no produto: o navegador raiz não monta os grupos `(student)`/`(driver)`** [mobile/src/app/_layout.tsx:87, mobile/src/components/app-tabs.tsx:16-30, mobile/src/app/index.tsx:37] — decisão adiada para a story 3.6. `_layout.tsx` renderiza `{isDbReady && isMockReady && isAuthenticated && <AppTabs />}` e `AppTabs` é um `NativeTabs` com exatamente dois triggers, `index` e `explore`, ambos do template do Expo; `app/index.tsx` ainda é a tela "Welcome to Expo". A única entrada no grupo do aluno é `router.replace('/(student)/home')` no login, que só dispara em login novo — quem reabre o app com sessão hidratada não tem caminho de nenhum tamanho até o QR. Efeito colateral: a AC #2 ("sobrevivendo a reinício do app") também fica inobservável, porque o `sessionId` sobrevive no MMKV mas a tela que o exibiria não é alcançável. A contradição é da própria story 3.2b (*Questões Abertas #3* defere o nav shell enquanto as ACs 2 e 5 dependem dele), não um deslize de implementação. A 3.2b fica registrada com a **AC #5 parcialmente atendida**: o fluxo de 1 toque existe e está correto a partir do login, o que falta é o shell que torna o grupo alcançável fora dele.
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

- **O layout raiz não renderiza a saída do router — nenhuma tela do projeto é alcançável, em nenhum estado de autenticação** [mobile/src/app/_layout.tsx:87, mobile/src/components/app-tabs.tsx:16-30] — escopo da Story 3.6. Este é o mesmo item já registrado no defer da 3.2b ("o navegador raiz não monta os grupos `(student)`/`(driver)`"), mas o diagnóstico era mais brando do que a realidade: não é que faltem triggers no `AppTabs`, é que **não existe `<Slot />`, `<Stack />` nem `<Tabs />` no layout raiz**. O que ele renderiza é `<AnimatedSplashOverlay />` e, só sob `isAuthenticated`, `<AppTabs />` — um `NativeTabs` com os triggers `index` e `explore` do template do Expo. Medido no alvo web: **não autenticado**, `/login`, `/scan`, `/qr-code` e `/trip` devolvem tela em branco com 0 elementos interativos e **zero erro no console**; **autenticado** (sessão semeada nas chaves `mmkv.default\auth.*`), todas renderizam "Welcome to Expo / GET STARTED / Try editing src/app/index.tsx" e `/scan`/`/qr-code` redirecionam para `/`. Consequência direta: as Dev Notes da 1.6 afirmam que "no alvo web isso deixa de ser bloqueio de verificação: as rotas são alcançáveis pela barra de endereços" — **isso é falso e está agora verificado**. Enquanto este item não fechar, nenhuma story mobile (3.3b, 3.4b, 3.5b) consegue evidência de runtime, independentemente do ambiente de execução existir.

- **`enableMocking()` não é idempotente: o modo MSW derruba o app na segunda invocação do efeito** [mobile/src/mocks/index.ts:3-20, mobile/src/app/_layout.tsx:38-48] — escopo da Story 3.6 (ou de uma correção pontual antes dela). O `useEffect` que chama `enableMocking()` roda duas vezes, `enableMocking()` não guarda estado e o segundo `server.listen()` lança `Invariant Violation: Failed to call "configure()" on the network: cannot configure an already enabled network.`. O `catch` do layout seta `mockError` e o app renderiza a tela "Falha ao inicializar os mocks (MSW)" — comportamento deliberado da 3.0, que prefere parar a mandar requisições para a API real sem aviso. **A causa NÃO é StrictMode** — não existe `StrictMode` em `mobile/src/` nem no build do `expo-router` (grep vazio em 28/08/2026), e `_layout.tsx:37-49` é um efeito com deps `[]` sem wrapper. A causa provável é Fast Refresh / remount do componente. Isso muda a correção: uma guarda de módulo (`let started = false`) **não sobrevive** a um Fast Refresh, que reavalia o módulo e zera a flag — o bug reabriria no primeiro save. Use uma guarda ancorada no estado do próprio servidor MSW (`if (server.listening) return`), que sobrevive à reavaliação do módulo porque o `server` vem de outro módulo e mantém o estado real. **Registrar junto a boa notícia, para que ninguém re-investigue:** o risco que a Story 1.6 sinalizava — `src/mocks/server.ts` usa `setupServer` de `msw/native`, cujo subpath o `package.json` do msw mapeia para `null` na condição `browser` — **não se concretizou**. O MSW intercepta corretamente no browser: o bundle resolveu (246 módulos), o console imprimiu `[mocks] MSW ativo`, um `POST /api/v1/auth/login` com `motorista@pureurban.com` devolveu `200` com o DRIVER mockado, e **nenhuma requisição escapou para a rede real**. O único problema é a dupla invocação.

- **`prisma/seed.ts` está quebrado sob Prisma 7 e não é alcançável por nenhum comando documentado** [api/prisma/seed.ts:22, api/package.json, api/prisma.config.ts] — pré-existente, fora do escopo da 1.6 (que fixa 6 arquivos na AC #8). Três camadas: (1) `npm run seed`, que a Story 1.6 e o README de várias stories prescrevem, **não existe** — `seed` é um hook em `package.json` → `prisma.seed`, não um script; (2) `npx prisma db seed` responde `No seed command configured`, porque o Prisma 7 moveu essa configuração para `prisma.config.ts` e ela não foi migrada; (3) rodando `prisma/seed.ts` direto, ele falha em `new PrismaClient()` sem `adapter`, obrigatório no Prisma 7 — exatamente o que o `@ts-ignore` do próprio arquivo antecipa ("tipos gerados exigem `adapter`"). Na 1.6 o admin foi criado por `POST /api/v1/auth/register` para não tocar no arquivo. Enquanto não for corrigido, qualquer story que dependa de "rodar o seed" não tem ambiente reproduzível.


## Deferred from: code review of story-1.6 (2026-08-28)

- **Falha de `initializeDatabase()` só é logada — o app segue sem fila offline e sem sinal** [mobile/src/app/_layout.tsx:30-34] — pré-existente, decisão deliberada da Story 1.5 ("Errors são logados mas não travam o app — modo degradado preferível a crash"). `initializeDatabase().catch(console.error).finally(() => setIsDbReady(true))` abre o portão de boot mesmo quando o banco não abriu, então o app roda sem Tier 2 e nada no produto indica isso — nem ao dev, nem ao motorista. No alvo web o gatilho mais provável é `crossOriginIsolated === false` (acesso por IP de LAN, ou `--https`, que contorna o patch do `metro.config.js`), onde o wa-sqlite rejeita a abertura. Não corrigido na 1.6 porque a AC #8 proíbe tocar em `_layout.tsx`. Contraste deliberado com o caminho do MSW, que na mesma tela **para o app** em caso de falha (`_layout.tsx:44-48`) — a assimetria é intencional hoje, mas vira dívida quando o Tier 2 for exercitado de verdade na 3.4b / Story 1.7.

---

## Reescopo e diferimentos — sprint-change-proposal-2026-08-28 (aprovado por Lucas, 28/08/2026)

### Itens reescopados da Story 3.6 para a Story 1.8

A Story 3.6 é a **última** do Épico 3, mas os dois primeiros itens abaixo bloqueiam as
stories que vêm **antes** dela (3.3b, 3.4b, 3.5b). Foram extraídos para a nova **Story 1.8
— Shell de Navegação e Remoção do Template Expo**, que executa a seguir.

| Item | Origem | Novo escopo |
|---|---|---|
| Layout raiz não renderiza saída de router — nenhuma tela alcançável | dev da 1.6 (27/08) | **Story 1.8** |
| `enableMocking()` não é idempotente; o modo MSW não sobe | dev da 1.6 (27/08) | **Story 1.8** |
| AC #5 da 3.2b não demonstrável (nav shell ausente) | code review da 3.2b (23/08) | **Story 1.8** — fecha por consequência |
| Ratificação de `eslint` + `eslint-config-expo` no mobile | code review da 3.2b (23/08) | **Story 1.8** — o lint passa a rodar sobre o código que sobrar |

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
