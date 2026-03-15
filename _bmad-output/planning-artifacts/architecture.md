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
---

# Architecture Decision Document — PureUrban

## 1. Visão Geral & Restrições

### Contexto do Projeto

- **Domínio:** App de gestão de transporte escolar/universitário (Expo/React Native + NestJS)
- **Complexidade:** Média-Alta — 37 FRs em 7 categorias, 20 NFRs
- **Recurso:** Desenvolvedor solo (Lucas) — MVP ~2 meses (maio/2026)
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
3. **Offline-first com sync** — Persistência local + queue de operações + resolução de conflitos (last-write-wins) em devices baratos.
4. **Bounded contexts com Effect TS** — Limites dos domínios mantendo functional core testável isoladamente.

### Decisões Deferidas (Pós-MVP / Fase 2)

| Decisão | Rationale |
|---|---|
| Rate limiting | Sem exposição pública |
| Refresh token rotation | Simple refresh suficiente para protótipo |
| CI/CD (GitHub Actions) | Dev solo, distribuição via Expo Go |
| Monitoramento externo (OpenTelemetry) | Logger NestJS v11 suficiente |
| Cache de listas em Redis | Overhead desnecessário no MVP |
| Push notifications | Expo Push API — fora do escopo MVP |

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

**Schema Prisma:**
- Schema único (`schema.prisma`) com separação lógica por comentários
- MVP com ~5-8 entidades não justifica multi-file schemas
- A separação DDD se expressa no código (modules, ports, adapters), não na camada de schema

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

**Armazenamento Offline:**
- MMKV: tokens, preferências, estado da sessão — leitura/escrita ultra-rápida
- expo-sqlite: lista de alunos offline, queue de check-ins pendentes — queries estruturadas

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

## 5. Padrões de Implementação & Regras de Consistência

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

## 6. Estrutura do Projeto & Fronteiras

### Repositório

Monorepo de diretórios simples (sem Nx/Turborepo — adequado para dev solo):

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
| Offline sync | N/A (resolve no sync) | `utils/offline-queue.ts` + `hooks/use-offline-sync.ts` |
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

## 7. Regras Obrigatórias para Agentes de IA

1. Todo controller DEVE ter decorators de Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
2. Todo endpoint DEVE usar `TenantGuard` + `@Roles()` — sem exceção
3. Toda lógica de domínio DEVE estar no functional core (Effect) — controllers e services NestJS são shells
4. Todo programa Effect DEVE declarar seus erros no tipo — nada de `Effect<A, never, R>` com erros silenciosos
5. Toda entidade DEVE ter `id`, `createdAt`, `updatedAt` e `companyId` (tenant)
6. Arquivos DEVEM usar `kebab-case` com sufixo de tipo (`.use-case.ts`, `.port.ts`, `.adapter.ts`, `.module.ts`)
7. Pastas `core/` contêm APENAS código Effect puro — zero imports de NestJS, Prisma ou Redis
8. Pastas `shell/` são o ÚNICO lugar onde NestJS, Prisma e Redis podem ser importados
9. Use cases DEVEM retornar `WithEvents<A>` — nunca emitir eventos diretamente no core

---

## 8. Sequência de Implementação

1. Inicialização dos projetos (Expo + NestJS starters)
2. Docker Compose (PostgreSQL + Redis)
3. Prisma schema + migrations
4. Effect TS setup + Composition Root (`EffectRuntimeModule`)
5. Auth module (JWT + Guards + RBAC)
6. Primeiro bounded context com CRUD (Rotas/Turmas)
7. Embarque digital (QR code + offline sync)
8. Localização em tempo real (SSE + Redis)
9. Notificações de ausência
10. Swagger documentation

**Dependências entre passos:**
- Effect Schema depende do setup Effect TS (passo 4)
- Auth Guards dependem do JWT module (passo 5)
- SSE depende de Redis (passo 2) + Effect runtime (passo 4)
- Offline sync depende de MMKV + expo-sqlite (configurados no passo 1)
- TanStack Query com persistência depende de MMKV (passo 1)

---

## 9. Gap Analysis & Prontidão

**Status:** PRONTO PARA IMPLEMENTAÇÃO — Nível de confiança alto.

**Gaps conhecidos:**
- ⚠️ Schema Prisma (entidades/campos): definir na primeira história
- ⚠️ Push notifications: fora do MVP
- ⚠️ Deploy específico (Railway vs Render): decidir no momento do deploy
- Nenhum gap crítico identificado

**Compatibilidade verificada:**
- Expo SDK 55 + NestJS v11 + Prisma v7 + Effect TS: sem conflitos
- SSE nativo NestJS + Redis Pub/Sub: padrão documentado
- Prisma v7 `moduleFormat = "cjs"`: resolve compatibilidade ESM/CJS
- `ManagedRuntime` + `useFactory`: funciona sem dependências externas
- Domain Events via return tuple: coerente com FC/IS + EventEmitter2
