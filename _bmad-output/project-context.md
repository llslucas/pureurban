---
project_name: 'pureurban'
user_name: 'Lucas'
date: '2026-04-01'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
status: 'complete'
rule_count: 52
optimized_for_llm: true
---

# Project Context for AI Agents

_Este arquivo contem regras criticas e padroes que agentes de IA devem seguir ao implementar codigo neste projeto. Foco em detalhes nao obvios que agentes podem perder._

---

## Technology Stack & Versions

### Backend (api/)

| Tecnologia | Versao | Notas |
|---|---|---|
| NestJS | 11.0.1 | Framework principal, DI/IoC |
| TypeScript | 5.7.3 | target: ES2023, module: nodenext, strict |
| Prisma | 7.6.0 | ORM com multi-schema PostgreSQL |
| @prisma/adapter-pg | 7.6.0 | Adaptador PostgreSQL nativo |
| Effect TS | latest | Functional Core — zero imports NestJS no core/ |
| Vitest | 4.1.2 | Testes unitarios e e2e |
| Playwright | 1.58.2 | Testes API e E2E com browser |
| ESLint | 9.18.0 | Flat config, typescript-eslint recommended-type-checked |
| Prettier | 3.4.2 | singleQuote: true, trailingComma: "all" |
| SWC | 1.15.21 | Transpiler (unplugin-swc) |

### Mobile (mobile/)

| Tecnologia | Versao | Notas |
|---|---|---|
| Expo | 55.0.8 | SDK 55, React Compiler habilitado |
| React | 19.2.0 | UI library |
| React Native | 0.83.2 | Runtime mobile |
| Expo Router | 55.0.7 | File-based routing, typedRoutes: true |
| TypeScript | 5.9.2 | Extends expo/tsconfig.base, paths: @/* = ./src/* |
| React Native Reanimated | 4.2.1 | Animacoes |

### Infraestrutura

| Servico | Versao | Porta |
|---|---|---|
| PostgreSQL | 16-alpine (Docker) | 5432 |
| Redis | 7-alpine (Docker) | 6379 |

## Critical Implementation Rules

### Regras Especificas de Linguagem (TypeScript)

**Configuracao TypeScript:**
- API: `module: "nodenext"` — imports relativos DEVEM incluir extensao `.js`
- API: `target: ES2023` — pode usar top-level await, Array.at(), etc.
- Mobile: path alias `@/*` mapeia para `./src/*` — usar SEMPRE em imports internos
- API NAO tem path aliases — usar imports relativos com extensao
- Strict mode habilitado em ambos os projetos

**Organizacao de Imports (API):**
1. Imports `@nestjs/*` (somente em shell/)
2. Imports de dominio / Effect TS
3. Utilitarios e helpers

**Error Handling com Effect TS:**
- Core retorna `Effect<A, E, R>` — NUNCA usar throw/try-catch no core
- Erros sao tipos tagueados do Effect (tagged errors)
- Shell converte Effect errors em HTTP exceptions do NestJS
- Use-cases usam `Effect.gen(function* () { ... })`

**Regra de Pureza Funcional:**
- `core/` NUNCA importa de `@nestjs/*` — pureza funcional obrigatoria
- `shell/` e a unica camada que conhece NestJS e infraestrutura
- Schemas de validacao usam `@effect/schema` no core (nao class-validator)
- class-validator/class-transformer somente em DTOs do shell/http/

### Regras Especificas de Framework

**NestJS + Effect TS (Backend):**
- Composicao manual via `ManagedRuntime` — injetado com `@Inject('EFFECT_RUNTIME')`
- Modulos NestJS usam `useFactory` para criar o runtime do Effect
- Controllers vivem em `shell/http/` — NUNCA logica de dominio no controller
- Controllers chamam use-cases via runtime: `this.runtime.runPromise(useCase(params))`
- Domain Events: core retorna `WithEvents<A> = [result: A, events: DomainEvent[]]`
- Shell despacha eventos via `EventEmitter2` apos executar o Effect

**Prisma Multi-Schema (DDD Enforcement):**
- 6 schemas: `public`, `auth`, `routing`, `boarding`, `tracking`, `trip`
- Cada entidade usa `@@schema("context_name")` no schema.prisma
- PROIBIDO fazer JOINs entre bounded contexts — schemas sao a barreira
- Todas entidades sao tenant-scoped (companyId)
- UUIDs como primary keys, timestamps (createdAt, updatedAt)

**Expo Router (Mobile):**
- File-based routing em `src/app/`
- Layout groups: `(auth)/`, `(driver)/`, `(student)/`
- `typedRoutes: true` — rotas tipadas automaticamente
- Theming via hook `useTheme()` consumindo constantes `ThemeColor`
- Arquivos platform-specific: sufixo `.web.tsx`

**Offline-First (Tiers):**
- Tier 1 (Leitura): TanStack Query + MMKV persistence — cobre 90% dos cenarios
- Tier 2 (Escrita): expo-sqlite queue somente para check-ins
- Idempotencia via header `X-Idempotency-Key`
- Backoff exponencial: 1s, 2s, 4s, 8s, max 30s

### Regras de Testes

**Organizacao:**
- `src/**/*.spec.ts` — testes unitarios (Vitest)
- `test/**/*.e2e-spec.ts` — testes e2e NestJS (Vitest, timeout 30s)
- `tests/api/` — integracao API sem browser (Playwright)
- `tests/e2e/` — E2E com browser (Playwright + Chrome)
- `tests/support/` — fixtures, factories (@faker-js/faker), auth helpers, seed helpers

**Padroes:**
- Testes unitarios usam `Test.createTestingModule()` do NestJS
- Testes de integracao com Prisma usam banco REAL — NUNCA mocks de banco
- Factories com `@faker-js/faker` para dados de teste
- Fixtures combinadas em `tests/support/merged-fixtures.ts`
- Playwright API tests usam `baseURL: http://localhost:3000`

**Core vs Shell:**
- Core (Effect TS) pode ser testado isoladamente SEM NestJS TestingModule
- Shell precisa de TestingModule com providers mockados ou reais

**Mobile (Story 1.10):**
- `mobile/` usa `jest-expo` (preset), `@testing-library/react-native` para render
- Arquivos `src/**/*.{test,spec}.{ts,tsx}` — `npm test` / `npm run test:watch`
- Roda sem device/emulador/rede/Docker/`.env`; suite inicial cobre funcoes puras + um render de primitivo RN

**Comandos:**
- `npm test` — unit | `npm run test:e2e` — e2e Vitest
- `npm run test:pw` — todos Playwright | `npm run test:pw:api` — API only
- `npm run test:pw:e2e` — E2E browser | `npm run test:cov` — coverage v8

### Regras de Qualidade e Estilo de Codigo

**ESLint/Prettier:**
- ESLint 9 flat config (`eslint.config.mjs`) com `@typescript-eslint/recommended-type-checked`
- Prettier: `singleQuote: true`, `trailingComma: "all"`
- `npm run format` — formata src/ e test/
- `npm run lint` — linting com auto-fix

**Estrutura de Arquivos (API - Hexagonal):**
```
domains/{context}/
  core/              # Puro, Effect TS — zero dependencias de infra
    ports/           # Interfaces de dominio (repositorios, servicos)
    use-cases/       # Logica de dominio (funcoes retornando Effect)
    errors/          # Erros tagueados do dominio
    schemas/         # Validacao com @effect/schema
  shell/             # NestJS-specific
    adapters/        # Implementacoes dos ports (Prisma, Redis)
    http/            # Controllers, DTOs, decorators
```

**Naming Conventions:**
- Controllers: `*.controller.ts` | Services: `*.service.ts` | Modules: `*.module.ts`
- Specs: `*.spec.ts` (unit), `*.e2e-spec.ts` (e2e)
- Mobile components: kebab-case arquivo, PascalCase export
- Indentacao: 2 espacos

**Documentacao:**
- Codigo auto-documentavel preferido — sem JSDoc obrigatorio
- Comentarios somente quando logica nao e auto-evidente

### Regras de Workflow de Desenvolvimento

**Monorepo:**
- `api/` e `mobile/` na raiz — cada um com seu proprio `package.json`
- Sem workspaces configurado — instalar dependencias em cada diretorio separadamente

**Git (Conventional Commits):**
- Branch principal: `main`
- Prefixos: `feat:`, `fix:`, `chore:`, `docs:`

**Ambiente Local:**
- `docker compose up` — PostgreSQL 16 + Redis 7
- `cd api && npm run start:dev` — backend watch mode
- `cd mobile && npm start` — Expo dev server
- `.env` baseado em `.env.example` — NUNCA commitar `.env`

**Build:**
- API: `npm run build` → `node dist/main` (CJS output)
- Mobile: Expo managed workflow
- CI/CD: planejado, ainda nao implementado

**Prisma Workflow:**
- Schema: `api/prisma/schema.prisma`
- Migrations: `api/prisma/migrations/`
- Client gerado: `api/src/generated/prisma`
- Apos alterar schema: `npx prisma migrate dev` → `npx prisma generate`

### Regras Criticas — Nao Ignorar

**Anti-Patterns PROIBIDOS:**
- NUNCA importar `@nestjs/*` dentro de `core/` — quebra arquitetura hexagonal
- NUNCA fazer JOINs/queries entre bounded contexts (schemas diferentes no Prisma)
- NUNCA usar `throw` ou `try/catch` no core — usar Effect errors tagueados
- NUNCA colocar logica de dominio em controllers — controllers sao adaptadores HTTP
- NUNCA usar `class-validator` no core — somente `@effect/schema`
- NUNCA commitar `.env` — usar `.env.example` como referencia
- NUNCA usar AsyncStorage no mobile — usar MMKV (performance)

**Multi-Tenancy (Obrigatorio):**
- TODA query deve filtrar por `companyId` — sem excecao
- `TenantGuard` valida companyId em toda requisicao autenticada
- Novas entidades SEMPRE incluem campo `companyId`

**Prisma Multi-Schema:**
- Ao criar nova entidade, SEMPRE adicionar `@@schema("context_name")`
- UUIDs como primary keys, timestamps (createdAt, updatedAt) em toda entidade

**Offline Sync:**
- Check-ins na fila expo-sqlite DEVEM ter `X-Idempotency-Key` para evitar duplicatas
- Backoff exponencial: 1s, 2s, 4s, 8s, max 30s

**Seguranca:**
- Todo endpoint protegido exceto login/register (JWT)
- Sanitizar inputs nos DTOs do shell — NUNCA confiar em dados do cliente

**Real-Time:**
- SSE para real-time — fallback para polling se SSE indisponivel
- Redis Pub/Sub para comunicacao entre instancias
- TanStack Query com staleTime configurado para evitar refetches desnecessarios

---

## Diretrizes de Uso

**Para Agentes de IA:**
- Ler este arquivo ANTES de implementar qualquer codigo
- Seguir TODAS as regras exatamente como documentado
- Na duvida, preferir a opcao mais restritiva
- Atualizar este arquivo se novos padroes emergirem

**Para Humanos:**
- Manter este arquivo enxuto e focado nas necessidades dos agentes
- Atualizar quando a stack tecnologica mudar
- Revisar trimestralmente para remover regras obsoletas
- Remover regras que se tornem obvias com o tempo

Ultima atualizacao: 2026-04-01
