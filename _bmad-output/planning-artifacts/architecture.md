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
revisedAt: '2026-08-23'
revisionNotes: 'Prazo estendido para dez/2026, equipe ampliada para 2 devs, simplificação do offline sync em tiers, CI/CD e testes E2E incorporados ao MVP. Revisão 12/07/2026 (sprint-change-proposal-2026-07-12, aprovado): nova §12 (Contrato de API e Desenvolvimento Paralelo — OpenAPI-first), §10 reescrita em duas trilhas formais, §9 substituída pelo ciclo contrato → trilhas paralelas → integração, e regras 11-13 adicionadas à §8. Nenhuma decisão estrutural alterada. Revisão 23/08/2026 (sprint-change-proposal-2026-08-23, aprovado): Expo Go removido como alvo de distribuição — premissa incompatível com a stack MMKV/Nitro decidida em §3. Nova subseção §3 (Ambiente de Execução e Validação) definindo web como alvo primário de desenvolvimento e development build Android para validação nativa; regras 14-16 adicionadas à §8. Nenhuma decisão estrutural alterada. Revisão 28/08/2026 (sprint-change-proposal-2026-08-28, aprovado): recurso humano corrigido para desenvolvedor solo; §10 reescrita como Modelo de Execução (Desenvolvedor Solo) com a nota da tese reenquadrada; §9 ganha o ciclo vertical dos Épicos 4 e 5 ao lado do ciclo de trilhas do Épico 3; §12 rescopa a camada de mock ao Épico 3 e troca boarding.broadcast por boarding.checkin_reminder; regras 12, 14 e 15 da §8 ajustadas; build Android demovido a validação final. FR36/FR37 diferidos para a Fase 2; FR30 e FR32 mudam de forma de entrega. Nenhuma decisão estrutural alterada.'
---

# Architecture Decision Document — PureUrban

## 1. Visão Geral & Restrições

### Contexto do Projeto

- **Domínio:** App de gestão de transporte escolar/universitário (Expo/React Native + NestJS)
- **Complexidade:** Média-Alta — 37 FRs em 7 categorias, 20 NFRs
- **Recurso:** desenvolvedor solo (Lucas) + agentes de IA — MVP até novembro/2026, defesa em dezembro/2026
- **Distribuição:** Development build (EAS, sem loja), Android 8+ / iOS 13+, telas 5", dispositivos de baixo custo. **Expo Go não é alvo** — ver §3, Ambiente de Execução e Validação
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

### Ambiente de Execução e Validação (Mobile)

**Expo Go não é um alvo suportado.** O `react-native-mmkv` v4 usa Nitro Modules — código nativo ausente do binário do Expo Go — e está no caminho de boot do app (`_layout.tsx`, `auth.store.ts`, `api-client.ts`, `mmkv-persister.ts`). Qualquer tentativa de rodar no Expo Go falha antes da tela de login, independentemente da versão do SDK.

O mobile é executado em dois ambientes complementares:

| Ambiente | Comando | Papel |
|---|---|---|
| **Web** (alvo primário de desenvolvimento) | `npm run web` | Ciclo diário. Telas, navegação, estado, SSE, offline Tier 1, leitura de QR via webcam |
| **Development build Android** (EAS) | `eas build -p android --profile development` | **Validação final, antes da defesa.** NFR5 (boot < 3s) e NFR18-NFR20 (ergonomia, tela de 5"). Não é pré-requisito de nenhuma story de feature: push saiu do MVP, GPS usa a Geolocation API no web e o Tier 2 foi verificado em wa-sqlite/OPFS na Story 1.6 |

**Substituições no alvo web** — equivalentes em API, distintos em substrato:

| Nativo | Web | Consequência |
|---|---|---|
| MMKV (mmap) | `localStorage` | Sem criptografia, perfil de performance diferente |
| expo-sqlite (SQLite nativo) | wa-sqlite (WASM/OPFS) | Exige `assetExts: ['wasm']` e headers COOP/COEP no Metro |
| expo-camera (nativo) | `getUserMedia` + `useWebBarcodeScanner` | Webcam, não câmera de device |

As regras decorrentes deste ambiente estão na §8 (regras 14, 15 e 16).

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
11. Tipos de API no mobile são **gerados** a partir de `api/openapi.json` (via `openapi-typescript`) — NUNCA escritos à mão. Editar `src/types/api.d.ts` manualmente é violação de contrato
12. **(histórico — vale apenas para o Épico 3)** Stories de trilha mobile (`X.Yb`) do Épico 3 desenvolvem contra os handlers MSW da Story 3.0. A partir do Épico 4 o projeto voltou ao fatiamento vertical e a camada de mock foi removida (§10): stories de feature são desenvolvidas contra a API local (`docker compose up` + `npm run start:dev`)
13. Nenhum endpoint **e nenhum evento SSE** entra numa story `X.Ya` sem estar declarado no contrato da story `X.0` do épico. Vale para o payload REST e para o schema de cada evento do stream — o mobile precisa mockar ambos. (Domain events internos entre bounded contexts — §4 — não são contrato de cliente e ficam fora desta regra, exceto quando expostos num stream SSE)
14. Toda dependência mobile nova DEVE ter suporte web declarado **ou** uma variante `.web.tsx` / `.web.ts` antes de ser adotada. A biblioteca de mapas do Épico 5 deixou de ser necessária na revisão de 28/08/2026 — o FR32 é entregue como última posição + ETA, sem renderização cartográfica
15. Nenhuma story mobile é considerada `done` sem execução verificada em pelo menos um dos dois ambientes da §3. **Todas as stories de feature restantes são verificáveis no alvo web.** O development build Android (Story 1.7) é exigido apenas para NFR5 e NFR18-NFR20, na validação final antes da defesa
16. `expo export --platform web` DEVE fazer parte da pipeline de CI como smoke test de bundle

---

## 9. Sequência de Implementação

### Fase de fundação (concluída — Épicos 1 e 2)

1. Inicialização dos projetos (Expo + NestJS starters)
2. Docker Compose (PostgreSQL + Redis)
3. CI/CD — GitHub Actions (lint + test + build no PR)
4. Prisma schema + migrations
5. Effect TS setup + Composition Root (`EffectRuntimeModule`)
6. Auth module (JWT + Guards + RBAC)
7. Primeiro bounded context com CRUD (Rotas/Turmas)

### Fase de execução por épico (Épicos 3 → 4 → 5)

> **Revisão de 28/08/2026 (`sprint-change-proposal-2026-08-28`, aprovado):** o ciclo de
> trilhas paralelas descrito abaixo vale integralmente para o **Épico 3**, que executa até
> o fim sob ele. A partir do **Épico 4** o projeto voltou ao fatiamento vertical — ver o
> ciclo vertical logo após os invariantes.

#### Épico 3 — ciclo de trilhas paralelas (modelo histórico)

A partir do Épico 3, a implementação deixa de ser uma lista linear de features e passa a repetir um **ciclo por épico**. A ordem dos épicos permanece **3 (Embarque) → 4 (Ausência e Comunicação) → 5 (Localização)**; o que muda é a estrutura interna de cada um:

```
  X.0  Contrato de API (OpenAPI-first)      ← bloqueia as duas trilhas
        │  DTOs + controllers stub (501) + Swagger + openapi.json
        │  + tipos gerados + handlers MSW (REST e SSE)
        │
        ├────────────────────┬────────────────────┐
        ↓                    ↓                    │
   Trilha API           Trilha Mobile             │  ← em paralelo
   (X.Ya — Dev 1)       (X.Yb — Dev 2)            │
   core Effect          telas, stores,            │
   + shell + adapters   offline, contra MSW       │
        │                    │                    │
        └────────────────────┴────────────────────┘
                             ↓
  X.N  Integração — mocks desligados, API real, E2E do épico
```

**Invariantes do ciclo:**
- A story `X.0` é **bloqueante**: nenhuma trilha começa antes do contrato existir e estar commitado.
- As trilhas `X.Ya` e `X.Yb` **não se bloqueiam mutuamente** — cada uma valida contra o contrato, não contra a outra.
- O épico só está entregue na `X.N`. Antes disso existem duas metades, não um incremento demonstrável.
- O drift check no CI (§12) é o que impede as trilhas de divergirem em silêncio entre `X.0` e `X.N`.

#### Épicos 4 e 5 — ciclo vertical (revisão de 28/08/2026)

```
  X.0  Contrato de API (OpenAPI-first)
        │  DTOs + controllers stub (501) + Swagger + openapi.json + tipos gerados
        │  SEM handlers MSW — não há trilha paralela a desbloquear
        ↓
  X.1 … X.n  Fatias verticais por FR
        │  core Effect + shell + adapters + tela, na mesma story,
        │  desenvolvidas contra a API local
        ↓
  X.N  E2E do épico (mocks não existem — nada a desligar)
```

**Invariantes que sobrevivem:** a `X.0` continua bloqueante; nenhum endpoint ou evento SSE
entra numa fatia sem estar no contrato; o drift check no CI (§12) continua sendo o guardião
do `openapi.json`.

**Guarda-corpo de tamanho:** uma fatia vertical que passe de ~8 ACs ou toque mais de ~15
arquivos é dividida por camada **dentro do mesmo épico**, em sequência (backend, depois
mobile contra a API local) — nunca voltando à camada de mock.

### Trabalho transversal (após o Épico 5)

8. Push notifications (Expo Push API) — **diferido para a Fase 2**. No MVP o lembrete do FR30
   é entregue in-app pelo canal SSE do Épico 4
9. Testes E2E consolidados (Supertest/Playwright API + Playwright mobile) — o grosso já é entregue nas stories `X.N`

**Dependências entre passos:**
- CI/CD (passo 3) deve estar pronto antes do segundo dev começar a contribuir
- Effect Schema depende do setup Effect TS (passo 5)
- Auth Guards dependem do JWT module (passo 6)
- SSE depende de Redis (passo 2) + Effect runtime (passo 5)
- Offline Tier 1 depende de MMKV + TanStack Query (configurados no passo 1)
- Offline Tier 2 depende de expo-sqlite (passo 1) + idempotência no endpoint de check-in (Story 3.3a — a idempotência é propriedade do endpoint, não do offline)

---

## 10. Modelo de Execução (Desenvolvedor Solo)

O segundo desenvolvedor previsto em 12/07/2026 não se materializou. Confirmado em
28/08/2026 (`sprint-change-proposal-2026-08-28`, aprovado): o projeto é executado por um
**desenvolvedor solo (Lucas) apoiado por agentes de IA**. O fatiamento em trilhas paralelas
— cujo **único** objetivo era o paralelismo — foi revertido a partir do Épico 4.

**O que sai:** a camada de mock MSW como obrigação de processo, e a divisão de stories por
camada (`X.Ya` / `X.Yb`).

**O que fica:** o contrato OpenAPI-first (§12). O `openapi.json` versionado e o drift check
no CI têm valor independente do paralelismo — são a documentação viva da API e o mecanismo
que impede divergência silenciosa entre o código e o contrato publicado.

**O que muda no Épico 3:** nada. Ele executou inteiro sob o modelo de duas trilhas e termina
assim. O modelo está preservado na §9 como registro histórico.

### A fronteira arquitetural continua valendo

A arquitetura hexagonal com bounded contexts cria uma fronteira natural — `core/` vs `shell/`
e domínios independentes. Ela deixa de ser usada como linha de divisão **entre pessoas** e
volta a ser o que sempre foi: a linha de divisão **entre responsabilidades**, dentro da mesma
fatia vertical.

| | Dentro de uma fatia vertical `X.n` |
|---|---|
| **Contrato (`X.0`)** | DTOs, controllers stub (501), decorators Swagger, `openapi.json` commitado, `src/types/api.d.ts` gerado |
| **Backend** | functional core (Effect) + shell NestJS + adapters |
| **Mobile** | telas, stores Zustand, services, hooks — contra a **API local** |
| **Testes** | use cases do core sem infraestrutura (< 100ms por suite) + fluxos contra a API local |
| **E2E (`X.N`)** | prova o épico ponta a ponta; não há mocks a desligar |

**Guarda-corpo de tamanho:** fatia vertical acima de ~8 ACs ou ~15 arquivos é dividida por
camada, **em sequência** (backend, depois mobile contra a API local), dentro do mesmo épico —
nunca voltando à camada de mock.

### Nota para a tese (revisada em 28/08/2026)

A afirmação original — *"a arquitetura hexagonal facilita trabalho paralelo em equipes
pequenas"* — deixa de ser verificável em três épicos e passa a ser verificável em um.
O reenquadramento preserva o material e melhora o desenho experimental:

- **Épico 3** = estudo de caso do modelo de trilhas paralelas com contrato OpenAPI.
- **Épicos 4 e 5** = grupo de comparação, sob fatiamento vertical.

O resultado deixa de ser uma afirmação de viabilidade sem controle e passa a ser uma
**observação comparativa** sobre o custo da camada de mock para um desenvolvedor solo —
material mais defensável, porque tem termo de comparação.

---

## 11. Gap Analysis & Prontidão

**Status:** PRONTO PARA IMPLEMENTAÇÃO — Nível de confiança alto.

**Gaps conhecidos:**
- ✅ Schema Prisma (entidades/campos): definido na Story 1.2
- ⚠️ Deploy específico (Railway vs Render): decidir no momento do deploy
- ✅ Shell de navegação do mobile ausente (Story 1.8) — **RESOLVIDO em 28/08/2026**: `<Stack>` + guards por papel; telas do produto alcançáveis
- ✅ Seed do banco quebrado sob Prisma 7 (Story 1.9) — **RESOLVIDO em 07/09/2026**: `prisma.config.ts` + adapter `PrismaPg`; `npm run seed` verificado
- Nenhum gap crítico identificado

**Compatibilidade verificada:**
- Expo SDK 55 + NestJS v11 + Prisma v7 + Effect TS: sem conflitos
- SSE nativo NestJS + Redis Pub/Sub: padrão documentado
- Prisma v7 `moduleFormat = "cjs"`: resolve compatibilidade ESM/CJS
- `ManagedRuntime` + `useFactory`: funciona sem dependências externas

### Trabalhos Futuros — Production Readiness (reemitido no wrap-3, 13/09/2026)

> Compromisso da retro do Épico 2, reemitido pela retro do Épico 3 (AI8, sem evidência
> de pouso) e cumprido pelo spec-wrap-3. A fonte **viva** dos débitos é
> `_bmad-output/implementation-artifacts/deferred-work.md`; esta seção é a fotografia
> com evidência, insumo direto da defesa do TCC.

**Evidência de pouso (Fase 1 completa — Épicos 1–5).** Gate completo da retro do Épico 5
(12/09/2026, stack real: Postgres/Redis via docker compose, API `:3001`, Expo Web
`:8081` sem MSW): **320 unit + 193 supertest + 2 pw:api + 10 pw:e2e verdes** e NFRs de
performance **medidos pela UI contra a API real** — NFR1 13ms (budget 2s), NFR2 25ms
(budget 5s), NFR3 101ms (budget 3s), NFR4 33ms com 55 alunos (budget 1s). O gate é o
script `npm run gate` (api/), que sobe a infra, roda as quatro suítes + drift check do
contrato e desliga o que iniciou; a bateria de fronteiras do wrap-2 (PR #41) elevou para
335 unit / 199 supertest. O canal SSE + Redis Pub/Sub do Épico 5 foi provado ponta a
ponta pela UI, incluindo comportamento degradado e fim limpo da transmissão.

**Débitos sistêmicos fechados desde a retro 2 (evidência verificada contra o HEAD):**

| Débito | Fechado por |
|---|---|
| Nenhuma tela do produto alcançável (shell ausente) | Story 1.8 (28/08/2026) |
| Seed quebrado sob Prisma 7 | Story 1.9 (PR #24) |
| Sem gate de testes automatizado | `npm run gate` — PR #31 |
| Suíte e2e vermelha na baseline (login 201×200) + P2002 do login | PR #31 |
| Queries offline pausando (`onlineManager` inerte): `networkMode: 'always'` global + factory de query options | PR #31 (decisão: SEM NetInfo — conectividade derivada do desfecho de transporte) |
| CORS × SSE bloqueado no browser (cache-control fora da allowlist, shim de teste) | PR #31 |
| CORS sem fail-fast em produção; preflight sem teste | wrap-1 (PR #39) |
| `toInfraError` em 11 cópias; harness de TestClock duplicado | PR #31 (extração; boarding/tracking adaptadores já nascem no helper) |
| Resync do last-known prometido pelo contrato e nunca executado; comentários descrevendo comportamento inexistente | wrap-1 (PR #39) — guarda monotônica por `capturedAt` |
| Mensagem não-objeto no Redis derrubando o processo (`handleMessage` sem guard, 2 cópias) | wrap-1 (PR #39) |
| Captura GPS engolindo 409/403 determinísticos (tempestade de POSTs pós-fim de viagem) | wrap-1 (PR #39) |
| Baratas: NaN no `formatClock`, `pollingInterval` do SSE, `isActive` na descoberta | wrap-1 (PR #39) |
| `QueueStorage` (SQL de produção) sem teste — bateria contra SQLite real | wrap-2 (PR #41) |
| Fronteiras dos Épicos 4/5 sem bateria (2 ausências, 2+ elegíveis, ADMIN, tie-break da descoberta, NFR10, accuracy −5, ping×timer) | wrap-2 (PR #41) |
| Contrato publicado divergente do código (staleness por idade; `capturedAt` rejeitando ISO válido; 501 de handlers reais; 403 do end-trip sem código de negócio) | **wrap-3 (este PR)** |

**Débitos sistêmicos abertos (aceitos como escopo de TCC; principais itens — a lista
viva completa é o `deferred-work.md`; mitigação é decisão de produto/arquitetura, não
patch):**

| Categoria | Débito | Origem | Mitigação proposta |
|---|---|---|---|
| Segurança | JWT nunca revalidado contra `isActive`/`role` — token vale até expirar; SSE autoriza só no connect | 3-5a; retro 5 (R8) | Revalidação em janela (ex.: no heartbeat do SSE) |
| Segurança | QR do aluno é UUID opaco em texto claro (`sessionId` nunca validado no backend) | 3.2b | Assinar o payload ou registrar/validar `sessionId` no check-in |
| Segurança | Segundo 401 após refresh bem-sucedido não encerra a sessão no app | 3.3b | Tratar 401 pós-refresh como logout |
| Multi-tenancy | Sem guard de empresa ativa — JWT válido de empresa desativada opera | 2.3 | Checar status no `TenantGuard` |
| DoS / Performance | Paginação sem teto; bcrypt sem rate limiting; N+1 em `updateDriver` | 2.4 / 2.3 | Limites de página, throttling, query única |
| Confiabilidade de eventos | Sem outbox transacional; dispatch best-effort pós-commit; `ManagedRuntime` sem `dispose()`; `Effect.orDie` converte falha de infra em 500 | 2.6 / 3.3a | Outbox + hook de dispose + mapeamento de erros |
| Confiabilidade | Resync do aluno compara relógios de domínios distintos — `capturedAt` (device do motorista) × timestamp do servidor no evento; o last-known não carrega carimbo do servidor | wrap-1 (review F3) | Servidor carimbar o `receivedAt` no last-known |
| Concorrência | Races check-then-create: vínculos (P2002 vira 500 no routing), duas viagens ativas por motorista (sem índice único parcial), TOCTOU check-in × fim de viagem | 2.6 / 3.3a / 3.1 | Índice único parcial (SQL cru), transação `FOR SHARE`, discriminação de P2002 no Prisma 7 |
| Fila offline | Desfecho pendente de decisão de produto (identidade no item, logout limpando, expiração 24h, invalidação pós-dreno, purga de linhas `sent`, `failedCount` preso) | 3.4b; retro 3 (AI3) | **wrap-5**, gated na matriz de decisão |
| Dívida de forma | Broadcaster SSE em 4 cópias; specs e2e gigantes (boarding 1.753, tracking 995 linhas) | retro 5 (AI6) | **wrap-4** |
| Processo | Sem CI — o gate é manual; lint da API vermelho na baseline (~147 erros) | 3.6 | Pipeline GitHub Actions; story de higiene de lint |
| Compliance | Sem audit trail (`actorId` ausente dos eventos) | 2.4 | Propagar ator nos domain events |

**O que fica para device — Story 1.7 (development build Android), não bloqueia o
desenvolvimento:** NFR5 (boot < 3s em Android 8+), NFR18–NFR20 (usabilidade em tela 5",
uma mão), o timeout de `Location.getCurrentPositionAsync` (EH-8 — risco silencioso da
transmissão GPS, talvez falso), a linha "F5 offline" do cache persistido (limitação do
dev server do Metro) e o realtime nativo (SSE, câmera e QR fora do browser).

---

## 12. Contrato de API e Desenvolvimento Paralelo (OpenAPI-first)

O `api/openapi.json` versionado é o contrato entre a API e o app. Ele nasceu para impedir que
duas trilhas paralelas divergissem; com o retorno ao modelo solo (§10) o paralelismo saiu, mas
**o contrato ficou** — agora como documentação viva da API e como guardião contra divergência
silenciosa entre o código e o contrato publicado, via drift check no CI.

**Decisão:** o contrato é um **artefato versionado no repositório**, não um endpoint servido em runtime. O Swagger já configurado (`api/src/main.ts`) documenta a API rodando; isso não basta para a trilha mobile, que precisa do contrato *antes* de o backend existir. O `openapi.json` commitado é o que torna as trilhas paralelas viáveis.

### Fluxo por épico

1. **Story `X.0`** declara DTOs, controllers stub e decorators Swagger completos. Os controllers retornam `501 Not Implemented` — o contrato existe, a lógica não.
2. `npm run openapi:export` (em `api/`) emite `api/openapi.json`. **O arquivo é commitado.**
3. Mobile roda `openapi-typescript api/openapi.json -o src/types/api.d.ts`. Nenhum tipo de API é escrito à mão (§8, regra 11).
4. **(Épico 3 apenas)** Mobile cria os handlers MSW em `mobile/src/mocks/handlers/` a partir do contrato (§8, regra 12).
5. **Épico 3:** trilhas `X.Ya` (API) e `X.Yb` (Mobile) executam em paralelo, cada uma validando contra o contrato.
   **Épicos 4 e 5:** fatias verticais `X.1 … X.n`, cada uma implementando core + shell + tela contra a API local.
6. **Story `X.N`** roda os E2E do épico. No Épico 3 ela também desliga os mocks; nos Épicos 4 e 5 não há mocks a desligar.

### Eventos SSE são contrato

O real-time do PureUrban não é acessório — é o produto (embarque em tempo real, ausência em tempo real, ônibus no mapa). Portanto **o schema de cada evento SSE é parte do contrato do épico, no mesmo nível dos endpoints REST**:

| Épico | Stream | Eventos declarados no `X.0` |
|---|---|---|
| 4 | `GET /api/v1/boarding/events` | `boarding.not_returning`, `boarding.absence_cancelled`, `boarding.checkin_reminder` |
| 5 | `GET /api/v1/tracking/trips/:id/stream` | `location.updated` |

Cada evento é declarado na story `X.0` como schema compartilhado — nome do evento, shape do `data`, e o endpoint de stream que o emite. A story `X.Ya` que publica o evento **não pode alterar esse shape** sem passar por uma mudança de contrato revisada pelas duas trilhas (§8, regra 13).

> Distinção importante: os **domain events internos** (§4 — `WithEvents`, `EventEmitter2`) são um mecanismo de comunicação entre bounded contexts e **não** são contrato de cliente. Só entram no `X.0` quando são expostos num stream SSE. `boarding.checked_in`, por exemplo, é interno ao backend no Épico 3; `boarding.not_returning` atravessa a fronteira no Épico 4 e por isso vira contrato.

### A camada de mock cobre stream, não só request/response *(histórico — Épico 3)*

> **Revisão de 28/08/2026:** esta subseção descreve uma exigência que valeu enquanto as
> trilhas eram paralelas. A partir do Épico 4 a camada de mock foi removida (§10) e o `msw`
> deixa de ser dependência obrigatória do fluxo: as telas de real-time são desenvolvidas
> contra o stream SSE da API local. O texto abaixo fica preservado como registro do modelo
> aplicado ao Épico 3.

Consequência direta do item acima: **os handlers MSW precisam ser capazes de emitir sequências de eventos ao longo do tempo**, não apenas responder a requisições.

- **Épico 5 (crítico):** o mapa do aluno (Story 5.2b) só pode ser desenvolvido contra um mock que emita uma **sequência** de `location.updated` — o mock precisa simular movimento, senão não há o que animar e a trilha mobile do épico trava. Um mock estático de "última posição conhecida" cobre apenas o estado inicial da tela (Story 5.3b).
- **Épico 4:** a tela do motorista (Story 4.2b) precisa receber `boarding.not_returning` *chegando* para testar o toast, a atualização de status e o ajuste da contagem.

MSW suporta streaming de `text/event-stream` via `ReadableStream` no handler — a exigência é que a story `X.0` de cada épico com real-time entregue um mock de stream funcional, não um stub. **Se o mock de stream não emite sequências, a story `X.0` não está concluída.**

### Drift check (CI)

O pipeline (GitHub Actions) regenera o `openapi.json` a partir do código e **falha o PR se divergir do arquivo commitado**. É o mecanismo que impede as trilhas de se separarem em silêncio entre a `X.0` e a `X.N`.

Consequência prática: **mudança de contrato é mudança consciente**. Quem precisa alterar o contrato no meio de um épico regenera o `openapi.json`, commita, e as duas trilhas revisam — o mobile regenera os tipos e ajusta os mocks no mesmo PR. O CI transforma um bug de integração silencioso (descoberto na `X.N`, quando é caro) num PR vermelho (descoberto no dia, quando é barato).

### Dependências de desenvolvimento

| Projeto | Dependência | Finalidade |
|---|---|---|
| `api/` | script `openapi:export` (usa `@nestjs/swagger`, já instalado) | Emitir `api/openapi.json` versionado |
| `mobile/` | `openapi-typescript` (dev) | Gerar `src/types/api.d.ts` a partir do contrato |
| `mobile/` | `msw` (dev) | Mock HTTP **e SSE** para a trilha mobile trabalhar sem backend |

Nenhuma dependência de runtime é adicionada ao app — as três são de desenvolvimento e não entram no bundle.

### Deferido: contract testing consumer-driven (Pact)

O módulo TEA já está configurado com `tea_use_pactjs_utils = true`, e testes de contrato consumer-driven são a evolução natural deste desenho. **Ficam deferidos:** o `openapi.json` versionado + drift check bloqueante no CI + a story de integração `X.N` cobrem a necessidade no nível de rigor que o MVP precisa, com uma fração do custo de setup. Pact é candidato a trabalho futuro — e material honesto para a seção de limitações da tese.
- Domain Events via return tuple: coerente com FC/IS + EventEmitter2
