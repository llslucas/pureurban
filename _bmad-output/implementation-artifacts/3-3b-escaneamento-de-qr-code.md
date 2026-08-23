# Story 3.3b: Escaneamento de QR Code (Mobile Motorista)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como **motorista**,
Quero **escanear o QR code dos alunos para registrar embarque**,
Para que **eu tenha controle digital de quem entrou no ônibus**.

## Acceptance Criteria

1. Com viagem ativa, ao abrir `(driver)/scan.tsx` a câmera (`expo-camera`) abre rapidamente, com área de escaneamento visualmente clara.
2. Ao ler um QR válido, o app chama `POST /api/v1/boarding/check-in` **contra o handler MSW** e exibe feedback visual de sucesso.
3. Cada código de erro do contrato (`INVALID_QR_CODE`, `STUDENT_NOT_ALLOWED`, `TRIP_NOT_ACTIVE`, `DUPLICATE_CHECK_IN`) tem feedback visual **distinto** e legível em movimento — mais os demais códigos alcançáveis do contrato (`DRIVER_NOT_ASSIGNED`, `IDEMPOTENCY_KEY_CONFLICT`) e o caso de rede indisponível.
4. O retorno visual acontece em menos de 2 segundos na percepção do usuário (NFR1).
5. A tela é operável com uma mão, com botões grandes e contraste alto (NFR18), e o scanner está a **1 toque** da tela inicial do motorista (NFR19).
6. A story fecha desenvolvida e verificada **inteiramente contra os handlers MSW** — nenhum arquivo em `api/` é tocado e o `api-client` não é apontado para a API real. A validação ponta-a-ponta é exercida na Story 3.6.

---

## 🚨 Os três bloqueadores que você vai encontrar primeiro — leia antes de tudo

### Bloqueador 1 — o `apiClient` é estruturalmente incapaz de enviar `X-Idempotency-Key`

O contrato declara o header como `required: true` (`api.d.ts`, `BoardingController_checkIn.parameters.header`), e o mock **rejeita com `400 MISSING_IDEMPOTENCY_KEY`** quem não mandar (`boarding.handlers.ts`). Mas a assinatura hoje é:

```ts
post: <T>(path: string, body?: unknown) => request<T>('POST', path, body)
```

Não existe caminho para um header por requisição. Isto está registrado em `deferred-work.md` desde o review da Story 3.0, com escopo atribuído explicitamente a esta story:

> `api-client.ts` não expõe headers por requisição: `post<T>(path, body)` é estruturalmente incapaz de enviar o `X-Idempotency-Key` que o contrato agora declara obrigatório — pré-existente; o cliente HTTP é escopo da 3.3b/3.4b.

É a **Task 2**, e é pré-requisito de tudo que faz rede aqui.

> ⚠️ **A armadilha dentro da Task 2:** o retry automático de 401 refaz a chamada com `return request<T>(method, path, body, true)`. Se você não repassar os headers nessa linha, o retry pós-refresh sai **sem** o `X-Idempotency-Key` e volta como `400 MISSING_IDEMPOTENCY_KEY` — um bug que só aparece quando o access token expira no meio do embarque, ou seja, no ônibus e nunca no seu teste.

### Bloqueador 2 — o motorista não tem viagem ativa em modo mock

A tela precisa de um `tripId` para montar o body do check-in. Ele vem de `GET /api/v1/trips/active` (`tripService.getActiveTrip`), e:

- **não existe handler MSW** para nenhum endpoint de `/api/v1/trips` — a Story 3.0 só mockou os dois endpoints que ela criou (`check-in` e `trips/:id/students`);
- com `EXPO_PUBLIC_USE_MOCKS=1`, `server.listen({ onUnhandledRequest: 'warn' })` deixa a requisição **escapar para a rede real** — ela falha, `activeTrip` fica `null`, e a tela de scan nunca sai do estado "sem viagem ativa";
- `/api/v1/trips/active` **não declara schema de resposta** no `openapi.json` (só `description: "Viagem ativa ou null"`), então não há tipo gerado para ela.

É a **Task 5**. Precedente direto: a Story 3.2b enfrentou exatamente isso com `/routes/mine` e resolveu criando `routes.handlers.ts` com o shape vindo da interface do serviço. Faça igual.

### Bloqueador 3 — `onBarcodeScanned` dispara continuamente, não uma vez por QR

O callback do `CameraView` é chamado **repetidamente enquanto o código estiver no enquadramento** — dezenas de vezes por segundo, com frequência variando por device. É o bug clássico da lib ([expo/expo#9619](https://github.com/expo/expo/issues/9619), [repro dedicado](https://github.com/Bug-Hunter-X/Expo-Camera--onBarCodeScanned-triggered-multiple-times-per-scan-4rja8)).

Sem gate, apontar a câmera para **um** QR dispara uma rajada de `POST /check-in`. E como cada disparo geraria uma `X-Idempotency-Key` nova, o primeiro retorna `201` e todos os seguintes retornam `409 DUPLICATE_CHECK_IN` — a tela mostraria **erro vermelho num embarque que deu certo**, destruindo a AC #3 no caminho mais comum de todos.

O gate suportado pela lib é passar `undefined` no lugar do handler:

```tsx
<CameraView onBarcodeScanned={isPaused ? undefined : handleScan} ... />
```

Um `if (scanned) return` **dentro** do callback não resolve: o callback continua sendo invocado a cada frame, só que agora desperdiçando trabalho na thread de JS. É a **Task 6.3**.

---

## Tabela de Verdade da Tela — a referência única

Toda decisão de UI de `(driver)/scan.tsx` sai daqui. Se a implementação divergir, a tabela está certa e o código está errado.

| # | Estado | Gatilho | O que a tela mostra | Câmera |
|---|---|---|---|---|
| 1 | Permissão não solicitada | primeiro mount | Explicação + botão grande "Permitir acesso à câmera" | off |
| 2 | Permissão negada | usuário negou | Mensagem + botão "Abrir configurações" (`Linking.openSettings`) | off |
| 3 | Carregando viagem | query `['activeTrip']` em `pending` | `ActivityIndicator` + "Carregando viagem..." | off |
| 4 | Sem viagem ativa | `activeTrip` null ou `COMPLETED` | "Nenhuma viagem ativa" + botão "Ir para Viagem" → `/(driver)/trip` | off |
| 5 | Pronto para escanear | permissão ok + viagem `ACTIVE` | Câmera + moldura de alto contraste + contador da sessão | **on** |
| 6 | Verificando | QR lido, POST em voo | Overlay neutro "Verificando..." + spinner | pausada |
| 7 | ✅ Sucesso | `201` | Overlay **verde**, ✓, "Embarque confirmado" | pausada |
| 8 | ⚠️ Já embarcou | `409 DUPLICATE_CHECK_IN` | Overlay **âmbar**, "Este aluno já embarcou" | pausada |
| 9 | ⛔ Aluno não autorizado | `403 STUDENT_NOT_ALLOWED` | Overlay **vermelho**, "Aluno não autorizado nesta viagem" | pausada |
| 10 | ⛔ QR inválido (local) | `decodeQrPayload` → `null` | Overlay **vermelho**, "QR code inválido" — **sem chamar a API** | pausada |
| 11 | ⛔ QR inválido (servidor) | `400 INVALID_QR_CODE` | Overlay **vermelho**, "QR code inválido" | pausada |
| 12 | ⛔ Viagem não ativa | `409 TRIP_NOT_ACTIVE` | Overlay **vermelho** + botão "Ir para Viagem" | pausada |
| 13 | ⛔ Viagem de outro motorista | `403 DRIVER_NOT_ASSIGNED` | Overlay **vermelho**, "Você não é o motorista desta viagem" | pausada |
| 14 | ⛔ Conflito de chave | `409 IDEMPOTENCY_KEY_CONFLICT` | Overlay **vermelho**, "Erro ao registrar. Tente novamente." | pausada |
| 15 | 📵 Sem conexão | erro de rede / `REQUEST_TIMEOUT` | Overlay **cinza-escuro**, "Sem conexão" + botão "Tentar novamente" (**mesma key**) | pausada |
| 16 | ⛔ Erro desconhecido | qualquer outro `code` | Overlay **vermelho** com a `message` da API — **fallback obrigatório** | pausada |
| 17 | Sessão expirada | `401` com refresh falho | Nada: o `api-client` já faz `logout()` + `router.replace('/(auth)/login')` | — |

**Regras que atravessam a tabela:**

- **Âmbar não é vermelho.** `DUPLICATE_CHECK_IN` significa "o aluno está no ônibus" — o objetivo do motorista foi atingido. Pintar de vermelho ensina o motorista a ignorar vermelho.
- **Erro não auto-retoma.** Estados 8–16 esperam toque explícito em "Escanear próximo". Só o estado 7 (sucesso) auto-retoma, após ~2,5s.
- **Fallback é obrigatório (estado 16).** O contrato tem mais códigos do que a AC #3 lista, e a 3.3a pode ganhar outros. Um `switch` sem `default` transforma código novo em tela em branco.
- **Estado 10 nunca toca a rede.** O contrato é explícito: *"O QR bruto nunca trafega (o app do motorista decodifica e envia campos estruturados)"*.

---

## Decisões já tomadas — não re-decidir, não pesquisar de novo

| Decisão | Valor | Fonte |
|---|---|---|
| Biblioteca de câmera | `expo-camera`, pin do SDK 55 `~55.0.10` | `epics.md#Story 3.3b`; `expo/bundledNativeModules.json` |
| API da câmera | `CameraView` + `useCameraPermissions()` | docs expo-camera (a API `Camera`/`BarCodeScanner` legada não existe mais) |
| Formato do QR | JSON compacto UTF-8, **sem base64**, 2 campos | `QrCodePayloadDto` no contrato |
| Codificação | `encodeQrPayload` já existe (3.2b) — esta story adiciona o par `decodeQrPayload` no **mesmo arquivo** | `src/utils/qr-payload.ts` |
| Origem da `X-Idempotency-Key` | UUID v4 gerado no cliente, uma por tentativa, via `Crypto.randomUUID()` (`expo-crypto` já instalado) | `architecture.md#5 Tier 2` |
| Onde a key é gerada | Na **tela**, não no serviço — a 3.4b precisa reusar a key vinda da fila | `architecture.md#5 Tier 2` |
| Estado do resultado | Union type discriminado, nunca booleanos | `architecture.md#6 Loading states` |
| Query key da viagem | `['activeTrip']` — **a mesma** de `(driver)/trip.tsx` | review da 3.2b (duas keys para o mesmo endpoint foi finding) |
| Fila offline | **Fora de escopo.** Estado 15 mostra "Tentar novamente", não enfileira | `epics.md#Story 3.4b` |

---

## Tasks / Subtasks

### Task 1 — Dependência: `expo-camera` (AC: 1)

- [ ] 1.1 `cd mobile && npx expo install expo-camera` — deixe o Expo pinar a versão do SDK 55. **É a única dependência autorizada nesta story.** Qualquer outra exige aprovação do Lucas antes de instalar.
- [ ] 1.2 Registrar o config plugin em `app.json#expo.plugins`, com a mensagem de permissão **em português** — sem `cameraPermission`, o iOS fica sem `NSCameraUsageDescription` e o pedido de permissão trava:
  ```json
  ["expo-camera", { "cameraPermission": "O PureUrban usa a câmera para escanear o QR code dos alunos no embarque." }]
  ```
- [ ] 1.3 `npx tsc --noEmit` continua em 0 erros após a instalação.

### Task 2 — `apiClient` com headers por requisição (AC: 2, 3) — Bloqueador 1

- [ ] 2.1 Adicionar um parâmetro opcional `extraHeaders?: Record<string, string>` a `request<T>()`. Ordem de montagem: **primeiro** os `extraHeaders`, **depois** `Content-Type` e `Authorization` por cima — assim um header de chamada nunca consegue derrubar a autenticação por engano.
- [ ] 2.2 Propagar em `post` e `patch` (`post<T>(path, body?, headers?)`). `get`/`delete` ficam como estão — nenhum consumidor precisa, e ampliar a superfície sem consumidor é código morto.
- [ ] 2.3 **Repassar `extraHeaders` no retry de 401** (`return request<T>(method, path, body, true, extraHeaders)`). Sem isso o retry pós-refresh perde o `X-Idempotency-Key` — ver o aviso no Bloqueador 1.
- [ ] 2.4 Não alterar mais nada do arquivo: timeout, mutex de refresh, `parseResponseJson`, `ApiClientError`, desempacotamento de `{ data }` e o `logout()` do 401 ficam intactos.

### Task 3 — Decodificação do payload do QR (AC: 2, 3)

- [ ] 3.1 Adicionar `decodeQrPayload(raw: string): QrCodePayload | null` a `src/utils/qr-payload.ts` — ao lado de `encodeQrPayload`, para que codificação e decodificação sejam simétricas por construção e mudem juntas.
- [ ] 3.2 Validar de verdade: `JSON.parse` protegido, resultado precisa ser objeto não-nulo, `studentId` e `sessionId` precisam ser strings no formato UUID. Declare a constante de regex de UUID **neste arquivo** — não importe de `src/mocks/`, que não entra no bundle de produção.
- [ ] 3.3 **Retornar `null`, nunca lançar.** O chamador traduz `null` em `INVALID_QR_CODE` local (estado 10 da tabela), sem tocar a rede.
- [ ] 3.4 Cobrir explicitamente: string vazia; QR de outro app (URL, vCard, Wi-Fi); JSON válido sem `studentId`; `studentId` presente mas não-UUID; JSON que decodifica para array ou número.

### Task 4 — `services/boarding.service.ts` (AC: 2)

- [ ] 4.1 Criar `src/services/boarding.service.ts` seguindo o molde fino de `trip.service.ts` / `routes.service.ts`: objeto exportado com métodos sobre `apiClient`, zero lógica de UI.
- [ ] 4.2 Tipos vindos de `@/types/api` — `components['schemas']['CheckInRequestDto']` e `['CheckInResponseDto']`. Nada escrito à mão (`architecture.md#8`, regra 11). Ambos são DTOs de classe e geram tipo correto.
- [ ] 4.3 `checkIn(input: CheckInRequest, idempotencyKey: string)` → `apiClient.post<CheckInResponse>('/api/v1/boarding/check-in', input, { 'X-Idempotency-Key': idempotencyKey })`.
- [ ] 4.4 **Não gerar a key dentro do serviço.** A key pertence à tentativa e é recebida de fora — é o que permite à 3.4b reenviar um item da fila com a key original.
- [ ] 4.5 Não enviar `occurredAt` nesta story (é opcional no contrato e existe para a fila offline). O servidor carimba o horário de processamento.

### Task 5 — Handlers MSW da viagem do motorista (AC: 1, 2) — Bloqueador 2

- [ ] 5.1 Extrair a sentinela de sessão dos mocks para `src/mocks/handlers/session.ts`, com `setMockSessionEmail(email)` e `getMockSessionEmail()`. Atualizar `auth.handlers.ts` e `routes.handlers.ts` para importarem de lá. Motivo: `trip.handlers.ts` também precisa ler a sessão, e importar de `routes.handlers.ts` criaria um ciclo `auth → routes → auth`.
- [ ] 5.2 Criar `src/mocks/handlers/trip.handlers.ts` com estado em memória e `resetTripMocks()` exportado — mesmo padrão de `boarding.handlers.ts`.
- [ ] 5.3 `GET /api/v1/trips/active` → viagem `ACTIVE` cujo `id` é **`MOCK_ACTIVE_TRIP_ID` importado de `boarding.handlers.ts`**. Sem essa importação os dois mocks divergem e todo check-in vira `TRIP_NOT_ACTIVE`.
- [ ] 5.4 `POST /api/v1/trips` e `PATCH /api/v1/trips/:id/end` — suficientes para `(driver)/trip.tsx` funcionar em mocks. Ecoe o `routeId` recebido; não valide se é UUID (a tela ainda manda `'route-placeholder-id'`, e consertar isso é escopo da 3.1).
- [ ] 5.5 Sentinelas de motorista (via `getMockSessionEmail()`), para tornar alcançáveis os estados 4 e 13 da tabela:
  - `motorista-sem-viagem@pureurban.com` → `/trips/active` devolve `null` (estado 4)
  - `motorista-outra-viagem@pureurban.com` → `/trips/active` devolve viagem com `id = MOCK_OTHER_DRIVER_TRIP_ID` (estado 13, `403 DRIVER_NOT_ASSIGNED` no check-in)
  - `motorista-viagem-encerrada@pureurban.com` → `id = MOCK_INACTIVE_TRIP_ID` (estado 12, `409 TRIP_NOT_ACTIVE`)
- [ ] 5.6 Adicionar os três motoristas a `MOCK_USERS` em `auth.handlers.ts` (role `DRIVER`, ids UUID distintos).
- [ ] 5.7 Tipagem: `/trips/active` não tem schema de resposta no contrato, então o shape vem da interface `Trip` de `trip.service.ts` — exatamente o que `routes.handlers.ts` fez com `AssignedRoute`, e pelo mesmo motivo. O envelope de erro continua tipado por `ErrorResponseDto`.
- [ ] 5.8 Registrar em `src/mocks/handlers/index.ts`. Ordem: `auth`, `routes`, `trip`, `boarding`.
- [ ] 5.9 Documentar os três e-mails novos em `.env.example`, no bloco que já existe.

### Task 6 — `components/qr-scanner.tsx` (AC: 1, 3, 5)

- [ ] 6.1 Componente **puro de captura**: recebe `onScan(raw: string)` e `isPaused: boolean`. Não conhece check-in, não faz rede, não conhece códigos de erro.
- [ ] 6.2 `CameraView` com `facing="back"` e `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` — restringir a `qr` evita que um código de barras de mochila dispare uma tentativa.
- [ ] 6.3 **Gate obrigatório:** `onBarcodeScanned={isPaused ? undefined : handleScan}`. Um `if` dentro do callback **não** substitui isto — ver Bloqueador 3.
- [ ] 6.4 Moldura de escaneamento: quadrado central, cantos de alto contraste sobre máscara escura (AC #1, "área de escaneamento clara"). Dimensionar em proporção da largura da tela, não em pixels fixos — a 3.2b teve finding exatamente por medida fixa em devices ≤ 368dp.
- [ ] 6.5 Sem lógica de permissão aqui. O componente assume permissão concedida; quem decide é a tela (Task 7.1).

### Task 7 — Tela `(driver)/scan.tsx` (AC: 1, 2, 3, 4, 5)

- [ ] 7.1 Permissão com `useCameraPermissions()`. Três ramos distintos: não solicitada (estado 1), negada (estado 2, com `Linking.openSettings()`), concedida. Nunca renderize a câmera antes de `granted`.
- [ ] 7.2 Viagem ativa com `useQuery({ queryKey: ['activeTrip'], queryFn: tripService.getActiveTrip })` — **a mesma key de `(driver)/trip.tsx`**. Use `status === 'pending'` para o estado 3, não `isLoading` (com a query pausada offline `isLoading` é `false` e a tela afirmaria "sem viagem ativa" sem nunca ter buscado — finding literal da 3.2b).
- [ ] 7.3 Estado do resultado como union discriminado: `{ kind: 'idle' } | { kind: 'checking' } | { kind: 'success', studentName?: string } | { kind: 'error', code: string, message: string, tone: 'warn' | 'error' | 'offline' }`. Nada de booleanos soltos.
- [ ] 7.4 **Entrar em `checking` de forma síncrona, antes de qualquer `await`.** É esse passo — não a resposta da API — que atende a AC #4 (<2s na percepção do usuário).
- [ ] 7.5 Chave de idempotência: `Crypto.randomUUID()` uma vez por tentativa, guardada junto do QR lido. "Tentar novamente" no estado 15 reenvia com a **mesma** key. Key nova só quando o QR muda — mandar key nova para o mesmo aluno produz `409 DUPLICATE_CHECK_IN` num check-in que já tinha dado certo.
- [ ] 7.6 Traduzir `ApiClientError.code` conforme a Tabela de Verdade (estados 7–16), **com `default` obrigatório** (estado 16). Erro que não é `ApiClientError` (falha de rede crua do `fetch`) e o código `REQUEST_TIMEOUT` caem no estado 15.
- [ ] 7.7 `decodeQrPayload(raw)` **antes** de qualquer chamada de rede; `null` → estado 10 sem tocar a API.
- [ ] 7.8 Retomada: botão grande "Escanear próximo" sempre visível nos estados 7–16; **só o sucesso** auto-retoma (~2,5s). Limpe o timer no `useEffect` de cleanup — sair da tela com timer vivo faz `setState` em componente desmontado.
- [ ] 7.9 Contador da sessão no topo ("N embarcados nesta sessão") — estado local da tela, zerado ao montar. **Não** é a lista de alunos da 3.5b e não deve tentar sê-la.
- [ ] 7.10 NFR18: alvos de toque ≥ 56dp de altura (o `buttonContent: { height: 56 }` de `(driver)/trip.tsx` é o precedente do repo); texto do overlay ≥ 18sp e em negrito; ações na metade inferior da tela (alcance do polegar); cores de resultado com contraste alto contra o preto da câmera.
- [ ] 7.11 Guarda de role: só `DRIVER`. Espelhe a guarda de `(student)/qr-code.tsx` — um aluno que chegue nesta rota não pode escanear ninguém.

### Task 8 — Navegação até o scanner (AC: 1, 5)

- [ ] 8.1 `(driver)/_layout.tsx` hoje é `<Stack />` nu e as quatro telas herdam o nome cru da rota no header. Trocar por `Stack` com `initialRouteName="trip"` e `Stack.Screen` com título em português para `trip`, `scan`, `student-list` e `routes` — mesmo padrão que a 3.2b aplicou em `(student)/_layout.tsx`.
- [ ] 8.2 Em `(driver)/trip.tsx`, adicionar botão "Escanear QR Code" **visível apenas quando `activeTrip.status === 'ACTIVE'`** (o bloco do Estado 2/4 da tela), com `router.navigate('/(driver)/scan')`. Use `navigate`, não `push`: duplo toque com `push` empilha duas telas de scan, cada uma abrindo sua própria câmera.
- [ ] 8.3 Contagem de toques (NFR19): login leva o motorista a `/(driver)/trip` (0 toques) → 1 toque em "Escanear QR Code" → câmera aberta. **Não** introduza telas intermediárias.
- [ ] 8.4 Nada além disso em `trip.tsx`. A tela pertence à Story 3.1, que está em `review` — o placeholder `PLACEHOLDER_ROUTE_ID` e o "Alunos: 0/0 (em breve)" **ficam como estão**.

### Task 9 — Verificação (todas as ACs)

- [ ] 9.1 `cd mobile && npx tsc --noEmit` → **0 erros**. A baseline desta branch já é 0 — qualquer erro é seu.
- [ ] 9.2 `cd mobile && npm run lint` → limpo (0 erros, 0 warnings). Baseline desta branch já é limpa.
- [ ] 9.3 Roteiro manual com `EXPO_PUBLIC_USE_MOCKS=1`, registrando o resultado de cada linha no Debug Log:
  | Caso | Como reproduzir | Estado esperado |
  |---|---|---|
  | Caminho feliz | login `motorista@pureurban.com` → Escanear → QR de `aluno@pureurban.com` | 7 (verde) |
  | Duplicata | escanear o mesmo aluno de novo | 8 (âmbar) |
  | Aluno fora do roster | QR de um `studentId` UUID qualquer | 9 (vermelho) |
  | QR estranho | apontar para um QR de URL qualquer | 10, **sem tráfego de rede** |
  | Viagem encerrada | login `motorista-viagem-encerrada@pureurban.com` | 12 |
  | Outro motorista | login `motorista-outra-viagem@pureurban.com` | 13 |
  | Sem viagem | login `motorista-sem-viagem@pureurban.com` | 4 |
  | Sem rede | modo avião com mocks desligados | 15 + "Tentar novamente" |
  | Rajada | manter o QR parado na frente da câmera por 5s | **exatamente um** POST |
  | Permissão | negar a permissão de câmera | 2 + botão de configurações |
- [ ] 9.4 Sem regressão no `api/`: nada é tocado lá, nada a rodar. Confirme que o `File List` final não contém nenhum caminho `api/`.

---

## Dev Notes

### Estado atual dos arquivos que serão MODIFICADOS

| Arquivo | Hoje | Esta story muda | Preservar |
|---|---|---|---|
| `src/services/api-client.ts` | `post(path, body)` sem headers; refresh de 401 com mutex; envelope `{ data }` | **Adiciona** `extraHeaders` em `request`/`post`/`patch` e o repasse no retry | Timeout, mutex, `ApiClientError`, `logout()` no 401, desempacotamento de `data` |
| `src/utils/qr-payload.ts` | `QrCodePayload`, `buildQrPayload`, `encodeQrPayload` (13 linhas) | **Adiciona** `decodeQrPayload` | A ordem fixa de chaves em `encodeQrPayload` — é o que torna o QR do aluno pixel-idêntico entre renders |
| `src/app/(driver)/scan.tsx` | Placeholder de 9 linhas | Tela real | — |
| `src/app/(driver)/_layout.tsx` | `<Stack />` nu | `initialRouteName` + títulos das 4 telas | — |
| `src/app/(driver)/trip.tsx` | Tela completa da 3.1 (start/end, cards, chips) | **Só** o botão "Escanear QR Code" no ramo `ACTIVE` | Todo o resto — a story 3.1 está em `review` |
| `src/mocks/handlers/auth.handlers.ts` | 6 usuários mock, rotação real de refresh token | **Adiciona** 3 motoristas sentinela | `findMockUser` com `Object.hasOwn`, a rotação, `REFRESH_FAILURE_EMAIL` |
| `src/mocks/handlers/routes.handlers.ts` | Sentinelas de sessão com `currentSessionEmail` privado | Passa a importar de `session.ts` | Os três e-mails sentinela do aluno e o comportamento de `/routes/mine` |
| `src/mocks/handlers/index.ts` | `[...auth, ...routes, ...boarding]` | `+trip` | A ordem (mais específicos primeiro) |
| `.env.example` | Documenta flags, IDs do boarding e credenciais mock | +3 motoristas | Todo o bloco existente |
| `app.json` | 3 plugins (`expo-router`, `expo-splash-screen`, `expo-sqlite`) | +`expo-camera` com `cameraPermission` | `experiments.typedRoutes`, `reactCompiler` |

### Padrões que já existem — não reinventar

- **HTTP:** `apiClient` já faz header de auth, timeout de 30s, refresh automático em 401, `logout()` + redirect e desempacota `{ data }`. Nunca `fetch` direto. Esta story **estende** o cliente; não cria um segundo.
- **Serviço por domínio:** `auth.service.ts`, `trip.service.ts`, `routes.service.ts` são o molde — objeto exportado, métodos finos, zero UI. `boarding.service.ts` segue igual.
- **Erros de negócio:** `ApiClientError` carrega `code`, `message`, `status`, `details`. É a única coisa que você precisa inspecionar para montar o feedback.
- **UI:** `react-native-paper` com `PaperProvider` já montado no `_layout.tsx` raiz; tema em `src/lib/theme.ts` (primária `#208AEF`). `(driver)/trip.tsx` é a referência viva de botão grande (`height: 56`) e `(driver)/routes.tsx` de `Card` + `RefreshControl` + `Snackbar`.
- **Mocks:** `boarding.handlers.ts` é o padrão de qualidade a imitar — tipagem a partir de `operations[...]`, estado em memória compartilhado, `resetXMocks()` exportado, comentário explicando *por que* cada ramo existe.
- **Cache offline (Tier 1):** `PersistQueryClientProvider` + `mmkvPersister` já ligados; `gcTime`/`maxAge` de 24h. Uma `useQuery` comum herda a persistência. **Mas veja o defer sobre `onlineManager` em *Previous Story Intelligence*** — a metade "refetch ao reconectar" não funciona.
- **UUID:** `Crypto.randomUUID()` de `expo-crypto`, já instalado e já usado em `auth.store.ts`. Não escreva gerador caseiro (o `mockUuid()` de `boarding.handlers.ts` existe só porque mocks não devem depender de módulo nativo).

### Fora de escopo (não fazer nesta story)

- **Fila de escrita offline (`expo-sqlite`, `utils/offline-queue.ts`, `hooks/use-offline-sync.ts`)** — é a Story 3.4b inteira. Aqui, sem rede, a tela mostra "Tentar novamente" (estado 15) e pronto.
- **Lista de alunos / roster / contagem `{ boarded, total }`** — Story 3.5b. O contador da Task 7.9 é local da sessão de escaneamento, não a lista.
- **`stores/boarding.store.ts`** — `architecture.md#7` prevê o arquivo, mas nada nesta story precisa de estado global. Criar um store sem leitor é exatamente o "reinventar roda" que a story quer evitar. Ele nasce na 3.5b.
- **Qualquer arquivo em `api/`** — story 100% mobile. A 3.3a já está `done`; não a toque.
- **Regenerar `api/openapi.json` ou `src/types/api.d.ts`** — o contrato da 3.0 já declara tudo que esta story consome. Editar `api.d.ts` à mão é violação de contrato (`architecture.md#8`, regra 11).
- **Apontar o `api-client` para a API real / desligar os mocks** — é a Story 3.6 (AC #6).
- **Introduzir framework de testes no mobile** — ver *Testing Requirements* e *Questões Abertas* #1.
- **Corrigir `constants.ts` para ler `EXPO_PUBLIC_API_URL`** — continua hardcoded, continua divergindo do `.env.example`. Aberta desde a 3.2b (*Questões Abertas* #2 de lá).
- **Montar o nav shell definitivo (`AppTabs` ainda tem as abas `index`/`explore` do starter)** — deferido para a 3.6. Esta story entrega o caminho motorista→scan a partir do login, como a 3.2b entregou aluno→QR.
- **`expo-haptics` / feedback sonoro** — a AC #3 pede feedback **visual**. Candidato óbvio a melhoria, mas é dependência nova e não está autorizada.

### Previous Story Intelligence

- **3.0 (contrato, `done`)** congelou `QrCodePayloadDto` com exatamente dois campos, a codificação (JSON puro, sem base64) e o header `X-Idempotency-Key` como `required`. Um terceiro campo no payload quebraria a 3.2b silenciosamente.
- **3.2b (mobile, `done` nesta branch)** é a metade emissora do seu QR. `encodeQrPayload` é a função que produz exatamente o que você vai decodificar — leia-a antes de escrever `decodeQrPayload`. O aluno mock `aluno@pureurban.com` tem `studentId` `660e8400-…440010`, que é membro do roster de `boarding.handlers.ts`: **o QR que a tela do aluno gera é aceito pelo seu check-in mockado**. Esse alinhamento é intencional e é o que torna o roteiro da Task 9.3 possível sem backend.
- **3.3a (backend, `done`)** já implementou o endpoint real, com idempotência e todos os tagged errors. Consequência prática: os códigos da Tabela de Verdade não são hipotéticos — são o que a API real devolve na 3.6. Um mapeamento incompleto aqui vira bug lá.
- **3.5a (backend, `done`)** definiu os status do roster e o `summary`. Você não consome nada disso, mas o estado compartilhado de `boarding.handlers.ts` faz seu check-in aparecer em `GET /trips/:id/students` — o que a 3.5b vai usar.
- **Defer da 3.0 endereçado por esta story:** headers por requisição no `api-client` (Bloqueador 1). Marque-o como resolvido nas Completion Notes.
- **Defer da 3.2b que te atrapalha:** `onlineManager` do TanStack Query **nunca foi conectado ao NetInfo** — nem `NetInfo` nem `onlineManager` aparecem em `mobile/src`. O `OnlineManager` padrão nasce com `#online = true` e só instala listeners onde existe `window.addEventListener`, ou seja, é inerte no React Native. Efeito para você: **nenhuma query pausa offline** e nenhuma refaz fetch ao reconectar; sem rede, a `useQuery(['activeTrip'])` queima o retry ladder inteiro com backoff. Não conserte aqui — é infraestrutura compartilhada, candidata a story técnica antes da 3.4b. Apenas não assuma que "offline" se comporta bem.
- **Defer da 3.2b que contextualiza sua tela:** o `sessionId` é opaco para o backend no MVP — o check-in valida `studentId` e roster, não a sessão. Ou seja, `decodeQrPayload` valida o formato do `sessionId` mas ele não protege nada ainda. Está coerente com a NFR8 ("segurança suficiente para protótipo"); registrado para ser consciente, não para ser consertado aqui.
- **Findings do review da 3.2b que se aplicam literalmente a esta tela:** (a) duas query keys para o mesmo endpoint → use `['activeTrip']`; (b) `isLoading` em vez de `status === 'pending'` com query pausada; (c) medida fixa em px estourando devices ≤ 368dp; (d) `push` em vez de `navigate` empilhando telas no duplo toque; (e) ausência de guarda de role. **Cinco dos dezessete findings da 3.2b têm equivalente direto aqui** — as Tasks 7.2, 6.4, 8.2 e 7.11 existem para preveni-los.

### Git Intelligence

Últimos commits: `55427c8` (3.2b, mobile) ← `ae10948` ← `4972cbc` ← `7097187` (merge da 3.5a). Esta branch parte de `55427c8`, e **não de `main`**: a 3.2b ainda está em PR aberta (#5), e partir de `main` significaria (a) criar um `qr-payload.ts` concorrente com o dela, num arquivo onde encoder e decoder precisam ser simétricos, e (b) herdar uma baseline de `tsc` com 2 erros. Consequência para você: **a PR desta story só fica limpa depois que a #5 for mergeada**.

Baseline verificada nesta branch, agora: `npx tsc --noEmit` → 0 erros; `npm run lint` → limpo.

Convenção de commit do repo: `feat(escopo): descrição em inglês, imperativo` + `(story X.Y)` no fim. Ex.: `feat(boarding): scan student QR code and register check-in (story 3.3b)`.

### Latest Tech Information (verificado em 2026-08-23)

- **`expo-camera`, pin do SDK 55: `~55.0.10`** (de `node_modules/expo/bundledNativeModules.json` — autoridade sobre qualquer versão do npm).
- **API atual:** `CameraView` (componente) + `useCameraPermissions()` (hook, devolve `[PermissionResponse | null, requestPermission, getPermission]`). As APIs `Camera` e `expo-barcode-scanner` foram removidas — qualquer tutorial que as use está desatualizado.
- **`onBarcodeScanned`** recebe `BarcodeScanningResult`: `{ type, data, bounds, cornerPoints, extra? }`. **`data` é a string do QR** — é o que entra em `decodeQrPayload`. Tipos suportados incluem `'qr'`; restrinja via `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`.
- **Disparo repetido:** confirmado como comportamento conhecido da lib, com frequência variando por device e por versão do SDK. O gate suportado é passar `undefined` no lugar do handler. Ver Bloqueador 3.
- **Config plugin:** `cameraPermission` (string iOS → `NSCameraUsageDescription`) e `barcodeScannerEnabled` (default `true`). No Android a permissão `CAMERA` é adicionada automaticamente.
- **Alerta de versão:** [expo/expo#44491](https://github.com/expo/expo/issues/44491) reportou, no SDK 55 com `expo-camera ~55.0.13`, o warning `🟡 Barcode scanning has been disabled` no iOS — `ZXingObjC` não era linkado quando o projeto usa `useFrameworks: "static"` do `expo-build-properties`. Foi corrigido ([PR #44635](https://github.com/expo/expo/pull/44635)). **Este projeto não usa `expo-build-properties`**, então não deve ser atingido; se o warning aparecer, atualize `expo-camera` em vez de investigar o próprio código.
- **Expo Go:** `expo-camera` vem embutido, então o scanner roda sem prebuild. Em dev client, o módulo nativo exige rebuild.
- **Web:** `CameraView` funciona, mas só QR. Irrelevante aqui — `expo start --web` já falha na baseline por um erro pré-existente de `expo-sqlite`/`wa-sqlite.wasm` (ver Debug Log da 3.2b).

### Testing Requirements

**Continua não existindo test runner no `mobile/`** — as `devDependencies` são `@types/react`, `eslint`, `eslint-config-expo`, `openapi-typescript`, `typescript`. **Não introduza um nesta story** (ver *Questões Abertas* #1).

O que vale como verde aqui:

- `npx tsc --noEmit` → **0 erros**. É o teste de conformidade de contrato: `boarding.service.ts` tipado por `components['schemas']['CheckInRequestDto']` não compila se divergir do `openapi.json`, e o mesmo vale para os handlers MSW tipados a partir de `operations[...]`.
- `npm run lint` limpo.
- **Roteiro manual da Task 9.3 executado e registrado**, com atenção especial às três linhas que só aparecem fora do caminho feliz: **rajada** (prova do Bloqueador 3), **sem rede** (estado 15) e **permissão negada** (estado 2).
- Sem regressão no `api/`: nada a rodar, porque nada lá é tocado.

> Se o roteiro manual não puder ser executado (ambiente sem emulador/device), **diga isso explicitamente nas Completion Notes e deixe as subtasks correspondentes desmarcadas** — foi finding de review na 3.2b marcar `[x]` em verificação não executada.

### Project Structure Notes

```
mobile/
├── app.json                                    # [UPDATE] +plugin expo-camera (cameraPermission)
├── .env.example                                # [UPDATE] +3 motoristas sentinela
├── package.json / package-lock.json            # [UPDATE] +1 dep: expo-camera
└── src/
    ├── app/(driver)/
    │   ├── _layout.tsx                         # [UPDATE] Stack nu → initialRouteName + títulos
    │   ├── scan.tsx                            # [UPDATE] placeholder → tela real
    │   └── trip.tsx                            # [UPDATE] +1 botão "Escanear QR Code" (nada mais)
    ├── components/qr-scanner.tsx               # [NEW] captura pura: CameraView + moldura + gate
    ├── mocks/handlers/
    │   ├── session.ts                          # [NEW] sentinela de sessão (extraída de routes.handlers)
    │   ├── trip.handlers.ts                    # [NEW] /trips/active, POST /trips, PATCH /trips/:id/end
    │   ├── auth.handlers.ts                    # [UPDATE] +3 motoristas, import de session.ts
    │   ├── routes.handlers.ts                  # [UPDATE] import de session.ts
    │   └── index.ts                            # [UPDATE] registrar tripHandlers
    ├── services/
    │   ├── api-client.ts                       # [UPDATE] headers por requisição (+repasse no retry de 401)
    │   └── boarding.service.ts                 # [NEW] checkIn(input, idempotencyKey)
    └── utils/qr-payload.ts                     # [UPDATE] +decodeQrPayload (par de encodeQrPayload)
```

`utils/offline-queue.ts`, `hooks/use-offline-sync.ts`, `stores/boarding.store.ts` e `student-card.tsx` aparecem em `architecture.md#Estrutura do Mobile` mas pertencem às stories 3.4b/3.5b. **Nenhum arquivo em `api/` nesta story.**

Nomes seguem `project-context.md`: arquivo em `kebab-case`, export em `PascalCase` para componentes; alias `@/*` obrigatório em imports internos.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3b] — ACs, camada, dependências, FR16, NFR1/NFR18
- [Source: _bmad-output/planning-artifacts/epics.md#Convenção de Fatiamento] — regra das stories `X.Yb`: desenvolver contra MSW, tipos gerados nunca à mão
- [Source: _bmad-output/planning-artifacts/prd.md#FR16,FR20,NFR1,NFR18,NFR19] — escaneamento, rejeição de QR inválido, 2s, uma mão, 2 toques
- [Source: _bmad-output/planning-artifacts/architecture.md#5] — Tier 2: `X-Idempotency-Key` é UUID v4 do cliente e é a chave da fila; Tier 1 já ligado
- [Source: _bmad-output/planning-artifacts/architecture.md#6] — padrões mobile: erros via Snackbar, loading states como union type, nunca booleanos
- [Source: _bmad-output/planning-artifacts/architecture.md#7] — `(driver)/scan.tsx`, `components/qr-scanner.tsx`, `services/boarding.service.ts` no desenho oficial
- [Source: _bmad-output/planning-artifacts/architecture.md#8] — regra 11 (tipos gerados) e regra 12 (trilha mobile roda contra MSW)
- [Source: _bmad-output/planning-artifacts/architecture.md#12] — contrato como artefato versionado; drift check
- [Source: _bmad-output/project-context.md] — MMKV nunca AsyncStorage, alias `@/*`, kebab-case, Zustand por domínio
- [Source: api/openapi.json#paths./api/v1/boarding/check-in] — **autoridade final** do endpoint, do header e dos códigos de erro
- [Source: mobile/src/types/api.d.ts:1885-1950] — `BoardingController_checkIn`: header obrigatório e os quatro status de erro com os códigos de cada um
- [Source: mobile/src/types/api.d.ts:458-471] — `QrCodePayloadDto`: dois campos, JSON UTF-8 sem base64
- [Source: mobile/src/types/api.d.ts:503-520] — `CheckInRequestDto`: `studentId`, `tripId`, `occurredAt?`
- [Source: mobile/src/mocks/handlers/boarding.handlers.ts] — ordem de validação do mock, IDs sentinela de viagem, roster e replay de idempotência
- [Source: mobile/src/mocks/handlers/routes.handlers.ts] — precedente de handler tipado pela interface do serviço quando o contrato não declara schema
- [Source: mobile/src/mocks/handlers/auth.handlers.ts] — `MOCK_USERS`, rotação de refresh token, `setMockSessionEmail`
- [Source: mobile/src/services/api-client.ts] — assinatura a estender, retry de 401 e `ApiClientError`
- [Source: mobile/src/utils/qr-payload.ts] — `encodeQrPayload`, o par simétrico do que esta story escreve
- [Source: mobile/src/app/(driver)/trip.tsx] — botões de 56dp, query key `['activeTrip']`, ramo `ACTIVE` onde o botão de scan entra
- [Source: mobile/src/app/(student)/qr-code.tsx] — padrão de guarda de role, `status === 'pending'`, estados distintos de empty/error
- [Source: _bmad-output/implementation-artifacts/3-2b-geracao-e-exibicao-de-qr-code-do-aluno.md#Review Findings] — os 17 findings; cinco têm equivalente direto nesta tela
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — defer da 3.0 sobre headers do `api-client` (endereçado aqui) e defer da 3.2b sobre `onlineManager`
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-05-11.md#Ações] — ação #4: padrões mobile (query keys segmentadas, empty ≠ error)
- [Source: https://docs.expo.dev/versions/latest/sdk/camera/] — `CameraView`, `useCameraPermissions`, `BarcodeScanningResult`, config plugin
- [Source: https://github.com/expo/expo/issues/44491] — regressão de barcode scanning no SDK 55 com `useFrameworks: "static"` (corrigida)

---

## Questões Abertas (para o Lucas, não bloqueiam o dev)

1. **O `mobile/` continua sem nenhum teste automatizado — e esta story piora o argumento.** `decodeQrPayload` é uma função pura de validação de entrada não confiável (é literalmente o que separa um QR de pôster de um check-in), e o mapa de código-de-erro → feedback é tabela pura. As duas coisas são triviais de testar e caras de verificar no olho. Aberto desde a 3.2b; a 3.4b (fila offline, retry, backoff, idempotência entre reinícios) é praticamente impossível de validar manualmente. **Recomendação: uma story técnica de `jest-expo` antes da 3.4b.**

2. **A `X-Idempotency-Key` protege contra reenvio, não contra rajada.** A Task 6.3 impede a rajada no cliente, mas se a proteção falhar em algum device, a segunda requisição chega com key nova e o servidor a trata como duplicata legítima (`DUPLICATE_CHECK_IN`) — comportamento correto do contrato, feedback ruim para o motorista. Uma alternativa seria derivar a key de `(tripId, studentId)` em vez de aleatória, o que tornaria a rajada idempotente de verdade — mas quebraria a semântica que a 3.4b precisa (a key é o id do item da fila, e o mesmo aluno pode legitimamente ter check-in em duas viagens). **Fica como está; registrado para a defesa do TCC.**

3. **`(driver)/student-list.tsx` continua um placeholder de 9 linhas** e o `(driver)/_layout.tsx` desta story vai dar um título em português a uma tela vazia. É a Story 3.5b. Só sinalizo porque, com a navegação arrumada, a tela vazia passa a ser alcançável — antes ninguém chegava nela.

4. **A PR desta story depende da #5.** A branch parte de `feat/3-2b-qr-code-do-aluno`. Enquanto a #5 não for mergeada, a PR da 3.3b vai mostrar os commits da 3.2b junto. Se preferir, mergeie a #5 primeiro e eu rebaseio.

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
