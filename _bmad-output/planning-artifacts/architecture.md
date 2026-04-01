---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: ['planning-artifacts/prd.md']
workflowType: 'architecture'
project_name: 'pureurban'
user_name: 'Lucas'
date: '2026-03-15'
lastStep: 8
status: 'complete'
completedAt: '2026-03-15T14:57:00-03:00'
revisedAt: '2026-03-31'
revisionNotes: 'Prazo estendido para dez/2026, equipe ampliada para 2 devs, simplificação do offline sync em tiers, CI/CD e testes E2E incorporados ao MVP'
---

# Architecture Decision Document — PureUrban

## 1. Visão Geral & Restrições

### Contexto do Projeto

- **Domínio:** App de gestão de transporte escolar/universitário (Expo/React Native + NestJS)
- **Complexidade:** Média-Alta — 37 FRs em 7 categorias, 20 NFRs
- **Recurso:** 2 desenvolvedores (Lucas + 1) — MVP ~9 meses (dezembro/2026)
- **Distribuição:** Expo Go / build de dev (sem loja), Android 8+ / iOS 13+, telas 5", dispositivos de baixo custo
- **Natureza acadêmica (TCC):** Hexagonal Architecture + DDD + Functional Core / Imperative Shell — parte da tese, não opcional

### Stack Definida

| Camada | Tecnologia | Versão (Mar/2026) |
|---|---|---|
| Mobile | Expo SDK (React Native) | 55 |
| Backend | NestJS | v11.1.16 |
| ORM | Prisma | v7.4.2 (`moduleFormat = "cjs"` para NestJS) |
| Functional Core | Effect TS | latest |
| Banco de Dados | PostgreSQL | via Docker Compose |
| Cache/Pub-Sub | Redis | via Docker Compose |
| Real-time | SSE (nativo NestJS) + Redis Pub/Sub | — |

### Desafios Arquiteturais Únicos

1. **Effect TS + NestJS coexistência** — Integrar programação funcional pura com framework OO. Composition Root como ponto de encontro.
2. **SSE + Redis Pub/Sub para real-time** — REST → Redis → Pub/Sub → SSE → cliente. Fallback para polling.
3. **Offline resiliente com sync progressivo** — Cache de leitura via TanStack Query persistido + fila de escrita offline limitada ao check-in (cenário crítico). Estratégia em tiers — ver seção dedicada.
4. **Bounded contexts com Effect TS** — Limites dos domínios mantendo functional core testável isoladamente.

### Decisões Incorporadas ao MVP (antes deferidas)

| Decisão | Rationale |
|---|---|
| CI/CD (GitHub Actions) | 2 devs = pipeline necessária. Lint + test + build no PR |
| Testes E2E | Prazo permite cobertura E2E com Supertest (API) e/ou Playwright |
| Push notifications | Expo Push API é simples e agrega valor ao produto — avaliar inclusão |

### Decisões Deferidas (Pós-MVP / Fase 2)

| Decisão | Rationale |
|---|---|
| Rate limiting | Sem exposição pública |
| Refresh token rotation | Simple refresh suficiente para protótipo |
| Monitoramento externo (OpenTelemetry) | Logger NestJS v11 suficiente |
| Cache de listas em Redis | Overhead desnecessário no MVP |
| Reconciliação bidirecional completa | Complexidade desproporcional — ver seção Offline Sync |
| CRDT / Event Sourcing para merge sem conflitos | Trabalho futuro — mencionado na tese |
| Sync framework dedicado (PowerSync, WatermelonDB) | Avaliar se necessário pós-MVP |

---

## 2. Integração Effect TS ↔ NestJS

**Decisão:** Integração manual via Composition Root, sem bibliotecas de terceiros.

**Justificativa:** A biblioteca `@nestjs-effect` foi descartada — 22 stars, mantenedor único, pré-1.0, "not production-ready", último publish há ~10 meses.

### Padrão: `useFactory` + `ManagedRuntime`

O imperative shell (NestJS) injeta um runtime do Effect já montado com todas as dependências:

1. **Functional Core (Effect TS puro):** Define interfaces (Tags) e lógica de domínio. Zero imports de NestJS.
2. **Adapters:** Implementações concretas das portas (Prisma, Redis, etc.).
3. **Composition Root (`EffectRuntimeModule`):** `useFactory` do NestJS recebe dependências de infraestrutura (PrismaService, RedisService), monta os Layers do Effect e instancia um `ManagedRuntime`.
4. **Services do NestJS:** Recebem o runtime via `@Inject('EFFECT_RUNTIME')` e executam programas Effect com `runtime.runPromise(program)`.

**Benefícios:**
- Inversão de dependência explícita — core define interfaces, shell fornece implementações
- Testabilidade em dois níveis — core testável sem NestJS, integração testável via substituição de providers
- Material rico para TCC — demonstra coexistência de dois sistemas de DI distintos
- Lifecycle management — `ManagedRuntime` gerencia recursos, NestJS gerencia módulos

---

## 3. Decisões Arquiteturais

### Arquitetura de Dados

**Schema Prisma com Multi-Schema PostgreSQL:**
- Schema Prisma único (`schema.prisma`) com anotações `@@schema()` por bounded context
- Schemas PostgreSQL separados por domínio: `auth`, `routing`, `boarding`, `tracking`, `trip`, `public` (shared)
- `Company` (tenant root) e enums compartilhados ficam no schema `public`
- Toda entidade recebe `@@schema("nome_do_contexto")` no modelo Prisma
- Generator configurado com `schemas = ["public", "auth", "routing", "boarding", "tracking", "trip"]`
- Fronteira física no banco reforça bounded contexts do DDD — impede JOINs acidentais entre domínios
- Relações cross-schema são explícitas e intencionais (FKs entre domínios = decisão arquitetural)
- Preparação para eventual extração de microserviços (`pg_dump --schema=boarding`)
- Trade-off analysis: ver `planning-artifacts/trade-off-multi-schema.md`

**Validação de Dados — Effect Schema:**
- Mantém validação no functional core (testável sem NestJS)
- Na camada NestJS, um Pipe customizado converte erros Effect Schema → respostas HTTP
- Afeta: DTOs, domain entities, API input validation

**Cache (Redis):**
- GPS: TTL curto, sobrescrita contínua
- JWT blacklist: tokens invalidados para logout seguro
- Cache de dados frequentes deferido para Fase 2

### Autenticação & Segurança

**RBAC:**
- NestJS Guards + decorators customizados (`@Roles('admin', 'driver', 'student')`)
- `TenantGuard` extrai `tenantId` do JWT e injeta no request — todas as queries filtradas por tenant, sem exceção
- 3 roles: `admin` (empresa), `driver` (motorista), `student` (aluno)

**Refresh Token:**
- Simples sem rotation para MVP (7 dias fixo)
- JWT module no Effect core já prevê interface de token store para rotation futura (Fase 2)

### API & Comunicação

**Tratamento de Erros Tipados:**
- Functional core retorna tagged errors (`StudentNotFound`, `InvalidQRCode`, `TenantMismatch`)
- NestJS ExceptionFilter converte → HTTP status + body `{ code: string, message: string, details?: object }`
- Core agnóstico de HTTP — demonstra separação na tese

**Documentação:** Swagger/OpenAPI via `@nestjs/swagger` — quase zero esforço, útil para TCC.

### Arquitetura Frontend (Mobile)

**Gerenciamento de Estado:**
- Zustand: estado da sessão, viagem ativa, modo offline, preferências
- TanStack Query: cache de chamadas à API, suporte offline via `persistQueryClient`

**Armazenamento Local:**
- MMKV: tokens, preferências, estado da sessão — leitura/escrita ultra-rápida
- expo-sqlite: fila de check-ins offline pendentes — queries estruturadas (ver seção Offline Sync)

**UI:** React Native Paper (Material Design) — componentes acessíveis (botões grandes, contraste alto — NFR18/NFR19).

### Infraestrutura & Deploy

- **Dev local:** Docker Compose (PostgreSQL + Redis + API)
- **Demo/TCC:** Railway ou Render (PostgreSQL + Redis managed, free tier)
- **Logging:** Logger padrão NestJS v11 (JSON log melhorado)

---

## 4. Domain Events Funcionais

### Padrão: Return Tuple (`WithEvents<A>`)

O functional core nunca emite eventos diretamente (side effect). Retorna uma tupla `[resultado, eventos[]]`. O imperative shell despacha via `EventEmitter2` do NestJS.

**Rationale:** Emitir eventos dentro do core quebraria o Functional Core / Imperative Shell (BERNHARDT, 2012) — o core *decide quais eventos ocorreram*, o shell *executa o dispatch*.

**Interface (Shared Kernel — `core/events/`):**

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

**Use Case (core/ — puro):**

```typescript
const checkIn = (studentId: string, tripId: string) =>
  Effect.gen(function* () {
    const repo = yield* BoardingRepository
    const boarding = yield* repo.recordCheckIn(studentId, tripId)
    return withEvents(boarding, [
      { type: 'boarding.checked_in', data: { studentId, tripId }, occurredAt: new Date().toISOString() }
    ])
  })
```

**Shell (NestJS — side effects):**

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

**Helper para dispatch automático (`shared/shell/effect-runtime/`):**

```typescript
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

**Eventos do PureUrban:**

| Evento | Emissor | Consumidor |
|---|---|---|
| `boarding.checked_in` | boarding | tracking (atualiza contagem) |
| `boarding.not_returning` | boarding | trip (atualiza lista) |
| `boarding.absence_cancelled` | boarding | trip (reverte status) |
| `trip.started` | trip | tracking (inicia GPS stream) |
| `trip.ended` | trip | tracking (para GPS stream) |
| `location.updated` | tracking | SSE controller (push para alunos) |

---

## 5. Estratégia de Offline Sync

### Problema

Offline sync completo (fila de operações genérica + resolução de conflitos bidirecional + reconciliação de estado) é um problema de complexidade desproporcional. Envolve idempotência, ordenação de operações, conflitos de escrita concorrente, estado local stale, fila persistente com garantias de entrega, e UI de estado misto (synced/pending/failed). Para o PureUrban, adotamos uma estratégia progressiva em tiers.

### Tier 1 — Cache de leitura offline (todos os domínios)

**Tecnologia:** TanStack Query com `persistQueryClient` + MMKV

**Comportamento:**
- Todas as chamadas REST são cacheadas automaticamente pelo TanStack Query
- `persistQueryClient` salva o cache em MMKV — sobrevive a reinicialização do app
- Offline, o app exibe dados cacheados (lista de alunos, rota ativa, status da viagem)
- Retry automático com backoff exponencial quando a conexão retorna (configuração nativa do TanStack Query)
- UI exibe indicador de "dados podem estar desatualizados" quando offline

**Cobertura:** ~90% dos cenários reais de uso offline (leitura de dados já carregados)

### Tier 2 — Fila de escrita offline (apenas check-in)

**Justificativa:** O check-in de embarque é o único cenário crítico de escrita offline — motorista em túnel ou zona rural sem sinal precisa registrar presença dos alunos sem interrupção.

**Tecnologia:** expo-sqlite (fila persistente)

**Schema da fila:**

```sql
CREATE TABLE offline_queue (
  id TEXT PRIMARY KEY,          -- UUID v4 gerado no cliente (chave de idempotência)
  operation TEXT NOT NULL,       -- 'check_in' | 'notify_not_returning' | 'cancel_absence'
  payload TEXT NOT NULL,         -- JSON com dados da operação
  status TEXT DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  created_at TEXT NOT NULL,      -- ISO 8601 — garante ordenação
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);
```

**Regras de processamento:**
- Operações processadas em ordem de `created_at` (FIFO estrito)
- Cada operação enviada com header `X-Idempotency-Key: {id}` — servidor verifica duplicidade antes de executar
- Retry com backoff exponencial: 1s, 2s, 4s, 8s, max 30s
- Máximo 5 tentativas por operação — após isso, status muda para `failed` e notifica o usuário
- Limite da fila: 500 operações (proteção contra acúmulo excessivo)

**Idempotência no servidor:**
- Use case de check-in recebe `idempotencyKey` como parâmetro
- Adapter verifica existência no banco antes de inserir: `WHERE idempotency_key = ? AND trip_id = ?`
- Se já existe, retorna o resultado anterior sem reprocessar

**Conflitos (Last-Write-Wins com regra de domínio):**
- Check-in: motorista presente tem autoridade sobre notificação de ausência do aluno
- Localização GPS: LWW puro (dado naturalmente substituível)
- Resolução aplicada no use case do functional core — testável isoladamente

**UI de estado:**
- Cada check-in na lista exibe badge de sincronização: `✓ confirmado` | `⏳ pendente` | `✗ falhou`
- Operações pendentes são visualmente distintas mas funcionais (motorista continua trabalhando)
- Botão "retentar" para operações com status `failed`

### Tier 3 — Trabalho Futuro (mencionado na tese)

Itens reconhecidos como limitações do MVP, candidatos a implementação pós-TCC:
- Reconciliação bidirecional completa (sync de estado, não apenas operações)
- CRDT ou event sourcing para merge sem conflitos
- Sync framework dedicado (PowerSync, WatermelonDB)
- Offline para outros domínios além de boarding (edição de rotas, criação de viagens)

---

## 6. Padrões de Implementação & Regras de Consistência

### Naming

**Banco de Dados (Prisma):**
- Models: `PascalCase` singular (`User`, `Route`, `Trip`, `BoardingRecord`)
- Colunas: `camelCase` (`userId`, `createdAt`, `tripStatus`)
- Relations: nome descritivo (`company`, `assignedRoutes`, `boardingRecords`)
- Enums: `SCREAMING_SNAKE_CASE` (`CHECKED_IN`, `NOT_RETURNING`, `TRIP_ACTIVE`)

**API REST:**
- Endpoints: `kebab-case`, plural (`/api/v1/routes`, `/api/v1/boarding-records`)
- Query params: `camelCase` (`?routeId=123&tripStatus=active`)
- JSON fields: `camelCase` em toda a API

**Código TypeScript:**
- Arquivos: `kebab-case` com sufixo de tipo (`.use-case.ts`, `.port.ts`, `.adapter.ts`, `.module.ts`)
- Classes: `PascalCase` (`BoardingService`, `CheckInUseCase`)
- Interfaces/Tags Effect: `PascalCase` (`StudentRepository`, `LocationStore`)
- Funções/variáveis: `camelCase` (`processCheckIn`, `studentId`)
- Constantes: `SCREAMING_SNAKE_CASE` (`MAX_RETRY_ATTEMPTS`, `JWT_SECRET`)
- Tipos de erro Effect: `PascalCase` descritivo (`StudentNotFound`, `InvalidQRCode`, `TenantMismatch`)

**Eventos SSE:** `domain.action` em `snake_case` (`location.updated`, `boarding.checked_in`)

### Formatos de Resposta da API

**Sucesso:**
```json
{
  "data": { ... },
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

**Datas:** ISO 8601 UTC na API. Conversão para timezone local apenas no frontend.

### Padrões Mobile

**Zustand Stores:**
- Um store por domínio (`useAuthStore`, `useTripStore`, `useBoardingStore`)
- Actions como métodos do store, nunca mutações externas
- Padrão: `set(state => ({ ...state, field: newValue }))`

**Tratamento de erros no mobile:**
- Erros de rede: retry automático com backoff (TanStack Query)
- Erros de negócio: mensagem ao usuário via toast/snackbar (React Native Paper)
- Erros inesperados: log + tela de fallback genérica

**Loading states:**
- TanStack Query: usar `isLoading`, `isFetching`, `isError` nativos
- Sem TanStack Query: `status: 'idle' | 'loading' | 'success' | 'error'` (union types, nunca booleanos)

### Testes

- Colocados junto ao arquivo testado (`*.spec.ts`)
- Exemplo: `core/use-cases/check-in.use-case.ts` → `core/use-cases/check-in.use-case.spec.ts`
- Testes de integração: pasta `test/` na raiz do projeto API (padrão NestJS)

---

## 7. Estrutura do Projeto & Fronteiras

### Repositório

Monorepo de diretórios simples (sem Nx/Turborepo — adequado para equipe pequena):

```
pureurban/
├── docker-compose.yml                   # PostgreSQL + Redis (dev local)
├── api/                                 # NestJS Backend
├── mobile/                              # Expo App (aluno + motorista)
├── shared/                              # (futuro) tipos compartilhados
└── docs/
```

### Inicialização dos Starters

```bash
npx create-expo-app@latest ./mobile --template default
npx @nestjs/cli@latest new ./api --strict --package-manager npm
```

**Pós-inicialização Mobile:** Storage offline (expo-sqlite, MMKV), expo-camera (QR), mapas, Zustand, TanStack Query, EventSource (SSE).

**Pós-inicialização API:** Prisma (`moduleFormat = "cjs"`), Effect TS, Redis (ioredis), JWT Auth (@nestjs/jwt + @nestjs/passport), reorganização hexagonal.

### Estrutura do Backend (Hexagonal, por bounded context)

```
api/src/
├── main.ts
├── app.module.ts
├── domains/
│   ├── auth/
│   │   ├── core/                    # Effect TS puro (functional core)
│   │   │   ├── ports/               # Interfaces (Tags Effect)
│   │   │   │   ├── user-repository.port.ts
│   │   │   │   └── token-service.port.ts
│   │   │   └── use-cases/           # Programas Effect
│   │   │       ├── login.use-case.ts
│   │   │       ├── refresh-token.use-case.ts
│   │   │       └── validate-token.use-case.ts
│   │   └── shell/                   # NestJS + Infra (imperative shell)
│   │       ├── adapters/            # Implementações dos ports
│   │       │   ├── prisma-user.adapter.ts
│   │       │   └── jwt-token.adapter.ts
│   │       ├── http/                # Controllers
│   │       │   └── auth.controller.ts
│   │       ├── auth.service.ts      # Chama Effect runtime
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
│   └── shared/                      # Shared Kernel (DDD)
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

> Os nomes `core/` e `shell/` mapeiam diretamente para Functional Core / Imperative Shell (BERNHARDT, 2012). O Shared Kernel segue a convenção de EVANS (2003).

### Estrutura do Mobile (Expo Router)

```
mobile/
├── app/                                 # Expo Router (file-based)
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
    │   ├── api-client.ts                # Único ponto de contato com a API
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

### Fronteiras da API (endpoints por domínio)

| Domínio | Base Path | Responsabilidade |
|---|---|---|
| `auth` | `/api/v1/auth/*` | Login, refresh, perfil |
| `routing` | `/api/v1/routes/*` | CRUD rotas, vínculos aluno/motorista |
| `trip` | `/api/v1/trips/*` | Iniciar/encerrar viagem, listar alunos |
| `boarding` | `/api/v1/boarding/*` | Check-in, notificar ausência, lembrete |
| `tracking` | `/api/v1/tracking/*` | Enviar GPS, SSE de localização |

### Fronteira Core ↔ Shell

- `core/ports/` define as interfaces (Tags Effect)
- `shell/adapters/` implementa com tecnologias concretas
- `shell/*.service.ts` recebe `EFFECT_RUNTIME` e executa programas
- **Regra absoluta:** `core/` nunca importa de `shell/`. `shell/` importa e implementa `core/`

### Fronteira Mobile ↔ API

- REST (JSON, `camelCase`) + SSE (localização)
- `mobile/src/services/api-client.ts` é o único ponto de contato com a API
- TanStack Query gerencia cache/retry/offline para todas as chamadas REST

### Preocupações Transversais — Localização

| Concern | Backend | Mobile |
|---|---|---|
| Multi-tenancy | `shared/shell/guards/tenant.guard.ts` | JWT contém `companyId` |
| Auth/RBAC | `shared/shell/guards/roles.guard.ts` | `stores/auth.store.ts` |
| Offline sync | Idempotência no use case (boarding) | `utils/offline-queue.ts` (Tier 2) + TanStack Query persist (Tier 1) |
| Error handling | `shared/shell/filters/effect-exception.filter.ts` | TanStack Query `onError` + Toast |

### Mapeamento de Requisitos → Estrutura

| Categoria FR | Domínio Backend | Telas Mobile |
|---|---|---|
| FR1-FR6 (Identidade/Acesso) | `auth/` | `(auth)/login.tsx` |
| FR7-FR10 (Rotas/Turmas) | `routing/` | Admin — Fase 2 |
| FR11-FR14 (Viagens) | `trip/` | `(driver)/trip.tsx` |
| FR15-FR21 (QR Code) | `boarding/` | `(student)/qr-code.tsx`, `(driver)/scan.tsx` |
| FR22-FR25 (Lista/Status) | `trip/` + `boarding/` | `(driver)/student-list.tsx` |
| FR26-FR30 (Ausência) | `boarding/` | `(student)/home.tsx` |
| FR31-FR35 (Localização) | `tracking/` | `(student)/track-bus.tsx` |
| FR36-FR37 (Comunicação) | `boarding/` (broadcast) | Push notification |

### Fluxo de Dados Principal

```
Mobile (Aluno/Motorista)
  │
  ├─ REST ──→ NestJS Controller (shell/http/)
  │              │
  │              └─→ Service (shell/*.service.ts)
  │                     │
  │                     └─→ Effect Runtime → Use Case (core/use-cases/)
  │                            │
  │                            ├─→ Port (core/ports/) ──→ Adapter (shell/adapters/) ──→ PostgreSQL
  │                            └─→ Port (core/ports/) ──→ Adapter (shell/adapters/) ──→ Redis
  │
  └─ SSE ←── NestJS SSE Controller (tracking/shell/http/) ←── Redis Pub/Sub
```

---

## 8. Regras Obrigatórias para Agentes de IA

1. Todo controller DEVE ter decorators de Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
2. Todo endpoint DEVE usar `TenantGuard` + `@Roles()` — sem exceção
3. Toda lógica de domínio DEVE estar no functional core (Effect) — controllers e services NestJS são shells
4. Todo programa Effect DEVE declarar seus erros no tipo — nada de `Effect<A, never, R>` com erros silenciosos
5. Toda entidade DEVE ter `id`, `createdAt`, `updatedAt` e `companyId` (tenant)
6. Toda entidade DEVE ter `@@schema("contexto")` correspondente ao seu bounded context (`auth`, `routing`, `boarding`, `tracking`, `trip`) — exceção: `Company` e enums compartilhados ficam em `@@schema("public")`
7. Arquivos DEVEM usar `kebab-case` com sufixo de tipo (`.use-case.ts`, `.port.ts`, `.adapter.ts`, `.module.ts`)
8. Pastas `core/` contêm APENAS código Effect puro — zero imports de NestJS, Prisma ou Redis
9. Pastas `shell/` são o ÚNICO lugar onde NestJS, Prisma e Redis podem ser importados
10. Use cases DEVEM retornar `WithEvents<A>` — nunca emitir eventos diretamente no core

---

## 9. Sequência de Implementação

1. Inicialização dos projetos (Expo + NestJS starters)
2. Docker Compose (PostgreSQL + Redis)
3. CI/CD — GitHub Actions (lint + test + build no PR)
4. Prisma schema + migrations
5. Effect TS setup + Composition Root (`EffectRuntimeModule`)
6. Auth module (JWT + Guards + RBAC)
7. Primeiro bounded context com CRUD (Rotas/Turmas)
8. Embarque digital (QR code + offline sync Tier 1 e Tier 2)
9. Localização em tempo real (SSE + Redis)
10. Notificações de ausência
11. Push notifications (Expo Push API)
12. Testes E2E (Supertest API + Playwright mobile)
13. Swagger documentation

**Dependências entre passos:**
- CI/CD (passo 3) deve estar pronto antes do segundo dev começar a contribuir
- Effect Schema depende do setup Effect TS (passo 5)
- Auth Guards dependem do JWT module (passo 6)
- SSE depende de Redis (passo 2) + Effect runtime (passo 5)
- Offline Tier 1 depende de MMKV + TanStack Query (configurados no passo 1)
- Offline Tier 2 depende de expo-sqlite (passo 1) + idempotência no use case de check-in (passo 8)

---

## 10. Divisão de Trabalho (2 Desenvolvedores)

A arquitetura hexagonal com bounded contexts cria uma **fronteira natural de divisão** — `core/` vs `shell/` e domínios independentes permitem trabalho paralelo com baixo acoplamento.

### Estratégia de Onboarding do Dev 2

- Dev 1 (Lucas) estabelece padrões nos primeiros bounded contexts (`shared/` + `auth/`)
- Dev 2 começa pelo mobile ou por adapters no shell (NestJS puro, sem Effect)
- Dev 2 entra gradualmente no functional core após 3-4 semanas de familiarização com Effect TS

### Sugestão de Divisão

| Dev 1 (Lucas — arquiteto) | Dev 2 |
|---|---|
| `shared/` + Effect runtime | Mobile setup + navegação |
| `auth/` (core + shell) | Mobile telas + stores |
| `boarding/` core | `boarding/` shell + adapters |
| `tracking/` core + SSE | `routing/` (core + shell) |
| `trip/` core | `trip/` shell + telas mobile |
| CI/CD + infra | Testes E2E |
| Offline Tier 2 (fila + idempotência) | Offline Tier 1 (TanStack persist) |

> **Nota para a tese:** A divisão core/shell facilitou o trabalho paralelo — um argumento prático a favor da arquitetura hexagonal em equipes pequenas.

---

## 11. Gap Analysis & Prontidão

**Status:** PRONTO PARA IMPLEMENTAÇÃO — Nível de confiança alto.

**Gaps conhecidos:**
- ⚠️ Schema Prisma (entidades/campos): definir na primeira história
- ⚠️ Deploy específico (Railway vs Render): decidir no momento do deploy
- ⚠️ Ramp-up do Dev 2 em Effect TS: prever 3-4 semanas de curva de aprendizado
- Nenhum gap crítico identificado

**Compatibilidade verificada:**
- Expo SDK 55 + NestJS v11 + Prisma v7 + Effect TS: sem conflitos
- SSE nativo NestJS + Redis Pub/Sub: padrão documentado
- Prisma v7 `moduleFormat = "cjs"`: resolve compatibilidade ESM/CJS
- `ManagedRuntime` + `useFactory`: funciona sem dependências externas
- Domain Events via return tuple: coerente com FC/IS + EventEmitter2
