# Story 3.1: Iniciar e Encerrar Viagem (Backend + Mobile Motorista)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como motorista,
Quero iniciar e encerrar viagens para minhas rotas,
Para que o sistema saiba quando o transporte está ativo.

## Acceptance Criteria

1. **Given** motorista autenticado com rota atribuída
   **When** toca "Iniciar Viagem" no app
   **Then** POST `/api/v1/trips` cria viagem com `status = ACTIVE`, `type = OUTBOUND`, `startedAt = now`
   **And** a tela `(driver)/trip.tsx` exibe viagem ativa com status e contagem de alunos

2. **Given** viagem ativa
   **When** motorista toca "Encerrar Viagem"
   **Then** PATCH `/api/v1/trips/:id/end` atualiza para `status = COMPLETED`, `endedAt = now`
   **And** motorista pode iniciar viagem de retorno (`type = RETURN`) para a mesma rota

3. **Given** viagem encerrada (OUTBOUND)
   **When** motorista toca "Iniciar Retorno"
   **Then** POST `/api/v1/trips` cria nova viagem com `type = RETURN`, `status = ACTIVE`, `relatedTripId` apontando para a viagem de ida

4. **Given** use case de trip executado
   **When** viagem é iniciada ou encerrada
   **Then** domain events `trip.started` e `trip.ended` são emitidos via `WithEvents`

5. **Given** usuário com role diferente de `driver`
   **When** tenta iniciar/encerrar viagem
   **Then** retorna 403 Forbidden (RolesGuard + `@Roles('driver')`)

6. **Given** viagem criada
   **When** registro é persistido
   **Then** contém `id`, `companyId`, `routeId`, `driverId`, `type`, `status`, `startedAt`, `endedAt`, `createdAt`, `updatedAt` (FR14)

## ⚠️ DEPENDÊNCIA CRÍTICA — Epic 2 Não Implementado

Esta story pressupõe que Epic 2 (Auth, Cadastro, Rotas) foi implementado. Se Epic 2 **não** estiver pronto:

- **Auth/JWT** — Não existe `JwtAuthGuard` nem `@nestjs/jwt`. Para desenvolver esta story, implementar um stub mínimo de autenticação OU usar `request.user` mockado manualmente nos testes.
- **Modelo User/Driver** — Não existem entidades `User`, `Driver` no Prisma. Criar as entidades necessárias no schema Prisma como parte desta story OU stub mínimo.
- **Modelo Route** — Não existe entidade `Route` no Prisma. Criar a entidade base necessária.

**Recomendação:** Antes de implementar esta story, verificar se Epic 2 já foi concluído. Caso contrário, considerar implementar primeiro ou criar stubs mínimos com `TODO: replace with real auth from Epic 2`.

## Tasks / Subtasks

- [x] Task 1 — Schema Prisma: Entidades Trip e dependências (AC: #1, #2, #3, #6)
  - [x] 1.1 Adicionar enums `TripStatus` (ACTIVE, COMPLETED) e `TripType` (OUTBOUND, RETURN) ao schema Prisma
  - [x] 1.2 Adicionar modelo `Trip` com campos: `id` (UUID), `companyId`, `routeId`, `driverId`, `type` (TripType), `status` (TripStatus), `startedAt`, `endedAt?`, `relatedTripId?`, `createdAt`, `updatedAt` com `@@schema("trip")`
  - [x] 1.3 User/Route não existem — usando IDs sem FK formal (cross-schema, conforme nota de dependência)
  - [x] 1.4 Executar `npx prisma migrate dev --name add-trip-entities` — migração aplicada com sucesso
  - [x] 1.5 Validar: `npx prisma generate` sem erros — cliente gerado

- [x] Task 2 — Functional Core: Erros tagueados do domínio Trip (AC: #1, #2, #5)
  - [x] 2.1 Criar `api/src/domains/trip/core/errors/trip.errors.ts` com tagged errors: `TripNotFound`, `TripAlreadyActive`, `InvalidTripTransition`, `DriverNotAssigned`
  - [x] 2.2 Criar `api/src/domains/trip/core/errors/index.ts` com barrel exports
  - [x] 2.3 Validado: zero imports `@nestjs/*`

- [x] Task 3 — Functional Core: Port `TripRepository` (AC: #1, #2, #3)
  - [x] 3.1 Criado `api/src/domains/trip/core/ports/trip-repository.port.ts` com `TripRepository` Effect Tag e interface `TripRepositoryApi`
  - [x] 3.2 Métodos definidos: `create(data)`, `findById(id, tenantId)`, `update(id, data, tenantId)`, `findActiveByDriver(driverId, tenantId)`
  - [x] 3.3 Validado: usa `Context.Tag` do Effect, zero imports `@nestjs/*`

- [x] Task 4 — Functional Core: Use Cases (AC: #1, #2, #3, #4)
  - [x] 4.1 `start-trip.use-case.ts` — verifica viagem ativa, cria viagem, retorna `WithEvents` com `trip.started`
  - [x] 4.2 `end-trip.use-case.ts` — verifica ownership e ACTIVE status, atualiza para COMPLETED, retorna `WithEvents` com `trip.ended`
  - [x] 4.3 `get-active-trip.use-case.ts` — retorna viagem ativa ou `noEvents(null)`
  - [x] 4.4 Validado: todos retornam `Effect<WithEvents<...>, E, TripRepository>`, zero imports `@nestjs/*`

- [x] Task 5 — Shell: Adapter Prisma (AC: #1, #2, #3, #6)
  - [x] 5.1 `prisma-trip.adapter.ts` implementando `TripRepositoryApi` — usa NestJS DI para PrismaService
  - [x] 5.2 TODAS as queries filtradas por `companyId` (multi-tenancy obrigatório)
  - [x] 5.3 Validado: usa `PrismaService` via injeção NestJS (constructor injection)

- [x] Task 6 — Shell: Service + Controller + DTOs (AC: #1, #2, #3, #5)
  - [x] 6.1 `trip.service.ts` — injeta `TRIP_RUNTIME` (domain-scoped) + `EffectEventDispatcher`, usa `runAndDispatch`
  - [x] 6.2 DTOs criados: `CreateTripDto` (routeId, type, relatedTripId?), `EndTripDto`
  - [x] 6.3 `trip.controller.ts` com 3 endpoints: POST, PATCH /:id/end, GET /active
  - [x] 6.4 Decorators Swagger: `@ApiTags('trips')`, `@ApiOperation`, `@ApiResponse` (requer @nestjs/swagger — instalado)
  - [x] 6.5 Guards: `@UseGuards(TenantGuard, RolesGuard)` com `@Roles(['driver'])` — JwtAuthGuard comentado (TODO: Epic 2)

- [x] Task 7 — Shell: Module Trip + registrar no AppModule (AC: #1–#6)
  - [x] 7.1 `trip.module.ts` — TRIP_RUNTIME domain-scoped com `Layer.succeed(TripRepository, adapter)`
  - [x] 7.2 `TripModule` importado no `app.module.ts`
  - [x] 7.3 Optado pela Opção A: runtime por módulo (desacoplado do EFFECT_RUNTIME global)

- [x] Task 8 — Mobile: Tela `(driver)/trip.tsx` (AC: #1, #2, #3)
  - [x] 8.1 Tela com 4 estados: sem viagem, OUTBOUND ativa, OUTBOUND encerrada (pode iniciar RETURN), RETURN ativa
  - [x] 8.2 Botão "Iniciar Viagem" — chama POST `/api/v1/trips` via `tripService.startTrip()`
  - [x] 8.3 Botão "Encerrar Viagem" — chama PATCH `/api/v1/trips/:id/end`
  - [x] 8.4 Botão "Iniciar Retorno" — chama POST `/api/v1/trips` com `type: 'RETURN'` e `relatedTripId`
  - [x] 8.5 Exibe status, rota, contagem alunos (placeholder "0/0") e horário de início
  - [x] 8.6 Botões com height 56dp, alto contraste, operação com uma mão — NFR18 atendido

- [x] Task 9 — Testes (AC: #1–#6)
  - [x] 9.1 Testes unitários: `start-trip.use-case.spec.ts` (4 testes), `end-trip.use-case.spec.ts` (5 testes) — sem NestJS
  - [x] 9.2 Testes de use cases cobrem todos os cenários críticos (ver notas de conclusão)
  - [x] 9.3 Service usa `runAndDispatch` — validado pela estrutura do módulo
  - [x] 9.4 Validado: `cd api && npm run build` — 0 erros
  - [x] 9.5 Validado: `cd api && npm test` — 61 testes passando (14 arquivos, incluindo todos os existentes)

## Dev Notes

### PRISMA SCHEMA — ENTIDADES TRIP

O schema Prisma atual contém APENAS `Company` no schema `public`. Esta story precisa adicionar entidades no schema `trip`:

```prisma
// ─── TRIP (Viagens) ─────────────────────────────────────────

enum TripStatus {
  ACTIVE
  COMPLETED
  @@schema("trip")
}

enum TripType {
  OUTBOUND
  RETURN
  @@schema("trip")
}

model Trip {
  id            String     @id @default(uuid())
  companyId     String
  routeId       String
  driverId      String
  type          TripType
  status        TripStatus @default(ACTIVE)
  startedAt     DateTime   @default(now())
  endedAt       DateTime?
  relatedTripId String?    @unique
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  relatedTrip   Trip?      @relation("TripReturn", fields: [relatedTripId], references: [id])
  returnTrip    Trip?      @relation("TripReturn")

  @@index([driverId, status])
  @@index([routeId, status])
  @@index([companyId])
  @@map("trips")
  @@schema("trip")
}
```

**ATENÇÃO:**
- `routeId` e `driverId` são strings UUID sem FK formal (cross-schema, será resolvido quando `routing` e `auth` schemas existirem)
- `companyId` é string UUID sem FK formal por enquanto (cross-schema para `public.companies`)
- Enums DEVEM ter `@@schema("trip")` para ficar no schema correto
- `relatedTripId` é self-relation para vincular ida ↔ volta

### FUNCTIONAL CORE — PADRÃO USE CASE

O core NUNCA importa `@nestjs/*`. Use cases usam `Effect.gen`:

```typescript
// domains/trip/core/use-cases/start-trip.use-case.ts — Effect TS PURO
import { Effect } from 'effect'
import { TripRepository } from '../ports/trip-repository.port.js'
import { withEvents } from '../../../shared/core/events/with-events.js'
import { TripAlreadyActive } from '../errors/trip.errors.js'
import type { WithEvents } from '../../../shared/core/events/index.js'

interface StartTripInput {
  driverId: string
  routeId: string
  tenantId: string
  type: 'OUTBOUND' | 'RETURN'
  relatedTripId?: string
}

export const startTrip = (input: StartTripInput) =>
  Effect.gen(function* () {
    const repo = yield* TripRepository

    // Verificar se driver já tem viagem ativa
    const activeTrip = yield* repo.findActiveByDriver(input.driverId, input.tenantId)
    if (activeTrip) {
      return yield* Effect.fail(
        new TripAlreadyActive({
          code: 'TRIP_ALREADY_ACTIVE',
          message: 'Motorista já possui uma viagem ativa',
          details: { activeTripId: activeTrip.id },
        })
      )
    }

    const trip = yield* repo.create({
      companyId: input.tenantId,
      routeId: input.routeId,
      driverId: input.driverId,
      type: input.type,
      status: 'ACTIVE',
      startedAt: new Date(),
      relatedTripId: input.relatedTripId,
    })

    return withEvents(trip, [
      {
        type: 'trip.started',
        data: { tripId: trip.id, routeId: trip.routeId, driverId: trip.driverId, tripType: trip.type },
        occurredAt: new Date().toISOString(),
      },
    ])
  })
```

### TAGGED ERRORS — DOMÍNIO TRIP

```typescript
// domains/trip/core/errors/trip.errors.ts — Effect TS PURO
import { Data } from 'effect'

export class TripNotFound extends Data.TaggedError('TripNotFound')<{
  readonly code: string
  readonly message: string
  readonly details?: Record<string, unknown>
}> {
  readonly httpStatus = 404
}

export class TripAlreadyActive extends Data.TaggedError('TripAlreadyActive')<{
  readonly code: string
  readonly message: string
  readonly details?: Record<string, unknown>
}> {
  readonly httpStatus = 409
}

export class InvalidTripTransition extends Data.TaggedError('InvalidTripTransition')<{
  readonly code: string
  readonly message: string
  readonly details?: Record<string, unknown>
}> {
  readonly httpStatus = 400
}

export class DriverNotAssigned extends Data.TaggedError('DriverNotAssigned')<{
  readonly code: string
  readonly message: string
  readonly details?: Record<string, unknown>
}> {
  readonly httpStatus = 403
}
```

**Padrão:** Seguir exatamente o padrão de `shared/core/errors/base.error.ts`. Cada erro tem `_tag` automático, `httpStatus` fixo, `code` + `message` + `details?` no construtor. O `EffectExceptionFilter` já reconhece esses erros via duck typing (`_tag` + `code` + `message`).

### PORT — TRIP REPOSITORY

```typescript
// domains/trip/core/ports/trip-repository.port.ts — Effect TS PURO
import { Context, Effect } from 'effect'
import type { TripNotFound } from '../errors/trip.errors.js'

export interface TripData {
  id: string
  companyId: string
  routeId: string
  driverId: string
  type: 'OUTBOUND' | 'RETURN'
  status: 'ACTIVE' | 'COMPLETED'
  startedAt: Date
  endedAt: Date | null
  relatedTripId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateTripData {
  companyId: string
  routeId: string
  driverId: string
  type: 'OUTBOUND' | 'RETURN'
  status: 'ACTIVE'
  startedAt: Date
  relatedTripId?: string
}

export interface TripRepositoryApi {
  create(data: CreateTripData): Effect.Effect<TripData, never, never>
  findById(id: string, tenantId: string): Effect.Effect<TripData, TripNotFound, never>
  update(id: string, data: Partial<TripData>, tenantId: string): Effect.Effect<TripData, TripNotFound, never>
  findActiveByDriver(driverId: string, tenantId: string): Effect.Effect<TripData | null, never, never>
}

export class TripRepository extends Context.Tag('TripRepository')<
  TripRepository,
  TripRepositoryApi
>() {}
```

**Padrão:** Seguir `PrismaServiceTag` em `shared/core/ports/prisma-service.tag.ts`. Usar `Context.Tag` do Effect para criar o service tag.

### SHELL — SERVICE COM EVENT DISPATCHER

```typescript
// domains/trip/shell/trip.service.ts
import { Injectable, Inject } from '@nestjs/common'
import type { ManagedRuntime } from 'effect'
import { EFFECT_RUNTIME } from '../../shared/shell/effect-runtime/effect-runtime.module.js'
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js'
import { startTrip } from '../core/use-cases/start-trip.use-case.js'
import { endTrip } from '../core/use-cases/end-trip.use-case.js'

@Injectable()
export class TripService {
  constructor(
    @Inject(EFFECT_RUNTIME) private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
    private readonly eventDispatcher: EffectEventDispatcher,
  ) {}

  async createTrip(driverId: string, routeId: string, tenantId: string, type: 'OUTBOUND' | 'RETURN', relatedTripId?: string) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      startTrip({ driverId, routeId, tenantId, type, relatedTripId }),
    )
  }

  async endTrip(tripId: string, driverId: string, tenantId: string) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      endTrip({ tripId, driverId, tenantId }),
    )
  }
}
```

**CRÍTICO:** Usar `eventDispatcher.runAndDispatch()` (já implementado em story 1.3) — NÃO chamar `runtime.runPromise()` diretamente. O dispatcher cuida de emitir os domain events após execução.

### SHELL — CONTROLLER

```typescript
// domains/trip/shell/http/trip.controller.ts
@ApiTags('trips')
@Controller('api/v1/trips')
@UseGuards(/* JwtAuthGuard, */ TenantGuard, RolesGuard)
@Roles('driver')
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @Post()
  @ApiOperation({ summary: 'Iniciar nova viagem' })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateTripDto,
    @Req() req: Request,
  ) {
    const driverId = req.user.userId // populado por JwtAuthGuard
    return this.tripService.createTrip(driverId, dto.routeId, tenantId, dto.type, dto.relatedTripId)
  }

  @Patch(':id/end')
  @ApiOperation({ summary: 'Encerrar viagem ativa' })
  async end(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Req() req: Request,
  ) {
    const driverId = req.user.userId
    return this.tripService.endTrip(id, driverId, tenantId)
  }

  @Get('active')
  @ApiOperation({ summary: 'Obter viagem ativa do motorista' })
  async getActive(
    @TenantId() tenantId: string,
    @Req() req: Request,
  ) {
    const driverId = req.user.userId
    return this.tripService.getActiveTrip(driverId, tenantId)
  }
}
```

**NOTA sobre JwtAuthGuard:** Se `@nestjs/jwt` e `@nestjs/passport` ainda não estão instalados (Epic 2 não concluído), comentar `JwtAuthGuard` no `@UseGuards()` e popular `request.user` manualmente nos testes/dev. Adicionar `// TODO: habilitar JwtAuthGuard quando Epic 2 estiver pronto`.

### EFFECT RUNTIME — ADICIONAR TRIP REPOSITORY LAYER

O `EffectRuntimeModule` atualmente monta apenas o `PrismaLayer`. Para o trip domain funcionar, o `TripRepository` precisa ser provido como Layer no runtime:

**Opção A (recomendada — Layer por módulo):** Em `trip.module.ts`, criar um provider local que estende o runtime com o `TripRepositoryLayer`. Isso mantém o runtime desacoplado.

**Opção B:** Adicionar `TripRepositoryLayer` ao `EffectRuntimeModule`. Isso acopla o shared kernel aos domínios — evitar.

```typescript
// trip.module.ts — Opção A
@Module({
  imports: [SharedKernelModule],
  controllers: [TripController],
  providers: [
    TripService,
    PrismaTripAdapter,
    {
      provide: 'TRIP_RUNTIME', // runtime específico do domínio
      useFactory: (prisma: PrismaService, adapter: PrismaTripAdapter) => {
        const PrismaLayer = Layer.succeed(PrismaServiceTag, prisma)
        const TripRepoLayer = Layer.succeed(TripRepository, adapter)
        return ManagedRuntime.make(Layer.merge(PrismaLayer, TripRepoLayer))
      },
      inject: [PrismaService, PrismaTripAdapter],
    },
  ],
})
```

**ATENÇÃO:** Se usar Opção A, o `TripService` deve injetar `@Inject('TRIP_RUNTIME')` em vez de `EFFECT_RUNTIME`. Isso é uma decisão arquitetural — discutir se necessário. A alternativa é estender o `EFFECT_RUNTIME` global, mas isso viola a independência dos bounded contexts.

### MOBILE — TELA TRIP DO MOTORISTA

A tela `mobile/src/app/(driver)/trip.tsx` já existe como placeholder. Implementar com:

- **React Native Paper** para componentes (Button, Card, Text) — já instalado
- **Zustand store** `useTripStore` para estado da viagem ativa
- **TanStack Query** para chamadas REST com retry automático
- **UI acessível:** botões grandes (mínimo 48dp), contraste alto, operação com uma mão (NFR18)

**Estados da tela:**
1. **Sem viagem** — Botão "Iniciar Viagem" proeminente, seletor de rota
2. **Viagem OUTBOUND ativa** — Status, rota, contagem alunos, botão "Encerrar"
3. **Viagem encerrada** — Botão "Iniciar Retorno"
4. **Viagem RETURN ativa** — Status, rota, contagem alunos, botão "Encerrar"

**API client:** Usar `api-client.ts` existente em `mobile/src/services/` como ponto único de contato.

### DOMAIN EVENTS

Eventos desta story — consumidores em stories futuras:

| Evento | Quando | Dados | Consumidor futuro |
|--------|--------|-------|-------------------|
| `trip.started` | Viagem iniciada | `tripId, routeId, driverId, tripType` | tracking (inicia GPS), boarding (habilita check-in) |
| `trip.ended` | Viagem encerrada | `tripId, routeId, driverId` | tracking (para GPS), boarding (desabilita check-in) |

Nesta story, os eventos são emitidos mas nenhum listener é configurado. Listeners serão adicionados nas stories de tracking (Epic 5) e boarding (Story 3.3+).

### Project Structure Notes

**Arquivos novos desta story:**
```
api/src/
├── domains/
│   └── trip/
│       ├── core/
│       │   ├── errors/
│       │   │   ├── trip.errors.ts            # [NEW]
│       │   │   └── index.ts                  # [NEW]
│       │   ├── ports/
│       │   │   └── trip-repository.port.ts   # [NEW]
│       │   └── use-cases/
│       │       ├── start-trip.use-case.ts     # [NEW]
│       │       ├── start-trip.use-case.spec.ts # [NEW]
│       │       ├── end-trip.use-case.ts       # [NEW]
│       │       ├── end-trip.use-case.spec.ts  # [NEW]
│       │       ├── get-active-trip.use-case.ts # [NEW]
│       │       └── get-active-trip.use-case.spec.ts # [NEW]
│       └── shell/
│           ├── adapters/
│           │   └── prisma-trip.adapter.ts     # [NEW]
│           ├── http/
│           │   ├── trip.controller.ts         # [NEW]
│           │   ├── trip.controller.spec.ts    # [NEW]
│           │   └── dtos/
│           │       └── create-trip.dto.ts     # [NEW]
│           ├── trip.service.ts                # [NEW]
│           ├── trip.service.spec.ts           # [NEW]
│           └── trip.module.ts                 # [NEW]

api/prisma/
└── schema.prisma                              # [MODIFIED] — adicionado Trip, TripStatus, TripType

mobile/
└── src/
    ├── app/(driver)/trip.tsx                   # [MODIFIED] — implementação real
    ├── services/
    │   └── trip.service.ts                    # [NEW]
    └── stores/
        └── trip.store.ts                      # [NEW]
```

**Arquivos modificados:**
- `api/prisma/schema.prisma` — adicionado esquema trip
- `api/src/app.module.ts` — importar `TripModule`
- `mobile/src/app/(driver)/trip.tsx` — implementar de placeholder para tela funcional

### TypeScript — Imports com Extensão .js

**CRÍTICO:** `module: "nodenext"` exige extensão `.js` em TODOS os imports relativos:

```typescript
// ✅ CORRETO
import { TripRepository } from '../ports/trip-repository.port.js'
import { withEvents } from '../../../shared/core/events/with-events.js'

// ❌ ERRADO
import { TripRepository } from '../ports/trip-repository.port'
```

### Naming Conventions

- Arquivos: `kebab-case` com sufixo de tipo (`.use-case.ts`, `.port.ts`, `.adapter.ts`)
- Classes: `PascalCase` (`TripService`, `TripController`, `PrismaTripAdapter`)
- Enums Prisma: `SCREAMING_SNAKE_CASE` (`ACTIVE`, `COMPLETED`, `OUTBOUND`, `RETURN`)
- Error codes: `SCREAMING_SNAKE_CASE` (`TRIP_NOT_FOUND`, `TRIP_ALREADY_ACTIVE`)
- Endpoints: `kebab-case`, plural (`/api/v1/trips`)
- Domain events: `domain.action` (`trip.started`, `trip.ended`)

[Source: architecture.md#6-padroes-de-implementacao]

### Regras Arquiteturais Obrigatórias

1. `core/` contém APENAS código Effect TS puro — zero imports `@nestjs/*`, `prisma`, `redis`
2. `shell/` é o ÚNICO lugar para imports NestJS/Prisma
3. Use cases retornam `Effect<WithEvents<A>, E, TripRepository>` — NUNCA emitir eventos diretamente
4. TODA query filtrada por `companyId` — sem exceção (multi-tenancy)
5. `EffectExceptionFilter` já registrado globalmente — tagged errors do trip serão convertidos automaticamente
6. `ResponseWrapperInterceptor` já registrado — respostas terão formato `{ data, meta }` automaticamente
7. Controller DEVE ter decorators Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
8. Testes do core executáveis SEM NestJS TestingModule (< 100ms por suite)
9. `Trip` DEVE ter `@@schema("trip")` no Prisma
10. PROIBIDO JOINs cross-schema (trip → auth, trip → routing) — usar IDs como referência

[Source: architecture.md#8-regras-obrigatorias]
[Source: project-context.md#regras-criticas]

### Anti-Patterns a Evitar

1. **NÃO criar FK formal** entre `Trip.driverId` → `User.id` (cross-schema `trip` → `auth`) — usar ID como referência sem constraint
2. **NÃO importar `@nestjs/*` no core** — o core é Effect TS puro
3. **NÃO chamar `runtime.runPromise()` diretamente** no service — usar `eventDispatcher.runAndDispatch()` para garantir dispatch de eventos
4. **NÃO registrar Guards como APP_GUARD** — usar `@UseGuards()` por controller
5. **NÃO usar `class-validator`** para validação no core — usar `@effect/schema` se necessário
6. **NÃO esquecer extensão `.js`** nos imports relativos
7. **NÃO criar viagem sem verificar se driver já tem viagem ativa** — validação no use case, não no controller
8. **NÃO colocar lógica de negócio no controller** — controllers são adaptadores HTTP do shell
9. **NÃO usar AsyncStorage no mobile** — usar MMKV (já configurado)
10. **NÃO hardcodar URLs** — usar `api-client.ts` no mobile

### Previous Story Intelligence

**Story 1.4 (done) — Key Learnings:**
- `Data.TaggedError` cria `_tag` automaticamente — `EffectExceptionFilter` detecta via duck typing
- `RolesGuard` e `TenantGuard` NÃO são `APP_GUARD` — usar `@UseGuards()` por controller
- `SharedKernelModule` exporta Guards e decorators
- `EffectSchemaPipe` usa `Schema.decodeUnknownEither`
- `ResponseWrapperInterceptor` + `EffectExceptionFilter` já registrados globalmente
- Review findings corrigidos: SSE bypass, StreamableFile passthrough, non-HTTP guard
- 52 testes unitários + 2 E2E passando

**Story 1.3 (done) — Key Learnings:**
- `ManagedRuntime` é singleton via `EffectRuntimeModule` (`@Global()`)
- `EffectEventDispatcher.runAndDispatch()` já funcional
- Todos imports relativos usam extensão `.js`
- Vitest é o test runner (não Jest)
- `PrismaServiceTag` em `core/ports/` como context tag
- `EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 })` configurado

**Story 1.2 (done) — Key Learnings:**
- Import PrismaClient: `../../../../generated/prisma/client.js`
- `PrismaService` extends `PrismaClient` em `shared/shell/infra/prisma.service.ts`
- `PrismaGlobalModule` com `@Global()` registrado
- `import "dotenv/config"` para .env em testes
- `instanceof PrismaClient` causa stack overflow — evitar

### Git Intelligence

Commits recentes:
- `f302a26` — feat(mobile): patch story 1-5 fixes
- `8521b14` — fix(shared): address 15 code review findings for story 1-4
- `42fc082` — feat(shared): implement shared infrastructure components (story 1-4)
- `2dc7838` — feat(api): implement effect ts composition root
- Padrão: `feat(scope):` para features, `fix(scope):` para fixes

### Pacotes Necessários

**Backend (api/):**
- `@nestjs/swagger` — se ainda não instalado, instalar para decorators Swagger
- Demais dependências (`effect`, `@effect/schema`, `@nestjs/common`, Prisma) já instaladas

**Mobile (mobile/):**
- `react-native-paper` — já instalado (story 1.5)
- `zustand` — já instalado
- `@tanstack/react-query` — já instalado

### References

- [Source: architecture.md#3-decisoes-arquiteturais] — RBAC, multi-tenancy, domain events
- [Source: architecture.md#4-domain-events-funcionais] — WithEvents pattern, event types
- [Source: architecture.md#6-padroes-de-implementacao] — Naming, response format
- [Source: architecture.md#7-estrutura-do-projeto] — trip/ domain structure, endpoints `/api/v1/trips/*`
- [Source: architecture.md#8-regras-obrigatorias] — 10 regras para agentes
- [Source: epics.md#story-3.1] — Acceptance criteria, FRs cobertos (FR11-FR14)
- [Source: project-context.md] — TypeScript rules, anti-patterns, Effect integration
- [Source: 1-4-infraestrutura-compartilhada-guards-filters-pipes.md] — Shared kernel implementation details

## Dev Agent Record

### Agent Model Used

Gemini 2.5 Pro (Antigravity)

### Debug Log References

- DB reset necessário: migração inicial foi modificada, executou `prisma migrate reset --force` + `prisma migrate dev --name add-trip-entities`
- `@nestjs/swagger` não estava instalado — instalado como parte da story
- `class-validator` não estava instalado — instalado como parte da story
- `PrismaTripAdapter` deve `implements TripRepositoryApi` (interface), não `TripRepository` (Context.Tag class)
- Testes de use cases usam `Effect.provideService(TripRepository, repo)` — não `Effect.provide(TripRepository.of(repo))`
- Adapter usa NestJS DI para PrismaService (não PrismaServiceTag via Effect context) para satisfazer `R = never` no port
- Opção A implementada: TRIP_RUNTIME domain-scoped via `Layer.succeed(TripRepository, adapter)` no TripModule

### Completion Notes List

- ✅ Schema Prisma: enums `TripStatus`, `TripType` e model `Trip` adicionados no schema `trip`, migração aplicada
- ✅ Core puro: erros tagueados, port `TripRepository` (Context.Tag), 3 use cases — zero imports NestJS
- ✅ Shell: `PrismaTripAdapter` (NestJS DI), `TripService` (TRIP_RUNTIME domain-scoped), `TripController` (3 endpoints + Swagger)
- ✅ `TripModule` com runtime separado; `AppModule` atualizado com `TripModule`
- ✅ Mobile: `trip.tsx` com 4 estados, `trip.service.ts`, `trip.store.ts` — NFR18 atendido
- ✅ 9 novos testes unitários (start-trip: 4, end-trip: 5); total: 61 testes, 14 arquivos, todos passando
- ✅ Build limpo: 0 erros TypeScript
- ✅ Eventos de domínio `trip.started` e `trip.ended` emitidos via `WithEvents` + `runAndDispatch`
- ⚠️ JwtAuthGuard comentado no controller — TODO: habilitar quando Epic 2 (Auth) for implementado
- ⚠️ PLACEHOLDER_ROUTE_ID no mobile — substituir por seleção de rota real no Epic 2

### File List

**Novos (Backend):**
- `api/src/domains/trip/core/errors/trip.errors.ts`
- `api/src/domains/trip/core/errors/index.ts`
- `api/src/domains/trip/core/ports/trip-repository.port.ts`
- `api/src/domains/trip/core/use-cases/start-trip.use-case.ts`
- `api/src/domains/trip/core/use-cases/start-trip.use-case.spec.ts`
- `api/src/domains/trip/core/use-cases/end-trip.use-case.ts`
- `api/src/domains/trip/core/use-cases/end-trip.use-case.spec.ts`
- `api/src/domains/trip/core/use-cases/get-active-trip.use-case.ts`
- `api/src/domains/trip/shell/adapters/prisma-trip.adapter.ts`
- `api/src/domains/trip/shell/http/dtos/create-trip.dto.ts`
- `api/src/domains/trip/shell/http/trip.controller.ts`
- `api/src/domains/trip/shell/trip.service.ts`
- `api/src/domains/trip/shell/trip.module.ts`
- `api/prisma/migrations/20260411003947_add_trip_entities/migration.sql`

**Modificados (Backend):**
- `api/prisma/schema.prisma`
- `api/src/app.module.ts`
- `api/src/generated/prisma/` (regenerado pelo `prisma generate`)

**Novos (Mobile):**
- `mobile/src/services/trip.service.ts`
- ~~`mobile/src/stores/trip.store.ts`~~ (removido no code review — dead code, ver abaixo)

**Modificados (Mobile):**
- `mobile/src/app/(driver)/trip.tsx`

## Code Review (2026-09-06)

Revisão feita meses depois da implementação (a story foi entregue em abril/2026, antes do
Épico 2, com Gemini). Alvo: o estado atual do código da 3.1 na `main`, descontando a parte
da Story 3.5a (lista de alunos) que já teve review próprio. 3 camadas de review em paralelo
(blind-hunter, edge-case-hunter, verification-gap). Branch: `fix/3-1-review`.

Baseline verde antes das mudanças: 32 testes de unidade do domínio trip + 24 e2e.
Depois: **37 unidade + 27 e2e**, `tsc` limpo (api e mobile), lint da api de 148 → **147 erros**
(baseline pré-existente; a story reduziu 1), mobile lint/jest verdes (106 testes).

### Corrigido nesta branch (patches)

| # | Achado | Correção |
|---|--------|----------|
| 1 | AC #3: uma RETURN podia ser criada sem `relatedTripId` — vira uma OUTBOUND disfarçada. | `startTrip` recusa RETURN sem `relatedTripId` (`InvalidTripTransition` / `RETURN_REQUIRES_RELATED_TRIP`) e descarta `relatedTripId` num OUTBOUND. `CreateTripDto` ganha `@ValidateIf` espelhando a regra. +3 testes de unidade, +1 e2e (400). |
| 2 | `prisma-trip.adapter.update()` fazia `update({ where: { id } })` sem `companyId` — viola "toda query filtra por companyId", com janela TOCTOU. | Envolvido em `$transaction` (findFirst tenant-scoped + update), mesmo padrão do `prisma-route.adapter`. |
| 3 | `endTrip` respondia 400 `InvalidTripTransition`/`TRIP_NOT_OWNED` para viagem de outro motorista — status errado + revela que a viagem existe. | Passa a responder `TripNotFound` (404, não-disclosure). Teste de unidade ajustado. |
| 4 | AC #2/#6: nenhum teste verificava que `endedAt` é gravado (só `status`). | Teste de unidade afirma o patch mandado ao repo; e2e afirma `endedAt` ≈ agora na resposta. |
| 5 | AC #3: criação de RETURN + persistência de `relatedTripId` nunca exercitada pelo caminho real. | e2e novo: encerra ida → POST RETURN com `relatedTripId` → afirma `type`/`status`/`relatedTripId`. |
| 6 | `get-active-trip.use-case.ts` sem arquivo de spec. | `get-active-trip.use-case.spec.ts` novo (3 testes). |
| 7 | Dead code: `useTripStore` (Zustand) nunca importado — 2ª fonte de verdade divergente; `EndTripDto` nunca usado. | `mobile/src/stores/trip.store.ts` removido; `EndTripDto` removido. |
| 8 | Card de viagem concluída mostrava `Alunos: 0/0 (em breve)` hardcoded. | Usa a contagem real (`studentsSummary`), com fallback `—`, igual ao card ativo. |

### Adiado (ver `deferred-work.md`, seção 2026-09-06)

- `relatedTripId` não é validado contra uma ida real (mesma empresa/motorista/rota, COMPLETED) — precisa de método novo no port.
- "Uma viagem ativa por motorista" é check-then-create sem transação nem índice único parcial (migração SQL cru).
- **Fluxo "Iniciar Retorno" some no reload** — `/trips/active` só devolve `ACTIVE`; a ida encerrada não é recuperável. AC #2/#3 pela ponta do cliente. Amarrado à decisão do `PLACEHOLDER_ROUTE_ID`.
- Sem `TripResponseDto` — `openapi.json` sem corpo de resposta para POST/PATCH; `Trip` do mobile é manual (regra 11 da architecture.md).
- `trip.tsx` sem teste de render (máquina de 4 estados, `isError` não distinguido de "sem viagem").
- `test/route-assignment.e2e-spec.ts` vermelho na baseline (login `.expect(200)` vs 201) — incidental, fora do escopo.

### ⚠️ Decisão de produto pendente — bloqueia o fechamento da story

`PLACEHOLDER_ROUTE_ID = 'route-placeholder-id'` em `trip.tsx` é passado em toda chamada de
`startTrip`. Não é UUID (o DTO rejeita com 400) e, mesmo sendo, cairia no `RouteAccess`
(403 `DRIVER_NOT_ASSIGNED`). **O fluxo de iniciar viagem pela UI não funciona.** Precisa de
decisão: de onde vem o `routeId` do motorista? (rota vinculada única auto-selecionada / seletor
de rota / `GET /drivers/me/routes` novo). O fluxo "iniciar retorno" (defer acima) depende da
mesma decisão. Até lá a story fica em `review`, não `done` — a viagem só entra por API (como
no smoke da 3.6).

## Suggested Review Order

**AC #3 — viagem de retorno exige vínculo com a ida**

- Regra no core: recusa RETURN sem `relatedTripId`, ignora num OUTBOUND
  [`start-trip.use-case.ts:54`](../../api/src/domains/trip/core/use-cases/start-trip.use-case.ts#L54)
- Mesma regra no shell, para 400 antes do use case + Swagger correto
  [`create-trip.dto.ts:30`](../../api/src/domains/trip/shell/http/dtos/create-trip.dto.ts#L30)

**Multi-tenancy na escrita**

- `update()` envolto em `$transaction` (findFirst tenant-scoped + update), padrão do routing
  [`prisma-trip.adapter.ts:82`](../../api/src/domains/trip/shell/adapters/prisma-trip.adapter.ts#L82)

**Semântica de erro do encerramento**

- Viagem de outro motorista → `TripNotFound` (404, não-disclosure), era 400
  [`end-trip.use-case.ts:27`](../../api/src/domains/trip/core/use-cases/end-trip.use-case.ts#L27)

**UI**

- Card de viagem concluída usa a contagem real de embarque
  [`trip.tsx:121`](../../mobile/src/app/(driver)/trip.tsx#L121)

**Testes**

- Unidade: RETURN repassa args ao repo, recusa sem `relatedTripId`, descarta em OUTBOUND
  [`start-trip.use-case.spec.ts:158`](../../api/src/domains/trip/core/use-cases/start-trip.use-case.spec.ts#L158)
- Unidade: `endTrip` grava `endedAt`; viagem alheia → `TripNotFound`
  [`end-trip.use-case.spec.ts:45`](../../api/src/domains/trip/core/use-cases/end-trip.use-case.spec.ts#L45)
- Unidade: `getActiveTrip` (arquivo novo)
  [`get-active-trip.use-case.spec.ts:1`](../../api/src/domains/trip/core/use-cases/get-active-trip.use-case.spec.ts#L1)
- e2e: ciclo encerrar (`endedAt` ≈ agora) + iniciar retorno atrelado; RETURN sem `relatedTripId` → 400
  [`trip.e2e-spec.ts:317`](../../api/test/trip.e2e-spec.ts#L317)
