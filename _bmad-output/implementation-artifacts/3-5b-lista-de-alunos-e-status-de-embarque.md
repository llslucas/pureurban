# Story 3.5b: Lista de Alunos e Status de Embarque (Mobile Motorista)

Status: ready-for-dev

**Épico:** 3 — Gestão de Viagens e Embarque Digital
**Camada:** Mobile (`X.Yb`) · **Depende de:** 3.0 (contrato, `done`), 3.5a (backend, `done`), 1.8 (shell de navegação, `done`)
**FRs:** FR22, FR24, FR25 · também exibe FR23 · **NFRs:** NFR18 (uma mão, contraste), NFR4 (percepção de < 1s)

---

## Story

Como **motorista**,
Quero **ver a lista completa dos alunos da viagem com o status de embarque de cada um**,
Para que **eu saiba quem já entrou e quem ainda falta, inclusive sem sinal de internet**.

---

## Acceptance Criteria

**Given** viagem ativa
**When** o motorista acessa `(driver)/student-list.tsx`
1. **Then** a lista exibe todos os alunos da viagem com os três status do contrato — `CHECKED_IN` ("Embarcou"), `NOT_CHECKED_IN` ("Não embarcou") e `NOT_RETURNING` ("Não vai voltar") — visualmente distintos entre si (FR22, FR23)
2. **And** a contagem resumida aparece no topo, no formato `"28/32 embarcados"`, lida de `summary` da resposta e **nunca** recalculada no cliente (FR25)
3. **And** a lista é cacheada offline pelo `persistQueryClient` já montado (Architecture §5, Tier 1) e **continua legível sem rede**, com indicador visível de que o dado pode estar desatualizado (FR24)
4. **And** um check-in feito na tela de scan reflete na lista sem que o motorista recarregue a tela
5. **And** a tela tem ponto de entrada in-app a partir de `(driver)/trip.tsx` **e** de `(driver)/scan.tsx` — hoje ela só é alcançável digitando a URL no alvo web
6. **And** a interface é otimizada para uma mão: alvos de toque ≥ 48dp, contraste alto, sem gesto fino (NFR18)
7. **And** a story é desenvolvida contra os handlers MSW da Story 3.0, sem backend de pé
8. **And** `npx tsc --noEmit` e `npm run lint` continuam limpos, e `npx expo export --platform web` continua completando sem erro

---

## 🚨 Os quatro bloqueadores que você vai encontrar primeiro — leia antes de tudo

### Bloqueador 1 — a tela não recebe `tripId` de lugar nenhum

`GET /api/v1/trips/:id/students` exige um `:id`, mas `(driver)/student-list.tsx` é uma rota
sem parâmetro: o shell da Story 1.8 a declara como `<Stack.Screen name="student-list" />`
(`src/app/(driver)/_layout.tsx:8`) e nada passa params até ela.

**A viagem vem da query `['activeTrip']`, e de nenhum outro lugar.** Essa key já é usada por
`(driver)/trip.tsx:36` e `(driver)/scan.tsx:217` — as duas apontam para
`tripService.getActiveTrip()`. **Criar uma segunda key para o mesmo endpoint foi finding de
review na 3.2b:** o cache duplica e as telas divergem entre si.

Consequência prática: a tela tem **duas** queries encadeadas — primeiro a viagem, depois o
roster (`enabled: Boolean(activeTrip?.id)`). Os estados 2, 3 e 4 da Tabela de Verdade existem
por causa disso.

### Bloqueador 2 — a câmera de `scan.tsx` continua viva quando você navega para a lista

Registrado no `deferred-work.md` com o gatilho nomeado: *"não alcançável hoje… vira real na
Story 3.5b, quando `(driver)/student-list.tsx` deixar de ser placeholder e ganhar navegação a
partir da tela de scan ou da viagem."* **A AC #5 é exatamente esse gatilho.**

`QrScanner` é montado incondicionalmente por `scan.tsx` e não tem `useIsFocused` nem gate de
`AppState` (`src/components/qr-scanner.tsx:32`, `:61`). Navegar `scan → student-list` **empilha**
uma tela: `scan` continua montado, o `CameraView` continua segurando o hardware e drenando
bateria pela viagem inteira. Hoje isso não acontece porque a única saída de `scan` é o botão
de voltar do header, que desempilha e desmonta.

O gate correto **não** é passar `isPaused`: `onBarcodeScanned={undefined}` só para de reportar
leituras, a câmera continua aberta. É **não renderizar** o `QrScanner` fora de foco (Task 5).

### Bloqueador 3 — o check-in bem-sucedido não invalida nada no cliente

`scan.tsx:submit` (`src/app/(driver)/scan.tsx:252-288`) atualiza `boardedCount` e `result`, e
**não** chama `queryClient.invalidateQueries`. O comentário do próprio mock
(`src/mocks/handlers/boarding.handlers.ts:31-32`) afirma que o roster em memória é compartilhado
"para que um check-in na tela de scan reflita na lista de `GET /trips/:id/students`" — **a
metade servidor desse contrato existe, a metade cliente não.**

O `deferred-work.md` registra o item como *"prematuro nesta story… é escopo da Story 3.5b, que
precisa criar a query e a invalidação na mesma passada."* A AC #4 é essa invalidação.

### Bloqueador 4 — trocar de conta não reseta o roster do mock

`auth.handlers.ts:123` chama `resetTripMocks()` no login, mas **não** `resetBoardingMocks()`.
Efeito que você vai ver: escanear com `motorista@pureurban.com`, deslogar, logar de novo — a
lista abre com alunos já `CHECKED_IN` de uma viagem que, para o app, nunca aconteceu. Na 3.3b
isso era invisível (não havia lista); aqui é a primeira tela que exibe o estado acumulado.

Correção de uma linha na Task 4.5. Não "conserte" isso mudando o roster ou a chave do mapa.

---

## Tabela de Verdade da Tela — a referência única

Toda linha abaixo é alcançável em mocks. Divergir dela quebra a Story 3.6.

| # | Condição | O que a tela mostra | Ação primária |
|---|---|---|---|
| 1 | `user` ausente ou `user.role !== 'DRIVER'` | Bloqueio "Acesso restrito — apenas motoristas veem a lista de embarque" | `logout()` + `router.replace('/(auth)/login')` |
| 2 | `['activeTrip']` com `status === 'pending'` | Spinner "Carregando viagem..." | — |
| 3 | `['activeTrip']` com `status === 'error'` | Bloqueio "Não foi possível carregar a viagem" | "Tentar novamente" → `refetch()` da viagem |
| 4 | Viagem resolvida como `null` | Vazio "Nenhuma viagem ativa" | "Ir para Viagem" → `router.navigate('/(driver)/trip')` |
| 5 | Roster `pending` **e sem dado em cache** | Spinner "Carregando alunos..." | — |
| 6 | Roster em `error`, **sem** dado em cache | Erro "Não foi possível carregar a lista" | "Tentar novamente" → `refetch()` do roster |
| 7 | Roster em `error`, **com** dado em cache | **A lista do cache**, com `Banner` "Dados podem estar desatualizados — sem conexão com o servidor" | "Atualizar" → `refetch()` |
| 8 | Roster 200 com `students: []` | Vazio "Nenhum aluno vinculado a esta rota" + contagem `0/0` | — |
| 9 | Roster 200 com alunos | Contagem + lista (estados 9a/9b/9c abaixo) | Pull-to-refresh |
| 9a | Item com `status: 'CHECKED_IN'` | Verde, rótulo "Embarcou", horário local de `checkedInAt` | — |
| 9b | Item com `status: 'NOT_CHECKED_IN'` | Neutro, rótulo "Não embarcou" | — |
| 9c | Item com `status: 'NOT_RETURNING'` | Âmbar, rótulo "Não vai voltar" | — |
| 10 | Roster responde `403 DRIVER_NOT_ASSIGNED` | Bloqueio "Viagem de outro motorista — você não é o responsável por esta viagem" | "Ir para Viagem" |
| 11 | Roster responde `404 TRIP_NOT_FOUND` | Bloqueio "Viagem não encontrada" | "Ir para Viagem" |
| 12 | Roster responde `401` e o refresh falha | **Nada.** O `api-client` já chamou `logout()` + `router.replace('/(auth)/login')` antes de lançar | — |

**Decisões embutidas na tabela. Nenhuma é negociável dentro desta story:**

- **Erro ≠ vazio, e erro-com-cache ≠ erro-sem-cache.** As linhas 6, 7 e 8 são três telas
  diferentes. Colapsá-las é o finding (b) da review da 3.2b e a ação #4 da retro do Épico 2,
  alcançados pela terceira porta. A linha 7 **é** o AC #3 (FR24): sem ela, "legível sem rede"
  vira uma tela de erro.
- **`status === 'pending'`, nunca `isLoading`.** Mesma razão de `scan.tsx:421`. E a linha 5
  exige `pending` **combinado com ausência de `data`** — com o cache do MMKV reidratado, `data`
  chega antes da rede e um spinner por cima dele apagaria o Tier 1 na cara do usuário.
- **A contagem vem de `summary`, sempre.** `students.filter(s => s.status === 'CHECKED_IN').length`
  no cliente é proibido pela AC #2 e pela FR25 ("não é calculada no cliente"). A 3.5a agrega no
  servidor de propósito; recalcular aqui cria uma segunda fonte de verdade que diverge no
  primeiro item paginado ou filtrado.
- **Sem 400 neste endpoint.** O contrato declara 401, 403 e 404 — só isso. Não invente
  validação de `:id` no cliente (ver a Tabela de Verdade da 3.5a).
- **Viagem `COMPLETED` responde 200.** A 3.5a usa `TripRepository.findById`, que não filtra
  status. Só que `GET /trips/active` devolve `ACTIVE` ou `null` (nunca `COMPLETED`), então essa
  linha não é alcançável a partir desta tela hoje. Não escreva um ramo para ela.

---

## Decisões já tomadas — não re-decidir, não pesquisar de novo

| Questão | Decisão | Por quê |
|---|---|---|
| Query key do roster | `['trip', tripId, 'students']` | Segmentada por viagem (ação #4 da retro do Épico 2). Uma key sem `tripId` faria a lista de uma viagem aparecer na seguinte, direto do cache reidratado |
| Query key da viagem | `['activeTrip']` — **reusar**, não criar outra | Já usada por `trip.tsx` e `scan.tsx`; key duplicada foi finding de review na 3.2b |
| Componente de lista | `FlatList` do React Native, com `keyExtractor` e item memoizado | NFR4 fala de 50+ alunos. `ScrollView` + `.map()` renderiza os 50 de uma vez |
| Tipos do payload | `components['schemas']['TripStudentsResponseDto']` | Gerados do contrato (Architecture §8, regra 11). Escrever a interface à mão é violação de contrato |
| Estado do roster | **TanStack Query, e só ela.** **Não crie `stores/boarding.store.ts`** | A 3.3b previa que o store "nasce na 3.5b", mas nada aqui precisa de estado global: a query já é cache, fonte de verdade e canal de invalidação. Um Zustand espelhando a query é uma segunda fonte de verdade e é exatamente o "reinventar roda" que o repo evita. `architecture.md#7` prevê o arquivo — ele nasce quando houver um leitor que a query não sirva |
| Indicador de dado velho | `Banner` do `react-native-paper` (existe na 5.15) | Architecture §5, Tier 1: "UI exibe indicador de 'dados podem estar desatualizados' quando offline" |
| Texto do indicador | "Dados podem estar desatualizados — sem conexão com o servidor" | **Não** use "Modo Offline — dados serão sincronizados": esse texto é a NFR13 e pertence à Story 3.4b, onde existe fila a sincronizar. Aqui não há escrita pendente; prometer sincronização seria mentira |
| Reflexo do check-in | `queryClient.invalidateQueries({ queryKey: ['trip', tripId, 'students'] })` no sucesso do check-in | Invalidação, não `setQueryData` otimista: `summary` é agregado do servidor (AC #2) e um cálculo local do novo total seria a mesma proibição pela porta dos fundos |
| Gate da câmera | Não renderizar `<QrScanner>` quando a tela de scan está fora de foco | `isPaused` não fecha a câmera — ver Bloqueador 2 |
| Horário do check-in | `new Date(checkedInAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })` | Architecture §6: ISO 8601 UTC na API, conversão para timezone local só no frontend. Padrão já usado em `trip.tsx:148` |

---

## Tasks / Subtasks

### Task 1 — `trip.service.ts`: método do roster (AC: 1, 2)

- [ ] 1.1 Em `src/services/trip.service.ts`, importar `import type { components } from '@/types/api'` e exportar os aliases:

  ```ts
  export type TripStudents = components['schemas']['TripStudentsResponseDto']
  export type TripStudentItem = components['schemas']['TripStudentItemDto']
  export type BoardingStatus = TripStudentItem['status']
  ```

  Os três DTOs são classes na API, então geram shape correto (ao contrário dos bodies de
  Effect Schema — ver o defer da 3.0). Verificado: `src/types/api.d.ts:416-457`.
- [ ] 1.2 Acrescentar ao objeto `tripService`:

  ```ts
  getTripStudents: (tripId: string) =>
    apiClient.get<TripStudents>(`/api/v1/trips/${tripId}/students`),
  ```

  `apiClient.get` já desempacota o `{ data }` do envelope — o retorno é o `TripStudentsResponseDto` puro.
- [ ] 1.3 **Não** toque em `getActiveTrip`, `startTrip`, `endTrip` nem na interface `Trip`.
- [ ] 1.4 **Não** crie `boarding.service.ts` novo nem mova `checkIn` para cá: o endpoint é
  `/api/v1/trips/*`, domínio `trip` (Architecture §7, Fronteiras da API).

### Task 2 — `components/student-card.tsx` (AC: 1, 6)

- [ ] 2.1 Criar `src/components/student-card.tsx`. Arquivo em kebab-case, export em PascalCase
  (`project-context.md`). Previsto em `architecture.md#Estrutura do Mobile`.
- [ ] 2.2 Props: `{ student: TripStudentItem }`. Componente **de apresentação pura** — sem
  query, sem navegação, sem conhecer viagem. Mesmo desenho do `QrScanner` (captura pura, quem
  interpreta é a tela).
- [ ] 2.3 Mapa `status → { label, color, background, icon }` como **constante de módulo**, não
  `switch` inline no JSX:

  | `status` | Rótulo | Cor | Ícone |
  |---|---|---|---|
  | `CHECKED_IN` | "Embarcou" | `#1B7F3B` sobre `#E8F5E9` | `✓` |
  | `NOT_CHECKED_IN` | "Não embarcou" | `#37474F` sobre `#ECEFF1` | `—` |
  | `NOT_RETURNING` | "Não vai voltar" | `#B26A00` sobre `#FFF4E5` | `!` |

  As cores são as mesmas famílias de `TONE_COLOR` em `scan.tsx:51-57` e dos chips de
  `trip.tsx:219-224`. Não introduza uma quarta paleta.
- [ ] 2.4 O rótulo é **texto**, nunca só cor: contraste alto e legível em movimento (NFR18), e
  cor sozinha não é acessível.
- [ ] 2.5 `CHECKED_IN` exibe o horário: `checkedInAt` formatado como em Decisões já tomadas.
  Nos outros dois status `checkedInAt` é `null` — não renderize linha vazia.
- [ ] 2.6 Altura mínima do item: 64dp, com padding vertical ≥ 12 (NFR18: alvo ≥ 48dp).
  Use medida **relativa ou mínima**, nunca largura fixa em px — medida absoluta estourou em
  devices ≤ 368dp na review da 3.2b.
- [ ] 2.7 Nome do aluno com `numberOfLines={1}` e `ellipsizeMode="tail"`; o chip de status
  **não** encolhe (`flexShrink: 0`) — um nome longo não pode empurrar o status para fora da tela.
- [ ] 2.8 Envolver o export em `React.memo`: o item é re-renderizado pela `FlatList` a cada
  invalidação do roster.

### Task 3 — Tela `(driver)/student-list.tsx` (AC: 1, 2, 3, 6)

- [ ] 3.1 Substituir o placeholder de 9 linhas. Estrutura de guardas **na ordem da Tabela de
  Verdade** — cada `if` na ordem 1 → 12, com os hooks todos acima do primeiro `return`
  (Rules of Hooks; ver o comentário em `_layout.tsx:50-51`).
- [ ] 3.2 Estado 1 — guarda de role, copiada de `scan.tsx:359-384`: `logout()` **antes** do
  `router.replace('/(auth)/login')`. Só navegar deixaria `isAuthenticated` true e o shell
  montado atrás.
- [ ] 3.3 Query da viagem: `useQuery<Trip | null>({ queryKey: ['activeTrip'], queryFn: () => tripService.getActiveTrip(), staleTime: 10_000, retry: 2 })`
  — **os mesmos parâmetros** de `trip.tsx:35-40` e `scan.tsx:211-221`. Divergir em `staleTime`
  entre telas que compartilham a key faz uma refetchar e a outra não, sem explicação visível.
- [ ] 3.4 Query do roster:

  ```ts
  const tripId = activeTrip?.id
  const roster = useQuery({
    queryKey: ['trip', tripId, 'students'],
    queryFn: () => tripService.getTripStudents(tripId!),
    enabled: Boolean(tripId),
    staleTime: 15_000,
    retry: 2,
  })
  ```

  `enabled` é obrigatório: sem ele a `queryFn` roda com `tripId` `undefined` e o path vira
  `/api/v1/trips/undefined/students` → 404 no mock e na API real.
- [ ] 3.5 Estados 2, 3 e 4 — derivados da query da viagem, com os mesmos textos e ações que
  `scan.tsx:421-455` já usa. Reaproveite o padrão visual, não copie/cole a implementação inteira.
- [ ] 3.6 Estados 10 e 11 — ler `roster.error`: `error instanceof ApiClientError && error.code === 'DRIVER_NOT_ASSIGNED'`
  (403) e `'TRIP_NOT_FOUND'` (404). Import de `@/services/api-client`, como `scan.tsx` faz.
- [ ] 3.7 Estado 12 — quando `error.code === 'UNAUTHORIZED'`, **não** renderize erro nenhum:
  o `api-client` já derrubou a sessão e navegou (`api-client.ts:143-149`). Mesmo tratamento de
  `scan.tsx:280`.
- [ ] 3.8 Estado 7 (**o AC #3**): a condição é `roster.isError && roster.data` — renderize a
  lista do cache com um `Banner` visível **acima** dela. Não é um `Snackbar`: o `Snackbar`
  some sozinho e o estado é permanente enquanto não houver rede.
- [ ] 3.9 Cabeçalho com a contagem: `` `${summary.boarded}/${summary.total} embarcados` ``,
  lido de `roster.data.summary` — **nunca** derivado de `students`. Tipografia ≥ `titleLarge`
  (o motorista lê de relance, em movimento).
- [ ] 3.10 `FlatList` com `data={roster.data.students}`, `keyExtractor={(s) => s.studentId}`,
  `renderItem={({ item }) => <StudentCard student={item} />}` e
  `ListEmptyComponent` para o estado 8. Use `refreshControl={<RefreshControl refreshing={roster.isFetching} onRefresh={() => void roster.refetch()} />}`
  — mesmo padrão de `routes.tsx:77-79`.
- [ ] 3.11 **Não** implemente busca, filtro, ordenação nem seleção de aluno. Nenhuma AC pede,
  e cada um deles é uma superfície nova de bug numa tela que o motorista usa dirigindo.
- [ ] 3.12 O `useEffect` de snackbar de `routes.tsx:55-57` **não** se aplica aqui: o estado 7
  já cobre a falha com um `Banner` persistente. Não empilhe os dois.

### Task 4 — Handlers MSW: sentinelas dos estados que ainda não são alcançáveis (AC: 7)

O handler de `GET /trips/:id/students` **já existe** (`boarding.handlers.ts:207-245`) e está
correto. O que falta é poder chegar nos estados 6, 7, 8, 10 e no cenário de 50+ alunos.

- [ ] 4.1 Em `src/mocks/handlers/auth.handlers.ts`, acrescentar a `MOCK_USERS` três motoristas
  sentinela, seguindo o bloco que já existe (ids `...440005`, `...440006`, `...440007`):
  `motorista-turma-vazia@`, `motorista-turma-grande@`, `motorista-lista-erro@` (todos
  `role: 'DRIVER'`). **Preserve** `findMockUser` com `Object.hasOwn`, a rotação de refresh
  token e `REFRESH_FAILURE_EMAIL`.
- [ ] 4.2 Em `src/mocks/handlers/boarding.handlers.ts`, exportar dois ids novos e registrá-los
  em `resetBoardingMocks()`:
  - `MOCK_EMPTY_ROSTER_TRIP_ID` (`770e8400-…440103`) → roster `[]`, `summary { boarded: 0, total: 0 }` (estado 8).
  - `MOCK_LARGE_ROSTER_TRIP_ID` (`770e8400-…440104`) → 60 alunos gerados, com **mistura dos três
    status** (~1/3 `CHECKED_IN` com `checkedInAt` preenchido). É o cenário de NFR4/FlatList.
- [ ] 4.3 Acrescentar uma sentinela de falha: quando `:id` for `MOCK_ROSTER_ERROR_TRIP_ID`
  (`770e8400-…440105`), responder `500` com `{ error: { code: 'INTERNAL_ERROR', message: … } }`
  — é o único jeito de exercitar os estados 6 e 7 sem derrubar a rede.
- [ ] 4.4 Em `src/mocks/handlers/trip.handlers.ts`, ligar os três e-mails novos aos três ids
  novos dentro de `GET /trips/active`, **depois** da guarda `currentTrip?.status === 'ACTIVE'`
  e no mesmo formato dos três sentinelas existentes. Todos com `status: 'ACTIVE'`: a tela
  precisa passar dos estados 2-4 para exercitar 5-11.
- [ ] 4.5 **Bloqueador 4** — em `auth.handlers.ts`, no `POST /auth/login`, chamar
  `resetBoardingMocks()` junto de `resetTripMocks()`. Importar de `./boarding.handlers`
  (`boarding.handlers` não importa de `auth.handlers`, então não há ciclo — mesma justificativa
  do comentário existente em `auth.handlers.ts:118-123`). Um comentário curto explicando
  *por quê* — o roster acumulado atravessava a troca de conta.
- [ ] 4.6 Mantenha o padrão de qualidade de `boarding.handlers.ts`: tipagem a partir de
  `operations[...]` (o typecheck **é** o teste de conformidade), estado em memória, comentário
  explicando por que cada ramo existe.
- [ ] 4.7 Atualizar `mobile/.env.example`: os três motoristas novos e os três ids de viagem
  novos, no bloco que já documenta os outros. **Preserve todo o bloco existente.**

### Task 5 — `scan.tsx`: invalidação do roster e gate de foco da câmera (AC: 4, 5)

- [ ] 5.1 **Bloqueador 3** — importar `useQueryClient` e, no `try` de `submit`, após o
  `await boardingService.checkIn(...)` bem-sucedido:

  ```ts
  void queryClient.invalidateQueries({ queryKey: ['trip', attempt.tripId, 'students'] })
  ```

  Depois de `lastSuccessStudentId.current = attempt.studentId` e antes do `setResult`, para
  que a rede comece a trabalhar enquanto o overlay de sucesso está na tela. `void` porque o
  resultado não é aguardado — a tela de scan não espera pelo roster.
- [ ] 5.2 `queryClient` entra nas deps do `useCallback` de `submit`. A instância de
  `useQueryClient()` é estável, mas a lista de deps precisa refletir o que o callback lê —
  o lint do Expo cobra isso.
- [ ] 5.3 **Não** troque `boardedCount` pela contagem do servidor. Ele é o contador **da sessão
  de escaneamento** ("3 embarques nesta sessão"), semântica diferente de `summary.boarded`
  ("3 de 32 embarcados nesta viagem"). Trocar seria regressão da 3.3b.
- [ ] 5.4 **Bloqueador 2** — gate de foco: `const isFocused = useIsFocused()` de
  `@react-navigation/native` (já é dependência direta — `package.json`), e o `<QrScanner>` só
  é renderizado quando `isFocused` é true. Fora de foco, renderize a mesma moldura preta
  estática (ou nada) — o importante é o `CameraView` **desmontar**.
- [ ] 5.5 Ao voltar o foco, `result` deve estar em `idle`: chame `resume()` num
  `useFocusEffect` (exportado por `expo-router` — confirmado em
  `node_modules/expo-router/build/exports.d.ts:25`) ou garanta por outro meio que a câmera não
  volta congelada num overlay antigo. Sem isso, voltar da lista deixa a tela travada no último
  resultado e o motorista precisa tocar "Escanear próximo" sem saber por quê.
- [ ] 5.6 Ponto de entrada para a lista: a `counterBar` (`scan.tsx:480-486`) hoje é
  `pointerEvents="none"`. Troque para `pointerEvents="box-none"` e acrescente, **dentro** dela,
  um `Button` compacto "Ver lista" → `router.navigate('/(driver)/student-list')`.
  `navigate`, **nunca** `push`: dois toques rápidos empilhavam duas telas (finding da 3.2b,
  repetido em `trip.tsx:158`).
- [ ] 5.7 **Não** altere `describeFailure`, a Tabela de Verdade da 3.3b, o gate `isBusy`,
  `isSubmitting`, `lastSuccessStudentId` nem o fluxo de idempotência. A 3.3b está `in-progress`
  e revisada; qualquer mudança ali é regressão.

### Task 6 — `trip.tsx`: ponto de entrada e contagem real (AC: 2, 5)

Escopo **cirúrgico**: a Story 3.1 está em `review` e o resto da tela não é seu.

- [ ] 6.1 Acrescentar, no ramo `ACTIVE` (depois do botão "Escanear QR Code",
  `trip.tsx:156-167`), um botão "Alunos da Viagem" →
  `router.navigate('/(driver)/student-list')`. Mesmo `contentStyle`/`labelStyle` dos botões
  existentes (56dp, NFR18). `mode="outlined"` para não competir com a ação primária de escanear.
- [ ] 6.2 Substituir o placeholder `<Text style={styles.infoText}>Alunos: 0/0 (em breve)</Text>`
  (`trip.tsx:146`, ramo `ACTIVE`) pela contagem real, lida da **mesma** query key do roster com
  `select`. **Atenção:** o mesmo texto aparece duas vezes no arquivo — a outra ocorrência
  (`trip.tsx:102`) está no ramo `COMPLETED`, que é código morto contra o contrato real e **não
  é seu** (ver 6.4). Troque só a do ramo `ACTIVE`:

  ```ts
  const { data: summary } = useQuery({
    queryKey: ['trip', activeTrip?.id, 'students'],
    queryFn: () => tripService.getTripStudents(activeTrip!.id),
    enabled: Boolean(activeTrip?.id),
    staleTime: 15_000,
    select: (r) => r.summary,
  })
  ```

  `select` e a mesma key: uma key própria aqui duplicaria o cache do roster e as duas telas
  divergiriam — o mesmo finding do Bloqueador 1, pela outra ponta.
- [ ] 6.3 Enquanto `summary` for `undefined`, renderize `Alunos: —`, não `0/0`. Um zero
  inventado durante o carregamento é indistinguível de um zero verdadeiro.
- [ ] 6.4 **Não** toque no ramo `COMPLETED` (`trip.tsx:96-105`). O `deferred-work.md` registra
  que ele é código morto contra o contrato real, e a decisão é da Story 3.1.
- [ ] 6.5 Nada mais em `trip.tsx`. Nem os chips, nem o `PLACEHOLDER_ROUTE_ID`, nem as mutations.

### Task 7 — Verificação em execução (todas as ACs)

Ambiente: alvo web (Architecture §8, regra 15). `cd mobile && npm run web`, aberto em
`http://localhost:8081` — **nunca pelo IP de LAN** (o login quebra em `crypto.randomUUID`;
ver `mobile/README.md`). `EXPO_PUBLIC_USE_MOCKS=1` no `.env`, dev server reiniciado após trocar
a flag (`EXPO_PUBLIC_*` entra no bundle em build time).

- [ ] 7.1 `npx tsc --noEmit` → 0 erros. **Baseline verificada nesta árvore em 30/08/2026: 0 erros.** Qualquer erro é seu.
- [ ] 7.2 `npm run lint` → limpo.
- [ ] 7.3 `npx expo export --platform web` → completa sem erro (AC #8; Architecture §8, regra 16).
- [ ] 7.4 Roteiro manual — **cada linha é uma AC**:
  - [ ] `motorista@pureurban.com` → "Iniciar Viagem" → "Alunos da Viagem": lista com 4 alunos,
    contagem `0/4 embarcados`, Diego Alves em "Não vai voltar" (estados 9, 9b, 9c) — AC #1, #2
  - [ ] Voltar → "Escanear QR Code" → escanear o QR de `aluno@pureurban.com` (segundo browser
    ou segundo perfil) → "Ver lista" **sem recarregar a página**: Ana Souza aparece "Embarcou"
    com horário e a contagem vira `1/4` — **AC #4 e AC #5**
  - [ ] Na mesma navegação: confirmar no DevTools que a câmera foi liberada ao entrar na lista
    (o indicador de câmera do browser apaga) — **Bloqueador 2**
  - [ ] Voltar da lista para o scan: a câmera reabre e a tela está pronta para ler, sem overlay
    congelado — Task 5.5
  - [ ] `motorista-turma-vazia@` → estado 8 ("Nenhum aluno vinculado", `0/0`)
  - [ ] `motorista-turma-grande@` → 60 alunos, rolagem fluida, contagem correta (NFR4)
  - [ ] `motorista-lista-erro@` → estado 6 (erro sem cache) → "Tentar novamente"
  - [ ] Com a lista carregada, DevTools → Network → **Offline**, pull-to-refresh: estado 7 —
    a lista **continua na tela** com o `Banner` de dado desatualizado — **AC #3 / FR24**
  - [ ] Ainda offline, **F5**: a lista volta do cache persistido em MMKV (Tier 1) — AC #3
  - [ ] `motorista-outra-viagem@` → estado 10 (403 `DRIVER_NOT_ASSIGNED`)
  - [ ] `motorista-sem-viagem@` → estado 4 ("Nenhuma viagem ativa")
  - [ ] `aluno@pureurban.com` digitando `/student-list` na barra de endereços → o shell da 1.8
    redireciona para `/(student)/home` (o estado 1 é a rede de segurança, não o caminho normal)
  - [ ] Trocar de conta e reabrir a lista: nenhum aluno vem `CHECKED_IN` de uma sessão anterior
    — **Bloqueador 4**
- [ ] 7.5 Sem regressão em `api/`: **nada é tocado lá**. Não rode nem altere nada na API.

> Se alguma linha do roteiro não puder ser executada, **diga isso explicitamente nas Completion
> Notes e deixe a subtask desmarcada.** Marcar `[x]` em verificação não executada foi finding
> de review na 3.2b, e o `deferred-work.md` registra o custo disso.

---

## Dev Notes

### Estado atual dos arquivos que serão MODIFICADOS

| Arquivo | Hoje | Esta story muda | Preservar |
|---|---|---|---|
| `src/app/(driver)/student-list.tsx` | Placeholder de 9 linhas (`<Text>Student List — placeholder</Text>`) | Tela real | — |
| `src/services/trip.service.ts` | `Trip`, `getActiveTrip`, `startTrip`, `endTrip` (25 linhas) | **Acrescenta** `getTripStudents` + 3 aliases de tipo | Tudo o que existe: as três funções e a interface `Trip` |
| `src/app/(driver)/scan.tsx` | Tela completa da 3.3b, revisada — Tabela de Verdade de 17 estados, gates `isBusy`/`isSubmitting`, idempotência | **Só** invalidação no sucesso, gate de foco e o botão "Ver lista" | Todo o resto. A 3.3b está `in-progress` e revisada |
| `src/app/(driver)/trip.tsx` | Tela completa da 3.1 (start/end, cards, chips) + botão de scan da 3.3b | **Só** o botão "Alunos da Viagem" e a contagem real no lugar de `0/0 (em breve)` | Todo o resto. A 3.1 está em `review` |
| `src/mocks/handlers/auth.handlers.ts` | 9 usuários mock, rotação real de refresh token, `resetTripMocks()` no login | +3 motoristas sentinela, +`resetBoardingMocks()` no login | `findMockUser` com `Object.hasOwn`, a rotação, `REFRESH_FAILURE_EMAIL`, os 9 usuários |
| `src/mocks/handlers/boarding.handlers.ts` | Check-in completo + `GET /trips/:id/students` correto, roster compartilhado, replay de idempotência | +3 ids sentinela (vazio, grande, erro) | **A ordem de validação do check-in**, o replay, o roster inicial de 4, `IDEMPOTENCY_KEY_CONFLICT` |
| `src/mocks/handlers/trip.handlers.ts` | `/trips/active` com 3 sentinelas de motorista, POST e PATCH com estado em memória | +3 ramos de sentinela em `/trips/active` | A precedência de `currentTrip?.status === 'ACTIVE'` sobre as sentinelas — inverter reabre um bug já corrigido |
| `mobile/.env.example` | Documenta flags, credenciais e ids do mock | +3 motoristas, +3 ids de viagem | Todo o bloco existente |

**Arquivo NOVO:** `src/components/student-card.tsx`.

### Padrões que já existem — não reinventar

- **HTTP:** `apiClient` faz header de auth, timeout de 30s, refresh automático em 401,
  `logout()` + redirect, e **desempacota o `{ data }`**. Nunca `fetch` direto, nunca um segundo
  cliente. Esta story só **usa** o `.get()`.
- **Serviço por domínio:** `trip.service.ts` é o molde — objeto exportado, métodos finos, zero
  UI. O endpoint é `/api/v1/trips/*`, então mora lá.
- **Erros de negócio:** `ApiClientError` carrega `code`, `message`, `status`, `details`. É a
  única coisa a inspecionar para escolher entre os estados 6, 10, 11 e 12.
- **Tela do motorista:** `(driver)/trip.tsx` é a referência de botão grande (`height: 56`);
  `(driver)/routes.tsx` é a referência de `Card` + `RefreshControl` + branch explícito de
  erro-vs-vazio; `(driver)/scan.tsx` é a referência de guarda de role, `status === 'pending'`
  e união discriminada de estado.
- **Mocks:** `boarding.handlers.ts` é o padrão de qualidade a imitar. Tipagem a partir de
  `operations[...]`, estado em memória compartilhado, `resetXMocks()` exportado, comentário
  explicando *por que* cada ramo existe.
- **Cache offline (Tier 1):** `PersistQueryClientProvider` + `mmkvPersister` já ligados em
  `_layout.tsx:71-76`, `gcTime` 24h ≥ `maxAge` 24h. Uma `useQuery` comum herda a persistência —
  **você não configura nada por query.** Mas veja o defer do `onlineManager` abaixo.
- **Isolamento entre contas:** `auth.store.ts:33-36` chama `queryClient.clear()` +
  `mmkvPersister.removeClient()` no login **e** no logout. Sua key `['trip', tripId, 'students']`
  já está protegida contra vazamento entre motoristas — não escreva lógica própria para isso.
- **Estados de loading:** union type discriminado, nunca booleanos soltos (Architecture §6).
  `scan.tsx:25-41` é o exemplo canônico no repo.

### O defer que muda como você lê "offline"

**`onlineManager` do TanStack Query nunca foi conectado ao NetInfo** — nem `NetInfo` nem
`onlineManager` aparecem em `mobile/src` ou no `package.json`. O `OnlineManager` padrão nasce
com `#online = true` e só instala listeners onde existe `window.addEventListener`.

Consequência **direta para o AC #3**: sem rede, a query **não pausa**. Ela dispara, queima o
`retry` ladder (2 tentativas com backoff) e termina em `error` — **com `data` do cache ainda
presente no resultado**. É por isso que o estado 7 é `isError && data`, e não
`isPaused` ou `!isOnline`. Se você escrever a condição em cima de um sinal de conectividade
que o app não tem, o AC #3 não funciona.

No **alvo web** o `window.addEventListener` existe, então o `onlineManager` do TanStack chega a
funcionar parcialmente ali — mas a condição `isError && data` cobre os dois ambientes e é a que
deve ser implementada. Não conserte o `onlineManager` nesta story: é infraestrutura
compartilhada, candidata a story técnica antes da 3.4b (que depende de detecção de
conectividade real).

### Fora de escopo (não fazer nesta story)

- **`stores/boarding.store.ts`** — ver Decisões já tomadas. A 3.3b escreveu que ele "nasce na
  3.5b"; a análise desta story concluiu que ele **não tem leitor**. Não crie.
- **Fila de escrita offline (`utils/offline-queue.ts`, `hooks/use-offline-sync.ts`, banner
  "Modo Offline — dados serão sincronizados")** — é a Story 3.4b inteira, com a NFR13.
- **Atualização em tempo real da lista (SSE)** — Épico 4 (`boarding.not_returning` e o canal
  `GET /api/v1/boarding/events`). Aqui a atualização é por invalidação e pull-to-refresh.
- **Qualquer arquivo em `api/`** — story 100% mobile. A 3.5a está `done`; não a toque.
- **Regenerar `api/openapi.json` ou `src/types/api.d.ts`** — o contrato da 3.0 + a mudança da
  3.5a já declaram tudo que esta story consome. Editar `api.d.ts` à mão é violação de contrato
  (Architecture §8, regra 11).
- **Apontar o `api-client` para a API real / desligar os mocks** — é a Story 3.6.
- **Introduzir framework de testes no mobile** — ver *Testing Requirements* e *Questões Abertas*.
- **Corrigir o `onlineManager`, o segundo-401 do `api-client`, o `+not-found` ou os órfãos de
  theming** — todos registrados no `deferred-work.md`, nenhum é desta story.
- **UI de logout para DRIVER/STUDENT** — item aberto do review da 1.8, sem AC aqui.
- **Filtro, busca, ordenação ou detalhe do aluno** — nenhuma AC pede.

### Previous Story Intelligence

- **3.0 (contrato, `done`)** declarou `TripStudentsResponseDto` com `students` + `summary`, e
  os três status. Os tipos gerados estão corretos (`api.d.ts:416-457`) — são DTOs de classe, não
  Effect Schema, então não colapsam em `Record<string, never>` como os 11 endpoints antigos.
- **3.5a (backend, `done`)** implementou o endpoint real e **mudou o contrato de propósito**:
  acrescentou `403 DRIVER_NOT_ASSIGNED` (motorista que não é o `driverId` da viagem). A
  mudança já foi propagada para o `openapi.json`, para `api.d.ts` e para o mock
  (`boarding.handlers.ts:207-216`). O estado 10 da sua tabela existe por causa disso.
  Ela também decidiu que **viagem inexistente → 404, nunca 409**, e que **viagem de outra
  empresa → 404, nunca 403** (não vazar existência entre tenants).
- **3.3b (mobile, `in-progress`, código revisado em `c36dd69`)** é a tela irmã. Três coisas
  dela chegam até você: (a) `boardingService.checkIn` recebe a chave de idempotência de fora;
  (b) o `api-client` já sabe mandar headers por requisição; (c) o roster compartilhado do mock
  foi construído prevendo esta story. **A 3.3b ainda não tem verificação em execução** — se o
  seu roteiro 7.4 revelar um problema no fluxo de scan, registre nas Completion Notes em vez de
  consertar em silêncio: é evidência que a 3.3b precisa.
- **3.2b (mobile, `done`)** deixou 17 findings de review. Os que têm equivalente direto nesta
  tela: (a) duas query keys para o mesmo endpoint → Bloqueador 1; (b) `isLoading` em vez de
  `status === 'pending'` com query pausada → Task 3.1; (c) medida fixa em px estourando devices
  ≤ 368dp → Task 2.6; (d) `push` em vez de `navigate` → Tasks 5.6 e 6.1; (e) ausência de guarda
  de role → Task 3.2; (f) erro tratado como vazio → estados 6/7/8.
- **1.8 (shell, `done`)** é a razão pela qual esta tela é alcançável. `ROLE_ROUTES` é a fonte
  única do roteamento por papel e os guards de `_layout.tsx` são derivados dela — **não escreva
  redirecionamento por papel dentro da sua tela**; o shell já fez isso. O review da 1.8
  registrou que `student-list.tsx` é uma das três telas "implementadas e mortas" por falta de
  ponto de entrada, e que **os pontos de entrada pertencem às stories que as especificam** —
  daí a AC #5.
- **1.6 (ambiente web, `done`)** entregou o ambiente onde o seu roteiro 7.4 roda. Ler as
  limitações no `mobile/README.md` antes de reportar bug de ambiente como bug de código.

### Git Intelligence

Branch atual: `feat/1-8-shell-de-navegacao` (PR **#12**, aberta em 29/08/2026). A `main` está
em `7097187` (merge da 3.5a) e **não contém** as stories 1.6, 3.2b, 3.3b nem 1.8 —
`git show main:mobile/src/app/(driver)/scan.tsx` ainda devolve o placeholder de 9 linhas.

**Consequência para você:** parta da branch da 1.8, não da `main`. Partir da `main` significaria
herdar uma árvore sem shell de navegação (tela alcançável por nada), sem `scan.tsx` real (nada
para invalidar) e sem `expo-camera` — os Bloqueadores 2 e 3 não existiriam e as ACs #4 e #5
seriam impossíveis. A PR desta story só fica limpa depois que a #12 for mergeada.

Últimos commits: `26bd064` (docs 1.8) ← `bf97fe2` ← `6d9902b` ← `f87e1da` ← `4a4ac8a`.

Convenção do repo (CLAUDE.md): branch `feat/3-5b-lista-de-alunos`, **commits atômicos** em
inglês com escopo e story — ex.: `feat(trip): render the trip student list with boarding status (story 3.5b)`,
`feat(boarding): invalidate the roster cache after a successful check-in (story 3.5b)`,
`fix(mobile): release the camera when the scan screen loses focus (story 3.5b)`.
**PR só com aprovação explícita do Lucas.**

### Latest Tech Information (verificado nesta árvore em 2026-08-30)

- **`@tanstack/react-query@5.96.2`** (instalado). `useQuery` devolve `status: 'pending' | 'error' | 'success'`
  e mantém `data` do cache mesmo quando `status === 'error'` — é o mecanismo do estado 7.
  `enabled` aceita boolean e é o gate correto para query dependente. `select` roda sobre o dado
  cacheado, sem refetch e sem duplicar entrada de cache — é o que a Task 6.2 usa.
- **`invalidateQueries({ queryKey })`** faz *prefix match*: `['trip', id, 'students']` é
  invalidada por `['trip']` também. Passe a key completa para não derrubar caches vizinhos.
  Query inativa (tela desmontada) é marcada stale e refaz fetch na próxima montagem — é assim
  que a AC #4 funciona com a lista fora da tela.
- **`react-native-paper@5.15.0`** (instalado). `Banner`, `Chip`, `Card`, `Divider`, `List`,
  `Snackbar` e `ActivityIndicator` estão todos exportados (`lib/typescript/index.d.ts:16-38`).
  O `PaperProvider` já está montado no `_layout.tsx` raiz com o tema de `@/lib/theme`
  (primária `#208AEF`).
- **`expo-router@55.0.7`** exporta `useFocusEffect`
  (`node_modules/expo-router/build/exports.d.ts:25`). `useIsFocused` vem de
  `@react-navigation/native@7.1.33`, que é **dependência direta** do `package.json` — não é
  dependência nova, não precisa de autorização.
- **`FlatList`** (React Native 0.83.2): `keyExtractor` + item memoizado é o suficiente para 60
  itens. **Não** adicione `getItemLayout`, `windowSize` nem `removeClippedSubviews` sem medir —
  otimização prematura em lista pequena costuma piorar.
- **Nenhuma dependência nova é necessária nesta story.** `package.json` deve sair com diff
  vazio. Se você achar que precisa de uma, pare e registre em *Questões Abertas*.

### Testing Requirements

**Continua não existindo test runner no `mobile/`** — as `devDependencies` são `@types/react`,
`eslint`, `eslint-config-expo`, `openapi-typescript`, `typescript`. **Não introduza um nesta
story** (ver *Questões Abertas* #1).

O que vale como verde aqui:

- `npx tsc --noEmit` → **0 erros**. É o teste de conformidade de contrato: `getTripStudents`
  tipado por `components['schemas']['TripStudentsResponseDto']` não compila se divergir do
  `openapi.json`, e os handlers MSW tipados por `operations[...]` não compilam se o mock
  divergir do contrato.
- `npm run lint` limpo.
- `npx expo export --platform web` sem erro (AC #8).
- **Roteiro manual da Task 7.4 executado e registrado**, com atenção às quatro linhas que só
  aparecem fora do caminho feliz: **offline com cache** (AC #3), **reflexo do check-in** (AC #4),
  **liberação da câmera** (Bloqueador 2) e **troca de conta** (Bloqueador 4).

### Project Structure Notes

```
mobile/
├── .env.example                                # [UPDATE] +3 motoristas, +3 ids de viagem
└── src/
    ├── app/(driver)/
    │   ├── student-list.tsx                    # [UPDATE] placeholder → tela real
    │   ├── scan.tsx                            # [UPDATE] invalidação + gate de foco + botão "Ver lista"
    │   └── trip.tsx                            # [UPDATE] botão "Alunos da Viagem" + contagem real
    ├── components/student-card.tsx             # [NEW] apresentação pura de um item do roster
    ├── mocks/handlers/
    │   ├── boarding.handlers.ts                # [UPDATE] +3 ids sentinela (vazio, grande, erro)
    │   ├── trip.handlers.ts                    # [UPDATE] +3 ramos em /trips/active
    │   └── auth.handlers.ts                    # [UPDATE] +3 motoristas, +resetBoardingMocks() no login
    └── services/trip.service.ts                # [UPDATE] +getTripStudents +3 aliases de tipo
```

`utils/offline-queue.ts` e `hooks/use-offline-sync.ts` aparecem em
`architecture.md#Estrutura do Mobile` mas pertencem à Story 3.4b.
`stores/boarding.store.ts` também aparece lá e **não nasce nesta story** (ver Decisões já
tomadas). **Nenhum arquivo em `api/`. `package.json` com diff vazio.**

Nomes seguem `project-context.md`: arquivo em `kebab-case`, export em `PascalCase` para
componentes, alias `@/*` obrigatório em imports internos, indentação de 2 espaços.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5b] — ACs, camada, FR22/FR24/FR25, NFR18
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5a] — o endpoint que esta tela consome, e por que ele responde 403/404
- [Source: _bmad-output/planning-artifacts/epics.md#Convenção de Fatiamento] — regra `X.Yb`: desenvolver contra MSW; tipos gerados nunca à mão
- [Source: _bmad-output/planning-artifacts/prd.md#FR22-FR25] — lista completa, status por aluno, acesso offline, contagem resumida
- [Source: _bmad-output/planning-artifacts/prd.md#NFR4,NFR13,NFR18] — 50+ alunos, texto do modo offline (que é da 3.4b), ergonomia de uma mão
- [Source: _bmad-output/planning-artifacts/architecture.md#5] — Tier 1: `persistQueryClient` + MMKV, indicador de dado desatualizado
- [Source: _bmad-output/planning-artifacts/architecture.md#6] — padrões mobile: um store por domínio, loading como union type, datas ISO convertidas só no frontend
- [Source: _bmad-output/planning-artifacts/architecture.md#7] — `(driver)/student-list.tsx` e `components/student-card.tsx` no desenho oficial; fronteira `/api/v1/trips/*` = domínio trip
- [Source: _bmad-output/planning-artifacts/architecture.md#8] — regra 11 (tipos gerados), regra 12 (trilha mobile do Épico 3 contra MSW), regra 15 (verificação no alvo web)
- [Source: api/openapi.json#paths./api/v1/trips/{id}/students] — **autoridade final** do endpoint: 200/401/403/404, sem 400
- [Source: mobile/src/types/api.d.ts:416-457] — `TripStudentItemDto`, `BoardingSummaryDto`, `TripStudentsResponseDto`
- [Source: mobile/src/mocks/handlers/boarding.handlers.ts:207-245] — o handler do roster, já correto; roster compartilhado com o check-in
- [Source: mobile/src/mocks/handlers/trip.handlers.ts] — precedência de `currentTrip` sobre as sentinelas de motorista
- [Source: mobile/src/mocks/handlers/auth.handlers.ts:118-123] — `resetTripMocks()` no login e o comentário que explica por quê
- [Source: mobile/src/app/(driver)/scan.tsx:211-221,252-288,480-486] — query `['activeTrip']`, `submit` sem invalidação, `counterBar`
- [Source: mobile/src/app/(driver)/trip.tsx:35-40,146,156-167] — query `['activeTrip']`, o placeholder `0/0`, os botões de 56dp
- [Source: mobile/src/app/(driver)/routes.tsx:42-79] — `RefreshControl`, branch explícito erro-vs-vazio
- [Source: mobile/src/components/qr-scanner.tsx] — por que `isPaused` não fecha a câmera
- [Source: mobile/src/stores/auth.store.ts:33-36] — `clearPersistedQueryCache` no login/logout
- [Source: mobile/README.md] — alvo web, `localhost:8081`, mocks, limitações
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#3-3b] — gate de foco da câmera e invalidação do roster, **ambos nomeando esta story**
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#3-2b] — `onlineManager` nunca conectado ao NetInfo
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#1-8] — três telas sem ponto de entrada in-app
- [Source: _bmad-output/implementation-artifacts/3-2b-...md#Review Findings] — os 17 findings; seis têm equivalente direto nesta tela
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-05-11.md#Ações] — ação #4: query keys segmentadas, empty ≠ error
- [Source: _bmad-output/project-context.md] — MMKV nunca AsyncStorage, alias `@/*`, kebab-case, Zustand por domínio
- [Source: CLAUDE.md] — comandos do mobile, fluxo branch → commits atômicos → PR

---

## Questões Abertas (para o Lucas, não bloqueiam o dev)

1. **O `mobile/` continua sem nenhum teste automatizado, e esta é a terceira story mobile
   seguida a registrar isso.** O mapa `status → apresentação` da Task 2.3 e a escolha entre os
   estados 6, 7 e 8 são tabelas puras, triviais de testar e caras de verificar no olho. A
   3.4b (fila offline, backoff, idempotência entre reinícios) é praticamente impossível de
   validar manualmente. **Recomendação, repetida desde a 3.2b: uma story técnica de `jest-expo`
   antes da 3.4b.**

2. **A contagem no `trip.tsx` acrescenta uma requisição à tela de viagem.** É o preço de trocar
   o `0/0 (em breve)` por dado real e de atender a FR25 onde o motorista olha primeiro. Se você
   preferir manter a tela de viagem sem rede extra, a Task 6.2 sai e o placeholder vira
   `Alunos: ver lista`. **Decisão sua** — a Task está escrita assumindo que a contagem entra.

3. **A lista não se atualiza sozinha enquanto está aberta.** Se o motorista deixar a lista na
   tela e um aluno avisar "não vou voltar" (Épico 4), o status só muda no pull-to-refresh ou
   no próximo `staleTime`. O canal SSE que resolveria isso é a Story 4.2. Registrado para que
   ninguém trate como bug desta story.

4. **`GET /trips/active` nunca devolve `COMPLETED`**, então o motorista não consegue revisar a
   lista depois de encerrar a viagem — apesar de a 3.5a ter decidido de propósito que o
   endpoint do roster responde 200 para viagem encerrada. Falta um caminho no app até uma
   viagem passada. É o mesmo nó do ramo morto de `trip.tsx` registrado no `deferred-work.md`.
   Decisão da Story 3.1 (em `review`), não desta.

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-30 | 0.1 | Story criada com contexto completo (create-story) | Scrum Master |
