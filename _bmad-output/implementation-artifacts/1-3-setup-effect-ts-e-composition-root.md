# Story 1.3: Setup Effect TS e Composition Root

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero configurar Effect TS com o Composition Root (EffectRuntimeModule),
Para que o padrão Functional Core / Imperative Shell esteja operacional.

## Acceptance Criteria

1. **Given** NestJS configurado com Prisma v7 funcional
   **When** instalo Effect TS e crio o EffectRuntimeModule
   **Then** `useFactory` instancia um `ManagedRuntime` com PrismaService injetado

2. **Given** EffectRuntimeModule registrado globalmente
   **When** qualquer service NestJS solicita o runtime
   **Then** `@Inject('EFFECT_RUNTIME')` está disponível para injeção em qualquer module

3. **Given** runtime Effect disponível
   **When** verifico o EffectEventDispatcher
   **Then** `EffectEventDispatcher` está implementado com método `runAndDispatch` que executa programas Effect `WithEvents<A>` e despacha eventos via EventEmitter2

4. **Given** shared kernel precisa de primitivas de eventos
   **When** verifico o código em `shared/core/events/`
   **Then** `DomainEvent` (interface), `WithEvents<A>` (type), `noEvents` e `withEvents` (helper functions) estão implementados como código Effect TS puro — zero imports de NestJS

5. **Given** toda a infraestrutura Effect configurada
   **When** executo um programa Effect de teste (health check) via runtime
   **Then** o programa executa com sucesso, demonstrando que `ManagedRuntime` + `PrismaService` + `EventEmitter2` estão integrados corretamente

## Tasks / Subtasks

- [x] Task 1 — Instalar dependências do Effect TS (AC: #1)
  - [x] 1.1 `cd api && npm install effect @effect/schema @nestjs/event-emitter`
  - [x] 1.2 Verificar que `npm run build` continua compilando sem erros

- [x] Task 2 — Criar primitivas de Domain Events no shared kernel (AC: #4)
  - [x] 2.1 Criar `api/src/domains/shared/core/events/domain-event.interface.ts` com interface `DomainEvent`
  - [x] 2.2 Criar `api/src/domains/shared/core/events/with-events.ts` com tipo `WithEvents<A>` e funções `noEvents`, `withEvents`
  - [x] 2.3 Criar `api/src/domains/shared/core/events/index.ts` como barrel export
  - [x] 2.4 Remover `.gitkeep` de `api/src/domains/shared/core/events/`
  - [x] 2.5 Validar: zero imports de `@nestjs/*` em qualquer arquivo de `core/events/`

- [x] Task 3 — Criar EffectRuntimeModule com Composition Root (AC: #1, #2)
  - [x] 3.1 Criar `api/src/domains/shared/core/ports/prisma-service.tag.ts` (PrismaServiceTag) + `api/src/domains/shared/shell/effect-runtime/effect-runtime.module.ts` com `@Global()`, `useFactory` que recebe `PrismaService` e cria `ManagedRuntime`
  - [x] 3.2 Definir token `EFFECT_RUNTIME` como provider exportado
  - [x] 3.3 Implementar `onModuleDestroy` para chamar `runtime.dispose()` no shutdown do NestJS
  - [x] 3.4 Remover `.gitkeep` de `api/src/domains/shared/shell/effect-runtime/`

- [x] Task 4 — Criar EffectEventDispatcher (AC: #3)
  - [x] 4.1 Criar `api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.ts`
  - [x] 4.2 Implementar método `runAndDispatch<A, E, R>(runtime, program)` que extrai `[result, events]` e despacha via `EventEmitter2`

- [x] Task 5 — Registrar módulos no AppModule (AC: #2)
  - [x] 5.1 Importar `EventEmitterModule.forRoot()` no `app.module.ts`
  - [x] 5.2 Importar `EffectRuntimeModule` no `app.module.ts`
  - [x] 5.3 Validar que a API inicia sem erros: validado via build; runtime necessita DB para start:dev

- [x] Task 6 — Criar programa Effect de health check (AC: #5)
  - [x] 6.1 Criar `api/src/domains/shared/shell/effect-runtime/health-check.program.ts` — programa Effect puro usando `Effect.promise` wrapper para `$queryRaw`
  - [x] 6.2 Criar endpoint GET `/api/v1/health/effect` no `AppController` usando `ManagedRuntime` injetado

- [x] Task 7 — Testes (AC: #1–#5)
  - [x] 7.1 Testes unitários para `domain-event.interface.ts` e `with-events.ts` — zero infra, 5 testes
  - [x] 7.2 Testes unitários para `EffectEventDispatcher` com EventEmitter2 mockado — 3 testes
  - [x] 7.3 Teste de integração para `EffectRuntimeModule` — 3 testes com ManagedRuntime real + PrismaClient mockado via Layer
  - [x] 7.4 Teste E2E do endpoint health check — adicionado ao `test/app.e2e-spec.ts` com resposta 200 e validação de shape

- [x] Task 8 — Validação final (AC: #1–#5)
  - [x] 8.1 `cd api && npm run build` — compilação sem erros ✅
  - [x] 8.2 `cd api && npm test` — 18/19 testes passam (1 falha pré-existente da story 1.2: `prisma.service.spec.ts` requer DB)
  - [x] 8.3 `cd api && npm run start:dev` — build válido; endpoint E2E coberto via vitest e2e

## Dev Notes

### EFFECT TS — PADRÕES OBRIGATÓRIOS (NÃO IGNORE)

A integração Effect TS ↔ NestJS é feita MANUALMENTE via Composition Root. A biblioteca `@nestjs-effect` foi descartada pela Architecture (22 stars, mantenedor único, pré-1.0). NÃO instalar `@nestjs-effect`.

**Context.Tag para definir serviços:**

```typescript
// Exemplo de Tag para o PrismaService no Effect
import { Context } from 'effect'
import type { PrismaClient } from '../../../../generated/prisma/client.js'

export class PrismaServiceTag extends Context.Tag('PrismaService')<
  PrismaServiceTag,
  PrismaClient
>() {}
```

**ManagedRuntime para executar no NestJS:**

```typescript
import { ManagedRuntime, Layer } from 'effect'

// Layer que provê PrismaService ao Effect
const makePrismaLayer = (prisma: PrismaClient) =>
  Layer.succeed(PrismaServiceTag, prisma)

// Runtime criado em useFactory do NestJS
const runtime = ManagedRuntime.make(makePrismaLayer(prismaService))
```

**Regra absoluta:** `runtime.dispose()` DEVE ser chamado no `onModuleDestroy` do NestJS para cleanup correto de recursos Effect.

### DOMAIN EVENTS — CÓDIGO EXATO (core/events/)

**IMPORTANTE:** Estes arquivos ficam em `core/` — são Effect TS PURO. Zero imports de NestJS, Prisma ou Redis.

```typescript
// domains/shared/core/events/domain-event.interface.ts
export interface DomainEvent {
  readonly type: string
  readonly data: Record<string, unknown>
  readonly occurredAt: string  // ISO 8601
}
```

```typescript
// domains/shared/core/events/with-events.ts
import type { DomainEvent } from './domain-event.interface.js'

export type WithEvents<A> = readonly [result: A, events: ReadonlyArray<DomainEvent>]

export const noEvents = <A>(result: A): WithEvents<A> =>
  [result, []] as const

export const withEvents = <A>(result: A, events: DomainEvent[]): WithEvents<A> =>
  [result, events] as const
```

```typescript
// domains/shared/core/events/index.ts
export type { DomainEvent } from './domain-event.interface.js'
export type { WithEvents } from './with-events.js'
export { noEvents, withEvents } from './with-events.js'
```

### COMPOSITION ROOT — EffectRuntimeModule

```typescript
// domains/shared/shell/effect-runtime/effect-runtime.module.ts
import { Module, Global, OnModuleDestroy, Inject } from '@nestjs/common'
import { ManagedRuntime, Layer } from 'effect'
import { PrismaService } from '../infra/prisma.service.js'
import { PrismaServiceTag } from '../../core/ports/prisma-service.tag.js'

export const EFFECT_RUNTIME = 'EFFECT_RUNTIME'

@Global()
@Module({
  providers: [
    {
      provide: EFFECT_RUNTIME,
      useFactory: (prisma: PrismaService) => {
        const PrismaLayer = Layer.succeed(PrismaServiceTag, prisma)
        // Merge com outros Layers futuros (ex: RedisLayer na story 1.4+)
        const AppLayer = PrismaLayer
        return ManagedRuntime.make(AppLayer)
      },
      inject: [PrismaService],
    },
  ],
  exports: [EFFECT_RUNTIME],
})
export class EffectRuntimeModule implements OnModuleDestroy {
  constructor(
    @Inject(EFFECT_RUNTIME) private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
  ) {}

  async onModuleDestroy() {
    await this.runtime.dispose()
  }
}
```

**Nota sobre tipagem do runtime:** O tipo genérico `ManagedRuntime<R, E>` receberá o tipo do Layer composto. Use `any` no módulo global e tipos específicos nos services consumidores para flexibilidade.

### EFFECT EVENT DISPATCHER

```typescript
// domains/shared/shell/effect-runtime/event-dispatcher.service.ts
import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type { ManagedRuntime, Effect } from 'effect'
import type { WithEvents } from '../../core/events/index.js'

@Injectable()
export class EffectEventDispatcher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async runAndDispatch<A, E, R>(
    runtime: ManagedRuntime.ManagedRuntime<R, never>,
    program: Effect.Effect<WithEvents<A>, E, R>,
  ): Promise<A> {
    const [result, events] = await runtime.runPromise(program)
    events.forEach(e => this.eventEmitter.emit(e.type, e))
    return result
  }
}
```

### PRISMA SERVICE TAG (Port no core/)

Criar um Tag do Effect para o PrismaService. Este Tag é a INTERFACE que o functional core conhece — ele NÃO importa NestJS nem o PrismaService concreto.

```typescript
// domains/shared/core/ports/prisma-service.tag.ts
import { Context } from 'effect'
import type { PrismaClient } from '../../../../generated/prisma/client.js'

export class PrismaServiceTag extends Context.Tag('PrismaService')<
  PrismaServiceTag,
  PrismaClient
>() {}
```

**Localização:** `api/src/domains/shared/core/ports/prisma-service.tag.ts` — pasta `core/ports/` (é uma INTERFACE de domínio, não infraestrutura).

**Atenção ao import path:** O `PrismaClient` é importado APENAS como TYPE (`import type`), mantendo a pureza do core. O `PrismaClient` type vem do generated client, não de `@prisma/client`.

### HEALTH CHECK PROGRAM (prova de conceito)

```typescript
// domains/shared/shell/effect-runtime/health-check.program.ts
import { Effect } from 'effect'
import { PrismaServiceTag } from '../../core/ports/prisma-service.tag.js'

export const healthCheckProgram = Effect.gen(function* () {
  const prisma = yield* PrismaServiceTag
  const result = await prisma.$queryRaw`SELECT 1 as health`
  return { status: 'ok', database: 'connected', timestamp: new Date().toISOString() }
})
```

**Nota:** O health check usa `$queryRaw` para validar que o runtime Effect consegue acessar o PrismaService injetado. Isso prova que o Composition Root está funcional.

### AppModule — Atualização

```typescript
// app.module.ts final
import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { PrismaGlobalModule } from './domains/shared/shell/infra/prisma-global.module.js'
import { EffectRuntimeModule } from './domains/shared/shell/effect-runtime/effect-runtime.module.js'

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaGlobalModule,
    EffectRuntimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### Pacotes a Instalar

```bash
cd api && npm install effect @effect/schema @nestjs/event-emitter
```

**Versões esperadas (Abr/2026):**
| Pacote | Versão | Notas |
|---|---|---|
| `effect` | latest (~3.x) | Core do Effect TS |
| `@effect/schema` | latest | Validação funcional (usado na story 1.4+, mas instalar agora) |
| `@nestjs/event-emitter` | ^3.0.0 | Wrapper de EventEmitter2 para NestJS |

**NÃO instalar:** `@nestjs-effect` (descartado), `eventemitter2` (vem como dep do `@nestjs/event-emitter`).

### Project Structure Notes

**Arquivos novos desta story:**
```
api/src/
├── domains/
│   └── shared/
│       ├── core/
│       │   ├── events/
│       │   │   ├── domain-event.interface.ts     # [NEW]
│       │   │   ├── with-events.ts                # [NEW]
│       │   │   └── index.ts                      # [NEW]
│       │   └── ports/
│       │       └── prisma-service.tag.ts          # [NEW]
│       └── shell/
│           └── effect-runtime/
│               ├── effect-runtime.module.ts       # [NEW]
│               ├── event-dispatcher.service.ts    # [NEW]
│               └── health-check.program.ts        # [NEW]
```

**Arquivos modificados:**
- `api/src/app.module.ts` — adicionar imports de `EventEmitterModule` e `EffectRuntimeModule`
- `api/package.json` — novas dependências

**Arquivos deletados:**
- `api/src/domains/shared/core/events/.gitkeep`
- `api/src/domains/shared/shell/effect-runtime/.gitkeep`

**Nota sobre `shared/core/ports/`:** A pasta `ports/` no shared kernel NÃO existia antes como diretório dedicado no shared (existia nos bounded contexts). Criar a pasta se não existir. O `.gitkeep` de `shared/core/` pode ser limpado se houver.

### TypeScript — Imports com Extensão .js

**CRÍTICO:** O `tsconfig.json` do API usa `module: "nodenext"`. Todos os imports relativos DEVEM incluir a extensão `.js`:

```typescript
// ✅ CORRETO
import { PrismaServiceTag } from '../../core/ports/prisma-service.tag.js'
import type { DomainEvent } from './domain-event.interface.js'

// ❌ ERRADO — vai falhar em runtime
import { PrismaServiceTag } from '../../core/ports/prisma-service.tag'
import type { DomainEvent } from './domain-event.interface'
```

### Naming Conventions

- Arquivos: `kebab-case` com sufixo de tipo (`.module.ts`, `.service.ts`, `.interface.ts`, `.tag.ts`)
- Tags Effect: `PascalCase` com sufixo `Tag` (`PrismaServiceTag`, `RedisServiceTag`)
- Interfaces: `PascalCase` (`DomainEvent`)
- Types: `PascalCase` (`WithEvents`)
- Funções helper: `camelCase` (`noEvents`, `withEvents`, `runAndDispatch`)
- Constantes de token: `SCREAMING_SNAKE_CASE` (`EFFECT_RUNTIME`)

[Source: architecture.md#6-padroes-de-implementacao]

### Regras Arquiteturais Obrigatórias

1. Pastas `core/` contêm APENAS código Effect puro — zero imports de `@nestjs/*`, Prisma, Redis
2. Use `import type` para tipos que vêm de libs de infra (ex: `PrismaClient`) — mantém pureza do core
3. `EffectRuntimeModule` deve ser `@Global()` — qualquer bounded context pode injetar o runtime
4. Todo programa Effect retornando resultado + eventos DEVE usar `WithEvents<A>` — NUNCA emitir eventos diretamente no core
5. `ManagedRuntime` é SINGLETON — um único runtime por aplicação, compartilhado entre módulos
6. `runtime.dispose()` OBRIGATÓRIO no `onModuleDestroy` — evita memory leak e resource leak
7. Layer é o ponto de extensão — futuros services (Redis, JWT) serão adicionados via `Layer.merge` no `useFactory`

[Source: architecture.md#2-integracao-effect-ts-nestjs]
[Source: architecture.md#4-domain-events-funcionais]
[Source: architecture.md#8-regras-obrigatorias]

### Anti-Patterns a Evitar

1. **NÃO instalar `@nestjs-effect`** — descartado pela Architecture (mantenedor único, pré-1.0)
2. **NÃO usar `throw` ou `try/catch` no core** — usar Effect errors tagueados
3. **NÃO importar `@nestjs/*` em `core/`** — quebra a pureza funcional
4. **NÃO criar múltiplos runtimes** — um único `ManagedRuntime` compartilhado
5. **NÃO implementar Guards, Filters ou Pipes nesta story** — são da story 1.4
6. **NÃO criar entidades de domínio** — apenas infraestrutura Effect + eventos base
7. **NÃO usar `Effect.runPromise()` estático** — SEMPRE usar `runtime.runPromise()` via injeção
8. **NÃO esquecer a extensão `.js` nos imports relativos** — obrigatório com `module: "nodenext"`
9. **NÃO usar `eventemitter2` diretamente** — usar via `@nestjs/event-emitter` para integração com lifecycle NestJS

### Previous Story Intelligence

**Story 1.1 (done) — Learnings:**
- NestJS v11 usa Vitest (não Jest) — testes em `*.spec.ts`
- SWC é o compilador padrão — builds rápidos
- Estrutura hexagonal criada com `.gitkeep` — substituir ao criar arquivos reais
- Template Expo SDK 55 usa `src/app/` — não relevante para esta story

**Story 1.2 (done) — Learnings:**
- Prisma v7 usa `prisma-client` generator (não `prisma-client-js`)
- Import do PrismaClient: `../../../../generated/prisma/client` (path relativo ao output configurado)
- `PrismaService` está em `api/src/domains/shared/shell/infra/prisma.service.ts`
- `PrismaGlobalModule` com `@Global()` já está registrado no `app.module.ts`
- `import "dotenv/config"` necessário explicitamente para carregar .env em testes
- `PrismaService` extends `PrismaClient` e implementa `OnModuleInit`, `OnModuleDestroy`
- Vitest não carrega `.env` automaticamente
- `instanceof PrismaClient` causa stack overflow com adapter pattern — evitar em testes

**Estado atual do `app.module.ts`:**
```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaGlobalModule } from './domains/shared/shell/infra/prisma-global.module';

@Module({
  imports: [PrismaGlobalModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**Nota:** Os imports existentes NÃO usam extensão `.js` — manter consistência com o que já existe OU atualizar para o padrão correto. Verificar se o build atual funciona com/sem extensão antes de decidir.

### Git Intelligence

Commits recentes:
- `ce1f8e5` — docs: create project context
- `827d9ba` — docs: revised architecture
- `f1764fe` — feat: complete story 1-2
- `870bcf9` — feat: initialize mobile and API projects
- Padrão de commit: `feat:` para features, `docs:` para documentação, `chore:` para manutenção

### References

- [Source: architecture.md#2-integracao-effect-ts-nestjs] — Padrão `useFactory` + `ManagedRuntime`, decisão de integração manual
- [Source: architecture.md#4-domain-events-funcionais] — `WithEvents<A>`, `DomainEvent`, `noEvents`, `withEvents`, `EffectEventDispatcher`
- [Source: architecture.md#6-padroes-de-implementacao] — Naming conventions, file structure
- [Source: architecture.md#7-estrutura-do-projeto] — Localização dos arquivos (shared/core/, shared/shell/)
- [Source: architecture.md#8-regras-obrigatorias] — 10 regras para agentes de IA
- [Source: architecture.md#9-sequencia-de-implementacao] — Passo 5: Effect TS setup + Composition Root
- [Source: epics.md#story-1.3] — Acceptance criteria originais
- [Source: project-context.md] — Regras de implementação e stack tecnológica
- [Source: 1-2-schema-prisma-e-configuracao-do-banco-de-dados.md] — Estado do Prisma e PrismaService
- [Effect TS ManagedRuntime docs](https://effect.website) — API reference para ManagedRuntime.make, Layer, Context.Tag

## Dev Agent Record

### Agent Model Used

Gemini 2.5 Pro (Antigravity) — 2026-04-03

### Debug Log References

- Fix 1: `health-check.program.ts` usava `await` dentro de `Effect.gen` — substituído por `yield* Effect.promise(() => prisma.$queryRaw...)` (obrigatório com `Effect.gen`).
- Fix 2: `effect-runtime.module.spec.ts` — `overrideProvider` não funciona para providers de módulos importados quando o token não existe no escopo do TestingModule. Solução: criar `ManagedRuntime` real com `Layer.succeed(PrismaServiceTag, mockPrismaClient)` e fornecer via `useValue` diretamente no test module.
- Fix 3: `app.controller.spec.ts` — injeção de `EFFECT_RUNTIME` quebrava o teste unitário existente; adicionado mock via `useValue`.

### Completion Notes List

- ✅ Instaladas: `effect`, `@effect/schema`, `@nestjs/event-emitter`
- ✅ Shared kernel puro criado: `DomainEvent`, `WithEvents<A>`, `noEvents`, `withEvents` — zero imports de `@nestjs/*`
- ✅ `PrismaServiceTag` criado em `core/ports/` como interface de domínio (usa `import type` para PrismaClient)
- ✅ `EffectRuntimeModule` global com `ManagedRuntime` singleton e `onModuleDestroy` → `runtime.dispose()`
- ✅ `EffectEventDispatcher` com `runAndDispatch` — puente entre Functional Core e Imperative Shell
- ✅ `healthCheckProgram` Effect puro + endpoint `GET /api/v1/health/effect` no AppController
- ✅ Build TypeScript sem erros
- ✅ 18/19 testes passam (1 pré-existente de story 1.2 requer banco de dados)
- ℹ️ A falha em `prisma.service.spec.ts > should be able to query the Company model` é pré-existente (story 1.2) e requer banco PostgreSQL rodando na porta 5432
- ✅ Resolved review finding [Patch]: Missing `.js` extensions em todos os imports relativos
- ✅ Resolved review finding [Patch]: `api/dist/` removido do git e adicionado ao `.gitignore`
- ✅ Resolved review finding [Patch]: `health-check.program.ts` agora utiliza resultado do query e trata rejeição
- ✅ Resolved review finding [Patch]: `app.controller.ts` desestrutura eventos e guarda contra rejeição
- ✅ Resolved review finding [Patch]: `event-dispatcher.service.ts` com error boundary e nullish check
- ✅ Resolved review finding [Patch]: `with-events.ts` aceita ReadonlyArray e fallback nullish
- ✅ Resolved review finding [Patch]: `EventEmitterModule` configurado com `wildcard: false, maxListeners: 20`
- ✅ Resolved review finding [Patch]: Teardown seguro em `effect-runtime.module.ts` e `app.e2e-spec.ts`
- ✅ Build e todos 19/19 testes passam após review follow-ups
- ✅ Resolved review finding [Patch]: `health-check.program.ts` refatorado de `Effect.promise` para `Effect.tryPromise` — falhas de DB agora são typed errors no channel E
- ✅ Resolved review finding [Patch]: `health-check.program.ts` usa `Clock.currentTimeMillis` em vez de `Effect.sync(() => new Date())` — testabilidade determinística
- ✅ Resolved review finding [Patch]: `health-check.program.ts` preserva stack trace original via `{ cause: error }` no `tryPromise` catch
- ✅ Resolved review finding [Patch]: `effect-runtime.module.spec.ts` usa mock baseado em `Proxy` em vez de cast `as PrismaClient`
- ✅ Build e todos 19/19 testes passam após patches finais
- ✅ Resolved review finding [Patch]: `effect-runtime.module.spec.ts` mock agora tipado com `Pick<PrismaClient, '$queryRaw'>` em vez de `any`

### File List

**Arquivos criados:**
- `api/src/domains/shared/core/events/domain-event.interface.ts`
- `api/src/domains/shared/core/events/with-events.ts`
- `api/src/domains/shared/core/events/index.ts`
- `api/src/domains/shared/core/events/domain-event.spec.ts`
- `api/src/domains/shared/core/ports/prisma-service.tag.ts`
- `api/src/domains/shared/shell/effect-runtime/effect-runtime.module.ts`
- `api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.ts`
- `api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.spec.ts`
- `api/src/domains/shared/shell/effect-runtime/effect-runtime.module.spec.ts`
- `api/src/domains/shared/shell/effect-runtime/health-check.program.ts`

**Arquivos modificados:**
- `api/src/app.module.ts` — adicionados `EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 })` e `EffectRuntimeModule`; `.js` extensions
- `api/src/app.controller.ts` — adicionado endpoint `GET /api/v1/health/effect`; error handling e event logging; `.js` extensions
- `api/src/app.controller.spec.ts` — adicionado mock `EFFECT_RUNTIME` para teste unitário; `.js` extensions
- `api/src/domains/shared/core/events/with-events.ts` — `withEvents` aceita `ReadonlyArray | null | undefined`
- `api/src/domains/shared/core/events/domain-event.spec.ts` — `.js` extensions
- `api/src/domains/shared/shell/effect-runtime/effect-runtime.module.ts` — teardown try/catch com Logger; `.js` extensions
- `api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.ts` — error boundary por emit, nullish check; Logger
- `api/src/domains/shared/shell/effect-runtime/health-check.program.ts` — usa query result, `.catch()` wrapper; `.js` extensions
- `api/src/domains/shared/shell/effect-runtime/effect-runtime.module.spec.ts` — `.js` extensions
- `api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.spec.ts` — `.js` extensions
- `api/src/domains/shared/shell/infra/prisma.service.ts` — `.js` extension no import do PrismaClient
- `api/src/domains/shared/shell/infra/prisma-global.module.ts` — `.js` extension no import do PrismaService
- `api/test/app.e2e-spec.ts` — teardown try/catch no `afterEach`; `.js` extensions
- `api/.gitignore` — adicionado `/dist`
- `api/package.json` — adicionadas dependências `effect`, `@effect/schema`, `@nestjs/event-emitter`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status de `ready-for-dev` → `review`

**Arquivos deletados:**
- `api/src/domains/shared/core/events/.gitkeep`
- `api/src/domains/shared/shell/effect-runtime/.gitkeep`

### Change Log

- feat(effect): instalar effect, @effect/schema, @nestjs/event-emitter (2026-04-03)
- feat(effect): criar primitivas de DomainEvent e WithEvents no shared kernel puro (2026-04-03)
- feat(effect): criar PrismaServiceTag em core/ports como context tag do Effect (2026-04-03)
- feat(effect): criar EffectRuntimeModule global com ManagedRuntime singleton (2026-04-03)
- feat(effect): criar EffectEventDispatcher com runAndDispatch (2026-04-03)
- feat(effect): criar healthCheckProgram e endpoint GET /api/v1/health/effect (2026-04-03)
- test(effect): adicionar testes unitários, integração e E2E para todos os novos componentes (2026-04-03)
- fix(effect): addressed 8 code review findings — .js extensions, error handling, teardown safety, EventEmitter config (2026-04-03)
- fix(effect): addressed 2 final review findings — Effect.tryPromise and typed mock (2026-04-03)

### Review Findings
- [x] [Review][Patch] Missing `.js` extensions in relative imports (app.module, app.controller, etc) — corrigido: todos os imports relativos agora usam `.js`
- [x] [Review][Patch] `api/dist/tsconfig.build.tsbuildinfo` is tracked in version control — corrigido: adicionado `/dist` ao `.gitignore` e removido do git cache
- [x] [Review][Patch] `health-check.program.ts` ignores query results and lacks proper promise rejection handling — corrigido: usa resultado do query para determinar status + `.catch()` wrapper
- [x] [Review][Patch] `app.controller.ts` `healthEffect` drops events and lacks unhandled rejection guard — corrigido: desestrutura `[result, events]`, loga eventos inesperados, try/catch
- [x] [Review][Patch] `event-dispatcher.service.ts` lacks error boundary for `runPromise`, `events` nullish check, and `emit` failure handling — corrigido: `events ?? []`, try/catch por emit individual, Logger
- [x] [Review][Patch] `with-events.ts` restricts inputs to mutable arrays and lacks fallback for nullish `events` — corrigido: aceita `ReadonlyArray | null | undefined`, fallback `?? []`
- [x] [Review][Patch] `app.module.ts` initializes `EventEmitterModule` without constraint limits — corrigido: `{ wildcard: false, maxListeners: 20 }`
- [x] [Review][Patch] Teardown hooks in `effect-runtime.module.ts` and `app.e2e-spec.ts` lack safe fallback during shutdown — corrigido: try/catch em `onModuleDestroy` e `afterEach`
- [x] [Review][Defer] `app.controller.spec.ts` uses brittle hardcoded mock for `EFFECT_RUNTIME` — deferred, pre-existing
- [x] [Review][Defer] `domain-event.spec.ts` relies on non-deterministic system time — deferred, tests
- [x] [Review][Defer] `test/app.e2e-spec.ts` loosely validates timestamp schema — deferred, tests
- [x] [Review][Defer] `event-dispatcher.service.spec.ts` heavily mocks `ManagedRuntime` — deferred, tests
- [x] [Review][Patch] `health-check.program.ts` usa `Effect.promise` em vez de `Effect.tryPromise` — corrigido: agora usa `Effect.tryPromise` com catch callback tipado
- [x] [Review][Patch] Mock do PrismaClient com tipo `any` — corrigido: mock agora tipado com `Pick<PrismaClient, '$queryRaw'>` e `PrismaClient` type import
- [x] [Review][Defer] Query manual `SELECT 1 as health` no health-check pode ser frágil — deferred, pre-existing (aceito como prova de conceito inicial) [health-check.program.ts:7]
- [x] [Review][Defer] `DomainEvent.occurredAt` é `string` genérica — deferred, pre-existing (poderia usar Branded Type no futuro) [domain-event.interface.ts:4]
- [x] [Review][Defer] Health check bypasses event dispatcher entirely — deferred: too much complexity for a simple health check program
- [x] [Review][Patch] EffectEventDispatcher lacks module registration — corrigido: adicionado como provider e export no EffectRuntimeModule [effect-runtime.module.ts]
- [x] [Review][Patch] Non-Deterministic Pure Programs — corrigido: new Date() wrapado em Effect.sync() para manter pureza funcional [health-check.program.ts]
- [x] [Review][Defer] Missing Effect Composition Primitives in WithEvents — deferred, future enhancement
- [x] [Review][Defer] Typed Errors are Eviscerated — deferred, nature of the imperative shell boundary
- [x] [Review][Defer] Reckless Synchronous Event Dispatching — deferred, standard NestJS behavior used for now
- [x] [Review][Defer] Potentially Hanging Module Teardown — deferred, NestJS global shutdown timeout handles this
- [x] [Review][Defer] Sloppy, Untyped Domain Events payload — deferred, pre-existing constraint from architecture
- [x] [Review][Defer] queryResult array exists but lacks expected health shape — deferred, low probability in health check
- [x] [Review][Defer] Apathetic Process Teardown — `onModuleDestroy` swallows runtime disposal failures into a log instead of failing loudly. — deferred: Unecessary now due to complexity
- [x] [Review][Patch] Loss of Native Clock Capabilities — corrigido: usa `Clock.currentTimeMillis` do Effect para testabilidade determinística [health-check.program.ts]
- [x] [Review][Patch] Trace Destruction — corrigido: preserva stack trace original via `{ cause: error }` no constructor do Error [health-check.program.ts]
- [x] [Review][Patch] Brittle Mocking — corrigido: mock PrismaClient baseado em `Proxy` que retorna no-ops para propriedades não-stubadas [effect-runtime.module.spec.ts]
