# Story 1.2: Schema Prisma e Configuração do Banco de Dados

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero configurar o Prisma com o schema inicial e executar a primeira migration,
Para que o banco de dados esteja pronto para as entidades dos próximos épicos.

## Acceptance Criteria

1. **Given** Docker Compose rodando (PostgreSQL 16 + Redis 7)
   **When** configuro o Prisma v7 no projeto `api/`
   **Then** a conexão com PostgreSQL é estabelecida usando `@prisma/adapter-pg` e `moduleFormat = "cjs"`

2. **Given** Prisma configurado
   **When** verifico o schema
   **Then** o schema contém a entidade `Company` com campos `id`, `name`, `createdAt`, `updatedAt` (seed mínimo para multi-tenancy), anotada com `@@schema("public")`

3. **Given** schema definido com multi-schema
   **When** executo `npx prisma migrate dev`
   **Then** a migration executa com sucesso, os schemas PostgreSQL (`public`, `auth`, `routing`, `boarding`, `tracking`, `trip`) são criados e a tabela `companies` existe no schema `public`

4. **Given** Prisma client gerado
   **When** verifico o `PrismaService`
   **Then** está criado em `api/src/domains/shared/shell/infra/` como service NestJS global

## Tasks / Subtasks

- [x] Task 1 — Instalar dependências do Prisma v7 (AC: #1)
  - [x] 1.1 `cd api && npm install @prisma/client @prisma/adapter-pg pg`
  - [x] 1.2 `cd api && npm install prisma dotenv --save-dev`
  - [x] 1.3 `cd api && npm install @types/pg --save-dev`
  - [x] 1.4 `npx prisma init --output ../src/generated/prisma`

- [x] Task 2 — Configurar schema Prisma (AC: #1, #2)
  - [x] 2.1 Editar `api/prisma/schema.prisma` com generator `prisma-client`, output `../src/generated/prisma`, `moduleFormat = "cjs"`, `schemas = ["public", "auth", "routing", "boarding", "tracking", "trip"]`
  - [x] 2.2 Configurar datasource `postgresql` com `url = env("DATABASE_URL")` e `schemas = ["public", "auth", "routing", "boarding", "tracking", "trip"]`
  - [x] 2.3 Criar modelo `Company` com campos: `id` (UUID, `@default(uuid())`), `name` (String), `createdAt` (DateTime, `@default(now())`), `updatedAt` (DateTime, `@updatedAt`)
  - [x] 2.4 Adicionar `@@map("companies")` e `@@schema("public")` para nome da tabela em snake_case no schema public

- [x] Task 3 — Configurar `prisma.config.ts` (AC: #1)
  - [x] 3.1 Criar `api/prisma.config.ts` com `import "dotenv/config"` e `defineConfig`
  - [x] 3.2 Definir `datasource.url` via `env("DATABASE_URL")`
  - [x] 3.3 Definir `migrations.path` como `"prisma/migrations"`

- [x] Task 4 — Configurar variáveis de ambiente (AC: #1)
  - [x] 4.1 Criar/atualizar `api/.env` com `DATABASE_URL=postgresql://pureurban:pureurban_dev@localhost:5432/pureurban`
  - [x] 4.2 Atualizar `api/.env.example` com a mesma variável (sem valores sensíveis em prod, ok para dev local)

- [x] Task 5 — Executar migration (AC: #3)
  - [x] 5.1 Subir Docker: `docker compose up -d` (a partir da raiz)
  - [x] 5.2 Gerar client: `cd api && npx prisma generate`
  - [x] 5.3 Executar migration: `cd api && npx prisma migrate dev --name init-multi-schema-company`
  - [x] 5.4 Validar que schemas (`public`, `auth`, `routing`, `boarding`, `tracking`, `trip`) e tabela `public.companies` existem no banco

- [x] Task 6 — Criar PrismaService e PrismaModule globais (AC: #4)
  - [x] 6.1 Criar `api/src/domains/shared/shell/infra/prisma.service.ts`
  - [x] 6.2 Criar `api/src/domains/shared/shell/infra/prisma-global.module.ts` com `@Global()`
  - [x] 6.3 Importar `PrismaGlobalModule` no `app.module.ts`
  - [x] 6.4 Remover `.gitkeep` de `api/src/domains/shared/shell/infra/` após criar arquivos reais

- [x] Task 7 — Validação final (AC: #1, #2, #3, #4)
  - [x] 7.1 `cd api && npm run build` — compilação sem erros
  - [x] 7.2 `cd api && npx prisma migrate status` — migration aplicada
  - [x] 7.3 Verificar que `PrismaService` pode ser injetado (teste manual ou start da API sem erros)

## Dev Notes

### PRISMA v7 — MUDANCAS CRITICAS (NAO IGNORE)

O Prisma v7 tem breaking changes significativas em relacao a versoes anteriores. O dev agent DEVE seguir estas regras:

**Generator:** Usar `prisma-client` (NAO `prisma-client-js` que esta deprecated).

**Output obrigatorio:** O campo `output` no generator e OBRIGATORIO. O client nao e mais gerado em `node_modules` — vai para um diretorio customizado como arquivos TypeScript.

**Driver adapter obrigatorio:** Prisma v7 requer driver adapters explicitos. Para PostgreSQL, usar `@prisma/adapter-pg` + `pg`.

**Import path:** Importar de `../generated/prisma/client` (ou o path relativo ao output configurado), NAO de `@prisma/client`.

**prisma.config.ts:** Arquivo de configuracao obrigatorio na raiz do projeto API. Variaveis de ambiente NAO sao mais carregadas automaticamente — necessario `import "dotenv/config"` explicitamente.

**enableShutdownHooks() REMOVIDO:** NAO usar o padrao antigo. Usar `OnModuleDestroy` com `$disconnect()` no NestJS.

### Schema Prisma — Formato Correto (v7 + Multi-Schema)

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
  schemas      = ["public", "auth", "routing", "boarding", "tracking", "trip"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "auth", "routing", "boarding", "tracking", "trip"]
}

// ─── PUBLIC (Shared / Tenant Root) ───────────────────────────

model Company {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("companies")
  @@schema("public")
}
```

**Multi-Schema:** Schemas PostgreSQL separados por bounded context. Cada entidade futura recebera `@@schema("contexto")` correspondente. Relacoes cross-schema sao explicitas via FK.

**Mapeamento de schemas:**
| Bounded Context | PostgreSQL Schema | Exemplos de entidades futuras |
|---|---|---|
| shared | `public` | Company |
| auth | `auth` | User, RefreshToken |
| routing | `routing` | Route, StudentRoute, DriverRoute |
| boarding | `boarding` | BoardingRecord, AbsenceNotification |
| tracking | `tracking` | (minimo — GPS no Redis) |
| trip | `trip` | Trip, TripStudent |

### prisma.config.ts — Formato Correto

```typescript
import "dotenv/config"
import { defineConfig, env } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
```

### PrismaService — Padrao NestJS v11 + Prisma v7

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../../../../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**ATENCAO ao import path:** O path relativo de `api/src/domains/shared/shell/infra/prisma.service.ts` ate `api/src/generated/prisma/client` sera algo como `../../../../generated/prisma/client`. Calcule o path relativo correto baseado na posicao do arquivo.

### PrismaGlobalModule

```typescript
import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaGlobalModule {}
```

### Pacotes a Instalar

```bash
# Dependencias de producao
npm install @prisma/client @prisma/adapter-pg pg

# Dependencias de desenvolvimento
npm install prisma dotenv @types/pg --save-dev
```

### Variavel de Ambiente

```
DATABASE_URL=postgresql://pureurban:pureurban_dev@localhost:5432/pureurban
```

Valores batem com `docker-compose.yml` na raiz do monorepo:
- User: `pureurban`
- Password: `pureurban_dev`
- Database: `pureurban`
- Host: `localhost`
- Port: `5432`

### Project Structure Notes

**Localizacao do PrismaService:** `api/src/domains/shared/shell/infra/prisma.service.ts` — conforme definido na Architecture. A pasta `infra/` no shared kernel e o lugar correto para infraestrutura transversal.

**Generated client:** `api/src/generated/prisma/` — este diretorio sera criado pelo `prisma generate`. DEVE ser adicionado ao `.gitignore` pois e codigo gerado.

**prisma.config.ts:** Vai na raiz de `api/` (junto ao `package.json`).

**Schema:** `api/prisma/schema.prisma` — padrao Prisma.

**Migrations:** `api/prisma/migrations/` — geradas automaticamente pelo `prisma migrate dev`.

**Estrutura resultante:**
```
api/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── YYYYMMDDHHMMSS_init_company/
│           └── migration.sql
├── prisma.config.ts
├── src/
│   ├── generated/
│   │   └── prisma/          # gerado — adicionar ao .gitignore
│   │       └── client.ts
│   └── domains/
│       └── shared/
│           └── shell/
│               └── infra/
│                   ├── prisma.service.ts
│                   └── prisma-global.module.ts
└── .env
```

**Atualizar `.gitignore`:** Adicionar `src/generated/` ao `.gitignore` do `api/`.

### Naming Conventions

- Models Prisma: `PascalCase` singular (`Company`)
- Colunas: `camelCase` (`createdAt`, `updatedAt`)
- Tabelas mapeadas: `snake_case` plural via `@@map("companies")`
- Enums Prisma: `SCREAMING_SNAKE_CASE`
- Arquivos: `kebab-case` com sufixo de tipo (`prisma.service.ts`, `prisma-global.module.ts`)

[Source: architecture.md#5-padroes-de-implementacao]

### Regras Arquiteturais Obrigatorias

1. Toda entidade DEVE ter `id`, `createdAt`, `updatedAt` e `companyId` (tenant) — EXCECAO: `Company` e a entidade raiz, nao tem `companyId` de si mesma
2. `PrismaService` fica em `shared/shell/infra/` — e infraestrutura compartilhada, nao pertence a nenhum bounded context especifico
3. `@Global()` no module para que todos os bounded contexts possam injetar `PrismaService` sem re-importar
4. Pastas `core/` NAO podem importar Prisma — Prisma e infraestrutura (shell only)
5. Schema Prisma unico (`schema.prisma`) com multi-schema PostgreSQL via `@@schema()` — schemas separados por bounded context (`public`, `auth`, `routing`, `boarding`, `tracking`, `trip`)
6. Toda entidade DEVE ter `@@schema("contexto")` — `Company` e enums compartilhados ficam em `@@schema("public")`

[Source: architecture.md#3-decisoes-arquiteturais]
[Source: architecture.md#7-regras-obrigatorias]

### Anti-Patterns a Evitar

1. **NAO usar `prisma-client-js`** como provider — esta deprecated no Prisma v7. Usar `prisma-client`.
2. **NAO importar de `@prisma/client`** — importar do diretorio de output configurado.
3. **NAO usar `enableShutdownHooks()`** — padrao removido. Usar `OnModuleDestroy`.
4. **NAO instalar dependencias de funcionalidades futuras** — esta story e APENAS Prisma + Company. Effect TS e para story 1.3.
5. **NAO criar use cases ou logica de dominio** — apenas infraestrutura de banco de dados.
6. **NAO criar entidades de dominio alem de Company** — as demais entidades serao criadas nos respectivos epicos.
7. **NAO esquecer de adicionar `src/generated/` ao `.gitignore`** — codigo gerado nao vai para o repositorio.
8. **NAO esquecer o `prisma.config.ts`** — sem ele, o CLI do Prisma v7 nao carrega variaveis de ambiente.
9. **NAO usar `Prisma.validator`** — removido no v7. Usar `satisfies` do TypeScript.

### Previous Story Intelligence

**Story 1.1 (done):**
- NestJS movido de raiz para `api/` — todos os paths sao relativos a `api/`
- Docker Compose ja existe na raiz com PostgreSQL 16 e Redis 7
- Estrutura hexagonal criada com `.gitkeep` em todas as pastas — substituir `.gitkeep` ao criar arquivos reais
- Agent Model: Gemini 2.5 Pro
- Template Expo SDK 55 usa `src/app/` como pasta de rotas
- NestJS v11 usa Vitest (nao Jest), SWC default, ESM por padrao mas API deve usar CJS para Prisma

### Git Intelligence

Commits recentes mostram:
- `870bcf9` — Inicializacao dos projetos (monorepo estruturado)
- `c52f9c1` — Sprint planning e primeira story
- Padrao de commit: `feat:` para features, `chore:` para manutencao

### References

- [Source: architecture.md#3-decisoes-arquiteturais] — Schema Prisma, validacao de dados, cache Redis
- [Source: architecture.md#5-padroes-de-implementacao] — Naming conventions para DB e codigo
- [Source: architecture.md#6-estrutura-do-projeto] — Localizacao de PrismaService e infra
- [Source: architecture.md#7-regras-obrigatorias] — Regras para entidades e separacao core/shell
- [Source: architecture.md#8-sequencia-de-implementacao] — Passo 3: Prisma schema + migrations
- [Source: epics.md#story-1.2] — Acceptance criteria originais
- [Source: prd.md#requisitos-api-backend] — PostgreSQL + Prisma como ORM
- [Source: 1-1-inicializacao-dos-projetos-e-repositorio.md] — Estado atual do repositorio pos-story 1.1
- [Prisma v7 Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Prisma + NestJS Official Guide](https://www.prisma.io/docs/guides/nestjs)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Prisma v7 removeu `url` do datasource block no schema.prisma — URL agora é configurada apenas em `prisma.config.ts`
- Prisma v7 migration não cria schemas PostgreSQL automaticamente para bounded contexts sem modelos — schemas foram adicionados manualmente ao SQL da migration
- `instanceof PrismaClient` causa stack overflow com adapter pattern do Prisma v7 — removido dos testes
- Testes de integração com Prisma requerem `import "dotenv/config"` explícito pois vitest não carrega .env automaticamente

### Completion Notes List

- Prisma v7 configurado com `prisma-client` generator, `moduleFormat = "cjs"`, output customizado em `src/generated/prisma/`
- Schema multi-schema com 6 PostgreSQL schemas: `public`, `auth`, `routing`, `boarding`, `tracking`, `trip`
- Modelo `Company` criado com `id` (UUID), `name`, `createdAt`, `updatedAt`, mapeado para tabela `companies` no schema `public`
- `prisma.config.ts` criado com `dotenv/config` e `defineConfig` usando `env("DATABASE_URL")`
- Migration `init-multi-schema-company` aplicada com criação de schemas e tabela
- `PrismaService` criado em `shared/shell/infra/` com driver adapter `@prisma/adapter-pg`, implementando `OnModuleInit` e `OnModuleDestroy`
- `PrismaGlobalModule` com `@Global()` exportando `PrismaService` para todos os bounded contexts
- Testes unitários e de integração para PrismaService (4 testes) e PrismaGlobalModule (2 testes)
- Build, migration status e startup da API verificados com sucesso
- Todos os 7 testes passam sem regressões

### File List

- `api/prisma/schema.prisma` — Schema Prisma com generator, datasource multi-schema e modelo Company (novo)
- `api/prisma.config.ts` — Configuração Prisma v7 com dotenv e defineConfig (modificado pelo prisma init, depois editado)
- `api/prisma/migrations/20260331003724_init_multi_schema_company/migration.sql` — Migration SQL com criação de schemas e tabela companies (novo)
- `api/src/domains/shared/shell/infra/prisma.service.ts` — PrismaService NestJS com driver adapter (novo)
- `api/src/domains/shared/shell/infra/prisma-global.module.ts` — PrismaGlobalModule @Global (novo)
- `api/src/domains/shared/shell/infra/prisma.service.spec.ts` — Testes do PrismaService (novo)
- `api/src/domains/shared/shell/infra/prisma-global.module.spec.ts` — Testes do PrismaGlobalModule (novo)
- `api/src/app.module.ts` — Importação do PrismaGlobalModule (modificado)
- `api/.env` — DATABASE_URL configurada (modificado)
- `api/.gitignore` — Adicionado pelo prisma init com src/generated/prisma e .env (novo)
- `api/package.json` — Dependências do Prisma adicionadas (modificado)
- `api/package-lock.json` — Lock file atualizado (modificado)
- `api/src/domains/shared/shell/infra/.gitkeep` — Removido (deletado)

### Change Log

- 2026-03-30: Implementação completa da Story 1.2 — Schema Prisma v7 com multi-schema, migration, PrismaService e PrismaGlobalModule
