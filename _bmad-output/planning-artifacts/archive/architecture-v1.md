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

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Análise de Contexto do Projeto

### Visão Geral dos Requisitos

**Requisitos Funcionais:**

37 requisitos funcionais organizados em 7 categorias:

| Categoria | FRs | Implicação Arquitetural |
|---|---|---|
| Gestão de Identidade e Acesso | FR1-FR6 | Multi-tenancy por empresa, RBAC (3 roles: admin, motorista, aluno), JWT |
| Gestão de Rotas e Turmas | FR7-FR10 | CRUD com vínculo empresa→rota→aluno/motorista |
| Gestão de Viagens | FR11-FR14 | Máquina de estados (viagem: idle→ativa→encerrada), ida/volta como conceito de domínio |
| Embarque Digital (QR Code) | FR15-FR21 | QR estático por sessão, validação multi-regra, offline-first com sync |
| Lista de Alunos e Status | FR22-FR25 | Leitura em tempo real + offline, agregações (contagem embarcados) |
| Notificação de Ausência | FR26-FR30 | Eventos assíncronos motorista↔aluno, período de cancelamento, lembrete automático baseado em tempo |
| Localização em Tempo Real | FR31-FR35 | SSE + Redis Pub/Sub, streaming contínuo durante viagem, graceful degradation |
| Comunicação | FR36-FR37 | Broadcast motorista→alunos da rota |

**Requisitos Não-Funcionais:**

| Área | Requisitos-Chave | Decisão Implícita |
|---|---|---|
| Performance | QR check-in <2s, GPS latência <5s, notificação <3s | Redis como cache, SSE para push, queries otimizadas |
| Offline | Check-in offline, lista offline, persistência local, sync automático | Storage local no device + fila de sincronização + conflict resolution (last-write-wins) |
| Segurança | HTTPS, JWT (access 15min + refresh 7d), QR vinculado à sessão | Auth middleware, token rotation, session management |
| Multi-tenancy | Isolamento de dados por empresa | Tenant-aware queries, row-level filtering |
| Escalabilidade | DDD com bounded contexts, functional core / imperative shell | Hexagonal Architecture com ports & adapters |

**Escala & Complexidade:**

- Domínio primário: Mobile App (Expo/React Native) + API Backend (NestJS)
- Nível de complexidade: Média-Alta
- Componentes arquiteturais estimados: ~8-10 (Auth, Rotas, Viagens, Embarque, Notificações, Real-time/GPS, Sync, Comunicação)

### Restrições Técnicas & Dependências

- **Stack definida no PRD:** Expo/React Native, NestJS, Effect TS, PostgreSQL/Prisma, Redis, SSE
- **Arquitetura acadêmica (TCC):** Hexagonal Architecture + DDD + Functional Core / Imperative Shell — parte da tese, não opcional
- **Recurso:** Desenvolvedor solo (Lucas)
- **Prazo:** MVP ~2 meses (maio/2026), documentação completa dezembro/2026
- **Distribuição:** Expo Go / build de dev (sem loja)
- **Dispositivos:** Android 8+ / iOS 13+, telas de 5", dispositivos de baixo custo

### Preocupações Transversais Identificadas

- **Multi-tenancy** — permeia todo o sistema, desde autenticação até queries de dados
- **Offline/Online sync** — afeta check-in, lista de alunos, e potencialmente notificações
- **Autenticação e autorização** — JWT + RBAC por empresa, validação em cada operação
- **Real-time event delivery** — SSE para localização + notificações de status de embarque
- **Auditoria e rastreabilidade** — timestamps de check-in, histórico de viagens
- **LGPD** — consentimento, privacidade de GPS, direito de exclusão (Fase 2, mas com impacto arquitetural desde já)

### Desafios Arquiteturais Únicos

1. **Effect TS + NestJS coexistência** — Integrar programação funcional pura com framework OO sem acoplamento. Composition Root como ponto de encontro.
2. **SSE + Redis Pub/Sub para real-time** — Fluxo: REST → Redis → Pub/Sub → SSE → cliente. Fallback para polling caso falhe.
3. **Offline-first com sync** — Persistência local + queue de operações + resolução de conflitos em devices baratos.
4. **Bounded contexts com Effect TS** — Definir limites dos domínios mantendo o functional core testável isoladamente.

## Avaliação de Starter Templates

### Domínio Tecnológico Primário

Dois artefatos independentes identificados a partir da análise do PRD:
- **App Mobile** — Expo (React Native), cross-platform iOS + Android
- **API Backend** — NestJS (Node.js), monolito modular

### Versões Atuais Pesquisadas (Março/2026)

| Tecnologia | Versão | Observações |
|---|---|---|
| Expo SDK | 55 | `create-expo-app@latest`, template `default` inclui Expo Router + TypeScript |
| NestJS | v11.1.16 | SWC padrão (~20x mais rápido), Vitest padrão, ESM first-class, Express v5 / Fastify v5 |
| Prisma | v7.4.2 | Cliente TypeScript (~90% menor, ~3x mais rápido), ESM padrão. NestJS requer `moduleFormat = "cjs"` |
| Effect TS | Ativo | Integração manual (sem `@nestjs-effect` — ver decisão abaixo) |

### Starters Considerados

#### App Mobile: `create-expo-app` (Selecionado ✅)

**Comando de inicialização:**
```bash
npx create-expo-app@latest ./mobile --template default
```

**Decisões arquiteturais fornecidas pelo starter:**
- TypeScript configurado
- Expo Router (file-based routing)
- Metro bundler com hot reload
- Estrutura de projeto multi-tela
- Acesso a APIs nativas (câmera, GPS, notificações)

**Adicionar pós-inicialização:**
- Storage offline (expo-sqlite ou AsyncStorage)
- Leitura de QR code (expo-camera)
- Mapas para localização em tempo real
- Gerenciamento de estado
- EventSource para SSE

#### API Backend: `@nestjs/cli` (Selecionado ✅)

**Comando de inicialização:**
```bash
npx @nestjs/cli@latest new ./api --strict --package-manager npm
```

**Decisões arquiteturais fornecidas pelo starter:**
- TypeScript strict mode
- SWC como compilador
- Vitest para testes
- ESLint + Prettier
- Estrutura modular padrão NestJS
- ESM support

**Adicionar pós-inicialização:**
- Prisma ORM (PostgreSQL) com `moduleFormat = "cjs"`
- Effect TS (integração manual — ver abaixo)
- Redis (ioredis)
- JWT Auth (@nestjs/jwt + @nestjs/passport)
- Reorganização para Arquitetura Hexagonal

### Estrutura de Repositório

Monorepo de diretórios simples (sem Nx/Turborepo — adequado para dev solo):

```
pureurban/
├── mobile/          # Expo app (aluno + motorista)
├── api/             # NestJS backend
├── shared/          # (futuro) tipos compartilhados
└── docs/            # documentação
```

### Decisão de Integração: Effect TS ↔ NestJS

**Decisão:** Integração manual via Composition Root, sem bibliotecas de terceiros.

**Justificativa:** A biblioteca `@nestjs-effect` foi avaliada e descartada — 22 stars no GitHub, mantenedor único, pré-1.0, explicitamente "not production-ready", último publish há ~10 meses. Risco inaceitável de dependência.

**Padrão adotado: `useFactory` + `ManagedRuntime`**

O imperative shell (NestJS) injeta um runtime do Effect já montado com todas as dependências, via `useFactory` providers:

1. **Functional Core (Effect TS puro):** Define interfaces (Tags) e lógica de domínio. Zero imports de NestJS.
2. **Adapters:** Implementações concretas das portas (Prisma, Redis, etc.).
3. **Composition Root (`EffectRuntimeModule`):** `useFactory` do NestJS recebe dependências de infraestrutura (PrismaService, RedisService), monta os Layers do Effect e instancia um `ManagedRuntime`.
4. **Services do NestJS:** Recebem o runtime via `@Inject('EFFECT_RUNTIME')` e executam programas Effect com `runtime.runPromise(program)`.

**Benefícios:**
- Inversão de dependência explícita — core define interfaces, shell fornece implementações
- Atrito reduzido — services recebem runtime pronto, sem montagem repetitiva
- Testabilidade em dois níveis — core testável sem NestJS, integração testável via substituição de providers
- Material rico para TCC — demonstra concretamente coexistência de dois sistemas de DI distintos
- Lifecycle management — `ManagedRuntime` gerencia recursos, NestJS gerencia módulos

**Nota:** A inicialização do projeto usando estes comandos deve ser a primeira história de implementação.

## Decisões Arquiteturais Core

### Análise de Prioridade das Decisões

**Decisões Críticas (Bloqueiam Implementação):**
- Modelagem de dados (Prisma schema único)
- Estratégia de validação (Effect Schema)
- Padrão de autorização (NestJS Guards + RBAC)
- Gerenciamento de estado mobile (Zustand + TanStack Query)
- Armazenamento offline (MMKV + expo-sqlite)

**Decisões Importantes (Moldam a Arquitetura):**
- Tratamento de erros tipados (Effect → HTTP)
- Documentação da API (Swagger)
- Biblioteca de componentes UI (React Native Paper)
- Ambiente de desenvolvimento (Docker Compose)

**Decisões Deferidas (Pós-MVP):**
- Rate limiting → Fase 2 (sem exposição pública)
- Refresh token rotation → Fase 2 (simple refresh suficiente para protótipo)
- CI/CD → Fase 2 (dev solo, distribuição via Expo Go)
- Monitoramento externo → Fase 2 (logger NestJS v11 suficiente)
- Cache de listas de alunos em Redis → Fase 2 (overhead desnecessário no MVP)

### Arquitetura de Dados

**Schema Prisma:**
- Decisão: Schema único (`schema.prisma`) com separação lógica por comentários
- Rationale: MVP com ~5-8 entidades não justifica multi-file schemas. A separação DDD se expressa no código (modules, ports, adapters no Effect core), não na camada de schema
- Afeta: Todos os bounded contexts

**Validação de Dados:**
- Decisão: Effect Schema
- Rationale: Mantém validação no functional core (testável sem NestJS), coerente com ecossistema Effect. Na camada NestJS, um Pipe customizado converte erros Effect Schema → respostas HTTP
- Afeta: DTOs, domain entities, API input validation

**Cache (Redis):**
- Decisão: Redis para localização GPS (TTL curto, sobrescrita contínua) + blacklist de tokens JWT invalidados
- Rationale: GPS é o caso de uso principal confirmado no PRD. Blacklist necessária para logout seguro. Cache de dados frequentes deferido para Fase 2
- Afeta: Módulo de localização, módulo de autenticação

### Autenticação & Segurança

**Autorização (RBAC):**
- Decisão: NestJS Guards + decorators customizados (`@Roles('admin', 'driver', 'student')`)
- Padrão: `TenantGuard` extrai `tenantId` do JWT e injeta no request. Todas as queries filtradas por tenant — sem exceção
- 3 roles: `admin` (empresa), `driver` (motorista), `student` (aluno)
- Afeta: Todos os controllers, middleware layer

**Refresh Token:**
- Decisão: Simples sem rotation para MVP. Refresh token fixo por 7 dias
- Evolução: Design do JWT module no Effect core já prevê interface de token store para rotation futura (Fase 2)
- Afeta: Auth module

### API & Padrões de Comunicação

**Tratamento de Erros:**
- Decisão: Erros tipados do Effect mapeados para HTTP no imperative shell
- Padrão: Functional core retorna tagged errors (`StudentNotFound`, `InvalidQRCode`, `TenantMismatch`). NestJS ExceptionFilter converte → HTTP status codes + body `{ code: string, message: string, details?: object }`
- Rationale: Core agnóstico de HTTP, demonstra separação na tese
- Afeta: Todos os endpoints, ExceptionFilter global

**Documentação da API:**
- Decisão: Swagger/OpenAPI via `@nestjs/swagger`
- Rationale: Quase zero esforço, documentação interativa útil para desenvolvimento e apresentação do TCC
- Afeta: Controllers (decorators de Swagger)

**Rate Limiting:**
- Decisão: Deferido para Fase 2
- Rationale: Protótipo acadêmico sem exposição pública

### Arquitetura Frontend (Mobile)

**Gerenciamento de Estado:**
- Decisão: Zustand (estado local/UI) + TanStack Query (server state)
- Zustand: Estado da sessão, viagem ativa, modo offline, preferências
- TanStack Query: Cache de chamadas à API (lista de alunos, rotas), suporte offline via `persistQueryClient`
- Rationale: Dois tools com responsabilidades distintas, ambos leves e pragmáticos
- Afeta: Toda a camada de estado do app mobile

**Armazenamento Offline:**
- Decisão: MMKV (dados rápidos) + expo-sqlite (dados estruturados)
- MMKV: Tokens, preferências, estado da sessão — leitura/escrita ultra-rápida
- expo-sqlite: Lista de alunos offline, queue de check-ins pendentes — queries estruturadas
- Rationale: Cada storage no seu sweet spot de performance e complexidade
- Afeta: Módulo de sync offline, auth persistence, boarding queue

**Biblioteca de Componentes UI:**
- Decisão: React Native Paper (Material Design)
- Rationale: Maduro, boa documentação, componentes acessíveis prontos (botões grandes, contraste alto — alinha com NFR18/NFR19). Adequado para dev solo com prazo apertado
- Afeta: Toda a camada de UI

### Infraestrutura & Deploy

**Ambiente de Desenvolvimento:**
- Decisão: Docker Compose para desenvolvimento local (PostgreSQL + Redis + API)
- Rationale: Ambiente reproduzível, sem dependências locais complexas

**Hospedagem (Demo/Apresentação):**
- Decisão: Railway ou Render para deploy de demonstração
- Rationale: Deploy fácil, PostgreSQL + Redis managed, free tier generoso. Adequado para apresentação do TCC

**CI/CD:**
- Decisão: Deferido para Fase 2
- Rationale: Dev solo, GitHub como repositório suficiente. GitHub Actions para lint + testes pode ser adicionado depois

**Logging & Monitoramento:**
- Decisão: Logger padrão do NestJS v11 (JSON log melhorado)
- Rationale: Sem tooling externo no MVP. Suficiente para debug e demonstração

### Análise de Impacto das Decisões

**Sequência de Implementação:**
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

**Dependências entre Decisões:**
- Effect Schema depende do setup Effect TS (passo 4)
- Auth Guards dependem do JWT module (passo 5)
- Offline sync depende de MMKV + expo-sqlite (configurados no passo 1)
- SSE depende de Redis (passo 2) + Effect runtime (passo 4)
- TanStack Query com persistência depende de MMKV (passo 1)

## Padrões de Implementação & Regras de Consistência

### Padrões de Naming

**Banco de Dados (Prisma):**
- Tabelas (Models): `PascalCase` singular (`User`, `Route`, `Trip`, `BoardingRecord`)
- Colunas: `camelCase` (`userId`, `createdAt`, `tripStatus`)
- Relations: nome descritivo (`company`, `assignedRoutes`, `boardingRecords`)
- Enums: `SCREAMING_SNAKE_CASE` (`CHECKED_IN`, `NOT_RETURNING`, `TRIP_ACTIVE`)

**API REST:**
- Endpoints: `kebab-case`, plural (`/api/v1/routes`, `/api/v1/trips`, `/api/v1/boarding-records`)
- Parâmetros de rota: `:id` (padrão NestJS/Express)
- Query params: `camelCase` (`?routeId=123&tripStatus=active`)
- JSON fields: `camelCase` em toda a API

**Código TypeScript:**
- Arquivos: `kebab-case` com sufixo de tipo (`boarding.service.ts`, `check-in.use-case.ts`, `student-repository.port.ts`)
- Classes: `PascalCase` (`BoardingService`, `CheckInUseCase`)
- Interfaces/Tags Effect: `PascalCase` (`StudentRepository`, `LocationStore`)
- Funções/variáveis: `camelCase` (`processCheckIn`, `studentId`)
- Constantes: `SCREAMING_SNAKE_CASE` (`MAX_RETRY_ATTEMPTS`, `JWT_SECRET`)
- Tipos de erro Effect: `PascalCase` descritivo (`StudentNotFound`, `InvalidQRCode`, `TenantMismatch`)

### Padrões de Estrutura

**Testes:**
- Colocados junto ao arquivo testado (`*.spec.ts`)
- Exemplo: `core/use-cases/check-in.use-case.ts` → `core/use-cases/check-in.use-case.spec.ts`
- Testes de integração: pasta `test/` na raiz do projeto API (padrão NestJS)

**Organização do Backend (por bounded context — core/shell):**

```
api/src/
├── domains/
│   ├── auth/
│   │   ├── core/                    # Effect TS puro (functional core)
│   │   │   ├── ports/               # Interfaces (Tags Effect)
│   │   │   └── use-cases/           # Programas Effect
│   │   └── shell/                   # NestJS + Infra (imperative shell)
│   │       ├── adapters/            # Implementações dos ports
│   │       ├── http/                # Controllers
│   │       ├── auth.service.ts      # Chama Effect runtime
│   │       └── auth.module.ts       # NestJS module
│   │
│   ├── boarding/
│   │   ├── core/
│   │   │   ├── ports/
│   │   │   └── use-cases/
│   │   └── shell/
│   │       ├── adapters/
│   │       ├── http/
│   │       ├── boarding.service.ts
│   │       └── boarding.module.ts
│   │
│   ├── tracking/
│   │   ├── core/
│   │   └── shell/
│   │
│   └── shared/                      # Shared Kernel (DDD)
│       ├── core/                    # Puros, compartilhados
│       │   ├── errors/              # Interface base de erros
│       │   └── events/              # Contratos de eventos (Schema)
│       └── shell/                   # Infra cruzada
│           ├── effect-runtime/      # EffectRuntimeModule (Composition Root)
│           ├── guards/              # TenantGuard, RolesGuard
│           ├── filters/             # EffectExceptionFilter
│           ├── pipes/               # EffectSchemaPipe
│           └── infra/               # PrismaGlobalModule, LoggerAdapter
│
└── main.ts
```

**Rationale da estrutura:** Os nomes `core/` e `shell/` mapeiam diretamente para o padrão Functional Core / Imperative Shell (BERNHARDT, 2012), tornando a separação teórica visível na organização de pastas. O Shared Kernel (EVANS, 2003) segue a mesma convenção.

**Organização do Mobile (por feature — Expo Router):**

```
mobile/app/                          # Expo Router (file-based)
├── (auth)/                          # Grupo de autenticação
│   ├── login.tsx
│   └── ...
├── (student)/                       # Telas do aluno
│   ├── home.tsx
│   ├── qr-code.tsx
│   └── track-bus.tsx
├── (driver)/                        # Telas do motorista
│   ├── trip.tsx
│   ├── scan.tsx
│   └── student-list.tsx
└── _layout.tsx

mobile/src/
├── services/                        # Chamadas à API
├── stores/                          # Zustand stores
├── hooks/                           # Custom hooks
├── components/                      # Componentes reutilizáveis
└── utils/                           # Utilitários
```

### Padrões de Formato

**Resposta de sucesso da API:**
```json
{
  "data": { ... },
  "meta": { "timestamp": "2026-03-15T14:30:00Z" }
}
```

**Resposta de erro da API:**
```json
{
  "error": {
    "code": "STUDENT_NOT_FOUND",
    "message": "Aluno não encontrado",
    "details": { "studentId": "abc-123" }
  }
}
```

**Datas:** ISO 8601 strings em JSON (`2026-03-15T14:30:00Z`), sempre UTC na API. Conversão para timezone local apenas no frontend.

### Padrões de Comunicação

**Eventos SSE:**
- Naming: `domain.action` em `snake_case` (`location.updated`, `boarding.checked_in`, `student.not_returning`)
- Payload: `{ type: string, data: object, timestamp: string }`

**Zustand Stores:**
- Um store por domínio (`useAuthStore`, `useTripStore`, `useBoardingStore`)
- Actions como métodos do store, nunca mutações externas
- Padrão: `set(state => ({ ...state, field: newValue }))`

### Padrões de Processo

**Tratamento de erros no mobile:**
- Erros de rede: retry automático com backoff (TanStack Query)
- Erros de negócio: mensagem ao usuário via toast/snackbar (React Native Paper)
- Erros inesperados: log + tela de fallback genérica

**Loading states:**
- TanStack Query: usar `isLoading`, `isFetching`, `isError` nativos
- Operações sem TanStack Query: `status: 'idle' | 'loading' | 'success' | 'error'` (union types, nunca booleanos)

### Regras Obrigatórias para Agentes de IA

1. Todo controller DEVE ter decorators de Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
2. Todo endpoint DEVE usar `TenantGuard` + `@Roles()` — sem exceção
3. Toda lógica de domínio DEVE estar no functional core (Effect) — controllers e services NestJS são shells
4. Todo programa Effect DEVE declarar seus erros no tipo — nada de `Effect<A, never, R>` com erros silenciosos
5. Toda entidade DEVE ter `id`, `createdAt`, `updatedAt` e `companyId` (tenant)
6. Arquivos DEVEM usar `kebab-case` com sufixo de tipo (`.use-case.ts`, `.port.ts`, `.adapter.ts`, `.module.ts`)
7. Pastas `core/` contêm APENAS código Effect puro — zero imports de NestJS, Prisma ou Redis
8. Pastas `shell/` são o ÚNICO lugar onde NestJS, Prisma e Redis podem ser importados

## Estrutura do Projeto & Fronteiras

### Estrutura Completa do Diretório

```
pureurban/
├── README.md
├── .gitignore
├── docker-compose.yml                   # PostgreSQL + Redis (dev local)
│
├── api/                                 # NestJS Backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── vitest.config.ts
│   ├── .env
│   ├── .env.example
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   └── domains/
│   │       ├── auth/
│   │       │   ├── core/
│   │       │   │   ├── ports/
│   │       │   │   │   ├── user-repository.port.ts
│   │       │   │   │   └── token-service.port.ts
│   │       │   │   └── use-cases/
│   │       │   │       ├── login.use-case.ts
│   │       │   │       ├── refresh-token.use-case.ts
│   │       │   │       └── validate-token.use-case.ts
│   │       │   └── shell/
│   │       │       ├── adapters/
│   │       │       │   ├── prisma-user.adapter.ts
│   │       │       │   └── jwt-token.adapter.ts
│   │       │       ├── http/
│   │       │       │   └── auth.controller.ts
│   │       │       ├── auth.service.ts
│   │       │       └── auth.module.ts
│   │       │
│   │       ├── routing/
│   │       │   ├── core/
│   │       │   │   ├── ports/
│   │       │   │   │   ├── route-repository.port.ts
│   │       │   │   │   └── student-route-repository.port.ts
│   │       │   │   └── use-cases/
│   │       │   │       ├── create-route.use-case.ts
│   │       │   │       ├── assign-student.use-case.ts
│   │       │   │       └── assign-driver.use-case.ts
│   │       │   └── shell/
│   │       │       ├── adapters/
│   │       │       │   └── prisma-route.adapter.ts
│   │       │       ├── http/
│   │       │       │   └── routing.controller.ts
│   │       │       ├── routing.service.ts
│   │       │       └── routing.module.ts
│   │       │
│   │       ├── boarding/
│   │       │   ├── core/
│   │       │   │   ├── ports/
│   │       │   │   │   ├── boarding-repository.port.ts
│   │       │   │   │   └── notification-service.port.ts
│   │       │   │   └── use-cases/
│   │       │   │       ├── check-in.use-case.ts
│   │       │   │       ├── notify-not-returning.use-case.ts
│   │       │   │       ├── cancel-absence.use-case.ts
│   │       │   │       └── send-check-in-reminder.use-case.ts
│   │       │   └── shell/
│   │       │       ├── adapters/
│   │       │       │   └── prisma-boarding.adapter.ts
│   │       │       ├── http/
│   │       │       │   └── boarding.controller.ts
│   │       │       ├── boarding.service.ts
│   │       │       └── boarding.module.ts
│   │       │
│   │       ├── tracking/
│   │       │   ├── core/
│   │       │   │   ├── ports/
│   │       │   │   │   └── location-store.port.ts
│   │       │   │   └── use-cases/
│   │       │   │       ├── update-location.use-case.ts
│   │       │   │       └── get-bus-location.use-case.ts
│   │       │   └── shell/
│   │       │       ├── adapters/
│   │       │       │   └── redis-location.adapter.ts
│   │       │       ├── http/
│   │       │       │   ├── tracking.controller.ts
│   │       │       │   └── tracking-sse.controller.ts
│   │       │       ├── tracking.service.ts
│   │       │       └── tracking.module.ts
│   │       │
│   │       ├── trip/
│   │       │   ├── core/
│   │       │   │   ├── ports/
│   │       │   │   │   └── trip-repository.port.ts
│   │       │   │   └── use-cases/
│   │       │   │       ├── start-trip.use-case.ts
│   │       │   │       ├── end-trip.use-case.ts
│   │       │   │       └── get-trip-students.use-case.ts
│   │       │   └── shell/
│   │       │       ├── adapters/
│   │       │       │   └── prisma-trip.adapter.ts
│   │       │       ├── http/
│   │       │       │   └── trip.controller.ts
│   │       │       ├── trip.service.ts
│   │       │       └── trip.module.ts
│   │       │
│   │       └── shared/
│   │           ├── core/
│   │           │   ├── errors/
│   │           │   │   └── base.error.ts
│   │           │   ├── events/
│   │           │   │   └── event.interface.ts
│   │           │   └── schemas/
│   │           │       └── common.schema.ts
│   │           └── shell/
│   │               ├── effect-runtime/
│   │               │   └── effect-runtime.module.ts
│   │               ├── guards/
│   │               │   ├── tenant.guard.ts
│   │               │   └── roles.guard.ts
│   │               ├── filters/
│   │               │   └── effect-exception.filter.ts
│   │               ├── pipes/
│   │               │   └── effect-schema.pipe.ts
│   │               ├── decorators/
│   │               │   └── roles.decorator.ts
│   │               └── infra/
│   │                   ├── prisma-global.module.ts
│   │                   ├── prisma.service.ts
│   │                   ├── redis.module.ts
│   │                   └── redis.service.ts
│   └── test/
│       └── integration/
│
├── mobile/                              # Expo App
│   ├── package.json
│   ├── tsconfig.json
│   ├── app.json
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── (auth)/
│   │   │   ├── _layout.tsx
│   │   │   └── login.tsx
│   │   ├── (student)/
│   │   │   ├── _layout.tsx
│   │   │   ├── home.tsx
│   │   │   ├── qr-code.tsx
│   │   │   └── track-bus.tsx
│   │   └── (driver)/
│   │       ├── _layout.tsx
│   │       ├── trip.tsx
│   │       ├── scan.tsx
│   │       └── student-list.tsx
│   └── src/
│       ├── services/
│       │   ├── api-client.ts
│       │   ├── auth.service.ts
│       │   ├── boarding.service.ts
│       │   ├── tracking.service.ts
│       │   └── sse-client.ts
│       ├── stores/
│       │   ├── auth.store.ts
│       │   ├── trip.store.ts
│       │   └── boarding.store.ts
│       ├── hooks/
│       │   ├── use-auth.ts
│       │   ├── use-location.ts
│       │   └── use-offline-sync.ts
│       ├── components/
│       │   ├── qr-scanner.tsx
│       │   ├── student-card.tsx
│       │   ├── trip-status-bar.tsx
│       │   └── bus-map.tsx
│       └── utils/
│           ├── storage.ts
│           ├── offline-queue.ts
│           └── constants.ts
│
└── docs/
    └── README.md
```

### Fronteiras Arquiteturais

**Fronteiras da API (endpoints REST por domínio):**

| Domínio | Base Path | Responsabilidade |
|---|---|---|
| `auth` | `/api/v1/auth/*` | Login, refresh, perfil |
| `routing` | `/api/v1/routes/*` | CRUD rotas, vínculos aluno/motorista |
| `trip` | `/api/v1/trips/*` | Iniciar/encerrar viagem, listar alunos |
| `boarding` | `/api/v1/boarding/*` | Check-in, notificar ausência, lembrete |
| `tracking` | `/api/v1/tracking/*` | Enviar GPS, SSE de localização |

**Fronteira Core ↔ Shell (em cada domínio):**
- `core/ports/` define as interfaces (Tags Effect)
- `shell/adapters/` implementa as interfaces com tecnologias concretas
- `shell/*.service.ts` é o ponto de entrada — recebe `EFFECT_RUNTIME` e executa programas
- Regra absoluta: `core/` nunca importa de `shell/`. `shell/` importa e implementa `core/`

**Fronteira Mobile ↔ API:**
- Toda comunicação via REST (JSON, `camelCase`) + SSE (localização)
- `mobile/src/services/api-client.ts` é o único ponto de contato com a API
- TanStack Query gerencia cache/retry/offline para todas as chamadas REST

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

**Preocupações Transversais → Localização:**

| Concern | Backend | Mobile |
|---|---|---|
| Multi-tenancy | `shared/shell/guards/tenant.guard.ts` | Token JWT contém `companyId` |
| Auth/RBAC | `shared/shell/guards/roles.guard.ts` | `stores/auth.store.ts` |
| Offline sync | N/A (resolve no sync) | `utils/offline-queue.ts` + `hooks/use-offline-sync.ts` |
| Error handling | `shared/shell/filters/effect-exception.filter.ts` | TanStack Query `onError` + Toast |

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

## Decisão Adicional: Domain Events Funcionais

### Padrão Adotado: Return Tuple (`WithEvents<A>`)

**Decisão:** O functional core nunca emite eventos diretamente (side effect). Em vez disso, retorna uma tupla `[resultado, eventos[]]`. O imperative shell recebe os eventos puros e os despacha via `EventEmitter2` do NestJS.

**Rationale:** Emitir eventos dentro do core quebraria a premissa fundamental do Functional Core / Imperative Shell (BERNHARDT, 2012) — o core deve ser puro, determinístico, sem side effects. Com a tupla, o core *decide quais eventos ocorreram*, e o shell *executa o dispatch*.

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

**Benefícios:**
- Core 100% puro — zero side effects, mesma entrada → mesma saída sempre
- Testabilidade: `expect(events).toContain(...)` sem mocks de EventEmitter
- Transacionalidade: shell só emite se o programa Effect completous com sucesso
- Determinismo: perfeito para demonstração acadêmica no TCC

**Eventos do PureUrban:**

| Evento | Domínio Emissor | Consumidor |
|---|---|---|
| `boarding.checked_in` | boarding | tracking (atualiza contagem) |
| `boarding.not_returning` | boarding | trip (atualiza lista) |
| `boarding.absence_cancelled` | boarding | trip (reverte status) |
| `trip.started` | trip | tracking (inicia GPS stream) |
| `trip.ended` | trip | tracking (para GPS stream) |
| `location.updated` | tracking | SSE controller (push para alunos) |

**Arquivos adicionados à estrutura:**
- `domains/shared/core/events/domain-event.interface.ts`
- `domains/shared/core/events/with-events.ts`
- `domains/shared/shell/effect-runtime/event-dispatcher.service.ts`

## Resultados da Validação Arquitetural

### Validação de Coerência ✅

**Compatibilidade de Decisões:**
- Expo SDK 55 + NestJS v11 + Prisma v7 + Effect TS: sem conflitos de versão
- SSE nativo do NestJS + Redis Pub/Sub: padrão documentado
- Prisma v7 com `moduleFormat = "cjs"` resolve compatibilidade ESM/CJS
- `ManagedRuntime` + `useFactory`: integração funcional sem dependências externas
- Domain Events via return tuple: coerente com FC/IS, usa EventEmitter2 (padrão NestJS)

**Consistência de Padrões:**
- Naming `kebab-case` alinhado com NestJS CLI + Expo em toda a codebase
- `core/` e `shell/` aplicados universalmente
- Padrão de resposta JSON consistente com ExceptionFilter global
- Eventos SSE com naming `domain.action` coerente com bounded contexts

### Cobertura de Requisitos ✅

- **37/37 requisitos funcionais** cobertos pela arquitetura
- **20/20 requisitos não-funcionais** endereçados
- Todas as jornadas do usuário (Carlos, João, Márcia, Ana) suportadas pela estrutura

### Gap Analysis

- ⚠️ Schema Prisma (entidades/campos): definir na primeira história de implementação
- ⚠️ Push notifications: explicitamente fora do MVP
- ⚠️ Deploy específico (Railway vs Render): decidir no momento do deploy
- **Nenhum gap crítico identificado**

### Checklist de Completude

- [x] Análise de contexto do projeto
- [x] Starters selecionados com versões verificadas
- [x] Integração Effect ↔ NestJS decidida (`useFactory` + `ManagedRuntime`)
- [x] Decisões de dados (Prisma, Effect Schema, Redis)
- [x] Decisões de auth (JWT, Guards, RBAC, TenantGuard)
- [x] Decisões de API (REST, error mapping, Swagger)
- [x] Decisões de frontend (Zustand + TanStack Query, MMKV + expo-sqlite, RN Paper)
- [x] Decisões de infra (Docker Compose, Railway/Render)
- [x] Domain Events funcionais (WithEvents + EventEmitter2)
- [x] Padrões de naming completos
- [x] Estrutura de diretórios completa
- [x] Fronteiras arquiteturais definidas
- [x] Mapeamento FR → estrutura completo
- [x] Regras obrigatórias para agentes de IA

### Avaliação de Prontidão

**Status:** PRONTO PARA IMPLEMENTAÇÃO

**Nível de confiança:** Alto

**Pontos fortes:**
- Separação `core/shell` visível na estrutura de pastas — mapeamento direto para o referencial teórico
- Domain Events via return tuple mantêm pureza funcional absolute
- Decisões pragmáticas focadas no MVP
- Stack moderna com versões verificadas

**Áreas para aprimoramento futuro (Fase 2):**
- CI/CD pipeline (GitHub Actions)
- Refresh token rotation
- Push notifications (Expo Push API)
- Monitoramento (OpenTelemetry nativo do NestJS v11)
- Rate limiting

### Handoff para Implementação

**Diretrizes para agentes de IA:**
1. Seguir todas as decisões arquiteturais exatamente como documentadas
2. Usar padrões de implementação consistentemente em todos os componentes
3. Respeitar fronteiras `core/` (puro) e `shell/` (NestJS/infraestrutura)
4. Use cases DEVEM retornar `WithEvents<A>` — nunca emitir eventos diretamente
5. Consultar este documento para todas as questões arquiteturais

**Primeira prioridade de implementação:**
```bash
npx create-expo-app@latest ./mobile --template default
npx @nestjs/cli@latest new ./api --strict --package-manager npm
```
