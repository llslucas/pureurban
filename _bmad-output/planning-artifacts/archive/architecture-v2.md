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

*This document outlines the architectural decisions, structure, and standards for the PureUrban project. It has been streamlined for clarity and strict adherence to project goals.*

## 1. Project Context & Principles

### Requirements & Constraints
- **Target Platforms:** Mobile App (Expo/React Native) + API Backend (NestJS).
- **Core Features:** Identity/Access, Routes Management, Real-time Tracking (SSE), Digital Boarding (QR Code), Absence Notifications.
- **Key NFRs:** Offline-first check-ins (<2s), GPS low latency (<5s), Multi-tenancy isolation.
- **Architecture Standard (TCC Requirement):** Hexagonal Architecture + DDD + Functional Core / Imperative Shell.

### Design Principles
- **Lean & Pragmatic:** MVP focus (~2 months).
- **User Journeys Drive Decisions:** Prioritize boring, stable tech over hype.
- **Composition over Coupling:** Strict separation between pure domain logic and infrastructural side-effects.

## 2. Technology Stack & Starter Templates

- **Mobile App:** `create-expo-app@latest` (SDK 55, template `default` with Expo Router).
  - *Storage/State:* Zustand, TanStack Query, MMKV, `expo-sqlite`.
  - *UI:* React Native Paper.
- **Backend API:** `@nestjs/cli@latest` (v11, SWC, Vitest).
  - *Database & ORM:* PostgreSQL + Prisma (v7.4.2).
  - *Cache & Real-time:* Redis (`ioredis`) + SSE.
  - *Functional Logic:* Effect TS (integrated manually).

## 3. Core Architectural Decisions (ADRs)

### ADR 1: Effect TS ↔ NestJS Integration
- **Decision:** Manual integration via Composition Root (`ManagedRuntime` + `useFactory`), avoiding unstable third-party wrappers like `@nestjs-effect`.
- **Implementation:**
  - *Functional Core:* Pure Effect TS. Defines interfaces (Tags). Zero NestJS imports.
  - *Adapters:* Concrete implementations of the interfaces.
  - *Composition Root:* `EffectRuntimeModule` mounts the layers and provides `EFFECT_RUNTIME` to NestJS services.

### ADR 2: Hexagonal & DDD Boundaries
- **Decision:** Group code by bounded contexts (`auth`, `boarding`, `tracking`, `trip`, `routing`). Inside each context, strictly separate `core/` (pure logic) from `shell/` (infrastructure, HTTP, adapters).
- **Conventions:** `core/` is completely isolated from frameworks; `shell/` is allowed to depend on `core/`.

### ADR 3: Functional Domain Events
- **Decision:** The core never emits events (side-effects). Instead, use cases return a tuple `WithEvents<A> = [result: A, events: DomainEvent[]]`.
- **Implementation:** The NestJS service shell receives the tuple and dispatches events via `EventEmitter2`. This promotes absolute determinism in the core.
- **Events Matrix:** `boarding.checked_in`, `trip.started`, `location.updated`, etc.

### ADR 4: Data Architecture & Persistence
- **Decision:** Single codebase schema (`schema.prisma`).
- **Validation:** Handled via Effect Schema in the core, converted to HTTP responses via global NestJS filters (`EffectExceptionFilter`) for unified error parsing.
- **Caching:** Redis specifically utilized for high-throughput, short TTL GPS updates and invalid JWT blacklist.

### ADR 5: Mobile Offline-First Strategy
- **Decision:** MMKV for fast key-value data (tokens, prefs) + `expo-sqlite` for structured queries (student lists, offline check-in queues). TanStack Query manages server synchronization.

### ADR 6: Authentication & Multi-Tenancy
- **Decision:** JWT + NestJS Guards. A `TenantGuard` enforces `companyId` filtering on every request based on the parsed token. Roles validated via `@Roles(...)`. Refresh token valid for 7 days (no rotation for MVP).

## 4. System Structure & Boundaries

```
pureurban/
├── mobile/                  # Expo (React Native)
│   ├── app/                 # Expo Router (file-based routing by feature: (auth), (driver), (student))
│   └── src/                 # services/, stores/ (Zustand), hooks/, components/
└── api/                     # NestJS Backend
    ├── prisma/              # schema.prisma, migrations/
    └── src/
        ├── domains/
        │   ├── auth/        # Bounded context example
        │   │   ├── core/    # Pure Effect: ports/, use-cases/
        │   │   └── shell/   # Infra: adapters/, http/ (controllers), auth.service.ts
        │   └── shared/      # Shared Kernel
        │       ├── core/    # errors/, events/ (WithEvents), schemas/
        │       └── shell/   # effect-runtime/, guards/, filters/, infra/
        └── main.ts
```

### Flow of Data (Imperative Shell → Functional Core)
`Mobile REST/SSE` → `NestJS Controller` → `Service` → `Effect Runtime (invoke use-case)` → `Core logic runs via Ports` → `Adapters execute DB/Redis` → `Response (and events) returned to Shell`.

## 5. Coding Padrões & Regras para Agentes

### Naming Conventions
- **Prisma:** Models `PascalCase` singular (`User`), Fields `camelCase`, Enums `SCREAMING_SNAKE_CASE`.
- **Files:** `kebab-case` with type suffix (`.use-case.ts`, `.port.ts`, `.adapter.ts`).
- **Classes/Interfaces:** `PascalCase`. Variables/Functions `camelCase`.
- **Events:** `snake_case` in `domain.action` format (`boarding.checked_in`).

### Mandatory Rules for AI Agents & Developers
1. **Purity in Core:** Folders named `core/` contain ONLY pure Effect TS code. No NestJS, Prisma, or Redis imports allowed.
2. **Infrastructure in Shell:** Folders named `shell/` are the ONLY places where NestJS, database or external logic belong.
3. **Event Discipline:** Use cases MUST return `WithEvents<A>`. Do not emit events directly.
4. **Mandatory Tenant Tracking:** Every entity must possess `companyId`. Every endpoint must enforce `TenantGuard` and `@Roles()`.
5. **Swagger Documentation:** Every controller MUST have `@ApiTags`, `@ApiOperation`, and `@ApiResponse`.
6. **Error Handling:** All core errors must be typed in the Effect program return signature.

## 6. Reference Implementation Patterns

These patterns are MANDATORY templates for integrating Effect TS with NestJS and handling side-effects. Do not deviate from these constructs.

### Pattern 1: Domain Events (Return Tuple)
The functional core MUST be purely deterministic. Side effects (like emitting events) are deferred to the NestJS shell.

**Core (Pure Effect TS):**
```typescript
// domains/shared/core/events/with-events.ts
type WithEvents<A> = readonly [result: A, events: ReadonlyArray<DomainEvent>]

const withEvents = <A>(result: A, events: DomainEvent[]): WithEvents<A> => [result, events] as const

// domains/boarding/core/use-cases/check-in.use-case.ts
const checkIn = (studentId: string, tripId: string) =>
  Effect.gen(function* () {
    const repo = yield* BoardingRepository
    const boarding = yield* repo.recordCheckIn(studentId, tripId)
    
    // The core decides the event happened, but doesn't emit it
    return withEvents(boarding, [
      { type: 'boarding.checked_in', data: { studentId, tripId }, occurredAt: new Date().toISOString() }
    ])
  })
```

**Shell (NestJS Side-Effects):**
```typescript
// domains/boarding/shell/boarding.service.ts
@Injectable()
class BoardingService {
  constructor(
    @Inject('EFFECT_RUNTIME') private readonly runtime: ManagedRuntime<...>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processCheckIn(dto: CheckInDto) {
    // 1. Run the pure program
    const [result, events] = await this.runtime.runPromise(
      checkIn(dto.studentId, dto.tripId)
    )
    
    // 2. Dispatch events iteratively
    events.forEach(e => this.eventEmitter.emit(e.type, e))
    return result
  }
}
```

### Pattern 2: Effect TS + NestJS Integration (`useFactory`)
Avoid third-party libraries for integration. Inject standard NestJS providers into the Effect context directly via a Composition Root.

**Shell (Composition Root):**
```typescript
// domains/shared/shell/effect-runtime/effect-runtime.module.ts
@Global()
@Module({
  imports: [PrismaGlobalModule, RedisModule],
  providers: [
    {
      provide: 'EFFECT_RUNTIME',
      inject: [PrismaService, RedisService],
      useFactory: (prisma: PrismaService, redis: RedisService) => {
        // Wire up actual implementations
        const BaseLayer = Layer.mergeAll(
          Layer.succeed(BoardingRepository, new PrismaBoardingAdapter(prisma)),
          Layer.succeed(LocationStore, new RedisLocationAdapter(redis))
        )
        return ManagedRuntime.make(BaseLayer)
      },
    },
  ],
  exports: ['EFFECT_RUNTIME'],
})
export class EffectRuntimeModule {}
```

## 7. Implementation Sequence (Handoff)

1. Initialize Expo and NestJS projects from starters.
2. Setup Docker Compose (Postgres, Redis).
3. Define Prisma schema & run migrations.
4. Setup Architecture Base: `EffectRuntimeModule`, Interfaces, Error Filters.
5. Implement: Auth Bounded Context (JWT, Guards).
6. Implement: Routing CRUD.
7. Implement: Digital Boarding (Offline Sync + QR).
8. Implement: Real-time Location (SSE).
9. Implement: Absence Notifications.
10. Finalize Swagger documentation.
