# Story 2.3: Cadastro e Gestão de Motoristas

Status: done
<!-- Review: 2026-05-03 — 16 patches aplicados, 3 deferidos, 7 descartados. Aprovado. -->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como administrador da empresa,
Quero cadastrar e gerenciar (listar, editar, desativar) motoristas vinculados à minha organização,
Para que apenas motoristas autorizados possam autenticar-se e operar rotas de transporte.

## Acceptance Criteria

1. **Given** admin autenticado (JWT válido com `role = ADMIN`)
   **When** envio `POST /api/v1/drivers` com `{ name, email, password }`
   **Then** o motorista é criado com `role = DRIVER`, `companyId` derivado do JWT do admin (multi-tenancy automático), `isActive = true`
   **And** a senha é armazenada com hash bcrypt (nunca plaintext)
   **And** a resposta retorna `{ data: { id, name, email, role, isActive, createdAt, updatedAt }, meta: { timestamp } }` (SEM o campo `password`)
   **And** status HTTP 201 Created

2. **Given** admin autenticado
   **When** envio `POST /api/v1/drivers` com email já existente em qualquer empresa
   **Then** retorna 409 com `{ error: { code: "EMAIL_ALREADY_EXISTS", message: "..." } }` (reutilizar `EmailAlreadyExistsError` existente)

3. **Given** admin autenticado
   **When** envio `POST /api/v1/drivers` com dados inválidos (email mal-formatado, senha < 8 chars, name < 2 chars)
   **Then** retorna 400 com `{ error: { code: "VALIDATION_ERROR", message, details: { issues: [...] } } }`

4. **Given** admin autenticado
   **When** envio `GET /api/v1/drivers`
   **Then** retorno lista contendo APENAS usuários da MINHA empresa com `role = DRIVER`, sem o campo `password`
   **And** motoristas de outras empresas nunca aparecem na lista (TenantGuard + filtro `companyId`)
   **And** suporta query params `?isActive=true|false` para filtrar por status (default: retorna ativos e inativos)
   **And** ordem por `createdAt DESC`

5. **Given** admin autenticado e motorista existente da mesma empresa
   **When** envio `GET /api/v1/drivers/:id`
   **Then** retorno o motorista (sem `password`)
   **And** se `:id` não existe OU pertence a outra empresa OU é um usuário de role diferente de `DRIVER` → 404 com `{ error: { code: "DRIVER_NOT_FOUND", ... } }` (mensagem genérica, não vaza existência cross-tenant)

6. **Given** admin autenticado
   **When** envio `PATCH /api/v1/drivers/:id` com qualquer subconjunto de `{ name?, email?, password?, isActive? }`
   **Then** apenas os campos enviados são atualizados (validação por Effect Schema)
   **And** se `password` está presente, é re-hasheada antes de persistir
   **And** se `email` está presente e já pertence a outro usuário → 409 `EMAIL_ALREADY_EXISTS`
   **And** se motorista não pertence à empresa → 404 `DRIVER_NOT_FOUND`
   **And** retorno o motorista atualizado (sem `password`)
   **And** body vazio retorna 400 `VALIDATION_ERROR`

7. **Given** admin autenticado e motorista ativo da mesma empresa
   **When** envio `DELETE /api/v1/drivers/:id`
   **Then** o motorista é desativado (soft delete: `isActive = false`) — registro NUNCA é fisicamente removido
   **And** status HTTP 204 No Content (sem body)
   **And** desativar motorista já inativo é idempotente (também retorna 204)
   **And** motorista de outra empresa retorna 404 (sem revelar existência)

8. **Given** motorista desativado (`isActive = false`)
   **When** o motorista tenta `POST /api/v1/auth/login` com suas credenciais
   **Then** retorna 401 `INVALID_CREDENTIALS` (mesma mensagem do email inexistente — anti-enumeração)
   **And** o use-case `login` valida `isActive` e nega autenticação para usuários desativados

9. **Given** usuário autenticado com role `DRIVER` ou `STUDENT`
   **When** chama qualquer endpoint `/api/v1/drivers/*`
   **Then** retorna 403 `FORBIDDEN` (RolesGuard rejeita)

10. **Given** requisição sem JWT ou com JWT inválido
    **When** chama qualquer endpoint `/api/v1/drivers/*`
    **Then** retorna 401 `Unauthorized` (JwtAuthGuard rejeita antes do RolesGuard)

11. **Given** o domain event para o ciclo de vida do motorista
    **When** um motorista é criado, atualizado ou desativado
    **Then** `auth.driver_created`, `auth.driver_updated`, `auth.driver_deactivated` são emitidos via `WithEvents` (sem consumidores nesta story — preparação para Epic 4/5)

## Tasks / Subtasks

- [x] Task 1 — Schema Prisma: adicionar `isActive` ao User + migration (AC: #1, #4, #6, #7, #8)
  - [x] 1.1 Editar `api/prisma/schema.prisma` — adicionar `isActive Boolean @default(true)` ao model `User`
  - [x] 1.2 Adicionar `@@index([companyId, role, isActive])` ao model `User` para listagem performática
  - [x] 1.3 Rodar `npx prisma migrate dev --name add_user_is_active` na pasta `api/`
  - [x] 1.4 Confirmar `npx prisma generate` reflete o novo campo em `api/src/generated/prisma/`

- [x] Task 2 — Functional Core: schemas de input (AC: #1, #3, #6)
  - [x] 2.1 Criar `api/src/domains/auth/core/schemas/create-driver.schema.ts` — `Schema.Struct({ name, email, password })` (mesmas regras do `RegisterInput`: email regex, password minLength 8, name minLength 2)
  - [x] 2.2 Criar `api/src/domains/auth/core/schemas/update-driver.schema.ts` — todos os campos opcionais (`name?`, `email?`, `password?`, `isActive?`); usar `Schema.partial()` ou `Schema.optional()` por campo
  - [x] 2.3 Adicionar refinement: schema de update DEVE rejeitar body vazio (use `Schema.filter` exigindo ≥1 campo presente; senão `EffectSchemaPipe` aceitaria `{}` e a operação não faria nada)

- [x] Task 3 — Functional Core: novo erro `DriverNotFound` (AC: #5, #6, #7)
  - [x] 3.1 Adicionar `DriverNotFoundError` em `api/src/domains/auth/core/errors/auth.errors.ts` (httpStatus 404, code `DRIVER_NOT_FOUND`, mensagem genérica "Motorista não encontrado")
  - [x] 3.2 NÃO criar erro novo para email duplicado — REUTILIZAR `EmailAlreadyExistsError`

- [ ] Task 4 — Functional Core: expandir `UserRepository` port (AC: #4–#7)
  - [ ] 4.1 Em `api/src/domains/auth/core/ports/user-repository.port.ts`, expandir a interface com:
    - `findManyByCompanyAndRole(companyId, role, filter?: { isActive?: boolean }) => Effect<UserData[], never>`
    - `findByIdAndCompanyAndRole(id, companyId, role) => Effect<UserData | null, never>`
    - `updatePartial(id, companyId, data: Partial<{ email, password, name, isActive }>) => Effect<UserData, never>`
  - [ ] 4.2 Atualizar `UserData` interface para incluir `isActive: boolean`
  - [ ] 4.3 Adicionar `createDriver(data: CreateDriverData) => Effect<UserData, never>` (DIFERENTE de `create()` — não cria Company; recebe `companyId` direto)
    - `CreateDriverData = { email, password, name, companyId }` — role implícito `DRIVER`

- [x] Task 5 — Functional Core: use-cases (AC: #1, #4, #5, #6, #7, #11)
  - [x] 5.1 Criar `api/src/domains/auth/core/use-cases/create-driver.use-case.ts` — verifica email duplicado (qualquer empresa) → fail `EmailAlreadyExistsError`; hash senha; chama `createDriver()`; retorna `withEvents(user, [{ type: 'auth.driver_created', data: { driverId, companyId }, occurredAt }])`
  - [x] 5.2 Criar `api/src/domains/auth/core/use-cases/list-drivers.use-case.ts` — recebe `{ companyId, isActive? }`; chama `findManyByCompanyAndRole(companyId, 'DRIVER', { isActive })`; retorna `noEvents(users)`
  - [x] 5.3 Criar `api/src/domains/auth/core/use-cases/get-driver.use-case.ts` — recebe `{ id, companyId }`; chama `findByIdAndCompanyAndRole(id, companyId, 'DRIVER')`; se null → fail `DriverNotFoundError`; retorna `noEvents(user)`
  - [x] 5.4 Criar `api/src/domains/auth/core/use-cases/update-driver.use-case.ts` — busca driver (mesmo padrão de get); se `data.email` mudou, valida `findByEmail` para evitar duplicidade (skip se for o próprio driver); se `data.password` presente, hasheia; chama `updatePartial`; emite `auth.driver_updated`
  - [x] 5.5 Criar `api/src/domains/auth/core/use-cases/deactivate-driver.use-case.ts` — busca driver; chama `updatePartial(id, companyId, { isActive: false })`; emite `auth.driver_deactivated`. Idempotente (se já inativo, ainda retorna sucesso e NÃO emite evento duplicado — usar guard `if (driver.isActive)`)

- [x] Task 6 — Functional Core: ajustar `login.use-case.ts` para rejeitar inativos (AC: #8)
  - [x] 6.1 Após validar password com sucesso, verificar `if (!user.isActive)` → fail `InvalidCredentialsError.create()` (MESMA mensagem do email errado — anti-enumeração)
  - [x] 6.2 Atualizar `login.use-case.spec.ts` adicionando cenário "deve falhar com InvalidCredentials quando user.isActive === false"
  - [x] 6.3 Atualizar `refresh-token.use-case.ts` similarmente: após `findById`, validar `isActive` → fail `InvalidRefreshTokenError`

- [x] Task 7 — Imperative Shell: adapter Prisma (AC: #1, #4–#7)
  - [x] 7.1 Em `api/src/domains/auth/shell/adapters/prisma-user.adapter.ts`, implementar os novos métodos do `UserRepository`
  - [x] 7.2 `findManyByCompanyAndRole`: `prisma.user.findMany({ where: { companyId, role, ...(filter?.isActive !== undefined && { isActive: filter.isActive }) }, orderBy: { createdAt: 'desc' } })`
  - [x] 7.3 `findByIdAndCompanyAndRole`: `prisma.user.findFirst({ where: { id, companyId, role } })` — `findFirst` (não `findUnique`) para combinar 3 filtros
  - [x] 7.4 `updatePartial`: usar `prisma.user.update({ where: { id }, data: { ...(email && { email }), ...(password && { password }), ... } })` — primeiro fazer `findFirst({ where: { id, companyId } })` para garantir tenant antes do update (Prisma `update` por id não filtra tenant nativamente)
  - [x] 7.5 `createDriver`: `prisma.user.create({ data: { email, password, name, role: 'DRIVER', companyId, isActive: true } })`
  - [x] 7.6 Atualizar mapeamento `UserData` em todos os métodos para incluir `isActive`

- [ ] Task 9 — Imperative Shell: controller (AC: #1, #4–#10)
  - [ ] 9.1 Criar `api/src/domains/auth/shell/http/driver.controller.ts` em `/api/v1/drivers`
  - [ ] 9.2 Decorar com `@ApiTags('drivers')`, `@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)`, `@Roles(['ADMIN'])` no nível do controller (aplica a todos os endpoints)
  - [ ] 9.3 `POST /` → recebe `@Body(new EffectSchemaPipe(CreateDriverInput)) dto`, `@TenantId() tenantId`; chama `driverService.create(dto, tenantId)`; retorna 201
  - [ ] 9.4 `GET /` → recebe `@Query('isActive') isActiveStr?`, `@TenantId() tenantId`; converte string→boolean (apenas `'true'`/`'false'`, demais ignorados); chama `driverService.list(tenantId, isActive?)`
  - [ ] 9.5 `GET /:id` → recebe `@Param('id') id`, `@TenantId() tenantId`; chama `driverService.getById(id, tenantId)`
  - [ ] 9.6 `PATCH /:id` → recebe `@Body(new EffectSchemaPipe(UpdateDriverInput)) dto`, `@Param('id') id`, `@TenantId() tenantId`; chama `driverService.update(id, dto, tenantId)`
  - [ ] 9.7 `DELETE /:id` → `@HttpCode(204)`, recebe `@Param('id') id`, `@TenantId() tenantId`; chama `driverService.deactivate(id, tenantId)`; retorna void
  - [ ] 9.8 Decorar TODOS os endpoints com Swagger: `@ApiOperation`, `@ApiResponse({ status: 200|201|204 })`, `@ApiResponse({ status: 401 })`, `@ApiResponse({ status: 403 })`, `@ApiResponse({ status: 404 })` (onde aplicável), `@ApiResponse({ status: 409 })` (onde aplicável)
  - [ ] 9.9 Adicionar `@ApiBearerAuth()` no controller (Swagger documenta auth requerida)

  - [ ] 10.4 `update-driver.use-case.spec.ts` — 5 cenários: sucesso parcial (só name), update com password (verifica hash), email mudado para email já em uso → fail `EmailAlreadyExistsError`, email mudado para o mesmo email do próprio driver (NÃO fail), driver não encontrado → fail `DriverNotFoundError`
  - [ ] 10.5 `deactivate-driver.use-case.spec.ts` — 3 cenários: ativo→inativo (com evento `auth.driver_deactivated`), já inativo (idempotente, SEM evento), driver não encontrado → fail
  - [ ] 10.6 `login.use-case.spec.ts` — adicionar cenário: user inativo → fail `InvalidCredentialsError` (mesma mensagem)
  - [ ] 10.7 `refresh-token.use-case.spec.ts` — adicionar cenário: user inativo → fail `InvalidRefreshTokenError`

- [ ] Task 11 — Testes do adapter (AC: #4, #6, #7)
  - [ ] 11.1 Atualizar `prisma-user.adapter.spec.ts` — testar `findManyByCompanyAndRole` (filtra por role + companyId + isActive opcional), `findByIdAndCompanyAndRole` (3 filtros combinados, retorna null para tenant errado), `updatePartial` (rejeita atualização cross-tenant via pré-check), `createDriver` (`role: 'DRIVER'`, `isActive: true`)
  - [ ] 11.2 Usar Prisma REAL (banco de teste) — NUNCA mockar Prisma (ver project-context.md)

- [ ] Task 12 — Teste E2E mínimo (AC: #1, #4, #5, #6, #7, #9, #10)
  - [ ] 12.1 Criar `api/test/driver.e2e-spec.ts` (pasta `test/`, padrão NestJS) ou estender `tests/api/` (Playwright API)
  - [ ] 12.2 Cenários e2e: admin cria driver → 201; admin de outra empresa NÃO vê o driver criado → 200 com lista vazia; driver tenta acessar `/api/v1/drivers` → 403; sem token → 401; admin atualiza driver → 200; admin desativa driver → 204 + driver não consegue mais logar
  - [ ] 12.3 Reusar `tests/support/` (factories, auth helpers) se existirem

- [ ] Task 13 — Validação final (AC: todos)
  - [ ] 13.1 `cd api && npm run build` — sem erros TS
  - [ ] 13.2 `cd api && npm run lint` — sem warnings novos
  - [ ] 13.3 `cd api && npm test` — todos os testes passam (existentes + novos)
  - [ ] 13.4 `cd api && npm run test:e2e` — e2e passa
  - [ ] 13.5 Iniciar API (`npm run start:dev`) e validar manualmente via Swagger UI (`http://localhost:3000/api`) os 5 endpoints
  - [ ] 13.6 Testar manualmente o fluxo: registrar empresa → login admin → criar driver → login do driver → desativar driver → tentar login do driver (deve falhar 401)

## Dev Notes

### Onde colocar o código (decisão arquitetural)

**Drivers/Students/Admins são todos `User`** — entidade que vive em `auth` schema (Prisma) e no bounded context `auth/` (DDD). NÃO criar bounded context novo. Entretanto, para preservar **separação de responsabilidades** dentro do mesmo domínio:

- Use-cases de gestão de motoristas → `domains/auth/core/use-cases/*-driver.use-case.ts`
- Service NestJS separado → `domains/auth/shell/driver.service.ts` (não misturar com `AuthService` que faz login/register/refresh)
- Module separado → `domains/auth/shell/driver.module.ts`
- Controller separado → `domains/auth/shell/http/driver.controller.ts` em `/api/v1/drivers`

A justificativa é: `AuthService` lida com sessão/credenciais (público); `DriverService` lida com administração de usuários (admin-only). Endpoints distintos, decorators de guard distintos, runtime distinto possível.

### Schema Prisma — Adicionar `isActive`

```prisma
model User {
  id        String   @id @default(uuid())
  email     String
  password  String
  name      String
  role      Role     @default(ADMIN)
  isActive  Boolean  @default(true)        // [NEW]
  companyId String
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([email])
  @@index([companyId, role, isActive])      // [NEW] — listagem performática
  @@map("users")
  @@schema("auth")
}
```

**Migration esperada (gerada automaticamente):**
```sql
ALTER TABLE "auth"."users" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "users_companyId_role_isActive_idx" ON "auth"."users"("companyId", "role", "isActive");
```

**ATENÇÃO:** o seed em `api/prisma/seed.ts` (pré-existente) pode precisar ser ajustado se cria `User` sem campo `isActive` — Prisma tratará via default, mas teste o seed após a migration.

### Use-Case `createDriver` — Functional Core

```typescript
// domains/auth/core/use-cases/create-driver.use-case.ts
import { Effect } from 'effect'
import { withEvents } from '../../../shared/core/events/with-events.js'
import { UserRepository } from '../ports/user-repository.port.js'
import { PasswordHasher } from '../ports/password-hasher.port.js'
import { EmailAlreadyExistsError } from '../errors/auth.errors.js'
import type { CreateDriverInput } from '../schemas/create-driver.schema.js'

export const createDriver = (input: CreateDriverInput, companyId: string) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const hasher = yield* PasswordHasher

    const existing = yield* userRepo.findByEmail(input.email.toLowerCase().trim())
    if (existing) {
      return yield* Effect.fail(EmailAlreadyExistsError.create(input.email))
    }

    const hashedPassword = yield* hasher.hash(input.password)

    const user = yield* userRepo.createDriver({
      email: input.email.toLowerCase().trim(),
      password: hashedPassword,
      name: input.name,
      companyId,
    })

    return withEvents(user, [
      {
        type: 'auth.driver_created',
        data: { driverId: user.id, companyId },
        occurredAt: new Date().toISOString(),
      },
    ])
  })
```

### Use-Case `deactivateDriver` — Idempotência sem evento duplicado

```typescript
export const deactivateDriver = (input: { id: string; companyId: string }) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository

    const driver = yield* userRepo.findByIdAndCompanyAndRole(input.id, input.companyId, 'DRIVER')
    if (!driver) {
      return yield* Effect.fail(DriverNotFoundError.create(input.id))
    }

    if (!driver.isActive) {
      // Idempotente — não emite evento, retorna o estado atual
      return noEvents(driver)
    }

    const updated = yield* userRepo.updatePartial(input.id, input.companyId, { isActive: false })

    return withEvents(updated, [
      {
        type: 'auth.driver_deactivated',
        data: { driverId: updated.id, companyId: input.companyId },
        occurredAt: new Date().toISOString(),
      },
    ])
  })
```

### Update — Validação de email cross-driver

Ao atualizar email, NÃO falhe se o email pertence ao próprio driver. Pseudocódigo:

```typescript
if (input.email && input.email !== driver.email) {
  const conflict = yield* userRepo.findByEmail(input.email)
  if (conflict && conflict.id !== input.id) {
    return yield* Effect.fail(EmailAlreadyExistsError.create(input.email))
  }
}
```

### Schema Effect — `UpdateDriverInput` com refinement

```typescript
// domains/auth/core/schemas/update-driver.schema.ts
import { Schema } from '@effect/schema'

export const UpdateDriverInput = Schema.Struct({
  name: Schema.optional(Schema.String.pipe(Schema.minLength(2))),
  email: Schema.optional(Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))),
  password: Schema.optional(Schema.String.pipe(Schema.minLength(8))),
  isActive: Schema.optional(Schema.Boolean),
}).pipe(
  Schema.filter(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.password !== undefined ||
      data.isActive !== undefined,
    { message: () => 'Pelo menos um campo deve ser fornecido para atualização' },
  ),
)

export type UpdateDriverInput = typeof UpdateDriverInput.Type
```

### Controller — Estrutura completa

```typescript
@ApiTags('drivers')
@ApiBearerAuth()
@Controller('api/v1/drivers')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(['ADMIN'])
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastrar motorista' })
  @ApiResponse({ status: 201, description: 'Motorista criado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (VALIDATION_ERROR)' })
  @ApiResponse({ status: 401 }) @ApiResponse({ status: 403 })
  @ApiResponse({ status: 409, description: 'Email já cadastrado' })
  async create(
    @Body(new EffectSchemaPipe(CreateDriverInput)) dto: CreateDriverInput,
    @TenantId() tenantId: string,
  ) {
    return this.driverService.create(dto, tenantId)
  }

  @Get()
  @ApiOperation({ summary: 'Listar motoristas da empresa' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiResponse({ status: 200 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 403 })
  async list(@TenantId() tenantId: string, @Query('isActive') isActiveStr?: string) {
    const isActive = isActiveStr === 'true' ? true : isActiveStr === 'false' ? false : undefined
    return this.driverService.list(tenantId, isActive)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar motorista' })
  @ApiResponse({ status: 200 }) @ApiResponse({ status: 404, description: 'DRIVER_NOT_FOUND' })
  async getById(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.driverService.getById(id, tenantId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar motorista' })
  @ApiResponse({ status: 200 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 409 })
  async update(
    @Param('id') id: string,
    @Body(new EffectSchemaPipe(UpdateDriverInput)) dto: UpdateDriverInput,
    @TenantId() tenantId: string,
  ) {
    return this.driverService.update(id, dto, tenantId)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Desativar motorista (soft delete)' })
  @ApiResponse({ status: 204, description: 'Motorista desativado' })
  @ApiResponse({ status: 404 })
  async deactivate(@Param('id') id: string, @TenantId() tenantId: string) {
    await this.driverService.deactivate(id, tenantId)
  }
}
```

**OBSERVAÇÃO sobre `@Roles(['ADMIN'])`:** verifique no `JwtStrategy.validate()` (linha 17–22) que o `role` retornado vem em UPPERCASE (vem do enum Prisma `Role.ADMIN`). O `RolesGuard` faz comparação estrita de string — `['admin']` (lowercase) NÃO funciona; usar `['ADMIN']`. Compare com o `TripController` que usa `@Roles(['driver'])` — esse provavelmente está bugado ou depende de mapping. Esclarecer este ponto durante a implementação e padronizar para UPPERCASE (o JwtStrategy retorna o valor original do enum).

### Pré-check de tenant antes de update Prisma

Prisma `update({ where: { id } })` NÃO suporta filtros adicionais como `companyId`. Para garantir multi-tenancy:

```typescript
// 1. Verificar pertencimento
const existing = await this.prisma.user.findFirst({
  where: { id, companyId, role: 'DRIVER' },
})
if (!existing) { return Effect.fail(...) }  // ou retornar null para o use-case decidir

// 2. Atualizar
return this.prisma.user.update({ where: { id }, data: {...} })
```

Alternativa: usar `prisma.user.updateMany({ where: { id, companyId } })` que retorna `{ count }` — se `count === 0`, registro não pertence ao tenant. Trade-off: `updateMany` não retorna o registro atualizado, exigiria `findFirst` adicional. Preferir o pattern `findFirst` → `update` (1 round-trip extra, mas semântica clara).

### Por que listagem retorna ativos E inativos por default

Admin precisa ver motoristas desativados para reativá-los (PATCH com `isActive: true`). Filtro opcional via query.

### Migração da Story 2.2 — Validação `isActive` no login

A Story 2.2 (login) **NÃO valida `isActive`** porque o campo não existia. Esta story DEVE adicionar a validação. **Sem isso, AC #8 falha** — driver desativado conseguiria logar mesmo desativado.

### Reutilização de `EmailAlreadyExistsError`

Já existe em `auth.errors.ts:3` com `httpStatus: 409`. NÃO criar erro duplicado. Use o mesmo nas operações de create e update.

### `UserData` interface — adicionar `isActive`

Em `user-repository.port.ts`, adicionar:
```typescript
export interface UserData {
  id: string
  email: string
  password: string
  name: string
  role: string
  isActive: boolean       // [NEW]
  companyId: string
  createdAt: Date
  updatedAt: Date
}
```

Isso quebra os testes existentes que mockam `UserData` (login.use-case.spec.ts, register-company.use-case.spec.ts, refresh-token.use-case.spec.ts). **Atualize todos os mocks adicionando `isActive: true`** (caso contrário TypeScript falhará em strict mode).

### Resposta — Stripping de `password`

Helper privado no service:
```typescript
private stripPassword(user: UserData) {
  const { password: _, ...safe } = user
  return safe
}
```

NÃO confiar no interceptor global para remover password — o `ResponseWrapperInterceptor` apenas envelopa em `{ data, meta }`, não filtra campos.

### Project Structure Notes

**Arquivos novos:**
```
api/src/domains/auth/
  core/
    schemas/create-driver.schema.ts                 # [NEW]
    schemas/update-driver.schema.ts                 # [NEW]
    use-cases/create-driver.use-case.ts             # [NEW]
    use-cases/create-driver.use-case.spec.ts        # [NEW]
    use-cases/list-drivers.use-case.ts              # [NEW]
    use-cases/list-drivers.use-case.spec.ts         # [NEW]
    use-cases/get-driver.use-case.ts                # [NEW]
    use-cases/get-driver.use-case.spec.ts           # [NEW]
    use-cases/update-driver.use-case.ts             # [NEW]
    use-cases/update-driver.use-case.spec.ts        # [NEW]
    use-cases/deactivate-driver.use-case.ts         # [NEW]
    use-cases/deactivate-driver.use-case.spec.ts    # [NEW]
  shell/
    driver.service.ts                                # [NEW]
    driver.module.ts                                 # [NEW]
    http/driver.controller.ts                        # [NEW]

api/test/driver.e2e-spec.ts                          # [NEW] (ou tests/api/drivers.spec.ts)
api/prisma/migrations/{TIMESTAMP}_add_user_is_active/ # [NEW] (gerada automaticamente)
```

**Arquivos modificados:**
```
api/prisma/schema.prisma                            # +isActive +index composto
api/src/domains/auth/core/errors/auth.errors.ts     # +DriverNotFoundError
api/src/domains/auth/core/ports/user-repository.port.ts  # expand UserData + métodos
api/src/domains/auth/core/use-cases/login.use-case.ts    # validação isActive
api/src/domains/auth/core/use-cases/login.use-case.spec.ts # +cenário isActive
api/src/domains/auth/core/use-cases/refresh-token.use-case.ts # validação isActive
api/src/domains/auth/core/use-cases/refresh-token.use-case.spec.ts # +cenário isActive
api/src/domains/auth/core/use-cases/register-company.use-case.spec.ts # mock UserData isActive
api/src/domains/auth/shell/adapters/prisma-user.adapter.ts # +novos métodos
api/src/domains/auth/shell/adapters/prisma-user.adapter.spec.ts # +testes
api/src/app.module.ts                               # +DriverModule
_bmad-output/implementation-artifacts/sprint-status.yaml # status → done
```

### Imports — Extensão `.js` Obrigatória

`tsconfig.json` da API usa `module: "nodenext"` — TODO import relativo deve incluir `.js`:
```typescript
// ✅ CORRETO
import { createDriver } from '../core/use-cases/create-driver.use-case.js'
// ❌ ERRADO
import { createDriver } from '../core/use-cases/create-driver.use-case'
```

### Anti-Patterns a Evitar

1. **NÃO importar `@nestjs/*` em `core/`** — pureza funcional obrigatória (project-context.md)
2. **NÃO retornar `password`** em nenhuma resposta — usar `stripPassword()` no service
3. **NÃO usar `prisma.user.update({ where: { id } })` sem pré-check de companyId** — quebra multi-tenancy
4. **NÃO usar `class-validator`** nas DTOs do controller — usar Effect Schema via `EffectSchemaPipe` (Story 2.2 estabeleceu padrão)
5. **NÃO duplicar `EmailAlreadyExistsError`** — reutilizar de `auth.errors.ts`
6. **NÃO fazer hard-delete** — soft delete via `isActive = false`
7. **NÃO usar `throw`** no core — usar `Effect.fail()` com tagged errors
8. **NÃO esquecer extensão `.js`** nos imports relativos
9. **NÃO usar `@Roles(['driver'])` (lowercase)** — JwtStrategy preserva casing original do enum (UPPERCASE). Use `@Roles(['ADMIN'])`
10. **NÃO emitir `auth.driver_deactivated` para um driver já inativo** — quebraria idempotência semântica
11. **NÃO permitir cross-tenant via `findUnique({ where: { id } })`** — sempre combinar `id + companyId` em `findFirst`
12. **NÃO criar bounded context novo** — drivers são `User`, ficam em `domains/auth/`
13. **NÃO permitir admin desativar a si mesmo via este endpoint** (drivers ≠ admins; o controller já filtra `role: DRIVER`, mas validar) — admin auto-desativação seria outra story; esta API só toca em DRIVERs

### Previous Story Intelligence

**Story 2.2 (done) — Padrões a seguir:**
- Domain-scoped runtime via `useFactory` no module (`AUTH_RUNTIME` foi criado para auth; criar `DRIVER_RUNTIME` análogo)
- Service usa `eventDispatcher.runAndDispatch(this.runtime, useCase(input))`
- Service formata resposta — NÃO retornar tipos do core diretamente
- `EffectSchemaPipe` para validação de body
- `EffectExceptionFilter` global converte tagged errors → HTTP — basta definir `httpStatus` no erro
- `ResponseWrapperInterceptor` global envelopa em `{ data, meta }` — NÃO wrapar manualmente
- 9 testes de auth foram adicionados na 2.2 (total 82) — esta story deve adicionar ~20+ novos testes sem quebrar os existentes
- `login.use-case.ts` já tem proteção anti-enumeração via `dummy hash` — preservar ao adicionar verificação de `isActive`

**Story 2.1 (done) — Padrões reutilizados:**
- `RegisterInput` schema usa mesma regex de email e `minLength(8)` para senha — copiar para `CreateDriverInput`
- `BcryptPasswordHasherAdapter` com `SALT_ROUNDS = 12` — reutilizar
- `PrismaUserAdapter.create` cria Company + User em transação — diferente de `createDriver` (que NÃO cria Company)
- `EmailAlreadyExistsError` httpStatus 409 — reutilizar

**Story 3.1 (ready-for-dev) — Padrões adotados:**
- `TripController` usa `@UseGuards(TenantGuard, RolesGuard)` em nível de controller — replicar
- `@TenantId()` decorator extrai `companyId` do request (preenchido pelo TenantGuard)
- TripModule importa `SharedKernelModule` para reutilizar guards — replicar
- `EffectEventDispatcher` declarado nos providers do module
- TripController tem comentário "TODO: habilitar JwtAuthGuard quando Epic 2 (Auth) estiver pronto" — Story 2.3 PRECISA do `JwtAuthGuard` ativo (não há TODO neste caso)

### Git Intelligence

Últimos 5 commits relevantes:
- `511a464` Merge PR #1 from 2.2 — Story 2.2 mergeada em main
- `86c1f65` feat(auth): complete authentication, login, and refresh token (2.2)
- `36c7409` feat(trip): implement story 3-1 iniciar e encerrar viagem
- `f3939b8` feat(auth): auth domain bounded context - story 2.1 (cadastro de empresa e seed inicial)
- `f302a26` feat(mobile): patch story 1-5 — fix race condition...

Repositório está em estado limpo no branch `main`. Sem trabalho pendente local. Story 2.2 acabou de ser mergeada — código de auth está estável e pronto para extensão.

### Latest Tech Information

- **Prisma 7.6.0**: usar `prisma.user.findFirst()` (não `findUnique`) quando combinar múltiplos filtros não-únicos como `id + companyId + role`. `findUnique` aceita apenas chaves únicas declaradas no schema.
- **Effect TS**: `Schema.optional()` produz tipos `T | undefined` no decode. Para refinement de "pelo menos um campo presente", usar `.pipe(Schema.filter(...))` no `Schema.Struct`.
- **NestJS 11**: `@HttpCode(204)` força status sem body. `@Delete()` por padrão retorna 200 — explicitar 204 para semântica correta de soft-delete.
- **bcrypt**: hash de senha NUNCA deve ser feito no controller — sempre no use-case (functional core orquestra; adapter executa). `SALT_ROUNDS = 12` já estabelecido em 2.1.

### Dependências

Nenhuma dependência nova. Todos os pacotes já instalados:
- `@nestjs/swagger`, `@effect/schema`, `bcrypt`, `@nestjs/jwt`, `@nestjs/passport` (Story 2.1/2.2)
- `class-validator`, `class-transformer` instalados (Story 3.1) — NÃO usar nesta story
- `vitest`, `@faker-js/faker` para testes (instalados)

### Mobile

**Esta story NÃO inclui mobile.** O cadastro de motoristas é feito via API por admin (que pode usar Swagger UI, Postman ou um futuro painel web — fora do escopo do MVP mobile-first). O Epic 2 nota explicitamente "Admin — Fase 2" para telas administrativas (architecture.md §7, mapeamento `routing/`). Confirmar se o motorista consegue **logar** (Story 2.2) após criação por esta story — esse é o critério de aceitação cross-story.

### References

- [Source: epics.md#Story-2.3] — Acceptance criteria originais
- [Source: architecture.md#3-decisoes-arquiteturais] — RBAC com 3 roles, multi-tenancy obrigatória
- [Source: architecture.md#6-padroes-de-implementacao] — Naming, formatos `{ data, meta }` / `{ error: { code, message } }`, naming kebab-case com sufixos
- [Source: architecture.md#7-estrutura-do-projeto] — `auth/` structure, regra core/shell
- [Source: architecture.md#8-regras-obrigatorias] — 10 regras críticas (Swagger, TenantGuard, RBAC, multi-tenancy, schema, naming, pureza)
- [Source: project-context.md#Critical-Implementation-Rules] — Imports `.js`, no class-validator no core, multi-schema enforcement
- [Source: prisma/schema.prisma] — User model atual (sem isActive)
- [Source: 2-2-autenticacao-login-e-refresh-token.md] — Padrão domain-scoped runtime, anti-enumeração no login, EffectSchemaPipe
- [Source: 2-1-cadastro-de-empresa-e-seed-inicial.md] — Padrões auth, RegisterInput schema, EmailAlreadyExistsError
- [Source: trip/shell/trip.module.ts] — Padrão domain-scoped runtime (espelhar em DriverModule)
- [Source: trip/shell/http/trip.controller.ts] — Padrão controller com guards, decorators, Swagger
- [Source: shared/shell/decorators/tenant-id.decorator.ts] — `@TenantId()` decorator
- [Source: shared/shell/guards/tenant.guard.ts] — TenantGuard popula `request.tenantId` a partir do JWT
- [Source: shared/shell/guards/roles.guard.ts] — RolesGuard compara role como string estrita

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

---

## Review Findings

> Revisão adversarial em 3 camadas — 2026-05-03. 16 patches, 3 deferidos, 7 descartados.

### Patches — HIGH

- [x] [Review][Patch] Controller path errado: `@Controller('drivers')` deve ser `'api/v1/drivers'` [driver.controller.ts:10] ✅ Fixed
- [x] [Review][Patch] `TenantGuard` ausente do `@UseGuards` — multi-tenancy não garantida no nível do guard [driver.controller.ts:11] ✅ Fixed
- [x] [Review][Patch] `@HttpCode(201)` faltando no endpoint `POST /` — NestJS retorna 200 por padrão [driver.controller.ts:14] ✅ Fixed
- [x] [Review][Patch] `@Request() req.user.companyId` deve ser substituído por `@TenantId()` em todos os 5 handlers [driver.controller.ts] ✅ Fixed
- [x] [Review][Patch] Raw `throw new Error(...)` em `updatePartial` torna-se defect não tipado no Effect — substituído por `throw DriverNotFoundError.create(id)` em transação [prisma-user.adapter.ts:updatePartial] ✅ Fixed
- [x] [Review][Patch] `updatePartial` não é atômico: `findFirst` + `update` são duas queries sem transação (TOCTOU) — envolvido em `$transaction` [prisma-user.adapter.ts:updatePartial] ✅ Fixed
- [x] [Review][Patch] `updatePartial` descarta campos com valor falsy (string vazia): usar `!== undefined` em vez de `&&` para `email`, `name`, `password` [prisma-user.adapter.ts:updatePartial] ✅ Fixed
- [x] [Review][Patch] `Effect.promise` em `createDriver` não mapeia P2002 Prisma → agora catch P2002 lança `EmailAlreadyExistsError` [prisma-user.adapter.ts:createDriver] ✅ Fixed

### Patches — MEDIUM

- [x] [Review][Patch] `isActive` query param aceita `'1'` (não-spec) e converte silenciosamente valores inválidos para `false` — agora rejeita com 400 [driver.controller.ts:list] ✅ Fixed
- [x] [Review][Patch] `role as any` em múltiplos métodos do adapter elimina type-safety do enum Prisma — substituído por `role as Role` [prisma-user.adapter.ts] ✅ Fixed
- [x] [Review][Patch] Swagger ausente: nenhum `@ApiTags`, `@ApiBearerAuth`, `@ApiOperation`, `@ApiResponse` no controller [driver.controller.ts] ✅ Fixed
- [x] [Review][Patch] `companyId` incluído na resposta do service viola AC1 (shape: `{ id, name, email, role, isActive, createdAt, updatedAt }`) [driver.service.ts] ✅ Fixed

### Patches — LOW

- [x] [Review][Patch] `DriverNotFoundError.create(id?)` ignora o parâmetro `id` silenciosamente [auth.errors.ts] ✅ Fixed
- [x] [Review][Patch] `@ts-ignore` no `seed.ts` — comentário corrigido: motivo é PrismaClient gerado exigir adapter; seed usa conexão direta via DATABASE_URL [prisma/seed.ts:21] ✅ Fixed
- [x] [Review][Patch] Sem `ParseUUIDPipe` nos `@Param('id')` — IDs malformados chegam ao Prisma sem validação [driver.controller.ts] ✅ Fixed
- [x] [Review][Patch] `updateDriver` emite `auth.driver_updated` mesmo quando nenhum campo foi alterado (no-op) [update-driver.use-case.ts] ✅ Fixed

### Deferidos

- [x] [Review][Defer] N+1 double-fetch em `updateDriver`: `findByIdAndCompanyAndRole` + `findFirst` interno do `updatePartial` (3 queries onde 1 bastaria) — deferred, pre-existing pattern
- [x] [Review][Defer] Sem guard de empresa ativa: JWT válido de empresa desativada ainda permite operações — deferred, systemic gap not caused by this story
- [x] [Review][Defer] `UserData` carrega campo `password` no tipo de domínio — domain type constraint pré-existente, service faz stripping correto
