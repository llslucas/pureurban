# Estrutura do Projeto & Fronteiras

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
