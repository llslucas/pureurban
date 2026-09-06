---
title: 'Story 3.5b: Lista de Alunos e Status de Embarque (Mobile Motorista)'
type: 'feature'
created: '2026-08-30'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done
review_loop_iteration: 0
baseline_commit: 'bd9ac5851a1c67d58e8948f475b9bba29c4f56b6'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

# Story 3.5b: Lista de Alunos e Status de Embarque (Mobile Motorista)

**Épico:** 3 — Gestão de Viagens e Embarque Digital
**Camada:** Mobile (`X.Yb`) · **Depende de:** 3.0 (contrato, `done`), 3.5a (backend, `done`), 1.8 (shell de navegação, `done`), 1.10 (test runner do mobile, `done`)
**Irmãs já na `main`:** 3.3b (tela de scan, `done`), 3.4b (fila offline + `OfflineBanner` + `app.store.isOnline`, `done`)
**FRs:** FR22, FR24, FR25 · também exibe FR23 · **NFRs:** NFR18 (uma mão, contraste), NFR4 (percepção de < 1s)

> **Revalidado em 2026-09-02** contra a `main` pós-merge da 3.4b (PR #16). O spec original
> (v0.1, 30/08) partia da branch da 1.8; as âncoras de linha, a seção de testes e a
> inteligência de stories anteriores foram refeitas. Os quatro bloqueadores abaixo foram
> reconferidos no código atual e **continuam todos válidos**.

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
sem parâmetro: o shell da Story 1.8 a declara como
`<Stack.Screen name="student-list" options={{ title: 'Alunos da viagem' }} />`
(`src/app/(driver)/_layout.tsx:17`) e nada passa params até ela.

**A viagem vem da query `['activeTrip']`, e de nenhum outro lugar.** Essa key já é usada por
`(driver)/trip.tsx:36` e `(driver)/scan.tsx:103-114` — as duas apontam para
`tripService.getActiveTrip()`. **Criar uma segunda key para o mesmo endpoint foi finding de
review na 3.2b:** o cache duplica e as telas divergem entre si.

Consequência prática: a tela tem **duas** queries encadeadas — primeiro a viagem, depois o
roster (`enabled: Boolean(activeTrip?.id)`). Os estados 2, 3 e 4 da Tabela de Verdade existem
por causa disso.

### Bloqueador 2 — a câmera de `scan.tsx` continua viva quando você navega para a lista

Registrado no `deferred-work.md` com o gatilho nomeado: *"não alcançável hoje… vira real na
Story 3.5b, quando `(driver)/student-list.tsx` deixar de ser placeholder e ganhar navegação a
partir da tela de scan ou da viagem."* **A AC #5 é exatamente esse gatilho.**

`QrScanner` é montado incondicionalmente por `scan.tsx` (`src/app/(driver)/scan.tsx:428`) e
não tem `useIsFocused` nem gate de `AppState` (`src/components/qr-scanner.tsx` — `CameraView`
com `onBarcodeScanned` alternado só por `isPaused`). Navegar `scan → student-list` **empilha**
uma tela: `scan` continua montado, o `CameraView` continua segurando o hardware e drenando
bateria pela viagem inteira. Hoje isso não acontece porque a única saída de `scan` é o botão
de voltar do header, que desempilha e desmonta.

O gate correto **não** é passar `isPaused`: `onBarcodeScanned={undefined}` só para de reportar
leituras, a câmera continua aberta. É **não renderizar** o `QrScanner` fora de foco (Task 5).

### Bloqueador 3 — o check-in bem-sucedido não invalida nada no cliente

`scan.tsx:submit` (`src/app/(driver)/scan.tsx:171-235`) atualiza `boardedCount` e `result`, e
**não** chama `queryClient.invalidateQueries` — `scan.tsx` sequer importa `useQueryClient`. O
comentário do próprio mock (`src/mocks/handlers/boarding.handlers.ts:31-33`) afirma que o
roster em memória é compartilhado "para que um check-in na tela de scan reflita na lista de
`GET /trips/:id/students`" — **a metade servidor desse contrato existe, a metade cliente não.**

Confirmado na revalidação: **nenhum** caminho de check-in invalida o roster hoje — nem o
`submit` online, nem o dreno da fila offline da 3.4b (`utils/offline-queue.ts` e
`hooks/use-offline-sync.ts` não importam `queryClient` nem chamam `invalidateQueries`). A AC #4
cobre o caminho **online** (Task 5.1); o reflexo do item drenado da fila offline fica
registrado na *Questão Aberta #5*.

O `deferred-work.md` registra o item como *"prematuro nesta story… é escopo da Story 3.5b, que
precisa criar a query e a invalidação na mesma passada."* A AC #4 é essa invalidação.

### Bloqueador 4 — trocar de conta não reseta o roster do mock

`src/mocks/handlers/auth.handlers.ts:123` chama `resetTripMocks()` no login, mas **não**
`resetBoardingMocks()` (reconferido na revalidação — segue igual). Efeito que você vai ver:
escanear com `motorista@pureurban.com`, deslogar, logar de novo — a lista abre com alunos já
`CHECKED_IN` de uma viagem que, para o app, nunca aconteceu. Na 3.3b isso era invisível (não
havia lista); aqui é a primeira tela que exibe o estado acumulado.

Correção de uma linha na Task 4.5. `boarding.handlers.ts` não importa de `auth.handlers.ts`
(importa só de `@/types/api`), então o `import` novo não fecha ciclo. Não "conserte" isso
mudando o roster ou a chave do mapa.

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
- **`status === 'pending'`, nunca `isLoading`.** Mesma razão de `scan.tsx:368-373`. E a linha 5
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
| Indicador de dado velho | `Banner` do `react-native-paper@5.15.0` (`Banner` está exportado — verificado), renderizado **dentro** de `student-list.tsx`, acima da `FlatList` | Architecture §5, Tier 1: "UI exibe indicador de 'dados podem estar desatualizados' quando offline" |
| Texto do indicador | "Dados podem estar desatualizados — sem conexão com o servidor" | **Não** use "Modo Offline — dados serão sincronizados": esse texto é a NFR13, já implementado pelo `OfflineBanner` global da 3.4b (`src/components/offline-banner.tsx`), que fala da **fila de escrita**. Esta tela é leitura (Tier 1); prometer sincronização seria mentira. São dois banners com propósitos distintos — não reutilize o `OfflineBanner` aqui nem edite o texto dele |
| Condição do indicador | `roster.isError && roster.data` (estado 7) | Não use `!useAppStore(s => s.isOnline)`: o `isOnline` da 3.4b cobre falha de transporte, mas um `500` do servidor mantém `isOnline: true` e ainda assim o dado em cache está velho. `isError && data` cobre os dois e é local à query — sem acoplar a tela ao store global |
| Reflexo do check-in | `queryClient.invalidateQueries({ queryKey: ['trip', tripId, 'students'] })` no sucesso do check-in | Invalidação, não `setQueryData` otimista: `summary` é agregado do servidor (AC #2) e um cálculo local do novo total seria a mesma proibição pela porta dos fundos |
| Gate da câmera | Não renderizar `<QrScanner>` quando a tela de scan está fora de foco | `isPaused` não fecha a câmera — ver Bloqueador 2 |
| Horário do check-in | `new Date(checkedInAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })` | Architecture §6: ISO 8601 UTC na API, conversão para timezone local só no frontend. Padrão já usado em `trip.tsx:148` |

---

## Tasks / Subtasks

### Task 1 — `trip.service.ts`: método do roster (AC: 1, 2)

- [x] 1.1 Em `src/services/trip.service.ts`, importar `import type { components } from '@/types/api'` e exportar os aliases:

  ```ts
  export type TripStudents = components['schemas']['TripStudentsResponseDto']
  export type TripStudentItem = components['schemas']['TripStudentItemDto']
  export type BoardingStatus = TripStudentItem['status']
  ```

  Os três DTOs são classes na API, então geram shape correto (ao contrário dos bodies de
  Effect Schema — ver o defer da 3.0). Verificado: `src/types/api.d.ts:416-456`.
- [x] 1.2 Acrescentar ao objeto `tripService`:

  ```ts
  getTripStudents: (tripId: string) =>
    apiClient.get<TripStudents>(`/api/v1/trips/${tripId}/students`),
  ```

  `apiClient.get` já desempacota o `{ data }` do envelope — o retorno é o `TripStudentsResponseDto` puro.
- [x] 1.3 **Não** toque em `getActiveTrip`, `startTrip`, `endTrip` nem na interface `Trip`.
- [x] 1.4 **Não** crie `boarding.service.ts` novo nem mova `checkIn` para cá: o endpoint é
  `/api/v1/trips/*`, domínio `trip` (Architecture §7, Fronteiras da API).

### Task 2 — `components/student-card.tsx` (AC: 1, 6)

- [x] 2.1 Criar `src/components/student-card.tsx`. Arquivo em kebab-case, export em PascalCase
  (`project-context.md`). Previsto em `architecture.md#Estrutura do Mobile`.
- [x] 2.2 Props: `{ student: TripStudentItem }`. Componente **de apresentação pura** — sem
  query, sem navegação, sem conhecer viagem. Mesmo desenho do `QrScanner` (captura pura, quem
  interpreta é a tela).
- [x] 2.3 Mapa `status → { label, color, background, icon }` como **constante de módulo
  exportada** (`STATUS_PRESENTATION`), não `switch` inline no JSX:

  | `status` | Rótulo | Cor | Ícone |
  |---|---|---|---|
  | `CHECKED_IN` | "Embarcou" | `#1B7F3B` sobre `#E8F5E9` | `✓` |
  | `NOT_CHECKED_IN` | "Não embarcou" | `#37474F` sobre `#ECEFF1` | `—` |
  | `NOT_RETURNING` | "Não vai voltar" | `#B26A00` sobre `#FFF4E5` | `!` |

  As cores são as mesmas famílias de `TONE_COLOR` em `scan.tsx:64-71` e as do `OfflineBanner`
  (`#37474F` neutro, `#B26A00`/âmbar). Não introduza uma quarta paleta.
- [x] 2.4 O rótulo é **texto**, nunca só cor: contraste alto e legível em movimento (NFR18), e
  cor sozinha não é acessível.
- [x] 2.5 `CHECKED_IN` exibe o horário: `checkedInAt` formatado como em Decisões já tomadas.
  Nos outros dois status `checkedInAt` é `null` — não renderize linha vazia.
- [x] 2.6 Altura mínima do item: 64dp, com padding vertical ≥ 12 (NFR18: alvo ≥ 48dp).
  Use medida **relativa ou mínima**, nunca largura fixa em px — medida absoluta estourou em
  devices ≤ 368dp na review da 3.2b.
- [x] 2.7 Nome do aluno com `numberOfLines={1}` e `ellipsizeMode="tail"`; o chip de status
  **não** encolhe (`flexShrink: 0`) — um nome longo não pode empurrar o status para fora da tela.
- [x] 2.8 Envolver o export em `React.memo`: o item é re-renderizado pela `FlatList` a cada
  invalidação do roster.
- [x] 2.9 Criar `src/components/student-card.test.tsx` (o runner existe desde a 1.10 —
  `jest-expo` + `@testing-library/react-native`, `npm test`; `offline-banner.test.tsx` é o
  molde de um teste de componente com `render`/`screen`). Cobrir, no mínimo:
  - os três `status` renderizam o rótulo correto (`Embarcou` / `Não embarcou` / `Não vai voltar`)
    e são distinguíveis por mais do que a cor (AC #1, NFR18);
  - `CHECKED_IN` com `checkedInAt` mostra o horário local; `NOT_CHECKED_IN` e `NOT_RETURNING`
    (com `checkedInAt: null`) **não** renderizam linha de horário (Task 2.5);
  - `STATUS_PRESENTATION` tem entrada para cada membro do union
    `TripStudentItem['status']` — um `status` novo no contrato quebra o teste, não a tela.

### Task 3 — Tela `(driver)/student-list.tsx` (AC: 1, 2, 3, 6)

- [x] 3.1 Substituir o placeholder de 6 linhas (`src/app/(driver)/student-list.tsx`, hoje só
  `<View><Text>Student List — placeholder</Text></View>`). Estrutura de guardas **na ordem da
  Tabela de Verdade** — cada `if` na ordem 1 → 12, com os hooks todos acima do primeiro
  `return` (Rules of Hooks; mesmo padrão do `scan.tsx`, que resolve todas as `useQuery`/`useRef`
  antes da primeira guarda de render em `scan.tsx:310`).
- [x] 3.2 Estado 1 — guarda de role, mesmo padrão de `scan.tsx:310-326`: `logout()` **antes** do
  `router.replace('/(auth)/login')`. Só navegar deixaria `isAuthenticated` true e o shell
  montado atrás. `const { user, logout } = useAuthStore()`.
- [x] 3.3 Query da viagem: `useQuery<Trip | null>({ queryKey: ['activeTrip'], queryFn: () => tripService.getActiveTrip(), staleTime: 10_000, retry: 2 })`
  — **os mesmos parâmetros** de `trip.tsx:35-40` e `scan.tsx:103-114`. Divergir em `staleTime`
  entre telas que compartilham a key faz uma refetchar e a outra não, sem explicação visível.
- [x] 3.4 Query do roster:

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
- [x] 3.5 Estados 2, 3 e 4 — derivados da query da viagem, com os mesmos textos e ações que
  o componente `Blocked` de `scan.tsx:371-402` já usa. Reaproveite o padrão visual, não
  copie/cole a implementação inteira.
- [x] 3.6 Estados 10 e 11 — ler `roster.error`: `error instanceof ApiClientError && error.code === 'DRIVER_NOT_ASSIGNED'`
  (403) e `'TRIP_NOT_FOUND'` (404). `import { ApiClientError } from '@/services/api-client'`
  (reexportado de `@/services/api-error`), como `scan.tsx:13` faz.
- [x] 3.7 Estado 12 — quando `error.code === 'UNAUTHORIZED'`, **não** renderize erro nenhum:
  o `api-client` já derrubou a sessão e navegou (`api-client.ts:144-151`). Mesmo tratamento de
  `scan.tsx:199-201`.
- [x] 3.8 Estado 7 (**o AC #3**): a condição é `roster.isError && roster.data` — renderize a
  lista do cache com um `Banner` visível **acima** dela. Não é um `Snackbar`: o `Snackbar`
  some sozinho e o estado é permanente enquanto não houver rede.
- [x] 3.9 Cabeçalho com a contagem: `` `${summary.boarded}/${summary.total} embarcados` ``,
  lido de `roster.data.summary` — **nunca** derivado de `students`. Tipografia ≥ `titleLarge`
  (o motorista lê de relance, em movimento).
- [x] 3.10 `FlatList` com `data={roster.data.students}`, `keyExtractor={(s) => s.studentId}`,
  `renderItem={({ item }) => <StudentCard student={item} />}` e
  `ListEmptyComponent` para o estado 8. Use `refreshControl={<RefreshControl refreshing={roster.isFetching} onRefresh={() => void roster.refetch()} />}`
  — mesmo padrão de `routes.tsx:75-80` (lá é num `ScrollView`; a `FlatList` aceita a mesma prop).
- [x] 3.11 **Não** implemente busca, filtro, ordenação nem seleção de aluno. Nenhuma AC pede,
  e cada um deles é uma superfície nova de bug numa tela que o motorista usa dirigindo.
- [x] 3.12 O `useEffect` de snackbar de `routes.tsx:55-57` **não** se aplica aqui: o estado 7
  já cobre a falha com um `Banner` persistente. Não empilhe os dois. (O `OfflineBanner` global
  da 3.4b, montado em `(driver)/_layout.tsx`, é ortogonal — só aparece se houver item na fila
  de escrita, o que esta tela nunca gera.)

### Task 4 — Handlers MSW: sentinelas dos estados que ainda não são alcançáveis (AC: 7)

O handler de `GET /trips/:id/students` **já existe** (`boarding.handlers.ts:207-246`) e está
correto. O que falta é poder chegar nos estados 6, 7, 8, 10 e no cenário de 50+ alunos.

- [x] 4.1 Em `src/mocks/handlers/auth.handlers.ts`, acrescentar a `MOCK_USERS` três motoristas
  sentinela, seguindo o bloco de motoristas que já existe (o último id usado é
  `550e8400-…440004` → os novos são `...440005`, `...440006`, `...440007`):
  `motorista-turma-vazia@`, `motorista-turma-grande@`, `motorista-lista-erro@` (todos
  `role: 'DRIVER'`). **Preserve** `findMockUser` com `Object.hasOwn`, a rotação de refresh
  token, `REFRESH_FAILURE_EMAIL` e os 8 usuários existentes.
- [x] 4.2 Em `src/mocks/handlers/boarding.handlers.ts`, exportar dois ids novos e registrá-los
  em `resetBoardingMocks()`:
  - `MOCK_EMPTY_ROSTER_TRIP_ID` (`770e8400-…440103`) → roster `[]`, `summary { boarded: 0, total: 0 }` (estado 8).
  - `MOCK_LARGE_ROSTER_TRIP_ID` (`770e8400-…440104`) → 60 alunos gerados, com **mistura dos três
    status** (~1/3 `CHECKED_IN` com `checkedInAt` preenchido). É o cenário de NFR4/FlatList.
- [x] 4.3 Acrescentar uma sentinela de falha: quando `:id` for `MOCK_ROSTER_ERROR_TRIP_ID`
  (`770e8400-…440105`), responder `500` com `{ error: { code: 'INTERNAL_ERROR', message: … } }`
  — é o único jeito de exercitar os estados 6 e 7 sem derrubar a rede.
- [x] 4.4 Em `src/mocks/handlers/trip.handlers.ts`, declarar os três e-mails como `const` no
  topo (padrão de `NO_TRIP_EMAIL`/`OTHER_DRIVER_EMAIL`/`ENDED_TRIP_EMAIL`, `trip.handlers.ts:28-30`)
  e ligá-los aos três ids novos dentro de `GET /trips/active`, **depois** da guarda
  `currentTrip?.status === 'ACTIVE'` (`trip.handlers.ts:84`) e no mesmo formato
  (`makeTrip({ id: ... })` + `envelope<Trip | null>(...)`) dos sentinelas existentes. A sessão
  vem de `getMockSessionEmail()` (`./session`), como os outros. Todos com `status: 'ACTIVE'`: a
  tela precisa passar dos estados 2-4 para exercitar 5-11.
- [x] 4.5 **Bloqueador 4** — em `auth.handlers.ts`, no `POST /auth/login`, chamar
  `resetBoardingMocks()` junto de `resetTripMocks()` (`auth.handlers.ts:123`). Importar de
  `./boarding.handlers` (que não importa de `auth.handlers` nem de `trip.handlers` — só de
  `@/types/api` —, então não há ciclo). Um comentário curto explicando *por quê* — o roster
  acumulado atravessava a troca de conta.
- [x] 4.6 Mantenha o padrão de qualidade de `boarding.handlers.ts`: tipagem a partir de
  `operations[...]` (o typecheck **é** o teste de conformidade), estado em memória, comentário
  explicando por que cada ramo existe.
- [x] 4.7 Atualizar `mobile/.env.example`: os três motoristas novos e os três ids de viagem
  novos, no bloco que já documenta os outros. **Preserve todo o bloco existente.**

### Task 5 — `scan.tsx`: invalidação do roster e gate de foco da câmera (AC: 4, 5)

- [x] 5.1 **Bloqueador 3** — importar `useQueryClient` (`scan.tsx` já importa `useQuery` de
  `@tanstack/react-query` na linha 6) e, no `try` de `submit` (`scan.tsx:175-192`), após o
  `await boardingService.checkIn(...)` bem-sucedido:

  ```ts
  void queryClient.invalidateQueries({ queryKey: ['trip', attempt.tripId, 'students'] })
  ```

  Depois de `lastSuccessStudentId.current = attempt.studentId` (`scan.tsx:180`) e antes do
  `setResult`, para que a rede comece a trabalhar enquanto o overlay de sucesso está na tela.
  `void` porque o resultado não é aguardado — a tela de scan não espera pelo roster.
- [x] 5.2 `queryClient` entra nas deps do `useCallback` de `submit` (hoje `[enqueue]`,
  `scan.tsx:235`). A instância de `useQueryClient()` é estável, mas a lista de deps precisa
  refletir o que o callback lê — o lint do Expo cobra isso.
- [x] 5.3 **Não** troque `boardedCount` pela contagem do servidor. Ele é o contador **da sessão
  de escaneamento** ("3 embarques nesta sessão"), semântica diferente de `summary.boarded`
  ("3 de 32 embarcados nesta viagem"). Trocar seria regressão da 3.3b.
- [x] 5.4 **Bloqueador 2** — gate de foco: `const isFocused = useIsFocused()` de
  `@react-navigation/native` (dependência direta, `^7.1.33` — não é nova), e o `<QrScanner>`
  (`scan.tsx:428`) só é renderizado quando `isFocused` é true. Fora de foco, renderize a mesma
  moldura preta estática (ou nada) — o importante é o `CameraView` **desmontar**. Os hooks
  (`useIsFocused`, `useFocusEffect`) ficam no topo, com as outras `useQuery`/`useEffect`, antes
  da primeira guarda de render.
- [x] 5.5 Ao voltar o foco, `result` deve estar em `idle`: chame `resume()` (`scan.tsx:135`,
  já é `useCallback`) num `useFocusEffect` de `expo-router` (reexportado — confirmado em
  `node_modules/expo-router/build/exports.d.ts:25`) ou garanta por outro meio que a câmera não
  volta congelada num overlay antigo. Sem isso, voltar da lista deixa a tela travada no último
  resultado e o motorista precisa tocar "Escanear próximo" sem saber por quê.
- [x] 5.6 Ponto de entrada para a lista: a `counterBar` (`scan.tsx:430-436`, estilo em
  `scan.tsx:608-616`) hoje é `pointerEvents="none"`. Troque para `pointerEvents="box-none"` e
  acrescente, **dentro** dela, um `Button` compacto "Ver lista" →
  `router.navigate('/(driver)/student-list')`. `navigate`, **nunca** `push`: dois toques
  rápidos empilhavam duas telas (finding da 3.2b, repetido em `trip.tsx:158`).
- [x] 5.7 **Não** altere `describeFailure`, a Tabela de Verdade da 3.3b, o gate `isBusy`,
  `isSubmitting`, `lastSuccessStudentId`, o discriminante de transporte da 3.4b (`isTransportFailure`,
  `enqueueCheckIn`, `notifyQueueChanged`) nem o fluxo de idempotência. A 3.3b e a 3.4b estão
  `done` e revisadas; qualquer mudança ali é regressão.

### Task 6 — `trip.tsx`: ponto de entrada e contagem real (AC: 2, 5)

Escopo **cirúrgico**: a Story 3.1 está em `review` e o resto da tela não é seu.

- [x] 6.1 Acrescentar, no ramo `ACTIVE` (depois do botão "Escanear QR Code",
  `trip.tsx:156-166`), um botão "Alunos da Viagem" →
  `router.navigate('/(driver)/student-list')`. Mesmo `contentStyle`/`labelStyle` dos botões
  existentes (56dp, NFR18). `mode="outlined"` para não competir com a ação primária de escanear.
- [x] 6.2 Substituir o placeholder `<Text style={styles.infoText}>Alunos: 0/0 (em breve)</Text>`
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
- [x] 6.3 Enquanto `summary` for `undefined`, renderize `Alunos: —`, não `0/0`. Um zero
  inventado durante o carregamento é indistinguível de um zero verdadeiro.
- [x] 6.4 **Não** toque no ramo `COMPLETED` (`trip.tsx:96-105`). O `deferred-work.md` registra
  que ele é código morto contra o contrato real, e a decisão é da Story 3.1.
- [x] 6.5 Nada mais em `trip.tsx`. Nem os chips, nem o `PLACEHOLDER_ROUTE_ID`, nem as mutations.

### Task 7 — Verificação em execução (todas as ACs)

Ambiente: alvo web (Architecture §8, regra 15). `cd mobile && npm run web`, aberto em
`http://localhost:8081` — **nunca pelo IP de LAN** (o login quebra em `crypto.randomUUID`;
ver `mobile/README.md`). `EXPO_PUBLIC_USE_MOCKS=1` no `.env`, dev server reiniciado após trocar
a flag (`EXPO_PUBLIC_*` entra no bundle em build time).

- [x] 7.1 `npx tsc --noEmit` → 0 erros. Qualquer erro é seu.
- [x] 7.2 `npm run lint` → limpo.
- [x] 7.3 `npm test` → verde, incluindo o novo `student-card.test.tsx` e as suítes existentes
  da 1.10/3.4b intactas (`role-routes`, `qr-payload`, `offline-queue`, `offline-banner`,
  `connectivity`, `scan-feedback`, `smoke-render`).
- [x] 7.4 `npx expo export --platform web` → completa sem erro (AC #8; Architecture §8, regra 16).
- [ ] 7.5 Roteiro manual — **cada linha é uma AC** (Lucas, verificação manual, PR #17 pós-merge):
  - [x] `motorista@pureurban.com` → "Iniciar Viagem" → "Alunos da Viagem": lista com 4 alunos,
    contagem `0/4 embarcados`, Diego Alves em "Não vai voltar" (estados 9, 9b, 9c) — AC #1, #2
  - [x] Voltar → "Escanear QR Code" → escanear o QR de `aluno@pureurban.com` (segundo browser
    ou segundo perfil) → "Ver lista" **sem recarregar a página**: Ana Souza aparece "Embarcou"
    com horário e a contagem vira `1/4` — **AC #4 e AC #5**
  - [x] Na mesma navegação: confirmar no DevTools que a câmera foi liberada ao entrar na lista
    (o indicador de câmera do browser apaga) — **Bloqueador 2**
  - [x] Voltar da lista para o scan: a câmera reabre e a tela está pronta para ler, sem overlay
    congelado — Task 5.5
  - [x] `motorista-turma-vazia@` → estado 8 ("Nenhum aluno vinculado", `0/0`)
  - [x] `motorista-turma-grande@` → 60 alunos, rolagem fluida, contagem correta (NFR4)
  - [x] `motorista-lista-erro@` → estado 6 (erro sem cache) → "Tentar novamente"
  - [ ] Com a lista carregada, DevTools → Network → **Offline**, pull-to-refresh: estado 7 —
    a lista **continua na tela** com o `Banner` de dado desatualizado — **AC #3 / FR24**.
    **Finding da verificação manual (2026-09-06):** o Banner não aparecia no alvo web —
    a query pausava (`fetchStatus: 'paused'`) em vez de errar, `isError` ficava `false`.
    **Corrigido** na branch `fix/3-5b-stale-banner-offline` (`networkMode: 'always'` na query
    do roster; ver Completion Notes). Aguarda **revalidação do Lucas no browser** após o fix.
  - [ ] Ainda offline, **F5**: a lista volta do cache persistido em MMKV (Tier 1) — AC #3.
    **Diferida para verificação em device** (ver `deferred-work.md`): F5 no alvo web rebaixa
    o bundle do dev server do Metro em `localhost:8081` e `web.output: "single"` não gera
    service worker — a página não recarrega offline por limitação do ambiente de dev, não
    do código. Comprovável só num build standalone ou em device.
  - [x] `motorista-outra-viagem@` → estado 10 (403 `DRIVER_NOT_ASSIGNED`)
  - [x] `motorista-sem-viagem@` → estado 4 ("Nenhuma viagem ativa")
  - [x] `aluno@pureurban.com` digitando `/student-list` na barra de endereços → o shell da 1.8
    redireciona para `/(student)/home` (o estado 1 é a rede de segurança, não o caminho normal)
  - [x] Trocar de conta e reabrir a lista: nenhum aluno vem `CHECKED_IN` de uma sessão anterior
    — **Bloqueador 4**
- [x] 7.6 Sem regressão em `api/`: **nada é tocado lá**. Não rode nem altere nada na API.

> Se alguma linha do roteiro não puder ser executada, **diga isso explicitamente nas Completion
> Notes e deixe a subtask desmarcada.** Marcar `[x]` em verificação não executada foi finding
> de review na 3.2b, e o `deferred-work.md` registra o custo disso.

---

## Dev Notes

### Estado atual dos arquivos que serão MODIFICADOS

| Arquivo | Hoje | Esta story muda | Preservar |
|---|---|---|---|
| `src/app/(driver)/student-list.tsx` | Placeholder de 6 linhas (`<View><Text>Student List — placeholder</Text></View>`) | Tela real | — |
| `src/services/trip.service.ts` | `Trip`, `getActiveTrip`, `startTrip`, `endTrip` (~30 linhas) | **Acrescenta** `getTripStudents` + 3 aliases de tipo | Tudo o que existe: as três funções e a interface `Trip` |
| `src/app/(driver)/scan.tsx` | Tela completa da 3.3b + discriminante de transporte / fila offline da 3.4b, revisadas — Tabela de Verdade de 17 estados, gates `isBusy`/`isSubmitting`, idempotência | **Só** invalidação no sucesso online, gate de foco e o botão "Ver lista" | Todo o resto. A 3.3b e a 3.4b estão `done` e revisadas |
| `src/app/(driver)/trip.tsx` | Tela completa da 3.1 (start/end, cards, chips) + botão de scan da 3.3b. Usa `isLoading` (pré-existente, não é seu para trocar) | **Só** o botão "Alunos da Viagem" e a contagem real no lugar de `0/0 (em breve)` no ramo `ACTIVE` | Todo o resto. A 3.1 está em `review` |
| `src/mocks/handlers/auth.handlers.ts` | 8 usuários mock, rotação real de refresh token, `resetTripMocks()` no login | +3 motoristas sentinela, +`resetBoardingMocks()` no login | `findMockUser` com `Object.hasOwn`, a rotação, `REFRESH_FAILURE_EMAIL`, os 8 usuários, `setMockSessionEmail` |
| `src/mocks/handlers/boarding.handlers.ts` | Check-in completo + `GET /trips/:id/students` correto (`:207-246`), roster compartilhado, replay de idempotência | +3 ids sentinela (vazio, grande, erro) | **A ordem de validação do check-in**, o replay, o roster inicial de 4, `IDEMPOTENCY_KEY_CONFLICT`, `MOCK_OTHER_DRIVER_TRIP_ID` |
| `src/mocks/handlers/trip.handlers.ts` | `/trips/active` com 3 sentinelas de motorista lidas de `getMockSessionEmail()`, POST e PATCH com estado em memória | +3 ramos de sentinela em `/trips/active` | A precedência de `currentTrip?.status === 'ACTIVE'` sobre as sentinelas — inverter reabre um bug já corrigido |
| `mobile/.env.example` | Documenta flags, credenciais e ids do mock (bloco "Sentinelas de estado da tela de scan") | +3 motoristas, +3 ids de viagem | Todo o bloco existente |

**Arquivos NOVOS:** `src/components/student-card.tsx`, `src/components/student-card.test.tsx`.

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
  explicando *por que* cada ramo existe. `session.ts` guarda o e-mail da sessão; `trip.handlers`
  e `auth.handlers` já o usam.
- **Cache offline (Tier 1):** `PersistQueryClientProvider` + `mmkvPersister` já ligados no
  layout raiz (`src/app/_layout.tsx`, `persistOptions` com `maxAge` 24h), `gcTime` em
  `lib/query-client.ts`. Uma `useQuery` comum herda a persistência — **você não configura nada
  por query.** Mas veja a nota de `onlineManager` abaixo.
- **Isolamento entre contas:** `auth.store.ts` chama `queryClient.clear()` +
  `mmkvPersister.removeClient()` no login **e** no logout. Sua key `['trip', tripId, 'students']`
  já está protegida contra vazamento entre motoristas — não escreva lógica própria para isso.
- **Estados de loading:** union type discriminado, nunca booleanos soltos (Architecture §6).
  `scan.tsx:33-46` (`ScanResult`) é o exemplo canônico no repo.
- **Conectividade derivada (3.4b):** `src/lib/connectivity.ts` + `src/stores/app.store.ts`
  expõem `isOnline`, alimentado pelo desfecho real das requisições no `api-client`
  (`reportSuccess`/`reportTransportFailure`). É o sinal que **a fila de escrita** usa. Esta tela
  **não** o consome — ver a linha "Condição do indicador" em *Decisões já tomadas*.

### A nota de `onlineManager` que muda como você lê "offline"

**`onlineManager` do TanStack Query nunca foi conectado a um provedor de conectividade** — a
3.4b resolveu a detecção com o store `app.store.isOnline` (derivado das respostas HTTP), não
plugando o `onlineManager`. O `OnlineManager` padrão nasce com `#online = true` e só instala
listeners onde existe `window.addEventListener`.

Consequência **direta para o AC #3**: sem rede, a query do roster **não pausa**. Ela dispara,
queima o `retry` ladder (2 tentativas com backoff) e termina em `error` — **com `data` do cache
ainda presente no resultado**. É por isso que o estado 7 é `roster.isError && roster.data`, e
não `isPaused` ou `!isOnline`. Um `500` do servidor (transporte OK, `isOnline` continua `true`)
também cai em "dado velho mas alcançável" e a condição `isError && data` cobre esse caso; um
sinal de conectividade não cobriria.

No **alvo web** o `window.addEventListener('online'/'offline')` existe e a 3.4b instala
listeners (`startConnectivityListeners`), então `isOnline` acompanha `navigator.onLine` ali —
mas a condição `isError && data` cobre os dois ambientes e é a que deve ser implementada. Não
mexa no `onlineManager` nem na conectividade nesta story.

### Fora de escopo (não fazer nesta story)

- **`stores/boarding.store.ts`** — ver Decisões já tomadas. A 3.3b escreveu que ele "nasce na
  3.5b"; a análise desta story concluiu que ele **não tem leitor**. Não crie.
- **Fila de escrita offline (`utils/offline-queue.ts`, `hooks/use-offline-sync.ts`,
  `components/offline-banner.tsx`, `lib/connectivity.ts`, `stores/app.store.ts`)** — já
  entregue pela Story 3.4b (`done`). Não edite nenhum desses arquivos, não reutilize o
  `OfflineBanner` nesta tela, não mexa no texto da NFR13.
- **Atualização em tempo real da lista (SSE)** — Épico 4 (`boarding.not_returning` e o canal
  `GET /api/v1/boarding/events`). Aqui a atualização é por invalidação e pull-to-refresh.
- **Qualquer arquivo em `api/`** — story 100% mobile. A 3.5a está `done`; não a toque.
- **Regenerar `api/openapi.json` ou `src/types/api.d.ts`** — o contrato da 3.0 + a mudança da
  3.5a já declaram tudo que esta story consome. Editar `api.d.ts` à mão é violação de contrato
  (Architecture §8, regra 11).
- **Apontar o `api-client` para a API real / desligar os mocks** — é a Story 3.6.
- **Corrigir o `onlineManager`, o segundo-401 do `api-client`, o `+not-found` ou os órfãos de
  theming** — todos registrados no `deferred-work.md`, nenhum é desta story.
- **UI de logout para DRIVER/STUDENT** — item aberto do review da 1.8, sem AC aqui.
- **Filtro, busca, ordenação ou detalhe do aluno** — nenhuma AC pede.

### Previous Story Intelligence

- **3.0 (contrato, `done`)** declarou `TripStudentsResponseDto` com `students` + `summary`, e
  os três status. Os tipos gerados estão corretos (`api.d.ts:416-456`) — são DTOs de classe, não
  Effect Schema, então não colapsam em `Record<string, never>` como os 11 endpoints antigos.
- **3.5a (backend, `done`)** implementou o endpoint real e **mudou o contrato de propósito**:
  acrescentou `403 DRIVER_NOT_ASSIGNED` (motorista que não é o `driverId` da viagem). A
  mudança já foi propagada para o `openapi.json`, para `api.d.ts` e para o mock
  (`boarding.handlers.ts:210-216`). O estado 10 da sua tabela existe por causa disso.
  Ela também decidiu que **viagem inexistente → 404, nunca 409**, e que **viagem de outra
  empresa → 404, nunca 403** (não vazar existência entre tenants).
- **3.3b (mobile, `done`)** é a tela irmã. Três coisas dela chegam até você: (a)
  `boardingService.checkIn` recebe a chave de idempotência de fora; (b) o `api-client` já sabe
  mandar headers por requisição; (c) o roster compartilhado do mock foi construído prevendo
  esta story. A verificação de UI da 3.3b foi executada no alvo web em 30/08 (10/10 casos) —
  ainda assim, se o roteiro 7.5 revelar um problema no fluxo de scan, registre nas Completion
  Notes em vez de consertar em silêncio.
- **3.4b (mobile, `done`)** é a irmã mais recente e a que mais mexe no seu terreno:
  - `(driver)/_layout.tsx` deixou de ser um `<Stack>` puro — agora é `<View>` com o `<Stack>` +
    `<OfflineBanner>` global e `useOfflineSync()`. A tela `student-list` **já renderiza dentro
    desse layout**: o banner da fila de escrita aparece nela de graça. O seu banner de dado
    velho (estado 7) é **outro**, dentro da tela.
  - `scan.tsx` ganhou o discriminante `isTransportFailure` / `enqueueCheckIn` /
    `notifyQueueChanged`. **Não toque nisso** — sua mudança na Task 5 é só invalidação online +
    gate de foco + botão.
  - Nasceram `stores/app.store.ts` (`isOnline`), `lib/connectivity.ts`, `hooks/use-offline-sync.ts`,
    `components/offline-banner.tsx`, `lib/offline-queue-storage.ts`, `lib/database*.ts`,
    `services/boarding.service.ts`, `utils/offline-queue.ts`. Todos fora do seu escopo.
  - Nenhum caminho de check-in (online ou drenado) invalida o roster hoje — ver Bloqueador 3.
- **3.2b (mobile, `done`)** deixou 17 findings de review. Os que têm equivalente direto nesta
  tela: (a) duas query keys para o mesmo endpoint → Bloqueador 1; (b) `isLoading` em vez de
  `status === 'pending'` com query pausada → Task 3.1; (c) medida fixa em px estourando devices
  ≤ 368dp → Task 2.6; (d) `push` em vez de `navigate` → Tasks 5.6 e 6.1; (e) ausência de guarda
  de role → Task 3.2; (f) erro tratado como vazio → estados 6/7/8.
- **1.10 (test runner, `done`)** instalou `jest` + `jest-expo` + `@testing-library/react-native`
  + `react-test-renderer`, `jest.config.js` com `testMatch` em `src/**/*.{test,spec}.{ts,tsx}`,
  `npm test` / `npm run test:watch`. Roda sem device/rede/Docker/`.env`. Suítes existentes:
  `role-routes`, `qr-payload`, `scan-feedback`, `connectivity`, `offline-queue`,
  `offline-banner` (render de componente Paper), `smoke-render`. **É por isso que a Task 2.9
  existe** — o mapa de apresentação e a regra de horário são testáveis agora.
- **1.8 (shell, `done`)** é a razão pela qual esta tela é alcançável. `ROLE_ROUTES` é a fonte
  única do roteamento por papel e os guards de `_layout.tsx` são derivados dela — **não escreva
  redirecionamento por papel dentro da sua tela**; o shell já fez isso. O review da 1.8
  registrou que `student-list.tsx` é uma das três telas "implementadas e mortas" por falta de
  ponto de entrada, e que **os pontos de entrada pertencem às stories que as especificam** —
  daí a AC #5.
- **1.6 (ambiente web, `done`)** entregou o ambiente onde o seu roteiro 7.5 roda. Ler as
  limitações no `mobile/README.md` antes de reportar bug de ambiente como bug de código.

### Git Intelligence

Branch já criada: **`feat/3-5b-lista-de-alunos-e-status-de-embarque`**, a partir de `origin/main`
pós-merge da 3.4b (PR #16). A `main` agora **contém** 1.6, 1.8, 1.10, 3.2b, 3.3b e 3.4b —
`mobile/src/app/(driver)/scan.tsx` é a tela real de ~680 linhas, `(driver)/_layout.tsx` já
monta o `<OfflineBanner>`, e o test runner está instalado. O primeiro commit desta branch
(`bd9ac58`, `docs: mark story 3.4b done`) já ajusta o `sprint-status.yaml`.

A branch stale `origin/chore/3-5b-lista-de-alunos-e-status-de-embarque` (partia de uma `main`
pré-1.8) foi abandonada; só este spec foi trazido dela.

Convenção do repo (CLAUDE.md): **commits atômicos** em inglês com escopo e story — sugestão de
fatiamento:
- `feat(trip): add getTripStudents to the trip service (story 3.5b)`
- `feat(mobile): render the student roster card (story 3.5b)` — inclui o teste
- `feat(trip): render the driver student list with boarding status (story 3.5b)`
- `feat(boarding): invalidate the roster cache after a successful check-in (story 3.5b)`
- `fix(mobile): release the camera when the scan screen loses focus (story 3.5b)`
- `feat(trip): link to the student list from the trip and scan screens (story 3.5b)`
- `test(mocks): add roster sentinels for empty, large and failing rosters (story 3.5b)`

**PR só com aprovação explícita do Lucas.**

### Latest Tech Information (reverificado nesta árvore em 2026-09-02)

- **`@tanstack/react-query@5.96.2`** (instalado). `useQuery` devolve `status: 'pending' | 'error' | 'success'`
  e mantém `data` do cache mesmo quando `status === 'error'` — é o mecanismo do estado 7.
  `enabled` aceita boolean e é o gate correto para query dependente. `select` roda sobre o dado
  cacheado, sem refetch e sem duplicar entrada de cache — é o que a Task 6.2 usa.
- **`invalidateQueries({ queryKey })`** faz *prefix match*: `['trip', id, 'students']` é
  invalidada por `['trip']` também. Passe a key completa para não derrubar caches vizinhos.
  Query inativa (tela desmontada) é marcada stale e refaz fetch na próxima montagem — é assim
  que a AC #4 funciona com a lista fora da tela.
- **`react-native-paper@5.15.0`** (instalado). `Banner`, `Chip`, `Card`, `Divider`, `List`,
  `Snackbar`, `Text` e `ActivityIndicator` exportados. O `PaperProvider` já está montado no
  `_layout.tsx` raiz com o tema de `@/lib/theme` (primária `#208AEF`). `offline-banner.test.tsx`
  prova que `render()` de componente com `<Text>` do Paper funciona sob `jest-expo`.
- **`expo-router@~55.0.7`** reexporta `useFocusEffect`
  (`node_modules/expo-router/build/exports.d.ts:25`). `useIsFocused` vem de
  `@react-navigation/native` (`^7.1.33`, instalado 7.2.1), **dependência direta** do
  `package.json` — não é dependência nova.
- **`FlatList`** (React Native 0.83.2): `keyExtractor` + item memoizado é o suficiente para 60
  itens. **Não** adicione `getItemLayout`, `windowSize` nem `removeClippedSubviews` sem medir —
  otimização prematura em lista pequena costuma piorar.
- **Nenhuma dependência nova é necessária nesta story.** `package.json` deve sair com diff
  vazio. Se você achar que precisa de uma, pare e registre em *Questões Abertas*.

### Testing Requirements

O test runner **existe** desde a 1.10 (`jest` + `jest-expo` + `@testing-library/react-native`,
`npm test`, roda sem device/rede/Docker/`.env`). O que vale como verde aqui:

- **`src/components/student-card.test.tsx`** (Task 2.9): rótulo por `status`, horário só em
  `CHECKED_IN`, cobertura do union de `status` pelo `STATUS_PRESENTATION`. É o único teste
  novo obrigatório — a tela e os handlers são exercitados pelo `tsc` + roteiro manual.
- `npm test` → toda a suíte verde, incluindo as existentes intactas.
- `npx tsc --noEmit` → **0 erros**. É o teste de conformidade de contrato: `getTripStudents`
  tipado por `components['schemas']['TripStudentsResponseDto']` não compila se divergir do
  `openapi.json`, e os handlers MSW tipados por `operations[...]` não compilam se o mock
  divergir do contrato.
- `npm run lint` limpo.
- `npx expo export --platform web` sem erro (AC #8).
- **Roteiro manual da Task 7.5 executado e registrado**, com atenção às quatro linhas que só
  aparecem fora do caminho feliz: **offline com cache** (AC #3), **reflexo do check-in** (AC #4),
  **liberação da câmera** (Bloqueador 2) e **troca de conta** (Bloqueador 4).

### Project Structure Notes

```
mobile/
├── .env.example                                # [UPDATE] +3 motoristas, +3 ids de viagem
└── src/
    ├── app/(driver)/
    │   ├── student-list.tsx                    # [UPDATE] placeholder → tela real
    │   ├── scan.tsx                            # [UPDATE] invalidação online + gate de foco + botão "Ver lista"
    │   └── trip.tsx                            # [UPDATE] botão "Alunos da Viagem" + contagem real (ramo ACTIVE)
    ├── components/
    │   ├── student-card.tsx                    # [NEW] apresentação pura de um item do roster
    │   └── student-card.test.tsx               # [NEW] jest — rótulo/horário/cobertura do union
    ├── mocks/handlers/
    │   ├── boarding.handlers.ts                # [UPDATE] +3 ids sentinela (vazio, grande, erro)
    │   ├── trip.handlers.ts                    # [UPDATE] +3 ramos em /trips/active
    │   └── auth.handlers.ts                    # [UPDATE] +3 motoristas, +resetBoardingMocks() no login
    └── services/trip.service.ts                # [UPDATE] +getTripStudents +3 aliases de tipo
```

`stores/boarding.store.ts` aparece em `architecture.md#Estrutura do Mobile` e **não nasce nesta
story** (ver Decisões já tomadas). `utils/offline-queue.ts`, `hooks/use-offline-sync.ts`,
`components/offline-banner.tsx` já existem (3.4b) e **não são tocados**. **Nenhum arquivo em
`api/`. `package.json` com diff vazio.**

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
- [Source: mobile/src/types/api.d.ts:416-456] — `TripStudentItemDto`, `BoardingSummaryDto`, `TripStudentsResponseDto`
- [Source: mobile/src/mocks/handlers/boarding.handlers.ts:207-246] — o handler do roster, já correto; roster compartilhado com o check-in
- [Source: mobile/src/mocks/handlers/trip.handlers.ts:28-30,84-108] — sentinelas de e-mail e precedência de `currentTrip`
- [Source: mobile/src/mocks/handlers/session.ts] — `getMockSessionEmail()` compartilhado
- [Source: mobile/src/mocks/handlers/auth.handlers.ts:117-123] — `setMockSessionEmail` + `resetTripMocks()` no login
- [Source: mobile/src/app/(driver)/scan.tsx:103-114,171-235,428,430-436] — query `['activeTrip']`, `submit` sem invalidação, `<QrScanner>`, `counterBar`
- [Source: mobile/src/app/(driver)/trip.tsx:35-40,146,156-166] — query `['activeTrip']`, o placeholder `0/0`, os botões de 56dp
- [Source: mobile/src/app/(driver)/_layout.tsx] — `<Stack>` + `<OfflineBanner>` + `useOfflineSync()`; a tela `student-list` renderiza aqui dentro
- [Source: mobile/src/app/(driver)/routes.tsx:39-80] — `RefreshControl`, branch explícito erro-vs-vazio
- [Source: mobile/src/components/qr-scanner.tsx] — por que `isPaused` não fecha a câmera
- [Source: mobile/src/components/offline-banner.test.tsx] — molde de teste de componente (`render`/`screen`, Paper)
- [Source: mobile/src/stores/auth.store.ts] — `queryClient.clear()` + `mmkvPersister.removeClient()` no login/logout
- [Source: mobile/src/stores/app.store.ts] + [mobile/src/lib/connectivity.ts] — `isOnline` derivado (3.4b), por que a tela NÃO o usa
- [Source: mobile/jest.config.js] — `testMatch`, `preset: 'jest-expo'`
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

1. **✅ Resolvida.** A story técnica de `jest-expo` pedida desde a 3.2b foi a **1.10** (`done`,
   30/08). O runner existe; a Task 2.9 cobre o mapa de apresentação com teste. Fica em aberto
   só se você quer um teste de render da tela `student-list` (as guardas da Tabela de Verdade
   dão para exercitar com `render` + `QueryClientProvider` fake) — a story não o exige porque
   o `tsc` + roteiro manual já cobrem, e um render da tela puxa MMKV/persister.

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

5. **Item drenado da fila offline (3.4b) não reflete na lista.** A AC #4 é atendida no caminho
   **online** (Task 5.1). Quando o check-in foi enfileirado sem rede e depois drenado por
   `use-offline-sync`, o roster só atualiza no próximo `staleTime`/pull-to-refresh — o dreno
   não tem acesso ao `queryClient`. Ligar isso é uma linha em `use-offline-sync.ts` (fora do
   escopo desta story, que não toca a fila) ou fica para a 3.6. Recomendação: registrar no
   `deferred-work.md` nomeando a 3.6.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (bmad-build / auto)

### Debug Log References

- `cd mobile && npx tsc --noEmit` → 0 erros
- `cd mobile && npm run lint` (+ `npx eslint` direto nos arquivos alterados) → limpo
- `cd mobile && npm test` → 8 suítes, 96 testes, verde (inclui o novo `student-card.test.tsx`; suítes da 1.10/3.4b intactas)
- `cd mobile && npx expo export --platform web` → completa sem erro (dist removido após verificação)

**Fix da verificação manual (branch `fix/3-5b-stale-banner-offline`, 2026-09-06):**
- `cd mobile && npx tsc --noEmit` → 0 erros
- `cd mobile && npm run lint` → limpo (exit 0)
- `cd mobile && npm test` → 10 suítes, 106 testes, verde (inclui o novo `roster-stale-banner.test.ts`)
- `cd mobile && npx expo export --platform web` → completa sem erro (`dist/` removido)

### Completion Notes List

- **Task 1–3, 5, 6 completas.** `getTripStudents` + 3 aliases no `trip.service.ts`; `student-card.tsx` (apresentação pura, `STATUS_PRESENTATION` exportado, `React.memo`) + teste; `student-list.tsx` reescrita com as 12 guardas da Tabela de Verdade na ordem; `scan.tsx` com invalidação online do roster, gate de foco (`useIsFocused` — `<QrScanner>` desmonta fora de foco), `useFocusEffect(resume)` e botão "Ver lista" na `counterBar` (`box-none`); `trip.tsx` com botão "Alunos da Viagem" (`outlined`) e contagem real via `select` na mesma query key (`Alunos: —` enquanto `undefined`).
- **Task 4 completa.** +3 motoristas sentinela (`...440005/6/7`), +`resetBoardingMocks()` no login (Bloqueador 4); +`MOCK_EMPTY_ROSTER_TRIP_ID` / `MOCK_LARGE_ROSTER_TRIP_ID` (60 alunos, 3 status) / `MOCK_ROSTER_ERROR_TRIP_ID` (500); +3 ramos ACTIVE em `/trips/active`; `.env.example` atualizado. Sem ciclo de import (`boarding.handlers` só importa `@/types/api`).
- **Code review (2026-09-03): 5 patches aplicados** — `student-card`: fallback quando `STATUS_PRESENTATION[status]` é `undefined`, `formatCheckedInAt` retorna `''` para data não-parseável, `accessible` + `accessibilityLabel` combinado (nome + status + horário); `student-list`: `retry` vira predicado que não retenta 4xx de negócio (estados 10/11 sem spinner à toa), pull-to-refresh também chama `refetchTrip()`. Query `['activeTrip']` intocada. +3 testes no `student-card.test.tsx`.
- **Task 7.1–7.4 executadas e verdes** (`tsc` 0 erros, `lint` limpo, `jest` 99/99, `expo export --platform web` OK; `dist/` removido). **Task 7.5 (roteiro manual no browser) NÃO executada** — ambiente non-interactive, sem `npm run web` + navegador. As quatro linhas críticas (offline-com-cache / reflexo do check-in / liberação da câmera / troca de conta) ficam para verificação humana; subtasks 7.5 permanecem desmarcadas conforme a nota do spec.
- **Questão Aberta #5** (item drenado da fila offline não reflete na lista) não foi registrada em `deferred-work.md` — é recomendação para o Lucas, não tarefa de dev. AC #4 atendida no caminho online (Task 5.1).
- `package.json` com diff vazio. Nenhum arquivo em `api/` tocado. `stores/boarding.store.ts` não criado (Decisões já tomadas).
- Os diffs em `sprint-status.yaml` e no cabeçalho deste spec já estavam no working tree quando o dev começou (preparação da branch) — não são desta implementação.

**Fix da verificação manual da Task 7.5 (branch `fix/3-5b-stale-banner-offline`, 2026-09-06):**
- **O finding.** A verificação manual do PM (Task 7.5) encontrou que o estado 7 da Tabela de
  Verdade (AC #3 / FR24) **não era demonstrável no alvo web**. `showStaleBanner` é
  `roster.isError && roster.data`; no alvo web o `OnlineManager` padrão do TanStack engancha
  os eventos `online`/`offline` do `window`, então o DevTools "Offline" o coloca offline e um
  refetch com o `networkMode: 'online'` default **pausa** (`fetchStatus: 'paused'`) em vez de
  errar. `roster.isError` fica `false` e o Banner nunca aparece. No device nativo o
  `onlineManager` nunca foi ligado ao NetInfo (defer da 3.2b), então lá a query erra e o
  Banner aparece — o comportamento divergia entre web e o alvo contra o qual se verifica.
- **O fix.** `networkMode: 'always'` na query do roster (`['trip', tripId, 'students']`), em
  `student-list.tsx` (`:37`, a query principal) **e** em `trip.tsx` (`:50`, o observer de
  contagem via `select` — mesma entrada de cache, deve falhar/retomar igual). O refetch passa
  a tentar mesmo "offline", falha no transporte (o `api-client` propaga o `TypeError` cru do
  `fetch`), cai em `isError` mantendo o `roster.data` do cache → Banner aparece. Consistente
  entre web e nativo.
- **O que NÃO mudou, com raciocínio.** (a) `['activeTrip']` fica com o `networkMode` default:
  se errasse offline, a guarda `tripStatus === 'error'` (estado 3) renderizaria "Não foi
  possível carregar a viagem" **antes** de a escada chegar no roster, mascarando o estado 7 —
  e a key é compartilhada com `scan.tsx`, cujo comportamento offline não é escopo aqui.
  (b) `lib/query-client.ts` (networkMode global) fica intocado — mudança sistêmica que toca
  todas as telas; o escopo mínimo (a query do roster) resolve o finding.
  (c) A condição `roster.isError && roster.data` fica como está (decisão travada na tabela
  "Decisões já tomadas"): com `networkMode: 'always'` o roster nunca pausa, então reforçar
  para `|| fetchStatus === 'paused'` seria código morto.
- **Cobertura.** `src/lib/roster-stale-banner.test.ts` (novo) tranca o
  mecanismo: uma query com `networkMode: 'always'` offline **erra** e mantém o cache
  (`isError && data`); a mesma com o `networkMode` default **pausa** e `isError` nunca vira
  true. Um teste de render da tela inteira continua fora de escopo (puxa MMKV/persister —
  Questão Aberta #1 e o defer da 3.5b registram isso).
- **Diferido.** A linha "F5 offline volta do cache" da Task 7.5 vira **verificação em device**
  (registrada em `deferred-work.md`): é limitação do dev server do Metro (F5 rebaixa o bundle
  de `localhost:8081`) + `web.output: "single"` sem service worker, não do código.
- **Revalidação pendente do Lucas:** a linha do Banner offline (estado 7) no browser, após
  este fix. Nada mais da Task 7.5 mudou de estado por esta branch.
- `package.json` com diff vazio. Nenhum arquivo em `api/` tocado.

### File List

- `mobile/src/services/trip.service.ts` (M)
- `mobile/src/components/student-card.tsx` (A)
- `mobile/src/components/student-card.test.tsx` (A)
- `mobile/src/app/(driver)/student-list.tsx` (M)
- `mobile/src/lib/roster-stale-banner.test.ts` (A) — fix 2026-09-06
- `mobile/src/app/(driver)/scan.tsx` (M)
- `mobile/src/app/(driver)/trip.tsx` (M)
- `mobile/src/mocks/handlers/auth.handlers.ts` (M)
- `mobile/src/mocks/handlers/boarding.handlers.ts` (M)
- `mobile/src/mocks/handlers/trip.handlers.ts` (M)
- `mobile/.env.example` (M)

### Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-30 | 0.1 | Story criada com contexto completo (create-story) | Scrum Master |
| 2026-09-02 | 0.2 | Revalidada contra a `main` pós-merge da 3.4b: âncoras de linha refeitas em todas as tasks; seção de testes reescrita (runner da 1.10 existe — Task 2.9 nova); Previous Story Intelligence + Git Intelligence + nota de `onlineManager` atualizadas para 3.3b/3.4b `done`; Bloqueadores 1-4 reconferidos e mantidos; Questão Aberta #1 fechada, #5 adicionada | bmad-build |
| 2026-09-02 | 0.3 | Implementação: Tasks 1–6 completas; Task 7.1–7.4 verdes (`tsc`/`lint`/`jest 96✓`/`expo export`); Task 7.5 (roteiro manual no browser) não executada — ambiente non-interactive | bmad-build (dev) |
| 2026-09-03 | 0.4 | Code review: 5 patches aplicados — fallback de `STATUS_PRESENTATION`, guarda de data inválida e `accessibilityLabel` único no `student-card`; predicado de `retry` que não retenta 4xx de negócio e `refetchTrip()` no pull-to-refresh no `student-list`. tsc/lint/jest(99✓)/expo export verdes | bmad-build (dev) |
| 2026-09-06 | 0.5 | Fix do finding da verificação manual (Task 7.5): estado 7 / AC #3 não demonstrável no alvo web. `networkMode: 'always'` na query do roster em `student-list.tsx` e `trip.tsx`; `['activeTrip']` e `query-client.ts` intocados (raciocínio nas Completion Notes). +`roster-stale-banner.test.ts` (em `src/lib/`, fora de `src/app/` — ver commit). Linha "F5 offline" da Task 7.5 diferida para device. tsc/lint/jest(106✓)/expo export verdes. Branch `fix/3-5b-stale-banner-offline` | bmad-build (dev) |

---

## Suggested Review Order

**Contrato consumido**

- Método fino + aliases gerados do contrato; nada escrito à mão
  [`trip.service.ts:22`](../../mobile/src/services/trip.service.ts#L22)

**A tela (ponto de entrada)**

- A escada de 12 guardas na ordem da Tabela de Verdade — comece aqui para entender o desenho
  [`student-list.tsx:45`](../../mobile/src/app/(driver)/student-list.tsx#L45)
- Duas queries encadeadas: `['activeTrip']` reusada, roster segmentado por `tripId` com `enabled` e `retry` que não retenta 4xx de negócio
  [`student-list.tsx:29`](../../mobile/src/app/(driver)/student-list.tsx#L29)
- Estado 7 (AC #3 / FR24): `isError && data` mantém a lista legível com `Banner` persistente; contagem sempre de `summary`
  [`student-list.tsx:152`](../../mobile/src/app/(driver)/student-list.tsx#L152)

**O item da lista**

- Mapa `status → apresentação` como constante exportada sobre o union; fallback não derruba a `FlatList`
  [`student-card.tsx:21`](../../mobile/src/components/student-card.tsx#L21)
- Rótulo textual + `accessibilityLabel` único (nome + status + horário); horário só em `CHECKED_IN`, com guarda de data inválida
  [`student-card.tsx:36`](../../mobile/src/components/student-card.tsx#L36)

**Reflexo do check-in e liberação da câmera (`scan.tsx`)**

- AC #4: invalidação de `['trip', tripId, 'students']` só no sucesso online do `submit`
  [`scan.tsx:201`](../../mobile/src/app/(driver)/scan.tsx#L201)
- Bloqueador 2: `<QrScanner>` desmonta fora de foco (`isFocused`); `useFocusEffect(resume)` reabre a câmera pronta
  [`scan.tsx:449`](../../mobile/src/app/(driver)/scan.tsx#L449)
- AC #5: ponto de entrada "Ver lista" dentro da `counterBar` (`box-none`), `navigate` nunca `push`
  [`scan.tsx:463`](../../mobile/src/app/(driver)/scan.tsx#L463)

**Contagem real na tela de viagem (`trip.tsx`)**

- Mesma query key do roster com `select`, para não duplicar cache; `Alunos: —` enquanto carrega; +botão "Alunos da Viagem"
  [`trip.tsx:45`](../../mobile/src/app/(driver)/trip.tsx#L45)

**Sentinelas MSW (estados antes inalcançáveis)**

- Roster vazio / 60 alunos / 500, +`resetBoardingMocks()` no login (Bloqueador 4)
  [`boarding.handlers.ts:28`](../../mobile/src/mocks/handlers/boarding.handlers.ts#L28)
- Três motoristas sentinela ligados aos ids novos em `GET /trips/active`
  [`trip.handlers.ts:116`](../../mobile/src/mocks/handlers/trip.handlers.ts#L116)
- `resetBoardingMocks()` acrescentado ao `POST /auth/login`
  [`auth.handlers.ts:151`](../../mobile/src/mocks/handlers/auth.handlers.ts#L151)

**Periféricos**

- Testes do card: rótulo por status, horário, cobertura do union, status desconhecido, data inválida, a11y
  [`student-card.test.tsx:1`](../../mobile/src/components/student-card.test.tsx#L1)
- Credenciais e ids novos documentados
  [`.env.example:24`](../../mobile/.env.example#L24)
