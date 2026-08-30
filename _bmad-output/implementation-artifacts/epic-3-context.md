# Epic 3 Context: Gestão de Viagens e Embarque Digital

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Este épico entrega o fluxo principal do produto ponta a ponta: o motorista inicia uma viagem para sua rota, cada aluno apresenta um QR code exclusivo, o motorista escaneia e registra o embarque, e a lista de alunos da viagem se atualiza em tempo real com uma contagem resumida (ex.: "28/32 embarcados"). É a substituição digital da carteirinha física — o núcleo do valor do PureUrban para as jornadas do Carlos (aluno) e do Seu João (motorista). O check-in precisa funcionar mesmo sem sinal de internet, com sincronização automática e sem duplicatas quando a conexão retorna, porque parte da rota passa por trechos sem cobertura. O épico só é considerado entregue quando a integração real (sem mocks) prova o fluxo completo com testes E2E.

## Stories

- Story 3.0: Contrato de API — Embarque Digital
- Story 3.1: Iniciar e Encerrar Viagem (Backend + Mobile Motorista) — já entregue, em review, não refatiada
- Story 3.2b: Geração e Exibição de QR Code do Aluno (Mobile Aluno)
- Story 3.3a: Check-in de Embarque (Backend)
- Story 3.3b: Escaneamento de QR Code (Mobile Motorista)
- Story 3.4b: Check-in Offline com Fila de Sincronização (Mobile Motorista)
- Story 3.5a: Lista de Alunos da Viagem com Status (Backend)
- Story 3.5b: Lista de Alunos e Status de Embarque (Mobile Motorista)
- Story 3.6: Integração e E2E do Épico 3

## Requirements & Constraints

**Escopo funcional:** viagens de ida e retorno com registro de horários de início e fim; QR code do aluno gerado localmente no dispositivo (nenhuma chamada à API), estático por sessão de login; escaneamento pelo motorista via câmera; registro de check-in com timestamp e identidade do aluno; validação de que o aluno está ativo e vinculado à rota da viagem; rejeição tipada de QR inválido, aluno sem permissão, viagem não ativa e check-in duplicado; check-in offline enfileirado e sincronizado; lista de alunos da viagem com status agregado por aluno (`CHECKED_IN`, `NOT_CHECKED_IN`, `NOT_RETURNING`) e contagem resumida calculada no servidor.

**Estados válidos:** viagem tem `status` (`ACTIVE` → `COMPLETED`) e `type` (`OUTBOUND` / `RETURN`); só role `driver` inicia/encerra viagens e escaneia; só o motorista atribuído à rota acessa a lista daquela viagem.

**Não-funcionais que guiam o design:**
- Check-in processado em menos de 2s no cenário online; feedback visual ao motorista percebido em menos de 2s.
- Lista de alunos carrega em menos de 1s mesmo com 50+ alunos por rota.
- Persistência offline sem perda mesmo com crash do app; sincronização com resolução automática de conflitos (last-write-wins, com a regra de domínio de que o check-in do motorista tem autoridade sobre a ausência do aluno).
- Interface do motorista operável com uma mão, botões grandes, alto contraste; fluxo do QR do aluno em no máximo 2 toques.
- Toda query filtrada por `companyId`; todo endpoint protegido por `TenantGuard` + `@Roles()`.

**Marco de entrega:** a Story 3.6 desliga os handlers MSW, aponta o `api-client.ts` para a API real, roda o drift check do `openapi.json` e cobre por E2E o caminho feliz, a rejeição de QR inválido e o cenário offline (check-in sem rede → reconexão → sincronização sem duplicata).

## Technical Decisions

**Convenção de fatiamento (exclusiva do Épico 3):** as stories são fatiadas por trilha de execução, não em fatias verticais. Sufixos: `X.0` = contrato (DTOs, controllers stub retornando `501`, decorators Swagger, `openapi.json` commitado, tipos gerados no mobile, handlers MSW); `X.Ya` = backend (functional core Effect + shell NestJS + adapters + testes de domínio); `X.Yb` = mobile (telas, stores, services, offline, desenvolvido contra os handlers MSW); `X.N` = integração + E2E. A story `X.0` é bloqueante para as duas trilhas. Nenhum endpoint aparece numa story de backend sem estar no contrato da `X.0`. Tipos de API no mobile são gerados de `api/openapi.json` via `openapi-typescript` — nunca escritos à mão. A partir do Épico 4 o projeto voltou ao fatiamento vertical e removeu a camada de mock; isso não afeta o Épico 3, que termina sob o modelo de trilhas.

**Bounded contexts envolvidos:** `trip` (iniciar/encerrar viagem, lista de alunos da viagem — `GET /api/v1/trips/:id/students`) e `boarding` (check-in — `POST /api/v1/boarding/check-in`). Schemas PostgreSQL separados; proibido JOIN entre contextos. Toda entidade tem `id` (UUID), `createdAt`, `updatedAt`, `companyId` e `@@schema("contexto")`.

**Functional Core / Imperative Shell:** lógica de domínio só no core Effect (use cases retornando `Effect<A, E, R>` com erros declarados no tipo); zero imports de NestJS/Prisma/Redis em `core/`. Erros de domínio são tagged errors convertidos pelo `EffectExceptionFilter` em HTTP `{ error: { code, message, details? } }`. Sucesso segue `{ data, meta }`. Use cases retornam `WithEvents<A>`; o shell despacha via `EventEmitter2`. Eventos deste épico: `trip.started`, `trip.ended`, `boarding.checked_in` — todos internos ao backend (não são contrato de cliente, não há stream SSE no Épico 3).

**Contrato de check-in:** payload do QR code é schema compartilhado com `studentId` e `sessionId` mais formato de codificação — é o contrato entre a tela do aluno (3.2b) e a validação do backend (3.3a). Endpoints de escrita documentam o header `X-Idempotency-Key`. Códigos de erro tipados: `INVALID_QR_CODE`, `STUDENT_NOT_ALLOWED`, `TRIP_NOT_ACTIVE`, `DUPLICATE_CHECK_IN`.

**Idempotência (propriedade do endpoint, não do offline):** o use case de check-in recebe a chave de idempotência como parâmetro; o adapter verifica existência (`WHERE idempotency_key = ? AND trip_id = ?`) antes de inserir e retorna o resultado anterior sem reprocessar. Implementada na Story 3.3a para que a fila offline da 3.4b possa reenviar sem duplicar.

**Offline (Architecture §5):** Tier 1 (leitura) = TanStack Query com `persistQueryClient` sobre MMKV — cobre a lista de alunos offline. Tier 2 (escrita) = fila em `expo-sqlite`, apenas para check-ins: FIFO por `created_at`, limite de 500 itens, id UUID v4 do cliente como chave de idempotência, backoff exponencial 1s→2s→4s→8s→max 30s, máximo 5 tentativas por item (depois `failed` + aviso ao usuário). A UI da fila foi enxugada para um banner global "Modo Offline — dados serão sincronizados" (sem badge por item).

**Contagem resumida:** `{ boarded, total }` (ou `{ boarded, total }` exibido como "28/32") é calculada no backend e retornada pela lista — o cliente não computa.

**Ambiente de execução:** desenvolvimento e verificação no alvo web (`npm run web`); Expo Go não é alvo. Substituições no web: `localStorage` no lugar do MMKV, wa-sqlite (WASM/OPFS) no lugar do expo-sqlite nativo, `getUserMedia` + `useWebBarcodeScanner` no lugar do expo-camera. A leitura de QR em `(driver)/scan.tsx` funciona via webcam. Nenhuma story mobile é `done` sem execução verificada no web. O shell de navegação (Story 1.8) e o seed corrigido (Story 1.9) são pré-requisitos de infraestrutura.

## UX & Interaction Patterns

- **Aluno — QR code (`(student)/qr-code.tsx`):** QR exibido em no máximo 2 toques a partir da entrada no app; tela mostra nome do aluno e rota vinculada; QR estático durante a sessão de login.
- **Motorista — escaneamento (`(driver)/scan.tsx`):** câmera abre rápido com área de escaneamento clara; sucesso e cada código de erro do contrato têm feedback visual distinto e legível em movimento; retorno percebido em menos de 2s; tela operável com uma mão, botões grandes, alto contraste.
- **Motorista — lista de alunos (`(driver)/student-list.tsx`):** todos os alunos da rota com status (`embarcou`, `não embarcou`, `não vai voltar`); contagem resumida no topo; um check-in feito na tela de scan reflete na lista sem recarregar; lista legível sem rede (cache Tier 1).
- **Motorista — viagem (`(driver)/trip.tsx`):** viagem ativa com status e contagem; ação para iniciar viagem de retorno na mesma rota após encerrar a ida.
- Toasts/snackbars do React Native Paper para erros de negócio; estado de loading via union types, nunca booleanos soltos.

## Cross-Story Dependencies

- **3.0 bloqueia tudo:** nenhuma trilha (backend ou mobile) começa antes do contrato existir e estar commitado.
- **3.2b, 3.3b, 3.5b** dependem apenas de 3.0 (desenvolvem contra MSW); **3.4b** depende de 3.3b e da Story 1.8 (shell de navegação).
- **3.3a** depende de 3.0; **3.5a** depende de 3.3a (precisa do modelo de check-in para agregar status).
- **3.6** depende de todas as anteriores (1.8, 3.2b, 3.3a, 3.3b, 3.4b, 3.5a, 3.5b) e é o marco demonstrável do épico.
- **Dependências externas:** Épico 2 concluído (auth, roles, rotas, vínculos aluno-rota e motorista-rota, `GET /api/v1/routes/mine`); Story 3.1 já entrega o modelo de viagem consumido por 3.3a e 3.5a; Stories 1.8 e 1.9 (infraestrutura mobile e seed) precisam estar fechadas.
- **Para o Épico 4:** o status `NOT_RETURNING` já aparece no contrato da lista (3.0/3.5a) mas só é escrito no Épico 4; o evento `boarding.checked_in` permanece interno até ser eventualmente exposto.
