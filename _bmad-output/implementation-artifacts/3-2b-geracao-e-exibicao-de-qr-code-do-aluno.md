---
baseline_commit: 7097187
branch: feat/3-2b-qr-code-do-aluno
---

# Story 3.2b: Geração e Exibição de QR Code do Aluno (Mobile Aluno)

Status: ready-for-dev

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

- [ ] 1.1 `mobile/src/app/(auth)/login.tsx`: `router.replace('/(student)/')` → `router.replace('/(student)/home')` e `router.replace('/(driver)/')` → `router.replace('/(driver)/trip')`. Não mexa em mais nada neste arquivo.
- [ ] 1.2 `mobile/src/app/(student)/_layout.tsx`: trocar o `<Stack />` nu por um `Stack` com `initialRouteName="home"` e `screenOptions`/`Stack.Screen` dando `title` legível a `home` ("Início") e `qr-code` ("Meu QR Code"), para o botão de voltar existir e ter rótulo.
- [ ] 1.3 Rodar `npx tsc --noEmit` — **deve sair com 0 erros**. Se sobrar qualquer erro, ele foi introduzido por você.

### Task 2 — Persistir a identidade da sessão no MMKV (AC: 1, 2)

- [ ] 2.1 `mobile/src/lib/storage.ts`: adicionar, no mesmo estilo do `tokenStorage` já existente:
  - `userStorage`: `getUser(): AuthUser | null` (JSON.parse defensivo — retorna `null` em JSON inválido), `setUser(user)`, `clearUser()`. Chave `auth.user`.
  - `qrSessionStorage`: `getSessionId(): string | undefined`, `setSessionId(id)`, `clearSessionId()`. Chave `qr.sessionId`.
  - Não crie um segundo `createMMKV()` — reutilize a instância `storage` exportada no topo do arquivo.
- [ ] 2.2 `mobile/src/stores/auth.store.ts`:
  - hidratar `user` de `userStorage.getUser()` no boot (hoje é `null` fixo);
  - derivar `isAuthenticated` de `Boolean(token) && Boolean(user)` — um token sem usuário é sessão inutilizável, e deixá-la "autenticada" é exatamente o Bloqueador 2;
  - `login(user)`: persistir o usuário **e** gerar+persistir um `sessionId` novo (`Crypto.randomUUID()`) — QR novo a cada login é o que a NFR8 pede;
  - `logout()`: além de `clearTokens()`, chamar `clearUser()` e `clearSessionId()`. Deixar o `sessionId` para trás faria o próximo aluno logado no mesmo aparelho herdar o QR do anterior.
- [ ] 2.3 Garantir que o `sessionId` seja **lido**, nunca regerado, fora do `login()`. Se a tela de QR gerar um id quando ele falta, o QR deixa de ser estático por sessão (AC #2). Ausência de `sessionId` com `user` presente é sessão corrompida → linha 4 da Tabela de Verdade.

### Task 3 — Dependências (AC: 1)

- [ ] 3.1 `cd mobile && npx expo install react-native-svg expo-crypto` (o `expo install` pina a versão compatível com o SDK 55 — **não** use `npm install` para essas duas).
- [ ] 3.2 `npm install react-native-qrcode-svg@^6.3.21`.
- [ ] 3.3 Nenhuma das três exige entrada em `app.json#plugins`. Não adicione.
- [ ] 3.4 Conferir que `package.json` e `package-lock.json` entram no commit juntos.

### Task 4 — Payload do QR, tipado pelo contrato (AC: 1, 6)

- [ ] 4.1 Criar `mobile/src/utils/qr-payload.ts`:
  ```ts
  import type { components } from '@/types/api'
  export type QrCodePayload = components['schemas']['QrCodePayloadDto']
  ```
- [ ] 4.2 `buildQrPayload(studentId: string, sessionId: string): QrCodePayload` — objeto literal `{ studentId, sessionId }`, nada além dos dois campos do contrato.
- [ ] 4.3 `encodeQrPayload(payload: QrCodePayload): string` — `JSON.stringify` de um literal com **ordem de chaves fixa** (`studentId` depois `sessionId`), sem espaços, **sem base64**. Ordem fixa importa: string idêntica ⇒ QR pixel-idêntico entre renders, o que é a prova visual da AC #2.
- [ ] 4.4 Nada de `zod`, `@effect/schema` ou validação manual aqui. O tipo gerado é o contrato (regra 11 da Architecture); o dev do scanner (3.3b) decodifica com o mesmo tipo.

### Task 5 — Serviço de rotas e handlers MSW (AC: 3, 4)

- [ ] 5.1 Criar `mobile/src/services/routes.service.ts` exportando a interface `AssignedRoute` e `routesService.getMyRoutes()` — **mova** (não duplique) a interface e o `fetchMyRoutes` que hoje vivem inline em `mobile/src/app/(driver)/routes.tsx:10-24`.
- [ ] 5.2 Atualizar `(driver)/routes.tsx` para importar do serviço. É uma troca de import + remoção das linhas movidas; não redesenhe a tela do motorista.
- [ ] 5.3 Criar `mobile/src/mocks/handlers/auth.handlers.ts`: `POST /api/v1/auth/login` e `POST /api/v1/auth/refresh` devolvendo o envelope `{ data: { accessToken, refreshToken, user }, meta }`. O usuário STUDENT **deve** ter `id = '660e8400-e29b-41d4-a716-446655440010'` (Ana Souza — membro do roster de `boarding.handlers.ts`), para que o QR gerado aqui seja aceito pelo check-in mockado nas stories 3.3b/3.6. Inclua também um usuário DRIVER. Escolha o papel pelo e-mail enviado (ex.: prefixo `aluno@` vs `motorista@`) e devolva `401` para credenciais fora da lista — o `api-client` trata 401 em `/auth/login` como erro de credencial, sem disparar refresh.
- [ ] 5.4 Criar `mobile/src/mocks/handlers/routes.handlers.ts`: `GET /api/v1/routes/mine` devolvendo `{ data: AssignedRoute[], meta }` com uma rota plausível. O contrato **não** declara schema de resposta para este endpoint (só descrições em `openapi.json`) — por isso aqui, e só aqui, o shape vem da interface `AssignedRoute` do serviço, não de `api.d.ts`. Deixe um comentário dizendo isso.
- [ ] 5.5 Registrar os dois em `mobile/src/mocks/handlers/index.ts` (`[...authHandlers, ...routesHandlers, ...boardingHandlers]`).
- [ ] 5.6 Atualizar o bloco `EXPO_PUBLIC_USE_MOCKS` de `mobile/.env.example` documentando as credenciais mockadas e o `studentId` do aluno mock.

> **Por que 5.3 existe:** `.env.example` promete que com a flag ligada a trilha mobile roda "sem backend de pé", e a convenção de fatiamento (`epics.md#Convenção de Fatiamento`) exige que as stories `X.Yb` sejam desenvolvidas contra MSW. Hoje isso é falso: `/auth/login` não tem handler, cai no `onUnhandledRequest: 'warn'` e vaza para a rede real — ou seja, o dev mobile precisa do backend de pé só para conseguir entrar no app. Como esta é a primeira story mobile do épico, o custo aparece aqui.

### Task 6 — Componente de exibição do QR (AC: 1, 2)

- [ ] 6.1 Criar `mobile/src/components/student-qr-code.tsx` (kebab-case no arquivo, PascalCase no export — `project-context.md#Naming Conventions`). Props: `value: string` (a string já codificada) e `size?: number`.
- [ ] 6.2 Renderizar `<QRCode value={value} size={size} backgroundColor="#FFFFFF" color="#000000" quietZone={16} ecl="M" />`.
- [ ] 6.3 **Fundo branco e módulos pretos são fixos, independentes do tema.** Não use as cores do Paper aqui: QR claro sobre fundo escuro derruba a taxa de leitura das câmeras que a 3.3b vai usar. Envolva o QR numa `View` branca com `borderRadius` — o contraste do card é decorativo, o do QR não é.
- [ ] 6.4 `size` default calculado a partir de `useWindowDimensions()`: `Math.min(width - 64, 288)`. Nada de valor fixo que estoure em telas pequenas.
- [ ] 6.5 O componente é puro: sem `useQuery`, sem store, sem acesso a MMKV. Ele recebe uma string e desenha.

### Task 7 — Tela `(student)/qr-code.tsx` (AC: 1, 2, 3, 4, 6)

- [ ] 7.1 Substituir o placeholder atual (9 linhas) pela tela real, seguindo o padrão de `(driver)/routes.tsx`: `react-native-paper` (`Text`, `Card`, `ActivityIndicator`, `Snackbar`, `Divider`), `ScrollView` + `RefreshControl`, TanStack Query.
- [ ] 7.2 Ler `user` de `useAuthStore()` e `sessionId` de `qrSessionStorage`. Memoizar a string do QR com `useMemo` sobre `[user?.id, sessionId]` — recalcular a cada render é desperdício e faz o QR "piscar".
- [ ] 7.3 Rota vinculada via `useQuery({ queryKey: ['routes', 'mine'], queryFn: routesService.getMyRoutes })`. **Query key em array segmentado** (`['routes','mine']`), conforme a ação #4 da retro do Épico 2 — é a convenção que esta story fixa para a trilha mobile.
- [ ] 7.4 Ordem de renderização: nome do aluno → **QR** → rota. O QR vem antes do bloco que depende de rede; assim nenhum estado de loading pode empurrá-lo para fora da tela.
- [ ] 7.5 Estados do bloco de rota, distintos entre si (lição da 2.6, registrada na retro do Épico 2): `isLoading` → skeleton/spinner **só no bloco**; lista vazia → "Nenhuma rota vinculada" (empty-state); `isError` → aviso de falha + `Snackbar` com ação de retry (error-state). Não confunda os dois últimos.
- [ ] 7.6 Múltiplas rotas: renderize a primeira e, se `length > 1`, um texto discreto "+N rotas". Nada de seletor — está fora de escopo.
- [ ] 7.7 Sessão corrompida — na prática, `sessionId` ausente com `user` presente (com a Task 2.2, `user == null` já derruba o `isAuthenticated` e o `_layout.tsx` manda para o login antes desta tela montar; trate o caso mesmo assim, porque um app instalado por cima de build antigo chega aqui): mensagem clara + `Button` que chama `logout()` e navega para `/(auth)/login`. Não renderize QR vazio, nem `''`, nem placeholder — um QR que decodifica para lixo vira `INVALID_QR_CODE` no ônibus, com uma criança na porta.
- [ ] 7.8 Texto de apoio curto ("Mostre este código ao motorista") e o nome do aluno em destaque, para o motorista conferir a olho quando a câmera falhar.

### Task 8 — Tela `(student)/home.tsx` com acesso em 1 toque (AC: 5)

- [ ] 8.1 Substituir o placeholder por uma home mínima: saudação com `user.name` e um `Button` grande (`mode="contained"`, `contentStyle` com `paddingVertical` generoso) "Meu QR Code" → `router.push('/(student)/qr-code')`.
- [ ] 8.2 Contagem de toques da AC #5: login leva a `home` (0 toques) → 1 toque no botão → QR na tela. Documente essa contagem num comentário de uma linha no arquivo.
- [ ] 8.3 **Escopo mínimo.** Nada de "Não vou voltar" (Story 4.1b) nem mapa (5.2b). Se quiser deixar o lugar preparado, deixe só o espaço — sem botão morto.

### Task 9 — Verificação (todas as ACs)

- [ ] 9.1 `cd mobile && npx tsc --noEmit` → **0 erros** (baseline tinha 2; ambos são seus, na Task 1).
- [ ] 9.2 `npm run lint` no mobile — nenhum arquivo desta story na saída.
- [ ] 9.3 Roteiro manual com `EXPO_PUBLIC_USE_MOCKS=1` (registre o resultado em *Completion Notes*):
  - login como aluno mock → cai em `(student)/home`;
  - 1 toque → QR visível com nome e rota (AC #1, #4, #5);
  - **matar e reabrir o app** → QR idêntico ao anterior, sem novo login (AC #2 + Bloqueador 2);
  - **modo avião** → QR continua renderizando; só o bloco de rota degrada (AC #3);
  - logout → login de novo → QR **diferente** do anterior (AC #2).
- [ ] 9.4 Prova cruzada da AC #1/#6: decodifique o QR exibido (qualquer leitor) e confirme que a string é exatamente `{"studentId":"<uuid>","sessionId":"<uuid>"}` — sem base64, sem espaços, dois campos. É esse texto que a 3.3b vai parsear.
- [ ] 9.5 Regressão do motorista: com a Task 5.1/5.2, `(driver)/routes.tsx` continua listando rotas igual a antes.

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

### Debug Log References

### Completion Notes List

### File List

### Change Log
