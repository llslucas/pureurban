# DOCUMENTO DE ARQUITETURA DE SOFTWARE

**PureUrban — Plataforma de Gestão de Transporte Universitário Intermunicipal**

---

| Campo | Informação |
|---|---|
| **Identificação** | PU-SAD-001 |
| **Projeto** | PureUrban |
| **Tipo de Documento** | Documento de Arquitetura de Software (Software Architecture Document — SAD) |
| **Versão** | 1.2 |
| **Status** | Vigente |
| **Classificação** | Restrito — Uso Acadêmico e Interno |
| **Data de Criação** | 15 de março de 2026 |
| **Última Revisão** | 10 de maio de 2026 |
| **Autor** | Lucas |
| **Documento de Referência** | PU-PRD-001 — Documento de Requisitos do Produto |
| **Contexto Acadêmico** | Trabalho de Conclusão de Curso — Bacharelado em Engenharia de Software |

---

## Histórico de Revisões

| Versão | Data | Autor | Descrição das Alterações |
|---|---|---|---|
| 1.0 | 15/03/2026 | Lucas | Criação do documento baseado no PRD (PU-PRD-001) |
| 1.1 | 31/03/2026 | Lucas | Prazo estendido para dezembro/2026; equipe ampliada para 2 desenvolvedores; simplificação do offline sync em tiers; CI/CD e testes E2E incorporados ao MVP |
| 1.2 | 10/05/2026 | Lucas | Revisão de formato e adequação para entrega formal |

---

## Sumário

1. [Visão Geral e Restrições Arquiteturais](#1-visão-geral-e-restrições-arquiteturais)
2. [Integração Effect TS e NestJS](#2-integração-effect-ts-e-nestjs)
3. [Decisões Arquiteturais](#3-decisões-arquiteturais)
4. [Domain Events Funcionais](#4-domain-events-funcionais)
5. [Estratégia de Sincronização Offline](#5-estratégia-de-sincronização-offline)
6. [Padrões de Implementação e Regras de Consistência](#6-padrões-de-implementação-e-regras-de-consistência)
7. [Estrutura do Projeto e Fronteiras Arquiteturais](#7-estrutura-do-projeto-e-fronteiras-arquiteturais)
8. [Regras Obrigatórias](#8-regras-obrigatórias)
9. [Sequência de Implementação](#9-sequência-de-implementação)
10. [Divisão de Trabalho](#10-divisão-de-trabalho)
11. [Análise de Lacunas e Prontidão](#11-análise-de-lacunas-e-prontidão)
12. [Glossário](#12-glossário)
13. [Referências](#13-referências)

---

## 1. Visão Geral e Restrições Arquiteturais

### 1.1 Contexto do Projeto

Este documento descreve as decisões arquiteturais do PureUrban, uma plataforma composta por aplicativo mobile (Expo/React Native) e API backend (NestJS) para gestão de transporte universitário intermunicipal.

| Atributo | Valor |
|---|---|
| **Domínio** | Gestão de transporte universitário intermunicipal |
| **Complexidade** | Média-Alta — 37 requisitos funcionais em 7 categorias, 20 requisitos não-funcionais |
| **Equipe** | 2 desenvolvedores (Lucas + 1 colaborador) |
| **Prazo do MVP** | Dezembro de 2026 |
| **Distribuição** | Expo Go / build de desenvolvimento — sem publicação em lojas |
| **Dispositivos alvo** | Android 8+ / iOS 13+, telas de 5 polegadas, dispositivos de baixo custo |
| **Natureza acadêmica** | TCC — Arquitetura Hexagonal + DDD + Functional Core/Imperative Shell são parte central da tese, não opcionais |

### 1.2 Pilha Tecnológica

| Camada | Tecnologia | Versão (Março/2026) |
|---|---|---|
| Mobile | Expo SDK (React Native) | 55 |
| Backend | NestJS | v11.1.16 |
| ORM | Prisma | v7.4.2 (`moduleFormat = "cjs"` para compatibilidade NestJS) |
| Functional Core | Effect TS | latest |
| Banco de Dados | PostgreSQL | Via Docker Compose |
| Cache / Pub-Sub | Redis | Via Docker Compose |
| Comunicação em tempo real | SSE nativo NestJS + Redis Pub/Sub | — |

### 1.3 Desafios Arquiteturais Centrais

1. **Coexistência Effect TS + NestJS:** Integrar programação funcional pura com framework orientado a objetos. O Composition Root atua como ponto de encontro entre os dois paradigmas.
2. **SSE + Redis Pub/Sub para tempo real:** Fluxo REST → Redis → Pub/Sub → SSE → cliente, com fallback para polling a cada 10 segundos.
3. **Sincronização offline progressiva:** Cache de leitura via TanStack Query persistido + fila de escrita offline restrita ao check-in (cenário crítico). Estratégia estruturada em tiers — detalhada na Seção 5.
4. **Bounded contexts com Effect TS:** Manutenção dos limites de domínio garantindo que o functional core seja testável de forma isolada.

### 1.4 Decisões Incorporadas ao MVP

| Decisão | Justificativa |
|---|---|
| CI/CD via GitHub Actions | Equipe com 2 desenvolvedores exige pipeline automatizada. Lint + test + build a cada pull request |
| Testes E2E | O prazo permite cobertura com Supertest (API) e/ou Playwright (mobile) |
| Push notifications | A Expo Push API é simples e agrega valor ao produto |

### 1.5 Decisões Diferidas (Pós-MVP / Fase 2)

| Decisão | Justificativa |
|---|---|
| Rate limiting | Sem exposição pública no MVP |
| Refresh token rotation | Refresh simples é suficiente para o protótipo |
| Monitoramento externo (OpenTelemetry) | Logger nativo do NestJS v11 é suficiente para esta fase |
| Cache de listas em Redis | Overhead desnecessário no MVP |
| Reconciliação bidirecional completa de dados offline | Complexidade desproporcional — ver Seção 5 |
| CRDT / Event Sourcing para merge sem conflitos | Trabalho futuro — mencionado na tese |
| Framework dedicado de sync (PowerSync, WatermelonDB) | Avaliar após o MVP |

---

## 2. Integração Effect TS e NestJS

### 2.1 Decisão Arquitetural

**Decisão:** Integração manual via Composition Root, sem bibliotecas de terceiros.

**Justificativa:** A biblioteca `@nestjs-effect` foi avaliada e descartada — 22 estrelas no GitHub, mantenedor único, versão pré-1.0, documentada como "not production-ready", sem atualização há aproximadamente 10 meses no momento da decisão.

### 2.2 Padrão: `useFactory` + `ManagedRuntime`

O imperative shell (NestJS) injeta um runtime do Effect pré-configurado com todas as dependências. A sequência de montagem é a seguinte:

1. **Functional Core (Effect TS puro):** Define interfaces de portas (Tags Effect) e implementa a lógica de domínio. Zero importações de NestJS.
2. **Adapters:** Implementações concretas das portas — utilizam Prisma, Redis e demais tecnologias de infraestrutura.
3. **Composition Root (`EffectRuntimeModule`):** Um factory provider (`useFactory`) do NestJS recebe as dependências de infraestrutura (PrismaService, RedisService), monta os Layers do Effect e instancia um `ManagedRuntime`.
4. **Services do NestJS:** Recebem o runtime via `@Inject('EFFECT_RUNTIME')` e executam programas Effect com `runtime.runPromise(program)`.

### 2.3 Benefícios da Abordagem

| Benefício | Descrição |
|---|---|
| **Inversão de dependência explícita** | O core define interfaces; o shell fornece implementações concretas |
| **Testabilidade em dois níveis** | O core é testável sem NestJS; a integração é testável via substituição de providers |
| **Material para o TCC** | Demonstra a coexistência de dois sistemas de injeção de dependência distintos |
| **Gestão de ciclo de vida** | `ManagedRuntime` gerencia recursos do Effect; NestJS gerencia o ciclo de vida dos módulos |

---

## 3. Decisões Arquiteturais

### 3.1 Arquitetura de Dados

**Multi-Schema PostgreSQL via Prisma:**

- Schema Prisma único (`schema.prisma`) com anotações `@@schema()` por bounded context.
- Schemas PostgreSQL separados por domínio: `auth`, `routing`, `boarding`, `tracking`, `trip` e `public` (compartilhado).
- `Company` (raiz do tenant) e enums compartilhados residem no schema `public`.
- Toda entidade recebe a anotação `@@schema("nome_do_contexto")` no modelo Prisma.
- Generator configurado com `schemas = ["public", "auth", "routing", "boarding", "tracking", "trip"]`.

**Justificativa da abordagem multi-schema:**
- A fronteira física no banco reforça os bounded contexts do DDD, prevenindo JOINs acidentais entre domínios.
- Relações cross-schema são explícitas e intencionais — uma foreign key entre domínios é uma decisão arquitetural visível.
- Prepara a base para eventual extração de microserviços (`pg_dump --schema=boarding`).

**Validação de Dados — Effect Schema:**

- A validação permanece no functional core, mantendo-a testável sem NestJS.
- Na camada NestJS, um Pipe customizado converte erros do Effect Schema em respostas HTTP estruturadas.
- Aplicação: DTOs, entidades de domínio e validação de inputs da API.

**Cache Redis:**

| Dado                         | Estratégia                                         |
| ---------------------------- | -------------------------------------------------- |
| Localização GPS do motorista | TTL curto; sobrescrita contínua a cada atualização |
| JWT blacklist                | Tokens invalidados para logout seguro              |
| Cache de dados frequentes    | Deferido para a Fase 2                             |

### 3.2 Autenticação e Segurança

**Controle de Acesso Baseado em Papéis (RBAC):**

- Implementado via NestJS Guards + decorators customizados (`@Roles('admin', 'driver', 'student')`).
- `TenantGuard` extrai o `tenantId` do JWT e injeta no contexto do request. Todas as queries são filtradas por tenant, sem exceção.
- Três papéis definidos: `admin` (empresa), `driver` (motorista), `student` (aluno).

**Refresh Token:**

- Implementação simples (sem rotation) para o MVP — validade de 7 dias.
- A interface do módulo JWT no functional core prevê extensão para rotation na Fase 2.

### 3.3 API e Comunicação

**Tratamento de Erros Tipados:**

- O functional core retorna erros tipados e identificados (`StudentNotFound`, `InvalidQRCode`, `TenantMismatch`).
- Um NestJS ExceptionFilter centralizado converte esses erros em respostas HTTP padronizadas.
- O core permanece agnóstico ao protocolo HTTP — separação clara demonstrada na tese.

**Documentação da API:**

- Swagger/OpenAPI gerado automaticamente via `@nestjs/swagger`.
- Esforço de implementação mínimo; documentação útil para a apresentação do TCC e para o desenvolvimento colaborativo.

### 3.4 Arquitetura Frontend (Mobile)

**Gerenciamento de Estado:**

| Biblioteca | Responsabilidade |
|---|---|
| **Zustand** | Estado da sessão, viagem ativa, modo offline, preferências do usuário |
| **TanStack Query** | Cache de chamadas à API, suporte offline via `persistQueryClient` |

**Armazenamento Local:**

| Biblioteca | Dados Armazenados |
|---|---|
| **MMKV** | Tokens JWT, preferências, estado da sessão — acesso ultra-rápido |
| **expo-sqlite** | Fila de check-ins offline pendentes — persistência estruturada com garantias de entrega |

**Biblioteca de UI:** React Native Paper (Material Design) — componentes acessíveis com botões grandes e alto contraste, atendendo NFR18 e NFR19.

### 3.5 Infraestrutura e Deploy

| Ambiente | Configuração |
|---|---|
| **Desenvolvimento local** | Docker Compose (PostgreSQL + Redis + API) |
| **Demo / TCC** | Railway ou Render (PostgreSQL + Redis gerenciados, tier gratuito) |
| **Logging** | Logger padrão NestJS v11 com saída JSON aprimorada |

---

## 4. Domain Events Funcionais

### 4.1 Padrão Adotado: Return Tuple (`WithEvents<A>`)

O functional core nunca emite eventos diretamente — emitir um evento é um efeito colateral incompatível com o padrão Functional Core/Imperative Shell (BERNHARDT, 2012). Em vez disso, o core retorna uma tupla `[resultado, eventos[]]`. O imperative shell é responsável por despachar os eventos via `EventEmitter2` do NestJS.

**Princípio:** O core *decide quais eventos ocorreram*; o shell *executa o dispatch*.

### 4.2 Interface Compartilhada (Shared Kernel)

```typescript
// domains/shared/core/events/domain-event.interface.ts
interface DomainEvent {
  readonly type: string
  readonly data: Record<string, unknown>
  readonly occurredAt: string  // ISO 8601
}

// domains/shared/core/events/with-events.ts
type WithEvents<A> = readonly [result: A, events: ReadonlyArray<DomainEvent>]

const noEvents = <A>(result: A): WithEvents<A> => [result, []] as const
const withEvents = <A>(result: A, events: DomainEvent[]): WithEvents<A> =>
  [result, events] as const
```

### 4.3 Exemplo: Use Case no Functional Core (puro)

```typescript
const checkIn = (studentId: string, tripId: string) =>
  Effect.gen(function* () {
    const repo = yield* BoardingRepository
    const boarding = yield* repo.recordCheckIn(studentId, tripId)
    return withEvents(boarding, [
      {
        type: 'boarding.checked_in',
        data: { studentId, tripId },
        occurredAt: new Date().toISOString()
      }
    ])
  })
```

### 4.4 Exemplo: Service no Imperative Shell (NestJS)

```typescript
@Injectable()
class BoardingService {
  constructor(
    @Inject('EFFECT_RUNTIME') private readonly runtime: ManagedRuntime<...>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processCheckIn(dto: CheckInDto) {
    const [result, events] = await this.runtime.runPromise(
      checkIn(dto.studentId, dto.tripId)
    )
    events.forEach(e => this.eventEmitter.emit(e.type, e))
    return result
  }
}
```

### 4.5 Helper para Dispatch Automático

```typescript
// shared/shell/effect-runtime/event-dispatcher.service.ts
@Injectable()
class EffectEventDispatcher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async runAndDispatch<A, E, R>(
    runtime: ManagedRuntime<R>,
    program: Effect<WithEvents<A>, E, R>,
  ): Promise<A> {
    const [result, events] = await runtime.runPromise(program)
    events.forEach(e => this.eventEmitter.emit(e.type, e))
    return result
  }
}
```

### 4.6 Catálogo de Eventos do PureUrban

| Evento | Domínio Emissor | Domínio Consumidor | Efeito |
|---|---|---|---|
| `boarding.checked_in` | boarding | tracking | Atualiza contagem de embarcados |
| `boarding.not_returning` | boarding | trip | Atualiza status do aluno na lista |
| `boarding.absence_cancelled` | boarding | trip | Reverte status de ausência |
| `trip.started` | trip | tracking | Inicia stream de GPS |
| `trip.ended` | trip | tracking | Encerra stream de GPS |
| `location.updated` | tracking | SSE controller | Entrega atualização de localização aos alunos |

---

## 5. Estratégia de Sincronização Offline

### 5.1 Contexto e Decisão

Sincronização offline completa — fila genérica de operações, resolução bidirecional de conflitos e reconciliação de estado — apresenta complexidade desproporcional ao problema. Envolve idempotência, ordenação de operações, conflitos de escrita concorrente, estado local desatualizado, fila persistente com garantias de entrega e UI de estado misto (synced/pending/failed).

Para o PureUrban, adota-se uma **estratégia progressiva em três tiers**, com escopo claramente delimitado para o MVP.

### 5.2 Tier 1 — Cache de Leitura Offline (Todos os Domínios)

**Tecnologia:** TanStack Query com `persistQueryClient` + MMKV.

**Comportamento:**

- Todas as chamadas REST são cacheadas automaticamente pelo TanStack Query.
- `persistQueryClient` serializa o cache em MMKV — o cache sobrevive ao encerramento do aplicativo.
- Quando offline, o aplicativo exibe os dados cacheados (lista de alunos, rota ativa, status da viagem).
- Retry automático com backoff exponencial ao restabelecer a conexão.
- UI exibe indicador de "dados podem estar desatualizados" enquanto offline.

**Cobertura estimada:** Aproximadamente 90% dos cenários reais de uso offline correspondem a leitura de dados já carregados.

### 5.3 Tier 2 — Fila de Escrita Offline (Somente Check-in)

**Justificativa:** O check-in de embarque é o único cenário crítico de escrita offline — o motorista em túnel ou zona rural sem sinal precisa registrar a presença dos alunos sem interrupção do fluxo operacional.

**Tecnologia:** expo-sqlite (fila persistente).

**Schema da fila:**

```sql
CREATE TABLE offline_queue (
  id          TEXT PRIMARY KEY,          -- UUID v4 gerado no cliente (chave de idempotência)
  operation   TEXT NOT NULL,             -- 'check_in' | 'notify_not_returning' | 'cancel_absence'
  payload     TEXT NOT NULL,             -- JSON com os dados da operação
  status      TEXT DEFAULT 'pending',    -- 'pending' | 'sent' | 'failed'
  created_at  TEXT NOT NULL,             -- ISO 8601 — garante ordenação FIFO
  attempts    INTEGER DEFAULT 0,
  last_error  TEXT
);
```

**Regras de processamento:**

- Operações processadas em ordem de `created_at` (FIFO estrito).
- Cada operação enviada com header `X-Idempotency-Key: {id}` — o servidor verifica duplicidade antes de executar.
- Retry com backoff exponencial: 1s, 2s, 4s, 8s, máximo de 30s.
- Máximo de 5 tentativas por operação; após isso, o status muda para `failed` e o usuário é notificado.
- Limite máximo da fila: 500 operações (proteção contra acúmulo excessivo).

**Idempotência no servidor:**

- O use case de check-in recebe `idempotencyKey` como parâmetro explícito.
- O adapter verifica a existência da chave no banco antes de inserir: `WHERE idempotency_key = ? AND trip_id = ?`.
- Se o registro já existe, retorna o resultado anterior sem reprocessar.

**Resolução de conflitos (Last-Write-Wins com regra de domínio):**

| Conflito | Regra |
|---|---|
| Check-in vs. notificação de ausência | Motorista presente tem autoridade — check-in prevalece sobre ausência |
| Localização GPS | LWW puro — dado naturalmente substituível |

A resolução é aplicada no use case do functional core, garantindo testabilidade isolada.

**Interface de estado na UI:**

| Badge | Significado |
|---|---|
| Confirmado | Check-in sincronizado com o servidor |
| Pendente | Aguardando envio (fila offline) |
| Falhou | Máximo de tentativas atingido — botão "Retentar" disponível |

### 5.4 Tier 3 — Trabalho Futuro (Mencionado na Tese)

Os seguintes itens são reconhecidos como limitações do MVP e candidatos a implementação pós-TCC:

- Reconciliação bidirecional completa (sync de estado, não apenas operações)
- CRDT ou Event Sourcing para merge sem conflitos
- Framework dedicado de sincronização (PowerSync, WatermelonDB)
- Suporte offline para domínios adicionais além do boarding (edição de rotas, criação de viagens)

---

## 6. Padrões de Implementação e Regras de Consistência

### 6.1 Convenções de Nomenclatura

**Banco de Dados (Prisma):**

| Elemento | Convenção | Exemplo |
|---|---|---|
| Models | `PascalCase` singular | `User`, `Route`, `Trip`, `BoardingRecord` |
| Colunas | `camelCase` | `userId`, `createdAt`, `tripStatus` |
| Relations | Nome descritivo | `company`, `assignedRoutes`, `boardingRecords` |
| Enums | `SCREAMING_SNAKE_CASE` | `CHECKED_IN`, `NOT_RETURNING`, `TRIP_ACTIVE` |

**API REST:**

| Elemento | Convenção | Exemplo |
|---|---|---|
| Endpoints | `kebab-case`, plural | `/api/v1/routes`, `/api/v1/boarding-records` |
| Query params | `camelCase` | `?routeId=123&tripStatus=active` |
| JSON fields | `camelCase` | `{ "studentId": "...", "createdAt": "..." }` |

**Código TypeScript:**

| Elemento | Convenção | Exemplo |
|---|---|---|
| Arquivos | `kebab-case` com sufixo de tipo | `check-in.use-case.ts`, `boarding-repository.port.ts` |
| Classes | `PascalCase` | `BoardingService`, `CheckInUseCase` |
| Interfaces / Tags Effect | `PascalCase` | `StudentRepository`, `LocationStore` |
| Funções / variáveis | `camelCase` | `processCheckIn`, `studentId` |
| Constantes | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_ATTEMPTS`, `JWT_SECRET` |
| Tipos de erro Effect | `PascalCase` descritivo | `StudentNotFound`, `InvalidQRCode`, `TenantMismatch` |

**Eventos SSE:** `domain.action` em `snake_case` — ex: `location.updated`, `boarding.checked_in`.

### 6.2 Formato de Resposta da API

**Sucesso:**

```json
{
  "data": { "..." : "..." },
  "meta": { "timestamp": "2026-03-15T14:30:00Z" }
}
```

**Erro:**

```json
{
  "error": {
    "code": "STUDENT_NOT_FOUND",
    "message": "Aluno não encontrado",
    "details": { "studentId": "abc-123" }
  }
}
```

**Datas:** Formato ISO 8601 UTC em toda a API. Conversão para timezone local realizada exclusivamente no frontend.

### 6.3 Padrões Mobile

**Zustand Stores:**

- Um store por domínio: `useAuthStore`, `useTripStore`, `useBoardingStore`.
- Actions como métodos do store — mutações externas são proibidas.
- Padrão de atualização: `set(state => ({ ...state, field: newValue }))`.

**Tratamento de Erros no Mobile:**

| Tipo de Erro | Tratamento |
|---|---|
| Erros de rede | Retry automático com backoff exponencial (TanStack Query) |
| Erros de negócio | Mensagem ao usuário via toast/snackbar (React Native Paper) |
| Erros inesperados | Log interno + tela de fallback genérica |

**Loading States:**

- Com TanStack Query: usar os estados nativos `isLoading`, `isFetching`, `isError`.
- Sem TanStack Query: utilizar union type `status: 'idle' | 'loading' | 'success' | 'error'` — nunca múltiplos booleanos.

### 6.4 Estratégia de Testes

- Arquivos de teste colocados junto ao arquivo testado (`*.spec.ts`).
- Exemplo: `core/use-cases/check-in.use-case.ts` → `core/use-cases/check-in.use-case.spec.ts`.
- Testes de integração: pasta `test/` na raiz do projeto API (padrão NestJS + Supertest).
- Testes E2E mobile: Playwright (previsto para o MVP).

---

## 7. Estrutura do Projeto e Fronteiras Arquiteturais

### 7.1 Organização do Repositório

Monorepo de diretórios simples, sem Nx ou Turborepo (adequado para equipe pequena):

```
pureurban/
├── docker-compose.yml          # PostgreSQL + Redis (desenvolvimento local)
├── api/                        # NestJS Backend
├── mobile/                     # Expo App (aluno + motorista)
├── shared/                     # Tipos compartilhados (uso futuro)
└── docs/                       # Documentação do projeto
```

### 7.2 Comandos de Inicialização

```bash
npx create-expo-app@latest ./mobile --template default
npx @nestjs/cli@latest new ./api --strict --package-manager npm
```

**Dependências pós-inicialização — Mobile:** expo-sqlite, MMKV, expo-camera, biblioteca de mapas, Zustand, TanStack Query, EventSource (SSE).

**Dependências pós-inicialização — API:** Prisma (`moduleFormat = "cjs"`), Effect TS, ioredis, @nestjs/jwt, @nestjs/passport; reorganização da estrutura hexagonal.

### 7.3 Estrutura do Backend (Hexagonal por Bounded Context)

```
api/src/
├── main.ts
├── app.module.ts
├── domains/
│   ├── auth/
│   │   ├── core/                         # Effect TS puro (functional core)
│   │   │   ├── ports/
│   │   │   │   ├── user-repository.port.ts
│   │   │   │   └── token-service.port.ts
│   │   │   └── use-cases/
│   │   │       ├── login.use-case.ts
│   │   │       ├── refresh-token.use-case.ts
│   │   │       └── validate-token.use-case.ts
│   │   └── shell/                        # NestJS + Infraestrutura (imperative shell)
│   │       ├── adapters/
│   │       │   ├── prisma-user.adapter.ts
│   │       │   └── jwt-token.adapter.ts
│   │       ├── http/
│   │       │   └── auth.controller.ts
│   │       ├── auth.service.ts
│   │       └── auth.module.ts
│   │
│   ├── routing/
│   │   ├── core/
│   │   │   ├── ports/
│   │   │   │   ├── route-repository.port.ts
│   │   │   │   └── student-route-repository.port.ts
│   │   │   └── use-cases/
│   │   │       ├── create-route.use-case.ts
│   │   │       ├── assign-student.use-case.ts
│   │   │       └── assign-driver.use-case.ts
│   │   └── shell/
│   │       ├── adapters/
│   │       │   └── prisma-route.adapter.ts
│   │       ├── http/
│   │       │   └── routing.controller.ts
│   │       ├── routing.service.ts
│   │       └── routing.module.ts
│   │
│   ├── boarding/
│   │   ├── core/
│   │   │   ├── ports/
│   │   │   │   ├── boarding-repository.port.ts
│   │   │   │   └── notification-service.port.ts
│   │   │   └── use-cases/
│   │   │       ├── check-in.use-case.ts
│   │   │       ├── notify-not-returning.use-case.ts
│   │   │       ├── cancel-absence.use-case.ts
│   │   │       └── send-check-in-reminder.use-case.ts
│   │   └── shell/
│   │       ├── adapters/
│   │       │   └── prisma-boarding.adapter.ts
│   │       ├── http/
│   │       │   └── boarding.controller.ts
│   │       ├── boarding.service.ts
│   │       └── boarding.module.ts
│   │
│   ├── tracking/
│   │   ├── core/
│   │   │   ├── ports/
│   │   │   │   └── location-store.port.ts
│   │   │   └── use-cases/
│   │   │       ├── update-location.use-case.ts
│   │   │       └── get-bus-location.use-case.ts
│   │   └── shell/
│   │       ├── adapters/
│   │       │   └── redis-location.adapter.ts
│   │       ├── http/
│   │       │   ├── tracking.controller.ts
│   │       │   └── tracking-sse.controller.ts
│   │       ├── tracking.service.ts
│   │       └── tracking.module.ts
│   │
│   ├── trip/
│   │   ├── core/
│   │   │   ├── ports/
│   │   │   │   └── trip-repository.port.ts
│   │   │   └── use-cases/
│   │   │       ├── start-trip.use-case.ts
│   │   │       ├── end-trip.use-case.ts
│   │   │       └── get-trip-students.use-case.ts
│   │   └── shell/
│   │       ├── adapters/
│   │       │   └── prisma-trip.adapter.ts
│   │       ├── http/
│   │       │   └── trip.controller.ts
│   │       ├── trip.service.ts
│   │       └── trip.module.ts
│   │
│   └── shared/                           # Shared Kernel (DDD)
│       ├── core/
│       │   ├── errors/
│       │   │   └── base.error.ts
│       │   ├── events/
│       │   │   ├── domain-event.interface.ts
│       │   │   └── with-events.ts
│       │   └── schemas/
│       │       └── common.schema.ts
│       └── shell/
│           ├── effect-runtime/
│           │   ├── effect-runtime.module.ts
│           │   └── event-dispatcher.service.ts
│           ├── guards/
│           │   ├── tenant.guard.ts
│           │   └── roles.guard.ts
│           ├── filters/
│           │   └── effect-exception.filter.ts
│           ├── pipes/
│           │   └── effect-schema.pipe.ts
│           ├── decorators/
│           │   └── roles.decorator.ts
│           └── infra/
│               ├── prisma-global.module.ts
│               ├── prisma.service.ts
│               ├── redis.module.ts
│               └── redis.service.ts
```

> Os nomes `core/` e `shell/` mapeiam diretamente para os conceitos de Functional Core e Imperative Shell (BERNHARDT, 2012). O Shared Kernel segue a convenção do DDD (EVANS, 2003).

### 7.4 Estrutura do Mobile (Expo Router)

```
mobile/
├── app/                                  # Expo Router (roteamento baseado em arquivos)
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   ├── (student)/
│   │   ├── _layout.tsx
│   │   ├── home.tsx
│   │   ├── qr-code.tsx
│   │   └── track-bus.tsx
│   └── (driver)/
│       ├── _layout.tsx
│       ├── trip.tsx
│       ├── scan.tsx
│       └── student-list.tsx
└── src/
    ├── services/
    │   ├── api-client.ts                 # Único ponto de contato com a API
    │   ├── auth.service.ts
    │   ├── boarding.service.ts
    │   ├── tracking.service.ts
    │   └── sse-client.ts
    ├── stores/
    │   ├── auth.store.ts
    │   ├── trip.store.ts
    │   └── boarding.store.ts
    ├── hooks/
    │   ├── use-auth.ts
    │   ├── use-location.ts
    │   └── use-offline-sync.ts
    ├── components/
    │   ├── qr-scanner.tsx
    │   ├── student-card.tsx
    │   ├── trip-status-bar.tsx
    │   └── bus-map.tsx
    └── utils/
        ├── storage.ts
        ├── offline-queue.ts
        └── constants.ts
```

### 7.5 Fronteiras da API por Domínio

| Domínio | Base Path | Responsabilidade |
|---|---|---|
| `auth` | `/api/v1/auth/*` | Login, refresh de token, perfil do usuário |
| `routing` | `/api/v1/routes/*` | CRUD de rotas, vínculos aluno/motorista |
| `trip` | `/api/v1/trips/*` | Iniciar/encerrar viagem, listar alunos |
| `boarding` | `/api/v1/boarding/*` | Check-in, notificação de ausência, lembrete |
| `tracking` | `/api/v1/tracking/*` | Envio de GPS, SSE de localização |

### 7.6 Fronteira Core ↔ Shell

| Regra | Descrição |
|---|---|
| `core/ports/` define | Interfaces (Tags Effect) — contratos que o shell deve implementar |
| `shell/adapters/` implementa | As portas com tecnologias concretas (Prisma, Redis, etc.) |
| `shell/*.service.ts` orquestra | Recebe `EFFECT_RUNTIME` e executa programas Effect |
| **Regra absoluta** | `core/` nunca importa de `shell/`. `shell/` importa e implementa `core/` |

### 7.7 Fluxo de Dados Principal

```
Mobile (Aluno / Motorista)
  │
  ├─ REST ──→ NestJS Controller (shell/http/)
  │              │
  │              └─→ Service (shell/*.service.ts)
  │                     │
  │                     └─→ Effect Runtime → Use Case (core/use-cases/)
  │                            │
  │                            ├─→ Port (core/ports/)
  │                            │       └─→ Adapter (shell/adapters/) → PostgreSQL
  │                            └─→ Port (core/ports/)
  │                                    └─→ Adapter (shell/adapters/) → Redis
  │
  └─ SSE ←── NestJS SSE Controller (tracking/shell/http/) ←── Redis Pub/Sub
```

### 7.8 Preocupações Transversais

| Concern | Backend | Mobile |
|---|---|---|
| Multi-tenancy | `shared/shell/guards/tenant.guard.ts` | JWT contém `companyId` |
| Autenticação / RBAC | `shared/shell/guards/roles.guard.ts` | `stores/auth.store.ts` |
| Sincronização offline | Idempotência no use case de boarding | `utils/offline-queue.ts` (Tier 2) + TanStack Query persist (Tier 1) |
| Tratamento de erros | `shared/shell/filters/effect-exception.filter.ts` | TanStack Query `onError` + Toast |

### 7.9 Mapeamento de Requisitos para a Estrutura

| Categoria (PRD) | Domínio Backend | Telas Mobile |
|---|---|---|
| FR1–FR6 (Identidade/Acesso) | `auth/` | `(auth)/login.tsx` |
| FR7–FR10 (Rotas/Turmas) | `routing/` | Painel Admin — Fase 2 |
| FR11–FR14 (Viagens) | `trip/` | `(driver)/trip.tsx` |
| FR15–FR21 (QR Code) | `boarding/` | `(student)/qr-code.tsx`, `(driver)/scan.tsx` |
| FR22–FR25 (Lista/Status) | `trip/` + `boarding/` | `(driver)/student-list.tsx` |
| FR26–FR30 (Ausência) | `boarding/` | `(student)/home.tsx` |
| FR31–FR35 (Localização) | `tracking/` | `(student)/track-bus.tsx` |
| FR36–FR37 (Comunicação) | `boarding/` (broadcast) | Push notification |

---

## 8. Regras Obrigatórias

As regras a seguir são invariantes arquiteturais — não estão sujeitas a exceções sem aprovação explícita do arquiteto (Dev 1).

1. Todo controller **deve** ter decorators de Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`).
2. Todo endpoint **deve** aplicar `TenantGuard` + `@Roles()` — sem exceção.
3. Toda lógica de domínio **deve** estar no functional core (Effect TS) — controllers e services NestJS são exclusivamente shells.
4. Todo programa Effect **deve** declarar seus erros no tipo — o uso de `Effect<A, never, R>` com erros silenciosos é proibido.
5. Toda entidade **deve** possuir os campos `id`, `createdAt`, `updatedAt` e `companyId` (tenant).
6. Toda entidade **deve** ter a anotação `@@schema("contexto")` correspondente ao seu bounded context (`auth`, `routing`, `boarding`, `tracking`, `trip`) — exceção: `Company` e enums compartilhados ficam em `@@schema("public")`.
7. Arquivos **devem** adotar `kebab-case` com sufixo de tipo (`.use-case.ts`, `.port.ts`, `.adapter.ts`, `.module.ts`).
8. Pastas `core/` **contêm apenas** código Effect puro — zero importações de NestJS, Prisma ou Redis.
9. Pastas `shell/` são o **único lugar** onde NestJS, Prisma e Redis podem ser importados.
10. Use cases **devem** retornar `WithEvents<A>` — nunca emitir eventos diretamente no core.

---

## 9. Sequência de Implementação

A sequência abaixo reflete as dependências técnicas entre os componentes e otimiza o paralelismo entre os dois desenvolvedores.

| Passo | Atividade |
|---|---|
| 1 | Inicialização dos projetos (Expo + NestJS starters) |
| 2 | Docker Compose (PostgreSQL + Redis) |
| 3 | CI/CD — GitHub Actions (lint + test + build no PR) |
| 4 | Schema Prisma + migrations iniciais |
| 5 | Setup do Effect TS + Composition Root (`EffectRuntimeModule`) |
| 6 | Módulo de autenticação (JWT + Guards + RBAC) |
| 7 | Primeiro bounded context com CRUD (Rotas/Turmas) |
| 8 | Embarque digital (QR code + offline sync Tier 1 e Tier 2) |
| 9 | Localização em tempo real (SSE + Redis Pub/Sub) |
| 10 | Notificações de ausência |
| 11 | Push notifications (Expo Push API) |
| 12 | Testes E2E (Supertest — API; Playwright — mobile) |
| 13 | Documentação Swagger completa |

**Dependências críticas entre passos:**

- CI/CD (passo 3) deve estar operacional antes de o segundo desenvolvedor começar a contribuir.
- Effect Schema depende do setup do Effect TS (passo 5).
- Auth Guards dependem do módulo JWT (passo 6).
- SSE depende do Redis (passo 2) + Effect runtime (passo 5).
- Offline Tier 1 depende do MMKV + TanStack Query (configurados no passo 1).
- Offline Tier 2 depende do expo-sqlite (passo 1) + idempotência no use case de check-in (passo 8).

---

## 10. Divisão de Trabalho

### 10.1 Fundamento Arquitetural

A arquitetura hexagonal com bounded contexts cria uma **fronteira natural de divisão** — `core/` versus `shell/` e domínios independentes permitem trabalho paralelo com baixo acoplamento entre os desenvolvedores.

### 10.2 Estratégia de Onboarding do Desenvolvedor 2

- Dev 1 (Lucas — arquiteto) estabelece os padrões nos primeiros bounded contexts (`shared/` + `auth/`).
- Dev 2 inicia pelo mobile ou pelos adapters do shell (NestJS puro, sem Effect TS).
- Dev 2 entra gradualmente no functional core após 3 a 4 semanas de familiarização com Effect TS.

### 10.3 Sugestão de Divisão por Responsabilidade

| Dev 1 — Lucas (Arquiteto) | Dev 2 |
|---|---|
| `shared/` + Effect runtime | Setup mobile + navegação |
| `auth/` (core + shell) | Telas mobile + stores |
| `boarding/` core | `boarding/` shell + adapters |
| `tracking/` core + SSE | `routing/` (core + shell) |
| `trip/` core | `trip/` shell + telas mobile |
| CI/CD + infraestrutura | Testes E2E |
| Offline Tier 2 (fila + idempotência) | Offline Tier 1 (TanStack persist) |

> **Observação para a tese:** A divisão core/shell facilitou o trabalho paralelo — um argumento prático a favor da arquitetura hexagonal em equipes pequenas.

---

## 11. Análise de Lacunas e Prontidão

**Status:** Pronto para implementação — nível de confiança alto.

### 11.1 Lacunas Conhecidas

| Lacuna | Impacto | Quando Resolver |
|---|---|---|
| Schema Prisma detalhado (entidades/campos completos) | Baixo — definição natural na primeira história de usuário | Sprint 1 |
| Plataforma de deploy (Railway vs. Render) | Baixo — não afeta o desenvolvimento | Momento do primeiro deploy |
| Curva de aprendizado do Dev 2 em Effect TS | Médio — previsto na estratégia de onboarding | Semanas 1–4 |

**Nenhum gap crítico identificado.**

### 11.2 Compatibilidade Verificada

| Combinação | Status |
|---|---|
| Expo SDK 55 + NestJS v11 + Prisma v7 + Effect TS | Sem conflitos identificados |
| SSE nativo NestJS + Redis Pub/Sub | Padrão documentado — funciona conforme esperado |
| Prisma v7 `moduleFormat = "cjs"` | Resolve compatibilidade ESM/CJS com NestJS |
| `ManagedRuntime` + `useFactory` | Funciona sem dependências externas adicionais |
| Domain Events via return tuple + EventEmitter2 | Coerente com FC/IS — testado conceitualmente |

---

## 12. Glossário

| Termo                 | Definição                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Adapter**           | Implementação concreta de uma porta (port) — conecta o functional core à infraestrutura                         |
| **Bounded Context**   | Fronteira explícita do DDD dentro da qual um modelo de domínio é válido e consistente (EVANS, 2003)             |
| **CI/CD**             | Continuous Integration / Continuous Delivery — pipeline automatizada de integração e entrega de software        |
| **Composition Root**  | Ponto único de montagem do grafo de dependências da aplicação                                                   |
| **CRDT**              | Conflict-free Replicated Data Type — estrutura de dados que resolve conflitos de merge automaticamente          |
| **DDD**               | Domain-Driven Design — abordagem de desenvolvimento centrada no modelo de domínio (EVANS, 2003)                 |
| **Effect TS**         | Biblioteca TypeScript para programação funcional tipada com gerenciamento explícito de efeitos                  |
| **EventEmitter2**     | Biblioteca de eventos para Node.js, utilizada no NestJS para pub/sub interno                                    |
| **Expo Router**       | Sistema de roteamento baseado em arquivos para aplicativos Expo/React Native                                    |
| **FIFO**              | First-In, First-Out — estratégia de processamento em ordem de chegada                                           |
| **Functional Core**   | Camada de domínio pura, sem efeitos colaterais, testável isoladamente (BERNHARDT, 2012)                         |
| **Imperative Shell**  | Camada de infraestrutura que gerencia efeitos colaterais e conecta o core ao mundo externo (BERNHARDT, 2012)    |
| **Idempotência**      | Propriedade de uma operação que produz o mesmo resultado independentemente de quantas vezes é executada         |
| **Layer (Effect TS)** | Abstração do Effect TS para composição de dependências e gerenciamento de recursos                              |
| **LGPD**              | Lei Geral de Proteção de Dados — Lei nº 13.709/2018                                                             |
| **LWW**               | Last-Write-Wins — estratégia de resolução de conflitos onde a escrita mais recente prevalece                    |
| **ManagedRuntime**    | Abstração do Effect TS para executar programas com recursos gerenciados e lifecycle definido                    |
| **MMKV**              | Biblioteca de armazenamento chave-valor de alto desempenho para React Native                                    |
| **Monolito Modular**  | Arquitetura com código em um único repositório/processo, mas organizado em módulos com fronteiras bem definidas |
| **Multi-tenancy**     | Capacidade de um sistema de servir múltiplos clientes (tenants) com isolamento de dados                         |
| **NestJS**            | Framework Node.js para construção de aplicações server-side escaláveis, baseado em TypeScript                   |
| **ORM**               | Object-Relational Mapping — mapeamento entre objetos e tabelas do banco de dados                                |
| **Port**              | Interface (contrato) definida no functional core que o shell deve implementar                                   |
| **Prisma**            | ORM moderno para TypeScript/Node.js, utilizado como adaptador de persistência                                   |
| **Pub/Sub**           | Publish/Subscribe — padrão de mensageria assíncrona                                                             |
| **QR Code**           | Quick Response Code — código bidimensional lido por câmera                                                      |
| **RBAC**              | Role-Based Access Control — controle de acesso por papel de usuário                                             |
| **Redis**             | Banco de dados em memória utilizado para cache e Pub/Sub                                                        |
| **REST**              | Representational State Transfer — estilo arquitetural de comunicação via HTTP                                   |
| **Shared Kernel**     | Subconjunto do domínio compartilhado entre bounded contexts (EVANS, 2003)                                       |
| **SSE**               | Server-Sent Events — tecnologia para streaming unidirecional do servidor ao cliente                             |
| **TanStack Query**    | Biblioteca de gerenciamento de estado assíncrono e cache para React/React Native                                |
| **Tag (Effect TS)**   | Identificador único de um serviço no sistema de injeção de dependência do Effect TS                             |
| **TLS**               | Transport Layer Security — protocolo criptográfico para comunicação segura                                      |
| **UUID**              | Universally Unique Identifier — identificador único universal                                                   |
| **WithEvents**        | Tipo utilitário do PureUrban: tupla `[resultado, eventos[]]` retornada pelos use cases                          |
| **Zustand**           | Biblioteca de gerenciamento de estado global para React/React Native                                            |

---

## 13. Referências

BERNHARDT, G. **Functional Core, Imperative Shell**. Destroy All Software, 2012. Disponível em: https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell.

COCKBURN, A. **Hexagonal Architecture**. 2005. Disponível em: https://alistair.cockburn.us/hexagonal-architecture/.

EVANS, E. **Domain-Driven Design: Tackling Complexity in the Heart of Software**. Boston: Addison-Wesley, 2003.

MARTIN, R. C. **Agile Software Development, Principles, Patterns, and Practices**. Upper Saddle River: Prentice Hall, 2003.

NEWMAN, S. **Building Microservices: Designing Fine-Grained Systems**. 2. ed. Sebastopol: O'Reilly Media, 2021.

---

*Documento gerado e mantido no contexto do Trabalho de Conclusão de Curso em Engenharia de Software.*
*Versão 1.2 — 10 de maio de 2026*
