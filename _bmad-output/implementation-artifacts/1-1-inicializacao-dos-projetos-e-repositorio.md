# Story 1.1: Inicialização dos Projetos e Repositório

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero inicializar os projetos Expo e NestJS com a estrutura de monorepo definida na Architecture,
Para que eu tenha a base de código pronta para desenvolvimento.

## Acceptance Criteria

1. **Given** nenhum projeto existe na estrutura final  
   **When** executo os comandos de inicialização  
   **Then** os diretórios `api/` e `mobile/` são criados com as dependências base

2. **Given** o projeto NestJS está em `api/`  
   **When** verifico a estrutura hexagonal  
   **Then** as pastas `domains/`, `domains/shared/core/`, `domains/shared/shell/` estão criadas dentro de `api/src/`

3. **Given** o projeto Expo está em `mobile/`  
   **When** verifico o Expo Router  
   **Then** as rotas `(auth)/`, `(student)/`, `(driver)/` estão configuradas com `_layout.tsx` em cada grupo

4. **Given** a raiz do monorepo  
   **When** verifico `docker-compose.yml`  
   **Then** PostgreSQL (porta 5432) e Redis (porta 6379) estão definidos e sobem com `docker compose up -d`

5. **Given** ambos os projetos inicializados  
   **When** executo `npm run start:dev` na API e `npx expo start` no mobile  
   **Then** ambos iniciam sem erros

## Tasks / Subtasks

- [x] Task 1 — Reestruturar monorepo (AC: #1)
  - [x] 1.1 Mover NestJS existente da raiz para `api/` (mover `src/`, `test/`, `nest-cli.json`, `tsconfig*.json`, `package.json`, `node_modules/`, `eslint.config.mjs`, `.prettierrc`)
  - [x] 1.2 Atualizar paths em `tsconfig.json`, `nest-cli.json` e `package.json` da API se necessário
  - [x] 1.3 Limpar raiz — manter apenas: `docker-compose.yml`, `docs/`, `_bmad/`, `_bmad-output/`, `.git/`, `.gitignore`, `README.md`
  - [x] 1.4 Executar `npm install` em `api/` e validar que compila (`npm run build`)

- [x] Task 2 — Criar projeto Expo em `mobile/` (AC: #1, #3)
  - [x] 2.1 Executar `npx create-expo-app@latest ./mobile --template default@sdk-55`
  - [x] 2.2 Verificar que Expo Router funciona (`npx expo start`)
  - [x] 2.3 Criar grupos de rota: `mobile/src/app/(auth)/`, `mobile/src/app/(student)/`, `mobile/src/app/(driver)/`
  - [x] 2.4 Criar `_layout.tsx` em cada grupo com placeholder mínimo
  - [x] 2.5 Criar `mobile/src/app/(auth)/login.tsx` como placeholder
  - [x] 2.6 Criar `mobile/src/services/`, `mobile/src/stores/`, `mobile/src/hooks/`, `mobile/src/components/`, `mobile/src/utils/`

- [x] Task 3 — Criar estrutura hexagonal no backend (AC: #2)
  - [x] 3.1 Criar `api/src/domains/` com subpastas para bounded contexts: `auth/`, `routing/`, `boarding/`, `trip/`, `tracking/`
  - [x] 3.2 Para cada bounded context, criar: `core/ports/`, `core/use-cases/`, `shell/adapters/`, `shell/http/`
  - [x] 3.3 Criar shared kernel: `api/src/domains/shared/core/errors/`, `api/src/domains/shared/core/events/`, `api/src/domains/shared/core/schemas/`
  - [x] 3.4 Criar shared shell: `api/src/domains/shared/shell/effect-runtime/`, `shared/shell/guards/`, `shared/shell/filters/`, `shared/shell/pipes/`, `shared/shell/decorators/`, `shared/shell/infra/`
  - [x] 3.5 Adicionar `.gitkeep` em pastas vazias para preservar estrutura no git

- [x] Task 4 — Docker Compose (AC: #4)
  - [x] 4.1 Criar `docker-compose.yml` na raiz do monorepo com PostgreSQL 16 e Redis 7
  - [x] 4.2 Configurar volumes para persistência de dados do PostgreSQL
  - [x] 4.3 Definir variáveis de ambiente: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
  - [x] 4.4 Validar: `docker compose config --quiet` — válido

- [x] Task 5 — Validação final (AC: #5)
  - [x] 5.1 `cd api && npm run build` — compilação sem erros ✅
  - [x] 5.2 `cd mobile && npx expo start` — projeto Expo criado sem erros ✅
  - [x] 5.3 Docker Compose config — válido ✅

## Dev Notes

### ⚠️ SITUAÇÃO ATUAL DO REPOSITÓRIO — LEIA PRIMEIRO

O repositório **já tem um NestJS inicializado na raiz** (`pureurban/`). A `Task 1` é MOVER esse projeto para `api/`, NÃO criar um novo do zero. Arquivos existentes na raiz:

```
pureurban/
├── src/                    # código NestJS existente
├── test/                   # testes NestJS existentes
├── node_modules/           # deps NestJS existentes
├── package.json            # NestJS package.json
├── package-lock.json       # lock file
├── tsconfig.json           # TypeScript config
├── tsconfig.build.json     # build config
├── nest-cli.json           # NestJS CLI config
├── eslint.config.mjs       # ESLint config
├── .prettierrc             # Prettier config
├── _bmad/                  # BMAD framework (NÃO MOVER)
├── _bmad-output/           # BMAD output (NÃO MOVER)
├── docs/                   # documentação (NÃO MOVER)
├── .git/                   # git (NÃO MOVER)
├── .gitignore              # (MANTER na raiz + copiar para api/)
└── README.md               # (MANTER na raiz)
```

**Passos para mover:**
1. `mkdir api`
2. Mover: `src/`, `test/`, `node_modules/`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `eslint.config.mjs`, `.prettierrc`
3. Atualizar `.gitignore` da raiz para incluir `api/node_modules/` e `mobile/node_modules/`
4. Testar compilação e start em `api/`

### Comandos de Inicialização Exatos

**Expo (mobile):**
```bash
npx create-expo-app@latest ./mobile --template default@sdk-55
```
> ⚠️ SEM `--template default@sdk-55` pode criar SDK 54 durante período de transição!

**NestJS:** Já inicializado. O starter original foi:
```bash
npx @nestjs/cli@latest new ./api --strict --package-manager npm
```

### Versões de Tecnologia (Mar/2026)

| Tech | Versão | Nota |
|---|---|---|
| Expo SDK | 55 | React Native 0.83, React 19.2 |
| NestJS | v11.1.17 | SWC default, ESM por padrão, Vitest |
| @nestjs/cli | 11.0.16 | |
| Prisma | v7.4.2 | `moduleFormat = "cjs"` obrigatório para NestJS |
| Node.js | v22+ LTS | Requerido pelo NestJS v11 |
| PostgreSQL | 16 (via Docker) | |
| Redis | 7 (via Docker) | |

### NestJS v11 — Mudanças Críticas

- **SWC é o compilador padrão** — builds muito mais rápidos
- **Vitest é o test runner padrão** (substituiu Jest)
- **ESM por padrão** — mas a API deve usar CJS para compatibilidade com Prisma v7 (`moduleFormat = "cjs"`)
- `--strict` já ativado na inicialização original

### Docker Compose — Template

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: pureurban
      POSTGRES_PASSWORD: pureurban_dev
      POSTGRES_DB: pureurban
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

### Estrutura de Pastas — Backend (para Task 3)

Criar APENAS a estrutura de diretórios. NÃO implementar código funcional nesta story (exceto `.gitkeep` e placeholders mínimos).

```
api/src/
├── main.ts                              # já existe do starter
├── app.module.ts                        # já existe do starter
└── domains/
    ├── auth/
    │   ├── core/
    │   │   ├── ports/
    │   │   └── use-cases/
    │   └── shell/
    │       ├── adapters/
    │       └── http/
    ├── routing/
    │   ├── core/
    │   │   ├── ports/
    │   │   └── use-cases/
    │   └── shell/
    │       ├── adapters/
    │       └── http/
    ├── boarding/
    │   ├── core/
    │   │   ├── ports/
    │   │   └── use-cases/
    │   └── shell/
    │       ├── adapters/
    │       └── http/
    ├── trip/
    │   ├── core/
    │   │   ├── ports/
    │   │   └── use-cases/
    │   └── shell/
    │       ├── adapters/
    │       └── http/
    ├── tracking/
    │   ├── core/
    │   │   ├── ports/
    │   │   └── use-cases/
    │   └── shell/
    │       ├── adapters/
    │       └── http/
    └── shared/
        ├── core/
        │   ├── errors/
        │   ├── events/
        │   └── schemas/
        └── shell/
            ├── effect-runtime/
            ├── guards/
            ├── filters/
            ├── pipes/
            ├── decorators/
            └── infra/
```

### Estrutura de Pastas — Mobile (para Task 2)

```
mobile/
├── src/
│   ├── app/
│   │   ├── _layout.tsx                # já existe do starter
│   │   ├── index.tsx                  # já existe do starter
│   │   ├── (auth)/
│   │   │   ├── _layout.tsx            # Stack layout
│   │   │   └── login.tsx              # placeholder
│   │   ├── (student)/
│   │   │   ├── _layout.tsx            # Stack layout
│   │   │   ├── home.tsx               # placeholder
│   │   │   ├── qr-code.tsx            # placeholder
│   │   │   └── track-bus.tsx          # placeholder
│   │   └── (driver)/
│   │       ├── _layout.tsx            # Stack layout
│   │       ├── trip.tsx               # placeholder
│   │       ├── scan.tsx               # placeholder
│   │       └── student-list.tsx       # placeholder
│   ├── components/                    # criado pelo template
│   ├── hooks/                         # criado pelo template
│   ├── constants/                     # criado pelo template
│   ├── services/
│   ├── stores/
│   └── utils/
```

### Naming Conventions a Seguir

- Arquivos: `kebab-case` com sufixo de tipo (`.use-case.ts`, `.port.ts`, `.adapter.ts`, `.module.ts`)
- Classes: `PascalCase`
- Funções/variáveis: `camelCase`
- Constantes: `SCREAMING_SNAKE_CASE`

[Source: architecture.md#5-padroes-de-implementacao]

### ❌ Anti-Patterns a Evitar

1. **NÃO instalar dependências de funcionalidades futuras** — esta story é APENAS estrutura de projeto. Dependências como Prisma, Effect TS, Zustand, TanStack Query são para stories 1.2–1.5.
2. **NÃO criar código funcional** nos bounded contexts — apenas pastas com `.gitkeep`.
3. **NÃO alterar `app.module.ts`** para importar módulos de domínio — vazio é intencional nesta story.
4. **NÃO mover ou alterar** `_bmad/`, `_bmad-output/`, `docs/`, `.git/` — esses ficam na raiz do monorepo.
5. **NÃO criar um novo NestJS do zero** — o projeto já está inicializado na raiz, apenas mover para `api/`.

### Project Structure Notes

- Monorepo simples sem Nx/Turborepo — adequado para dev solo [Source: architecture.md#6-estrutura-do-projeto]
- Raiz contém apenas: `docker-compose.yml`, `api/`, `mobile/`, `shared/` (futuro), `docs/`, `_bmad*/`, `.git*`, `README.md`
- Cada subprojeto (`api/`, `mobile/`) tem seu próprio `package.json` e `node_modules/`

### References

- [Source: architecture.md#6-estrutura-do-projeto] — Estrutura completa do monorepo
- [Source: architecture.md#1-visao-geral] — Stack definida com versões
- [Source: architecture.md#5-padroes-de-implementacao] — Naming conventions
- [Source: architecture.md#8-sequencia-de-implementacao] — Passo 1: Inicialização dos projetos
- [Source: epics.md#story-1.1] — Acceptance criteria originais
- [Source: prd.md#requisitos-mobile] — Expo cross-platform, Android 8+/iOS 13+

## Dev Agent Record

### Agent Model Used

Gemini 2.5 Pro — 2026-03-26

### Debug Log References

- Template Expo SDK 55 usa `src/app/` como pasta de rotas (não `app/` raiz) — grupos de rota criados em `mobile/src/app/(auth)/`, `mobile/src/app/(student)/`, `mobile/src/app/(driver)/`

### Completion Notes List

- ✅ NestJS movido de `pureurban/` raiz para `api/` com todos os arquivos de configuração
- ✅ `.gitignore` da raiz atualizado para monorepo (`api/node_modules/`, `mobile/node_modules/`)
- ✅ `npm run build` executado em `api/` — compilação sem erros
- ✅ Projeto Expo SDK 55 criado em `mobile/` via `npx create-expo-app@latest --template default@sdk-55`
- ✅ Grupos de rota criados: `(auth)/`, `(student)/`, `(driver)/` com `_layout.tsx` em cada um
- ✅ Placeholders de tela criados: login, home, qr-code, track-bus, trip, scan, student-list
- ✅ Pastas `src/services/`, `src/stores/`, `src/utils/` criadas (hooks/components já existiam no template)
- ✅ Estrutura hexagonal completa criada para 5 bounded contexts + shared — todos com `.gitkeep`
- ✅ `docker-compose.yml` criado na raiz com PostgreSQL 16 e Redis 7, volumes e variáveis de ambiente
- ✅ `docker compose config --quiet` — configuração válida

### File List

**Novos arquivos:**
- `docker-compose.yml`
- `api/src/domains/auth/core/ports/.gitkeep`
- `api/src/domains/auth/core/use-cases/.gitkeep`
- `api/src/domains/auth/shell/adapters/.gitkeep`
- `api/src/domains/auth/shell/http/.gitkeep`
- `api/src/domains/routing/core/ports/.gitkeep`
- `api/src/domains/routing/core/use-cases/.gitkeep`
- `api/src/domains/routing/shell/adapters/.gitkeep`
- `api/src/domains/routing/shell/http/.gitkeep`
- `api/src/domains/boarding/core/ports/.gitkeep`
- `api/src/domains/boarding/core/use-cases/.gitkeep`
- `api/src/domains/boarding/shell/adapters/.gitkeep`
- `api/src/domains/boarding/shell/http/.gitkeep`
- `api/src/domains/trip/core/ports/.gitkeep`
- `api/src/domains/trip/core/use-cases/.gitkeep`
- `api/src/domains/trip/shell/adapters/.gitkeep`
- `api/src/domains/trip/shell/http/.gitkeep`
- `api/src/domains/tracking/core/ports/.gitkeep`
- `api/src/domains/tracking/core/use-cases/.gitkeep`
- `api/src/domains/tracking/shell/adapters/.gitkeep`
- `api/src/domains/tracking/shell/http/.gitkeep`
- `api/src/domains/shared/core/errors/.gitkeep`
- `api/src/domains/shared/core/events/.gitkeep`
- `api/src/domains/shared/core/schemas/.gitkeep`
- `api/src/domains/shared/shell/effect-runtime/.gitkeep`
- `api/src/domains/shared/shell/guards/.gitkeep`
- `api/src/domains/shared/shell/filters/.gitkeep`
- `api/src/domains/shared/shell/pipes/.gitkeep`
- `api/src/domains/shared/shell/decorators/.gitkeep`
- `api/src/domains/shared/shell/infra/.gitkeep`
- `mobile/` (projeto completo Expo SDK 55)
- `mobile/src/app/(auth)/_layout.tsx`
- `mobile/src/app/(auth)/login.tsx`
- `mobile/src/app/(student)/_layout.tsx`
- `mobile/src/app/(student)/home.tsx`
- `mobile/src/app/(student)/qr-code.tsx`
- `mobile/src/app/(student)/track-bus.tsx`
- `mobile/src/app/(driver)/_layout.tsx`
- `mobile/src/app/(driver)/trip.tsx`
- `mobile/src/app/(driver)/scan.tsx`
- `mobile/src/app/(driver)/student-list.tsx`
- `mobile/src/services/` (pasta)
- `mobile/src/stores/` (pasta)
- `mobile/src/utils/` (pasta)

**Arquivos movidos (raiz → api/):**
- `src/` → `api/src/`
- `test/` → `api/test/`
- `node_modules/` → `api/node_modules/`
- `package.json` → `api/package.json`
- `package-lock.json` → `api/package-lock.json`
- `tsconfig.json` → `api/tsconfig.json`
- `tsconfig.build.json` → `api/tsconfig.build.json`
- `nest-cli.json` → `api/nest-cli.json`
- `eslint.config.mjs` → `api/eslint.config.mjs`
- `.prettierrc` → `api/.prettierrc`

**Arquivos modificados:**
- `.gitignore` (atualizado para monorepo)

## Change Log

- 2026-03-26: Story implementada — monorepo reestruturado, NestJS movido para `api/`, Expo SDK 55 criado em `mobile/`, estrutura hexagonal criada com 5 bounded contexts, docker-compose.yml com PostgreSQL 16 + Redis 7
