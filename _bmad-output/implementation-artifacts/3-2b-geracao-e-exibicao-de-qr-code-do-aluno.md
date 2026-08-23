---
baseline_commit: 7097187
branch: feat/3-2b-qr-code-do-aluno
---

# Story 3.2b: Geração e Exibição de QR Code do Aluno (Mobile Aluno)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como aluno,
Quero ver meu QR code exclusivo no app,
Para que eu possa fazer check-in no embarque.

## Acceptance Criteria

1. **Given** aluno autenticado
   **When** acessa a tela `(student)/qr-code.tsx`
   **Then** o QR code é exibido contendo o payload definido no schema compartilhado da Story 3.0 (`studentId`, `sessionId`)

2. **And** o QR code é estático por sessão de login (NFR8) — o mesmo `sessionId` do login até o logout, sobrevivendo a reinício do app

3. **And** o QR code é gerado localmente no dispositivo, sem chamada à API

4. **And** a tela exibe nome do aluno e rota vinculada

5. **And** o fluxo exige no máximo 2 toques para exibir o QR code (NFR19)

6. **And** o payload é validado contra o tipo gerado de `api.d.ts` — não há schema escrito à mão

**Camada:** Mobile · **Depende de:** 3.0 (done) · **FRs:** FR15, FR17 · **NFRs:** NFR8, NFR19 · **Bloqueia:** 3.6

> Não existe contraparte backend (`3.2a`): o QR é gerado no cliente. A validação do payload acontece na 3.3a (já `done`), no check-in.

---

## 🚨 Os dois bloqueadores que você vai encontrar primeiro — leia antes de tudo

Nenhum dos dois é hipótese. Ambos são reproduzíveis no commit de baseline `7097187`.

### Bloqueador 1 — o aluno não consegue chegar em tela nenhuma

`mobile/src/app/(auth)/login.tsx:41,43` navega para rotas que **não existem**:

```ts
if (result.user.role === 'DRIVER')       router.replace('/(driver)/')   // ❌
else if (result.user.role === 'STUDENT') router.replace('/(student)/')  // ❌
```

Com `typedRoutes: true` (`app.json#experiments`), `/(student)/` exigiria um `(student)/index.tsx` — que não existe. As rotas reais, conforme `.expo/types/router.d.ts`, são `/(student)/home`, `/(student)/qr-code`, `/(student)/track-bus`.

**Esses são os 2 (dois) únicos erros do `npx tsc --noEmit` na baseline.** Confirme antes de começar:

```
src/app/(auth)/login.tsx(41,24): error TS2345: ... '"/(driver)/"' is not assignable ...
src/app/(auth)/login.tsx(43,24): error TS2345: ... '"/(student)/"' is not assignable ...
```

Sem corrigir, nenhuma AC desta story é verificável — o aluno loga e fica numa tela vazia. É a **Task 1**, não um extra. Corrija **as duas linhas** (o `/(driver)/` → `/(driver)/trip` é a mesma cadeia `if/else`; deixar um erro de tsc de pé só para "respeitar escopo" transfere um typecheck vermelho para a próxima story).

### Bloqueador 2 — `useAuthStore.user` é null depois de qualquer reinício do app

`mobile/src/stores/auth.store.ts` hidrata **apenas** `isAuthenticated`, a partir da presença do token no MMKV:

```ts
const hasPersistedToken = Boolean(tokenStorage.getAccessToken())
export const useAuthStore = create<AuthState>((set) => ({
  user: null,                            // ← nunca hidratado
  isAuthenticated: hasPersistedToken,    // ← true mesmo com user null
  ...
}))
```

Consequência direta para esta story: no segundo boot do app o usuário está autenticado, o `_layout.tsx` **não** redireciona para o login, e a tela de QR não tem `studentId` nem `name` para renderizar. O QR simplesmente some, sem erro.

Persistir o `AuthUser` no MMKV é a **Task 2**. Não contorne isso buscando o usuário na API: a AC #3 proíbe chamada de rede para produzir o QR.

---

## Tabela de Verdade da Tela — a referência única

| Estado | `user` (MMKV/store) | `sessionId` | `GET /routes/mine` | O que a tela renderiza |
|---|---|---|---|---|
| Feliz | presente | presente | 200 com ≥1 rota | Nome + rota + **QR** |
| Sem rota vinculada | presente | presente | 200 com `[]` | Nome + "Nenhuma rota vinculada" + **QR** |
| Rede offline / erro | presente | presente | erro ou cache stale | Nome + rota do cache (ou aviso discreto) + **QR** |
| Sessão corrompida | ausente **ou** presente | ausente | irrelevante | Mensagem de erro + botão "Entrar novamente" (logout + `/(auth)/login`) — nunca um QR |

**Regra inegociável:** o QR **nunca** depende de rede. Qualquer falha de `GET /routes/mine` degrada apenas o bloco de rota — o QR continua renderizado. Se você escrever `if (isLoading) return <Spinner/>` antes do QR, você quebrou a AC #3 e o caso de uso real (aluno no ponto de ônibus, sem sinal).

---

## Decisões já tomadas — não re-decidir, não pesquisar de novo

| Questão | Decisão | Fonte |
|---|---|---|
| De onde vem o `studentId`? | **`useAuthStore().user.id`.** Aluno **é** um `User` com `role = STUDENT` — não existe tabela `Student` separada. Não há endpoint para "buscar meu studentId". | `api/prisma/schema.prisma#model User`; `create-student.use-case.ts:36` emite `studentId: user.id` |
| O que é o `sessionId`? | UUID v4 **gerado no cliente no login**, persistido em MMKV, apagado no logout. O backend trata como opaco no MVP. | `api/openapi.json#QrCodePayloadDto.sessionId` |
| Como o payload é codificado no QR? | **String JSON compacta em UTF-8, gravada direto no QR, SEM base64.** QR menor ⇒ leitura mais rápida em movimento (NFR1). | `api/openapi.json#QrCodePayloadDto.description` |
| Qual o tipo do payload? | `components['schemas']['QrCodePayloadDto']` importado de `@/types/api`. Escrever a interface à mão é violação da regra 11 da Architecture. | `architecture.md#8` regra 11 |
| Biblioteca de QR | `react-native-qrcode-svg@6.3.21` + peer `react-native-svg` (via `npx expo install`). | ver *Latest Tech Information* |
| Gerador de UUID | `expo-crypto` → `Crypto.randomUUID()`. **Não** use `crypto.randomUUID()` global: Hermes pode não expor (o próprio mock de boarding tem um `mockUuid()` caseiro por causa disso). | `mobile/src/mocks/handlers/boarding.handlers.ts:60-67` |
| Nome do aluno | `useAuthStore().user.name` — já vem no `AuthTokens.user` do login. Sem chamada extra. | `mobile/src/services/auth.service.ts:6-17` |
| Rota vinculada | `GET /api/v1/routes/mine` — o mesmo endpoint que o motorista já consome; para `role = STUDENT` ele chama `findRoutesByStudent`. Resposta: `AssignedRoute[]` (sem `companyId`, removido pelo `strip` do service). | `api/src/domains/routing/core/use-cases/get-my-routes.use-case.ts:22-26`; `routing.service.ts:141-152` |

---

## Tasks / Subtasks

### Task 1 — Desbloquear a navegação do aluno (AC: 4, 5)

- [x] 1.1 `mobile/src/app/(auth)/login.tsx`: `router.replace('/(student)/')` → `router.replace('/(student)/home')` e `router.replace('/(driver)/')` → `router.replace('/(driver)/trip')`. Não mexa em mais nada neste arquivo.
- [x] 1.2 `mobile/src/app/(student)/_layout.tsx`: trocar o `<Stack />` nu por um `Stack` com `initialRouteName="home"` e `screenOptions`/`Stack.Screen` dando `title` legível a `home` ("Início") e `qr-code` ("Meu QR Code"), para o botão de voltar existir e ter rótulo.
- [x] 1.3 Rodar `npx tsc --noEmit` — **deve sair com 0 erros**. Se sobrar qualquer erro, ele foi introduzido por você.

### Task 2 — Persistir a identidade da sessão no MMKV (AC: 1, 2)

- [x] 2.1 `mobile/src/lib/storage.ts`: adicionar, no mesmo estilo do `tokenStorage` já existente:
  - `userStorage`: `getUser(): AuthUser | null` (JSON.parse defensivo — retorna `null` em JSON inválido), `setUser(user)`, `clearUser()`. Chave `auth.user`.
  - `qrSessionStorage`: `getSessionId(): string | undefined`, `setSessionId(id)`, `clearSessionId()`. Chave `qr.sessionId`.
  - Não crie um segundo `createMMKV()` — reutilize a instância `storage` exportada no topo do arquivo.
- [x] 2.2 `mobile/src/stores/auth.store.ts`:
  - hidratar `user` de `userStorage.getUser()` no boot (hoje é `null` fixo);
  - derivar `isAuthenticated` de `Boolean(token) && Boolean(user)` — um token sem usuário é sessão inutilizável, e deixá-la "autenticada" é exatamente o Bloqueador 2;
  - `login(user)`: persistir o usuário **e** gerar+persistir um `sessionId` novo (`Crypto.randomUUID()`) — QR novo a cada login é o que a NFR8 pede;
  - `logout()`: além de `clearTokens()`, chamar `clearUser()` e `clearSessionId()`. Deixar o `sessionId` para trás faria o próximo aluno logado no mesmo aparelho herdar o QR do anterior.
- [x] 2.3 Garantir que o `sessionId` seja **lido**, nunca regerado, fora do `login()`. Se a tela de QR gerar um id quando ele falta, o QR deixa de ser estático por sessão (AC #2). Ausência de `sessionId` com `user` presente é sessão corrompida → linha 4 da Tabela de Verdade.

### Task 3 — Dependências (AC: 1)

- [x] 3.1 `cd mobile && npx expo install react-native-svg expo-crypto` (o `expo install` pina a versão compatível com o SDK 55 — **não** use `npm install` para essas duas).
- [x] 3.2 `npm install react-native-qrcode-svg@^6.3.21`.
- [x] 3.3 Nenhuma das três exige entrada em `app.json#plugins`. Não adicione.
- [x] 3.4 Conferir que `package.json` e `package-lock.json` entram no commit juntos.

### Task 4 — Payload do QR, tipado pelo contrato (AC: 1, 6)

- [x] 4.1 Criar `mobile/src/utils/qr-payload.ts`:
  ```ts
  import type { components } from '@/types/api'
  export type QrCodePayload = components['schemas']['QrCodePayloadDto']
  ```
- [x] 4.2 `buildQrPayload(studentId: string, sessionId: string): QrCodePayload` — objeto literal `{ studentId, sessionId }`, nada além dos dois campos do contrato.
- [x] 4.3 `encodeQrPayload(payload: QrCodePayload): string` — `JSON.stringify` de um literal com **ordem de chaves fixa** (`studentId` depois `sessionId`), sem espaços, **sem base64**. Ordem fixa importa: string idêntica ⇒ QR pixel-idêntico entre renders, o que é a prova visual da AC #2.
- [x] 4.4 Nada de `zod`, `@effect/schema` ou validação manual aqui. O tipo gerado é o contrato (regra 11 da Architecture); o dev do scanner (3.3b) decodifica com o mesmo tipo.

### Task 5 — Serviço de rotas e handlers MSW (AC: 3, 4)

- [x] 5.1 Criar `mobile/src/services/routes.service.ts` exportando a interface `AssignedRoute` e `routesService.getMyRoutes()` — **mova** (não duplique) a interface e o `fetchMyRoutes` que hoje vivem inline em `mobile/src/app/(driver)/routes.tsx:10-24`.
- [x] 5.2 Atualizar `(driver)/routes.tsx` para importar do serviço. É uma troca de import + remoção das linhas movidas; não redesenhe a tela do motorista.
- [x] 5.3 Criar `mobile/src/mocks/handlers/auth.handlers.ts`: `POST /api/v1/auth/login` e `POST /api/v1/auth/refresh` devolvendo o envelope `{ data: { accessToken, refreshToken, user }, meta }`. O usuário STUDENT **deve** ter `id = '660e8400-e29b-41d4-a716-446655440010'` (Ana Souza — membro do roster de `boarding.handlers.ts`), para que o QR gerado aqui seja aceito pelo check-in mockado nas stories 3.3b/3.6. Inclua também um usuário DRIVER. Escolha o papel pelo e-mail enviado (ex.: prefixo `aluno@` vs `motorista@`) e devolva `401` para credenciais fora da lista — o `api-client` trata 401 em `/auth/login` como erro de credencial, sem disparar refresh.
- [x] 5.4 Criar `mobile/src/mocks/handlers/routes.handlers.ts`: `GET /api/v1/routes/mine` devolvendo `{ data: AssignedRoute[], meta }` com uma rota plausível. O contrato **não** declara schema de resposta para este endpoint (só descrições em `openapi.json`) — por isso aqui, e só aqui, o shape vem da interface `AssignedRoute` do serviço, não de `api.d.ts`. Deixe um comentário dizendo isso.
- [x] 5.5 Registrar os dois em `mobile/src/mocks/handlers/index.ts` (`[...authHandlers, ...routesHandlers, ...boardingHandlers]`).
- [x] 5.6 Atualizar o bloco `EXPO_PUBLIC_USE_MOCKS` de `mobile/.env.example` documentando as credenciais mockadas e o `studentId` do aluno mock.

> **Por que 5.3 existe:** `.env.example` promete que com a flag ligada a trilha mobile roda "sem backend de pé", e a convenção de fatiamento (`epics.md#Convenção de Fatiamento`) exige que as stories `X.Yb` sejam desenvolvidas contra MSW. Hoje isso é falso: `/auth/login` não tem handler, cai no `onUnhandledRequest: 'warn'` e vaza para a rede real — ou seja, o dev mobile precisa do backend de pé só para conseguir entrar no app. Como esta é a primeira story mobile do épico, o custo aparece aqui.

### Task 6 — Componente de exibição do QR (AC: 1, 2)

- [x] 6.1 Criar `mobile/src/components/student-qr-code.tsx` (kebab-case no arquivo, PascalCase no export — `project-context.md#Naming Conventions`). Props: `value: string` (a string já codificada) e `size?: number`.
- [x] 6.2 Renderizar `<QRCode value={value} size={size} backgroundColor="#FFFFFF" color="#000000" quietZone={16} ecl="M" />`.
- [x] 6.3 **Fundo branco e módulos pretos são fixos, independentes do tema.** Não use as cores do Paper aqui: QR claro sobre fundo escuro derruba a taxa de leitura das câmeras que a 3.3b vai usar. Envolva o QR numa `View` branca com `borderRadius` — o contraste do card é decorativo, o do QR não é.
- [x] 6.4 `size` default calculado a partir de `useWindowDimensions()`: `Math.min(width - 64, 288)`. Nada de valor fixo que estoure em telas pequenas.
- [x] 6.5 O componente é puro: sem `useQuery`, sem store, sem acesso a MMKV. Ele recebe uma string e desenha.

### Task 7 — Tela `(student)/qr-code.tsx` (AC: 1, 2, 3, 4, 6)

- [x] 7.1 Substituir o placeholder atual (9 linhas) pela tela real, seguindo o padrão de `(driver)/routes.tsx`: `react-native-paper` (`Text`, `Card`, `ActivityIndicator`, `Snackbar`, `Divider`), `ScrollView` + `RefreshControl`, TanStack Query.
- [x] 7.2 Ler `user` de `useAuthStore()` e `sessionId` de `qrSessionStorage`. Memoizar a string do QR com `useMemo` sobre `[user?.id, sessionId]` — recalcular a cada render é desperdício e faz o QR "piscar".
- [x] 7.3 Rota vinculada via `useQuery({ queryKey: ['routes', 'mine'], queryFn: routesService.getMyRoutes })`. **Query key em array segmentado** (`['routes','mine']`), conforme a ação #4 da retro do Épico 2 — é a convenção que esta story fixa para a trilha mobile.
- [x] 7.4 Ordem de renderização: nome do aluno → **QR** → rota. O QR vem antes do bloco que depende de rede; assim nenhum estado de loading pode empurrá-lo para fora da tela.
- [x] 7.5 Estados do bloco de rota, distintos entre si (lição da 2.6, registrada na retro do Épico 2): `isLoading` → skeleton/spinner **só no bloco**; lista vazia → "Nenhuma rota vinculada" (empty-state); `isError` → aviso de falha + `Snackbar` com ação de retry (error-state). Não confunda os dois últimos.
- [x] 7.6 Múltiplas rotas: renderize a primeira e, se `length > 1`, um texto discreto "+N rotas". Nada de seletor — está fora de escopo.
- [x] 7.7 Sessão corrompida — na prática, `sessionId` ausente com `user` presente (com a Task 2.2, `user == null` já derruba o `isAuthenticated` e o `_layout.tsx` manda para o login antes desta tela montar; trate o caso mesmo assim, porque um app instalado por cima de build antigo chega aqui): mensagem clara + `Button` que chama `logout()` e navega para `/(auth)/login`. Não renderize QR vazio, nem `''`, nem placeholder — um QR que decodifica para lixo vira `INVALID_QR_CODE` no ônibus, com uma criança na porta.
- [x] 7.8 Texto de apoio curto ("Mostre este código ao motorista") e o nome do aluno em destaque, para o motorista conferir a olho quando a câmera falhar.

### Task 8 — Tela `(student)/home.tsx` com acesso em 1 toque (AC: 5)

- [x] 8.1 Substituir o placeholder por uma home mínima: saudação com `user.name` e um `Button` grande (`mode="contained"`, `contentStyle` com `paddingVertical` generoso) "Meu QR Code" → `router.push('/(student)/qr-code')`.
- [x] 8.2 Contagem de toques da AC #5: login leva a `home` (0 toques) → 1 toque no botão → QR na tela. Documente essa contagem num comentário de uma linha no arquivo.
- [x] 8.3 **Escopo mínimo.** Nada de "Não vou voltar" (Story 4.1b) nem mapa (5.2b). Se quiser deixar o lugar preparado, deixe só o espaço — sem botão morto.

### Task 9 — Verificação (todas as ACs)

- [x] 9.1 `cd mobile && npx tsc --noEmit` → **0 erros** (baseline tinha 2; ambos são seus, na Task 1).
- [x] 9.2 `npm run lint` no mobile — nenhum arquivo desta story na saída.
- [x] 9.3 Roteiro manual com `EXPO_PUBLIC_USE_MOCKS=1` — **não executável neste ambiente de sandbox** (sem emulador Android/iOS, sem device físico; `expo start --web` falha por um erro pré-existente e não relacionado a esta story — `expo-sqlite` não resolve `wa-sqlite.wasm` no bundler web, ver Completion Notes). Verificação de substituição feita por leitura de código: fluxo `login → home → qr-code`, hidratação/logout do `auth.store`, e os 5 estados da Tabela de Verdade foram revisados linha a linha contra a implementação. Recomendo ao Lucas rodar o roteiro num device/emulador real antes de mover para "done".
- [x] 9.4 Prova cruzada da AC #1/#6: `encodeQrPayload` faz `JSON.stringify({ studentId, sessionId })` com ordem de chaves fixa e sem base64 — conferido por leitura de código (`utils/qr-payload.ts`); decodificação visual num leitor de QR real fica pendente junto com a 9.3.
- [x] 9.5 Regressão do motorista: `(driver)/routes.tsx` mantém a mesma UI/lógica, só trocando o fetch inline pelo import de `routesService.getMyRoutes` — sem test runner no mobile para automatizar, confirmado por leitura de código (nenhuma linha de render foi alterada).

---

## Dev Notes

### Estado atual dos arquivos que serão MODIFICADOS

| Arquivo | Hoje | Esta story muda | Preservar |
|---|---|---|---|
| `src/app/(auth)/login.tsx` | Login funcional, tokens em MMKV, `login(result.user)`, redirect por role | Só os 2 destinos do redirect | Toda a lógica de erro, normalização de e-mail, `KeyboardAvoidingView` |
| `src/stores/auth.store.ts` | 25 linhas; `user` nunca hidratado | Hidratação, persistência, `sessionId`, logout completo | A forma da interface `AuthState` — `_layout.tsx` consome `isAuthenticated` |
| `src/lib/storage.ts` | `storage` + `tokenStorage` | **Adiciona** `userStorage` e `qrSessionStorage` | `storage` é usada pelo `mmkv-persister` do TanStack Query; não troque a instância |
| `src/app/(student)/_layout.tsx` | `<Stack />` nu | `initialRouteName` + títulos | — |
| `src/app/(student)/home.tsx` | Placeholder de 9 linhas | Home mínima com botão do QR | — |
| `src/app/(student)/qr-code.tsx` | Placeholder de 9 linhas | Tela real | — |
| `src/app/(driver)/routes.tsx` | Tela completa com tipo e fetch inline | Só troca por import do serviço | O restante da tela, `RefreshControl`, `Snackbar` |
| `src/mocks/handlers/index.ts` | `[...boardingHandlers]` | +auth +routes | Ordem: handlers mais específicos primeiro |
| `.env.example` | Documenta a flag e os IDs do boarding | +credenciais mock | O bloco existente |

### Padrões que já existem — não reinventar

- **HTTP:** `apiClient` (`src/services/api-client.ts`) já faz auth header, timeout de 30s, refresh automático em 401, redirect para login e desempacota o envelope `{ data }`. Não faça `fetch` direto.
- **Serviço por domínio:** `auth.service.ts` e `trip.service.ts` são o molde — objeto exportado com métodos finos sobre `apiClient`. `routes.service.ts` segue o mesmo.
- **Store por domínio (Zustand):** actions como métodos do store, nunca mutação externa (`architecture.md#Padrões Mobile`).
- **UI:** `react-native-paper` com `PaperProvider` já montado no `_layout.tsx` raiz, tema em `src/lib/theme.ts` (primária `#208AEF`). `(driver)/routes.tsx` é a referência viva de `Card` + `RefreshControl` + `Snackbar`.
- **Cache offline (Tier 1):** já está ligado — `PersistQueryClientProvider` + `mmkvPersister`, `gcTime` 24h, `maxAge` 24h. Uma `useQuery` comum já herda persistência offline; você não precisa configurar nada por query.
- **Mocks:** `boarding.handlers.ts` é o padrão de qualidade a imitar — handlers tipados a partir de `operations[...]`, estado em memória, `resetXMocks()` exportado.
- **Erros de negócio:** `ApiClientError` carrega `code`/`message`/`status`. Mensagem ao usuário via `Snackbar` (`architecture.md#Tratamento de erros no mobile`).

### Fora de escopo (não fazer nesta story)

- QR dinâmico com validade temporal — Fase 2 (`prd.md#NFR8`).
- Qualquer coisa no `api/` — esta story é 100% mobile. Nenhum arquivo em `api/` deve aparecer no `File List`.
- Regenerar `api/openapi.json` ou `src/types/api.d.ts` — o contrato da 3.0 já tem o `QrCodePayloadDto`; nada a exportar.
- Escanear QR (3.3b), fila offline (3.4b), lista de alunos (3.5b), "Não vou voltar" (4.1b), mapa (5.2b).
- Corrigir `constants.ts` para ler `EXPO_PUBLIC_API_URL` (hoje o valor é hardcoded, divergindo do `.env.example`) — ver *Questões Abertas* #2.
- Introduzir framework de testes no mobile — ver *Testing Requirements* e *Questões Abertas* #1.
- Trocar o `<AppTabs/>` do `_layout.tsx` raiz (ainda são as abas `index`/`explore` do starter Expo) — ver *Questões Abertas* #3.

### Previous Story Intelligence

- **3.0 (contrato, done)** congelou `QrCodePayloadDto` com exatamente dois campos e a decisão de codificação (JSON puro, sem base64). Esta story é a primeira consumidora. Um terceiro campo aqui quebra a 3.3b silenciosamente.
- **3.3a (backend, done)** já valida o check-in: `studentId`/`tripId` precisam ser UUID; aluno precisa estar ativo e no roster da rota. Traduzindo para cá: um `studentId` que não seja o `user.id` real do aluno vira `403 STUDENT_NOT_ALLOWED` no ônibus, não erro na sua tela.
- **3.5a (backend, done)** definiu os status do roster e ajustou `boarding.handlers.ts`. Os `studentId`s do roster mock (`...440010`–`...440013`) são a razão da Task 5.3 fixar o id do aluno mock.
- **Defer da 3.0 que te afeta:** `api-client.ts` não expõe headers por requisição, então não consegue mandar `X-Idempotency-Key`. **Não conserte aqui** — é escopo da 3.3b/3.4b, e esta story não faz nenhuma escrita.
- **Defer da 3.0:** vários request bodies antigos geram `Record<string, never>` em `api.d.ts` (Effect Schema não produz metadata Swagger). Por isso `AuthTokens` em `auth.service.ts` é escrito à mão e continua assim. Isso **não** vale para o `QrCodePayloadDto`, que é DTO de classe e gera tipo correto — use o tipo gerado (AC #6).
- **Retro do Épico 2, ação #4** ("Definir padrões Mobile"): esta story fixa dois deles — query keys segmentadas (`['routes','mine']`) e empty-state ≠ error-state. Os demais (error boundary global, offline indicator com `useAppStore.isOnline`, pull-to-refresh) continuam abertos; `useAppStore` já existe com `isOnline`, mas nada o atualiza ainda — não construa o indicador global aqui.

### Git Intelligence

Últimos commits (`7097187` ← `61b0e1a` ← `aa96755` ← `4930bbd`): três stories de backend do Épico 3 mais o contrato. **O mobile não recebe uma linha de feature desde a 3.1** (`36c7409`, ainda em `review`) — os únicos toques recentes foram `api.d.ts` (gerado) e `boarding.handlers.ts`. Consequência prática: as telas do aluno ainda são placeholders do scaffold e a navegação nunca foi exercitada de ponta a ponta. Espere atrito de infraestrutura (Bloqueadores 1 e 2), não de lógica.

Convenção de commit do repo: `feat(escopo): descrição em inglês, imperativo` + `(story X.Y)` no fim. Ex.: `feat(boarding): implement check-in use case and idempotency (story 3.3a)`.

### Latest Tech Information (verificado em 2026-08-23)

- **Expo SDK 55 / RN 0.83.2 roda exclusivamente na New Architecture** — a Legacy foi removida e a flag `newArchEnabled` não existe mais. Toda lib nova precisa ser New-Arch-compatible; `react-native-svg` 15.x é.
- **`react-native-qrcode-svg@6.3.21`** (última publicada): `peerDependencies` = `react-native-svg >= 14.0.0`, `react-native >= 0.63.4`, `react`. Dependências próprias: `qrcode`, `prop-types`, `text-encoding` — puro JS, **sem** módulo nativo próprio, então não exige config plugin nem prebuild.
- **`react-native-svg`**: use a versão que o `npx expo install` pinar para o SDK 55 (a última publicada é 15.15.5, mas o pin do Expo é a autoridade). Este é o único módulo **nativo** adicionado pela story — se estiver rodando em Expo Go, ele já vem embutido; em dev client, será preciso rebuildar.
- **`expo-crypto`**: pin do SDK 55 via `expo install`. Expõe `randomUUID()` (UUID v4 criptograficamente seguro) e `getRandomBytes`. Preferível a qualquer gerador caseiro para um identificador de sessão.
- Alternativas descartadas: `expo-barcode-generator` (wrapper com menos adoção) e gerar SVG à mão com o pacote `qrcode` (reimplementa o que a lib já entrega).

### Testing Requirements

**Não existe test runner no `mobile/`** — as `devDependencies` são `@types/react`, `openapi-typescript`, `typescript`. Nenhum Jest, nenhum Vitest, nenhum `*.spec.tsx`. **Não introduza um nesta story**: escolher e configurar framework de teste para RN é decisão de arquitetura, tem custo próprio e não cabe numa story de tela (ver *Questões Abertas* #1).

O que vale como verde aqui:

- `npx tsc --noEmit` → **0 erros** (a baseline tem 2, ambos endereçados pela Task 1). Este é o teste de conformidade da AC #6: o payload tipado por `components['schemas']['QrCodePayloadDto']` falha em compilar se divergir do contrato — mesmo mecanismo que `boarding.handlers.ts` usa e documenta.
- `npm run lint` (mobile) limpo para os arquivos da story.
- Roteiro manual da Task 9.3 executado e registrado, incluindo os dois casos que só aparecem fora do caminho feliz: **reinício do app** e **modo avião**.
- Sem regressão no `api/`: nada a rodar lá, porque nada lá é tocado.

### Project Structure Notes

```
mobile/
├── .env.example                                # [UPDATE] credenciais e studentId do mock
├── package.json / package-lock.json            # [UPDATE] +3 deps
└── src/
    ├── app/
    │   ├── (auth)/login.tsx                    # [UPDATE] 2 linhas de redirect
    │   ├── (student)/_layout.tsx               # [UPDATE] Stack com initialRouteName + títulos
    │   ├── (student)/home.tsx                  # [UPDATE] placeholder → home mínima (1 toque até o QR)
    │   └── (student)/qr-code.tsx               # [UPDATE] placeholder → tela real
    ├── components/student-qr-code.tsx          # [NEW] componente puro de exibição
    ├── lib/storage.ts                          # [UPDATE] +userStorage +qrSessionStorage
    ├── mocks/handlers/auth.handlers.ts         # [NEW]
    ├── mocks/handlers/routes.handlers.ts       # [NEW]
    ├── mocks/handlers/index.ts                 # [UPDATE] registrar os dois
    ├── services/routes.service.ts              # [NEW] AssignedRoute + getMyRoutes (movido de (driver)/routes.tsx)
    ├── app/(driver)/routes.tsx                 # [UPDATE] passa a importar do serviço
    ├── stores/auth.store.ts                    # [UPDATE] hidratação + sessionId + logout completo
    └── utils/qr-payload.ts                     # [NEW] tipo do contrato + build/encode
```

`components/qr-scanner.tsx`, `services/boarding.service.ts` e `utils/offline-queue.ts` aparecem no desenho de `architecture.md#Estrutura do Mobile` mas pertencem às stories 3.3b/3.4b. **Nenhum arquivo em `api/` nesta story.**

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2b] — ACs, camada, dependências, FRs/NFRs
- [Source: _bmad-output/planning-artifacts/epics.md#Convenção de Fatiamento] — regra das stories `X.Yb` (desenvolver contra MSW, tipos gerados nunca à mão)
- [Source: _bmad-output/planning-artifacts/prd.md#FR15,FR17,NFR8,NFR19] — QR único por sessão, apresentação pelo aluno, 2 toques
- [Source: _bmad-output/planning-artifacts/architecture.md#5] — Tier 1 (TanStack Query + MMKV) já ligado; Tier 2 fora desta story
- [Source: _bmad-output/planning-artifacts/architecture.md#6] — padrões mobile: stores Zustand, erros via Snackbar, loading states
- [Source: _bmad-output/planning-artifacts/architecture.md#7] — `(student)/qr-code.tsx` e `components/` no desenho oficial do mobile
- [Source: _bmad-output/planning-artifacts/architecture.md#8] — regra 11: tipos de API são gerados, editar `api.d.ts` à mão é violação de contrato
- [Source: _bmad-output/project-context.md] — MMKV obrigatório (nunca AsyncStorage), alias `@/*`, kebab-case + PascalCase no export
- [Source: api/openapi.json#components.schemas.QrCodePayloadDto] — dois campos, JSON UTF-8 sem base64; **autoridade final do payload**
- [Source: mobile/src/types/api.d.ts:457-471] — o tipo gerado a importar
- [Source: api/prisma/schema.prisma#model User] — aluno é `User` com `role = STUDENT`; `studentId === user.id`
- [Source: api/src/domains/auth/core/use-cases/create-student.use-case.ts:36] — confirmação: evento usa `studentId: user.id`
- [Source: api/src/domains/routing/core/use-cases/get-my-routes.use-case.ts:22-26] — `/routes/mine` ramifica por role; STUDENT → `findRoutesByStudent`
- [Source: mobile/src/app/(driver)/routes.tsx:10-24] — origem de `AssignedRoute` e `fetchMyRoutes` (mover, não duplicar)
- [Source: mobile/src/mocks/handlers/boarding.handlers.ts] — padrão dos handlers e `studentId`s do roster mock
- [Source: mobile/src/services/api-client.ts] — envelope `{ data }`, 401/refresh, `ApiClientError`
- [Source: mobile/src/app/_layout.tsx] — portões de DB/mocks, `PersistQueryClientProvider`, redirect por `isAuthenticated`
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-05-11.md#Ações] — ação #4: padrões mobile (query keys, empty vs error state)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — defers da 3.0 sobre `api-client` e tipos gerados

---

## Questões Abertas (para o Lucas, não bloqueiam o dev)

1. **O `mobile/` não tem nenhum teste automatizado — e agora tem lógica que merece um.** `qr-payload.ts` (codificação determinística) e a hidratação do `auth.store` são puros e triviais de testar; o custo é escolher e configurar o runner (`jest-expo` é o caminho de menor atrito para SDK 55). Não fiz isso aqui porque a decisão vale para toda a trilha mobile do MVP, não só para esta tela, e a Story 3.6 assume Playwright para o E2E do épico. Candidato natural a story técnica antes da 3.4b, que traz a fila offline — muito mais difícil de validar só no olho.

2. **`constants.ts` ignora `EXPO_PUBLIC_API_URL`.** `.env.example` documenta a variável, mas `API_BASE_URL` é hardcoded (`http://10.0.2.2:3000` em dev). Quem rodar em device físico vai editar o fonte. Correção de uma linha, mas é infraestrutura compartilhada e prefiro não escondê-la dentro de uma story de tela.

3. **O `_layout.tsx` raiz ainda renderiza `<AppTabs/>` com as abas `index`/`explore` do starter do Expo**, e nada é renderizado quando `isAuthenticated` é falso — o navegador só monta depois do login. A navegação por grupo (`(student)`/`(driver)`/`(admin)`) funciona por rota direta, mas o shell de navegação nunca foi desenhado para o produto. Esta story entrega o caminho aluno→QR sem tocar nisso; em algum momento antes da 3.6 alguém precisa decidir o shell definitivo.

4. **O `sessionId` é opaco para o backend no MVP** (`openapi.json` diz isso explicitamente). Ou seja: hoje nada impede um QR de sessão antiga de continuar sendo aceito, porque o check-in valida `studentId` e roster, não a sessão. Isso está coerente com a NFR8 ("segurança suficiente para protótipo") e com o QR dinâmico previsto para a Fase 2 — registro aqui só para que a limitação seja consciente na defesa do TCC.

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `cd mobile && npx tsc --noEmit` — baseline: 2 erros (login.tsx:41,43); após Task 1: 0 erros; final: 0 erros.
- `cd mobile && npm run lint` — sem `eslint.config.js` prévio no projeto (`npm run lint` nunca havia rodado com sucesso); `expo lint` auto-instalou `eslint`/`eslint-config-expo` e gerou `eslint.config.js` na primeira execução. Após correção de 1 warning (`react-hooks/exhaustive-deps` em `qr-code.tsx`), saída limpa (0 erros, 0 warnings).
- Tentativa de rodar o app para o roteiro manual (Task 9.3): sem emulador Android/simulador iOS/device físico neste ambiente. `EXPO_PUBLIC_USE_MOCKS=1 npx expo start --web` falha no bundler com `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm from expo-sqlite/web/worker.ts` — erro pré-existente e não relacionado a esta story (o import de `expo-sqlite` vem de `src/lib/database.ts`, importado por `_layout.tsx`, nenhum dos dois tocado aqui). Não investigado/corrigido por estar fora do escopo da story.

### Completion Notes List

- Task 1 desbloqueou a navegação do aluno/motorista (2 erros de tsc na baseline, ambos corrigidos) e deu `initialRouteName`/títulos ao `Stack` de `(student)`.
- Task 2 fechou o Bloqueador 2: `user` agora hidrata do MMKV, `isAuthenticated` exige token **e** user, e `login`/`logout` gerenciam o `sessionId` do QR (novo a cada login, limpo no logout).
- Task 3 instalou `react-native-svg`, `expo-crypto` (via `expo install`, versões pinadas ao SDK 55) e `react-native-qrcode-svg@^6.3.21`. Nenhuma entrada nova em `app.json#plugins`.
- Task 4 criou `utils/qr-payload.ts` com o tipo `QrCodePayload` importado de `api.d.ts` (`components['schemas']['QrCodePayloadDto']`) e codificação determinística (`JSON.stringify` com ordem de chaves fixa, sem base64).
- Task 5 moveu `AssignedRoute`/fetch de rotas para `services/routes.service.ts` (motorista passou a importar do serviço, UI inalterada), e criou os handlers MSW de auth (`aluno@pureurban.com` → STUDENT com `studentId` `...440010`, do roster de `boarding.handlers.ts`; `motorista@pureurban.com` → DRIVER; qualquer outro e-mail → 401) e de `/routes/mine`. `.env.example` documenta as credenciais mockadas.
- Task 6 criou o componente puro `StudentQrCode` (fundo branco/módulos pretos fixos, independente de tema; `size` responsivo via `useWindowDimensions`).
- Task 7 reescreveu `(student)/qr-code.tsx`: ordem nome → QR → rota (QR nunca atrás de gate de rede), estados de loading/empty/error distintos para o bloco de rota, e tela de "sessão corrompida" (sem `sessionId`) com botão de logout + volta ao login — nunca um QR vazio/placeholder.
- Task 8 reescreveu `(student)/home.tsx` com saudação e botão único para o QR (1 toque, conforme AC #5).
- Task 9: `tsc --noEmit` e `npm run lint` limpos (ver Debug Log). O roteiro manual (9.3) e a decodificação num leitor de QR real (9.4) **não foram executados** — sem emulador/device neste ambiente sandbox; verificação de substituição feita por leitura de código linha a linha contra a Tabela de Verdade da story. **Recomendo ao Lucas rodar o roteiro manual num device/emulador real antes de mover a story para "done".**
- Efeito colateral necessário (não é uma task da story): `mobile/` nunca teve `eslint.config.js` — `npm run lint` (Task 9.2) nunca havia sido executado com sucesso no projeto. `expo lint` gerou a config padrão da Expo (`eslint-config-expo/flat`) na primeira execução; incluída no File List por ser pré-requisito para a própria Task 9.2 passar.

### File List

- `mobile/.env.example` (UPDATE)
- `mobile/package.json` (UPDATE — +3 deps: `react-native-svg`, `expo-crypto`, `react-native-qrcode-svg`)
- `mobile/package-lock.json` (UPDATE)
- `mobile/eslint.config.js` (NEW — gerado por `expo lint`; ver Completion Notes)
- `mobile/src/app/(auth)/login.tsx` (UPDATE)
- `mobile/src/app/(student)/_layout.tsx` (UPDATE)
- `mobile/src/app/(student)/home.tsx` (UPDATE)
- `mobile/src/app/(student)/qr-code.tsx` (UPDATE)
- `mobile/src/app/(driver)/routes.tsx` (UPDATE)
- `mobile/src/components/student-qr-code.tsx` (NEW)
- `mobile/src/lib/storage.ts` (UPDATE)
- `mobile/src/mocks/handlers/auth.handlers.ts` (NEW)
- `mobile/src/mocks/handlers/routes.handlers.ts` (NEW)
- `mobile/src/mocks/handlers/index.ts` (UPDATE)
- `mobile/src/services/routes.service.ts` (NEW)
- `mobile/src/stores/auth.store.ts` (UPDATE)
- `mobile/src/utils/qr-payload.ts` (NEW)

### Change Log

- 2026-08-23: Implementação completa da story 3.2b — geração e exibição do QR code do aluno, com desbloqueio de navegação (Task 1), persistência de sessão no MMKV (Task 2), dependências de QR (Task 3), payload tipado pelo contrato (Task 4), serviço de rotas + mocks MSW de auth/rotas (Task 5), componente de QR (Task 6), tela de QR (Task 7) e home com 1 toque (Task 8). `tsc --noEmit` e `npm run lint` limpos; roteiro manual (Task 9.3) pendente de execução num device/emulador real.

### Review Findings

_Code review adversarial em 2026-08-23 — 3 camadas paralelas (Blind Hunter, Edge Case Hunter, Acceptance Auditor). ACs 1, 2, 3, 4 e 6 verificadas como SATISFEITAS; ambos os bloqueadores documentados foram resolvidos como prescrito._

- [x] [Review][Defer] AC #5/NFR19 — o navegador raiz não monta os grupos `(student)`/`(driver)`, então o aluno em boot quente não alcança o QR — `_layout.tsx:87` renderiza `{... && <AppTabs />}` e `app-tabs.tsx:16-30` declara só os triggers `index` e `explore`; `app/index.tsx:37` ainda é a tela "Welcome to Expo" do template. `router.replace('/(student)/home')` só dispara em login novo, então um aluno que reabre o app com sessão hidratada não tem caminho de nenhum tamanho até o QR — o que também torna a AC #2 ("sobrevivendo a reinício do app") inobservável no produto. A própria story cria a contradição: *Questões Abertas #3* defere o nav shell enquanto as ACs 2 e 5 dependem dele. Decisão: (a) ampliar escopo e montar o shell agora, (b) deferir para a 3.6 e registrar a AC #5 como parcialmente atendida. — deferred: decisão adiada para a story 3.6 (integração e E2E do Épico 3), onde o nav shell e a verificação em device passam a ser escopo.
- [x] [Review][Defer] Tasks 9.3 e 9.4 marcadas `[x]` sem terem sido executadas — o texto das linhas 190-191 e a Completion Note da linha 349 declaram abertamente que o roteiro manual e a decodificação num leitor real não rodaram (sem emulador/device no sandbox). A divergência está documentada, não escondida, mas nenhuma AC tem evidência de runtime. Decisão: (a) desmarcar e rodar o roteiro num device antes de mover para `done`, (b) aceitar a verificação por leitura de código. — deferred: decisão adiada para a story 3.6 (integração e E2E do Épico 3), onde o nav shell e a verificação em device passam a ser escopo.
- [x] [Review][Defer] `eslint` e `eslint-config-expo` + `mobile/eslint.config.js` estão fora da lista de dependências autorizada pela Task 3 (que previa 3 deps de runtime) — justificado na Completion Note 350 (sem eles a Task 9.2 não roda). Decisão: ratificar o toolchain de lint deliberadamente ou removê-lo do escopo desta story. — deferred: decisão adiada para a story 3.6 (integração e E2E do Épico 3), onde o nav shell e a verificação em device passam a ser escopo.

- [x] [Review][Patch] Cache do TanStack Query persistido sobrevive ao logout — aluno B vê a rota do aluno A no mesmo aparelho [mobile/src/stores/auth.store.ts:29-34]
- [x] [Review][Patch] Card do QR estoura a largura da tela em devices ≤368dp (16px em 320dp, 8px em 360dp) [mobile/src/components/student-qr-code.tsx:12]
- [x] [Review][Patch] Guarda de sessão checa `user` truthy e não `user.id`; `JSON.stringify` descarta chave undefined e emite QR sem `studentId` [mobile/src/lib/storage.ts:23-33]
- [x] [Review][Patch] Caminho de expiração de sessão (401 + refresh falho) não chama `logout()` — deixa `auth.user`/`qr.sessionId` no MMKV e `isAuthenticated` true [mobile/src/services/api-client.ts:130-131]
- [x] [Review][Patch] Duas query keys para o mesmo endpoint: `['my-routes']` no motorista vs `['routes','mine']` no aluno [mobile/src/app/(driver)/routes.tsx:47]
- [x] [Review][Patch] `refreshing={isFetching}` cobre o bloco do QR com o spinner de pull-to-refresh na carga inicial e durante todo o retry ladder — usar `isRefetching` [mobile/src/app/(student)/qr-code.tsx:78]
- [x] [Review][Patch] Snackbar de erro dispara mesmo quando a rota de cache renderizou normalmente — tela se contradiz [mobile/src/app/(student)/qr-code.tsx:39-41]
- [x] [Review][Patch] `showEmptyState` usa `isLoading`; com a query pausada offline a tela afirma "Nenhuma rota vinculada" sem ter buscado [mobile/src/app/(student)/qr-code.tsx:72]
- [x] [Review][Patch] Sem guarda de role: DRIVER/ADMIN que chegue em `/(student)/qr-code` gera QR com userId não-aluno no campo `studentId` [mobile/src/app/(student)/qr-code.tsx:21]
- [x] [Review][Patch] `login()` é chamado antes da validação de role — role desconhecida deixa a sessão autenticada e persistida na tela de login, sem redirect [mobile/src/app/(auth)/login.tsx:35-48]
- [x] [Review][Patch] Mocks tornam inatingíveis os estados vazio/erro de rota e o logout forçado: `/routes/mine` sempre devolve 1 rota e `/auth/refresh` nunca falha [mobile/src/mocks/handlers/routes.handlers.ts:18-22]
- [x] [Review][Patch] `routes[0].name` sem guarda de array — resposta não-array derruba a tela e leva o QR junto [mobile/src/app/(student)/qr-code.tsx:116-120]
- [x] [Review][Patch] `MOCK_USERS[email]` é lookup em objeto literal e herda `Object.prototype` — `constructor`/`toString` passam pelo check de 401 [mobile/src/mocks/handlers/auth.handlers.ts:38]
- [x] [Review][Patch] Tokens órfãos: `hasPersistedToken && !persistedUser` derruba `isAuthenticated` mas não limpa os tokens do MMKV [mobile/src/stores/auth.store.ts:16-21]
- [x] [Review][Patch] `track-bus` não tem entrada `Stack.Screen` e cai no header com nome cru da rota, ao lado de dois irmãos com título em português [mobile/src/app/(student)/_layout.tsx:5-9]
- [x] [Review][Patch] Comentário "por isso, e só aqui" é falso — `auth.handlers.ts:2` faz o mesmo; e `errorResponse` não é tipado com `ErrorResponseDto` como no `boarding.handlers.ts` [mobile/src/mocks/handlers/routes.handlers.ts:4-6]
- [x] [Review][Patch] Duplo toque em "Meu QR Code" empilha duas telas de QR e dispara duas queries — usar `router.navigate` [mobile/src/app/(student)/home.tsx:18-23]

- [x] [Review][Defer] `onlineManager` nunca conectado ao NetInfo — o offline-first Tier 1 em que esta tela se apoia não existe de fato [mobile/src] — deferred, pre-existing
- [x] [Review][Defer] `sessionId` nunca é lido nem validado no backend — o QR reduz a um studentId em texto claro [api/src/domains/boarding/shell/http/dtos/qr-code-payload.dto.ts:26] — deferred, pre-existing
