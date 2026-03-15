# Padrões de Implementação & Regras de Consistência

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
