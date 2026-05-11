# Story 2.6: Vínculos Aluno-Rota e Motorista-Rota

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como administrador da empresa,
Quero vincular alunos e motoristas a rotas específicas,
Para que o sistema saiba quem pode embarcar em qual rota e qual motorista opera cada rota.

## Acceptance Criteria

1. **Given** alunos, motoristas e rotas cadastrados
   **When** envio `POST /api/v1/routes/:routeId/students` com `{ studentId }`
   **Then** o aluno é vinculado à rota
   **And** resposta 201 Created com `{ data: { id, routeId, studentId, createdAt }, meta: { timestamp } }`
   **And** `companyId` é validado via TenantGuard (aluno, rota e admin devem ser da mesma empresa)
   **And** duplicata retorna 409 `ASSIGNMENT_ALREADY_EXISTS`

2. **Given** admin autenticado
   **When** envio `POST /api/v1/routes/:routeId/drivers` com `{ driverId }`
   **Then** o motorista é vinculado à rota
   **And** resposta 201 Created com `{ data: { id, routeId, driverId, createdAt }, meta: { timestamp } }`
   **And** `companyId` é validado (motorista, rota e admin da mesma empresa)
   **And** duplicata retorna 409 `ASSIGNMENT_ALREADY_EXISTS`

3. **Given** admin autenticado
   **When** envio `DELETE /api/v1/routes/:routeId/students/:studentId`
   **Then** vínculo aluno-rota é removido (hard delete)
   **And** status 204 No Content
   **And** vínculo inexistente retorna 404 `ASSIGNMENT_NOT_FOUND`

4. **Given** admin autenticado
   **When** envio `DELETE /api/v1/routes/:routeId/drivers/:driverId`
   **Then** vínculo motorista-rota é removido (hard delete)
   **And** status 204 No Content
   **And** vínculo inexistente retorna 404 `ASSIGNMENT_NOT_FOUND`

5. **Given** admin autenticado
   **When** envio `GET /api/v1/routes/:routeId/students`
   **Then** retorno lista de alunos vinculados à rota (com dados do aluno: id, name, email)
   **And** filtrado por `companyId`

6. **Given** admin autenticado
   **When** envio `GET /api/v1/routes/:routeId/drivers`
   **Then** retorno lista de motoristas vinculados à rota (com dados do motorista: id, name, email)
   **And** filtrado por `companyId`

7. **Given** motorista autenticado
   **When** acessa `GET /api/v1/routes/mine`
   **Then** vê apenas as rotas atribuídas a ele (FR10)
   **And** resposta contém dados da rota: id, name, description, originCity, destinationCity
   **And** role `DRIVER` permitido neste endpoint

8. **Given** admin autenticado
   **When** tenta vincular studentId/driverId que não existe ou pertence a outra empresa
   **Then** retorna 404 `USER_NOT_FOUND` (não vaza existência cross-tenant)

9. **Given** admin autenticado
   **When** tenta vincular a routeId que não existe ou pertence a outra empresa
   **Then** retorna 404 `ROUTE_NOT_FOUND`

10. **Given** aluno vinculado (role `STUDENT`)
    **When** acessa `GET /api/v1/routes/mine`
    **Then** vê apenas as rotas às quais está vinculado
    **And** role `STUDENT` permitido neste endpoint

11. **Given** requisição sem JWT ou com JWT inválido
    **When** chama qualquer endpoint de vínculos
    **Then** retorna 401 `Unauthorized`

12. **Given** o ciclo de vida dos vínculos
    **When** um vínculo é criado ou removido
    **Then** eventos `routing.student_assigned`, `routing.student_unassigned`, `routing.driver_assigned`, `routing.driver_unassigned` são emitidos via `WithEvents`

## Tasks / Subtasks

- [ ] Task 1 — Schema Prisma: Modelos RouteStudent e RouteDriver (AC: #1, #2)
  - [ ] 1.1 Adicionar modelo `RouteStudent` com `id` (UUID), `routeId`, `studentId`, `companyId`, `createdAt` com `@@schema("routing")`
  - [ ] 1.2 Adicionar modelo `RouteDriver` com `id` (UUID), `routeId`, `driverId`, `companyId`, `createdAt` com `@@schema("routing")`
  - [ ] 1.3 `@@unique([routeId, studentId])` em RouteStudent e `@@unique([routeId, driverId])` em RouteDriver
  - [ ] 1.4 FK para `Route` (same-schema `routing`). FK para `User` é cross-schema (`routing` → `auth`) — Prisma suporta
  - [ ] 1.5 Adicionar relações reversas em `Route` (`routeStudents RouteStudent[]`, `routeDrivers RouteDriver[]`)
  - [ ] 1.6 Adicionar relações reversas em `User` (`routeStudents RouteStudent[]`, `routeDrivers RouteDriver[]`)
  - [ ] 1.7 `@@index([companyId])` em ambos os modelos
  - [ ] 1.8 Executar `npx prisma migrate dev --name add-route-assignments`

- [ ] Task 2 — Functional Core: Erros adicionais (AC: #1, #2, #3, #4, #8)
  - [ ] 2.1 Adicionar `AssignmentAlreadyExistsError` (httpStatus 409, code `ASSIGNMENT_ALREADY_EXISTS`) em `routing.errors.ts`
  - [ ] 2.2 Adicionar `AssignmentNotFoundError` (httpStatus 404, code `ASSIGNMENT_NOT_FOUND`)
  - [ ] 2.3 Adicionar `UserNotFoundError` (httpStatus 404, code `USER_NOT_FOUND`) — reutilizar do auth ou criar local

- [ ] Task 3 — Functional Core: Schemas de input (AC: #1, #2)
  - [ ] 3.1 Criar `assign-student.schema.ts` — `Schema.Struct({ studentId: Schema.String.pipe(Schema.pattern(/^[0-9a-f-]{36}$/i)) })`
  - [ ] 3.2 Criar `assign-driver.schema.ts` — `Schema.Struct({ driverId: Schema.String.pipe(Schema.pattern(/^[0-9a-f-]{36}$/i)) })`

- [ ] Task 4 — Functional Core: Port `RouteAssignmentRepository` (AC: #1–#6)
  - [ ] 4.1 Criar `route-assignment-repository.port.ts` com `RouteAssignmentRepository` Effect Tag
  - [ ] 4.2 Interface com: `assignStudent(routeId, studentId, companyId)`, `unassignStudent(routeId, studentId, companyId)`, `findStudentsByRoute(routeId, companyId)`, `assignDriver(routeId, driverId, companyId)`, `unassignDriver(routeId, driverId, companyId)`, `findDriversByRoute(routeId, companyId)`, `findRoutesByDriver(driverId, companyId)`, `findRoutesByStudent(studentId, companyId)`

- [ ] Task 5 — Functional Core: Use-cases (AC: #1–#12)
  - [ ] 5.1 `assign-student.use-case.ts` — valida rota e aluno existem (via repos), cria vínculo, emite `routing.student_assigned`
  - [ ] 5.2 `unassign-student.use-case.ts` — remove vínculo, emite `routing.student_unassigned`
  - [ ] 5.3 `list-route-students.use-case.ts` — lista alunos da rota com `noEvents`
  - [ ] 5.4 `assign-driver.use-case.ts` — valida rota e motorista existem, cria vínculo, emite `routing.driver_assigned`
  - [ ] 5.5 `unassign-driver.use-case.ts` — remove vínculo, emite `routing.driver_unassigned`
  - [ ] 5.6 `list-route-drivers.use-case.ts` — lista motoristas da rota com `noEvents`
  - [ ] 5.7 `get-my-routes.use-case.ts` — recebe `{ userId, role, companyId }`, chama `findRoutesByDriver` ou `findRoutesByStudent` baseado na role, retorna `noEvents(routes)`

- [ ] Task 6 — Imperative Shell: Adapter Prisma (AC: #1–#6, #7, #10)
  - [ ] 6.1 Criar `prisma-route-assignment.adapter.ts` implementando `RouteAssignmentRepositoryApi`
  - [ ] 6.2 `assignStudent`: verificar existência da rota E do user (role STUDENT, isActive, same companyId) antes de criar
  - [ ] 6.3 `assignDriver`: verificar existência da rota E do user (role DRIVER, isActive, same companyId) antes de criar
  - [ ] 6.4 Capturar P2002 (unique constraint) → `AssignmentAlreadyExistsError`
  - [ ] 6.5 `findStudentsByRoute`/`findDriversByRoute`: JOIN com User para retornar name/email
  - [ ] 6.6 `findRoutesByDriver`/`findRoutesByStudent`: JOIN com Route para retornar dados da rota
  - [ ] 6.7 Todas queries filtradas por `companyId`

- [ ] Task 7 — Imperative Shell: Atualizar `RoutingService` (AC: #1–#7, #10)
  - [ ] 7.1 Adicionar métodos: `assignStudent`, `unassignStudent`, `listRouteStudents`, `assignDriver`, `unassignDriver`, `listRouteDrivers`, `getMyRoutes`
  - [ ] 7.2 Stripping de `companyId` em todas as respostas

- [ ] Task 8 — Imperative Shell: Atualizar `RoutingModule` (AC: todos)
  - [ ] 8.1 Adicionar `PrismaRouteAssignmentAdapter` como provider
  - [ ] 8.2 Atualizar `ROUTING_RUNTIME` factory para incluir `RouteAssignmentRepository` layer (merge com RouteRepository layer)

- [ ] Task 9 — Imperative Shell: Atualizar `RoutingController` (AC: #1–#11)
  - [ ] 9.1 Sub-rotas: `POST routes/:routeId/students`, `DELETE routes/:routeId/students/:studentId`, `GET routes/:routeId/students`
  - [ ] 9.2 Sub-rotas: `POST routes/:routeId/drivers`, `DELETE routes/:routeId/drivers/:driverId`, `GET routes/:routeId/drivers`
  - [ ] 9.3 Endpoint `GET routes/mine` — aceitar roles `DRIVER` e `STUDENT` (override `@Roles` do controller)
  - [ ] 9.4 `ParseUUIDPipe` em todos params (`:routeId`, `:studentId`, `:driverId`)
  - [ ] 9.5 Swagger completo para cada novo endpoint

- [ ] Task 10 — Testes unitários do core (AC: #1–#10, #12)
  - [ ] 10.1 `assign-student.use-case.spec.ts` — sucesso, duplicata, rota/aluno inexistente
  - [ ] 10.2 `unassign-student.use-case.spec.ts` — sucesso, vínculo inexistente
  - [ ] 10.3 `assign-driver.use-case.spec.ts` — sucesso, duplicata, rota/motorista inexistente
  - [ ] 10.4 `unassign-driver.use-case.spec.ts` — sucesso, vínculo inexistente
  - [ ] 10.5 `get-my-routes.use-case.spec.ts` — driver, student, lista vazia

- [ ] Task 11 — Teste E2E mínimo (AC: #1–#11)
  - [ ] 11.1 Criar `api/test/route-assignment.e2e-spec.ts` — POST assign student/driver; GET list; DELETE unassign; GET mine (driver); 409 duplicata; 404 cross-tenant; 401/403

- [ ] Task 12 — Mobile: Tela de rotas do motorista (AC: #7)
  - [ ] 12.1 Criar `mobile/app/(driver)/routes.tsx` — lista de rotas atribuídas ao motorista
  - [ ] 12.2 Usar TanStack Query com `GET /api/v1/routes/mine`
  - [ ] 12.3 UI com React Native Paper — lista com cards, botões grandes (NFR18)

- [ ] Task 13 — Validação final
  - [ ] 13.1 `npm run build`
  - [ ] 13.2 `npm run lint`
  - [ ] 13.3 `npm test` — zero regressões

## Dev Notes

### CONTEXTO: Expansão do bounded context `routing/`

Esta story **expande** o bounded context `routing/` existente (criado na Story 2.5). Os modelos de join table (`RouteStudent`, `RouteDriver`) vivem no mesmo schema `routing` do Prisma. A rota base `/api/v1/routes` é reutilizada com sub-rotas.

### Schema Prisma — Modelos de Join Table

```prisma
model RouteStudent {
  id        String   @id @default(uuid())
  routeId   String
  studentId String
  companyId String
  route     Route    @relation(fields: [routeId], references: [id], onDelete: Cascade)
  student   User     @relation("StudentRoutes", fields: [studentId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([routeId, studentId])
  @@index([companyId])
  @@index([studentId])
  @@map("route_students")
  @@schema("routing")
}

model RouteDriver {
  id        String   @id @default(uuid())
  routeId   String
  driverId  String
  companyId String
  route     Route    @relation(fields: [routeId], references: [id], onDelete: Cascade)
  driver    User     @relation("DriverRoutes", fields: [driverId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([routeId, driverId])
  @@index([companyId])
  @@index([driverId])
  @@map("route_drivers")
  @@schema("routing")
}
```

**ATENÇÃO:**
- `onDelete: Cascade` — deletar rota remove vínculos automaticamente (rotas usam hard delete na Story 2.5)
- FK cross-schema: `RouteStudent.studentId → User.id` (`routing` → `auth`) e `RouteDriver.driverId → User.id` (`routing` → `auth`). Prisma suporta FKs cross-schema.
- Relações nomeadas obrigatórias: `@relation("StudentRoutes")` e `@relation("DriverRoutes")` porque User tem 2 relações distintas com as join tables
- `companyId` denormalizado nas join tables para filtro de tenant direto sem JOIN
- Sem `updatedAt` — vínculos são imutáveis (create/delete only)
- Adicionar na model `Route`: `routeStudents RouteStudent[]` e `routeDrivers RouteDriver[]`
- Adicionar na model `User`: `routeStudents RouteStudent[] @relation("StudentRoutes")` e `routeDrivers RouteDriver[] @relation("DriverRoutes")`

### Validação Cross-Entity no Adapter

O adapter DEVE verificar que rota E user existem E pertencem à mesma empresa ANTES de criar o vínculo:

```typescript
// Pseudo-código do assignStudent
async assignStudent(routeId, studentId, companyId) {
  return prisma.$transaction(async (tx) => {
    const route = await tx.route.findFirst({ where: { id: routeId, companyId } });
    if (!route) → RouteNotFoundError

    const student = await tx.user.findFirst({ 
      where: { id: studentId, companyId, role: 'STUDENT', isActive: true } 
    });
    if (!student) → UserNotFoundError

    return tx.routeStudent.create({ data: { routeId, studentId, companyId } });
  });
}
```

**Erro P2002 (unique constraint violation):** Capturar e converter para `AssignmentAlreadyExistsError` (409).

### Endpoint `GET /api/v1/routes/mine` — Override de Roles

O controller usa `@Roles(['ADMIN'])` no nível de classe. O endpoint `mine` DEVE sobrescrever com `@Roles(['DRIVER', 'STUDENT'])`:

```typescript
@Get('mine')
@Roles(['DRIVER', 'STUDENT'])  // Override do @Roles(['ADMIN']) da classe
@ApiOperation({ summary: 'Listar minhas rotas (motorista ou aluno)' })
async getMyRoutes(@TenantId() companyId: string, @Req() req: any) {
  const userId = req.user.userId;
  const role = req.user.role;
  return this.routingService.getMyRoutes(userId, role, companyId);
}
```

**ATENÇÃO:** O `@Get('mine')` DEVE ser declarado ANTES de `@Get(':id')` no controller, senão o NestJS interpreta "mine" como um UUID e falha no `ParseUUIDPipe`. Ordem das rotas é significativa.

### UserNotFoundError — Decisão

Criar `UserNotFoundError` localmente no `routing/core/errors/routing.errors.ts` (NÃO importar de `auth/core/`). Razão: o core de routing não deve ter dependência do core de auth (bounded contexts separados). O erro é genérico o suficiente ("User not found") sem vazar detalhes.

### Layer Merge no Module

O runtime precisa de 2 services (RouteRepository + RouteAssignmentRepository):

```typescript
useFactory: (routeAdapter: PrismaRouteAdapter, assignAdapter: PrismaRouteAssignmentAdapter) => {
  const RouteLayer = Layer.succeed(RouteRepository, routeAdapter);
  const AssignLayer = Layer.succeed(RouteAssignmentRepository, assignAdapter);
  const MergedLayer = Layer.merge(RouteLayer, AssignLayer);
  return ManagedRuntime.make(MergedLayer);
},
inject: [PrismaRouteAdapter, PrismaRouteAssignmentAdapter],
```

### Dados Retornados nos Listings

**`GET /routes/:routeId/students`** retorna:
```json
{ "data": [{ "id": "assign-uuid", "studentId": "user-uuid", "name": "João", "email": "joao@..." }] }
```

**`GET /routes/:routeId/drivers`** retorna:
```json
{ "data": [{ "id": "assign-uuid", "driverId": "user-uuid", "name": "Carlos", "email": "carlos@..." }] }
```

**`GET /routes/mine`** retorna:
```json
{ "data": [{ "id": "route-uuid", "name": "Rota Norte", "description": "...", "originCity": "Viçosa", "destinationCity": "BH" }] }
```

Sem `companyId` em nenhuma resposta (padrão de stripping).

### Mobile — Tela do Motorista

Criar `mobile/app/(driver)/routes.tsx`:
- TanStack Query: `useQuery({ queryKey: ['my-routes'], queryFn: () => apiClient.get('/api/v1/routes/mine') })`
- React Native Paper: `List.Section` com `List.Item` ou `Card` para cada rota
- Botões grandes, contraste alto (NFR18)
- Loading state via TanStack Query `isLoading`
- Erro: toast via React Native Paper `Snackbar`

### Project Structure Notes

**Arquivos novos:**
```
api/src/domains/routing/
  core/
    schemas/assign-student.schema.ts                    # [NEW]
    schemas/assign-driver.schema.ts                     # [NEW]
    ports/route-assignment-repository.port.ts            # [NEW]
    use-cases/assign-student.use-case.ts                # [NEW]
    use-cases/assign-student.use-case.spec.ts           # [NEW]
    use-cases/unassign-student.use-case.ts              # [NEW]
    use-cases/unassign-student.use-case.spec.ts         # [NEW]
    use-cases/list-route-students.use-case.ts           # [NEW]
    use-cases/assign-driver.use-case.ts                 # [NEW]
    use-cases/assign-driver.use-case.spec.ts            # [NEW]
    use-cases/unassign-driver.use-case.ts               # [NEW]
    use-cases/unassign-driver.use-case.spec.ts          # [NEW]
    use-cases/list-route-drivers.use-case.ts            # [NEW]
    use-cases/get-my-routes.use-case.ts                 # [NEW]
    use-cases/get-my-routes.use-case.spec.ts            # [NEW]
  shell/
    adapters/prisma-route-assignment.adapter.ts          # [NEW]
    adapters/prisma-route-assignment.adapter.spec.ts     # [NEW]

api/test/route-assignment.e2e-spec.ts                    # [NEW]
mobile/app/(driver)/routes.tsx                           # [NEW]
```

**Arquivos modificados:**
```
api/prisma/schema.prisma              # +RouteStudent, +RouteDriver, +relações em Route e User
api/src/domains/routing/core/errors/routing.errors.ts   # +AssignmentAlreadyExistsError, +AssignmentNotFoundError, +UserNotFoundError
api/src/domains/routing/shell/routing.service.ts        # +7 métodos de vínculo
api/src/domains/routing/shell/routing.module.ts         # +PrismaRouteAssignmentAdapter, layer merge
api/src/domains/routing/shell/http/routing.controller.ts # +7 endpoints
```

### Anti-Patterns a Evitar

1. **NÃO importar de `auth/core/`** no `routing/core/` — bounded contexts separados
2. **NÃO fazer queries cross-schema via JOIN** — usar `companyId` denormalizado nas join tables
3. **NÃO esquecer `@Roles` override** no endpoint `mine` — sem isso, apenas ADMIN acessa
4. **NÃO declarar `@Get(':id')` ANTES de `@Get('mine')`** — NestJS trata "mine" como UUID
5. **NÃO retornar `companyId`** nas respostas (padrão de stripping)
6. **NÃO esquecer `ParseUUIDPipe`** em `:routeId`, `:studentId`, `:driverId`
7. **NÃO criar vínculos para users inativos** — verificar `isActive: true` no adapter
8. **NÃO usar soft delete** em vínculos — hard delete por design (igual a rotas)

### Previous Story Intelligence

**Story 2.5 (done) — Lições:**
- Bounded context `routing/` completo com CRUD — reutilizar controller/service/module
- Hard delete padrão para rotas — aplicar o mesmo em vínculos
- `$transaction` com `findFirst` pré-check para multi-tenancy
- `EffectSchemaPipe` para validação de body
- Eventos emitidos via `WithEvents` + `EffectEventDispatcher`
- No-op detection para updates (não aplicável aqui — vínculos são create/delete only)
- Review patches: `Schema.trimmed()`, `Schema.maxLength()`, `Schema.NullOr`, P2003 handler

**Story 2.4 (done) — Lições:**
- Stripping de `companyId` na resposta
- `ParseUUIDPipe` obrigatório
- User queries filtradas por `companyId` + `role` + `isActive`

**Deferred work relevante:**
- Unbounded pagination — pré-existente, aceito para MVP

### Git Intelligence

Últimos commits:
- `e60511c` docs: add prd and architecture formatted docs
- `d2c3bc2` feat: configure swagger and openAPI integration
- `0360a1a` fix(routing): harden route CRUD validation (story 2.5 review patches)
- `0e68c67` feat(routing): implement route CRUD (story 2.5)

Commit desta story: `feat(routing): implement route assignments (story 2.6)`

### Dependências

Nenhuma dependência nova. Todos os pacotes já instalados.

### References

- [Source: epics.md#Story-2.6] — AC originais (FR8, FR9, FR10)
- [Source: prd.md#FR8] — "Empresa pode vincular alunos a rotas específicas"
- [Source: prd.md#FR9] — "Empresa pode vincular motoristas a rotas específicas"
- [Source: prd.md#FR10] — "Motorista pode visualizar as rotas atribuídas a ele"
- [Source: architecture.md#3] — Multi-schema routing, multi-tenancy
- [Source: architecture.md#7] — routing/ domain structure, endpoints /api/v1/routes/*
- [Source: architecture.md#8] — Regras obrigatórias para agentes
- [Source: 2-5-crud-de-rotas-de-transporte.md] — Template e padrões do routing domain
- [Source: route-repository.port.ts] — Template de port (Context.Tag)
- [Source: routing.module.ts] — Template de module (domain-scoped runtime)
- [Source: routing.errors.ts] — Template de erros (Data.TaggedError)
- [Source: routing.controller.ts] — Template de controller

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (Thinking) via Antigravity

### Debug Log References

### Completion Notes List

### File List

**Completion Notes:**
- Implementados 13 tasks conforme especificação da story
- Migration `add_route_assignments` aplicada com sucesso (RouteStudent + RouteDriver com @@unique constraints)
- UserNotFoundError criado localmente em routing/core (sem import de auth/core — isolamento de BC)
- GET /routes/mine declarado ANTES de GET :id no controller (anti-padrão NestJS evitado)
- Layer.merge para combinar RouteRepository + RouteAssignmentRepository no ROUTING_RUNTIME
- 15 testes unitários + 14 E2E specs criados
- Suite completa: 37 arquivos, 143 testes, zero regressões — build limpo
- Tela mobile routes.tsx criada com TanStack Query e React Native Paper

### Review Findings

**Decisões resolvidas:**

- [x] [Review][Decision] Eventos com `companyId` no payload — **Decisão:** manter (eventos são tenant-internal). Sem patch.
- [x] [Review][Decision] `AssignmentNotFoundError` em DELETE cross-tenant — **Decisão:** diferenciar internamente (logar classificação ROUTE/USER/ASSIGNMENT) mantendo `ASSIGNMENT_NOT_FOUND` no response. Convertido em patch #14 abaixo.
- [x] [Review][Decision] Cascade vs soft-delete — **Decisão:** filtrar `isActive` nos listings (já coberto pelo patch #6) e manter `ON DELETE CASCADE`. Sem patch adicional.

**Patches a aplicar (patch):**

- [x] [Review][Patch] **CRÍTICO — RolesGuard ignora `@Roles` no nível de classe** [api/src/domains/shared/shell/guards/roles.guard.ts:15] — `reflector.get(Roles, context.getHandler())` lê apenas o handler. Os 6 endpoints novos (`POST/DELETE/GET routes/:routeId/students` e `routes/:routeId/drivers`) NÃO têm `@Roles` no método e dependem do `@Roles(['ADMIN'])` da classe. Resultado: qualquer usuário com JWT válido (DRIVER/STUDENT) consegue assign/unassign/listar. O e2e `'deve retornar 403 para role DRIVER'` (linha 171) na realidade falharia se executado. AC1/AC2/AC3/AC4/AC5/AC6 quebrados na prática. Fix: trocar para `reflector.getAllAndOverride(Roles, [context.getHandler(), context.getClass()])`. (Bug pré-existente em 2.5 que esta story amplifica.)
- [x] [Review][Patch] P2003 (FK violation) não capturado em `assignStudent`/`assignDriver` [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts:1885-1888,2019-2027 do diff] — Race window: se rota/user é deletado entre `findFirst` e `create`, P2003 escapa do try interno → `Effect.orDie` → 500 em vez de 404. Adicionar branch `e.code === 'P2003'` para mapear para `RouteNotFoundError`/`UserNotFoundError`.
- [x] [Review][Patch] Race em `unassignStudent`/`unassignDriver` gera P2025 → 500 [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts:1922-1944,2057-2080 do diff] — Dois unassigns concorrentes: ambos passam `findFirst`, o segundo `delete` lança P2025 não capturado. Substituir `findFirst+delete` por `deleteMany({where})` + verificação de `count===0` → mapear para `AssignmentNotFoundError`.
- [x] [Review][Patch] `getMyRoutes` faz fall-through silencioso para STUDENT [api/src/domains/routing/core/use-cases/get-my-routes.use-case.ts:22-26] — Ternário `role === 'DRIVER' ? findRoutesByDriver : findRoutesByStudent` atende qualquer outra role como STUDENT. Combinado com o bug do RolesGuard (acima), um ADMIN cairia silenciosamente na query de student. Adicionar branch explícito `if (role !== 'DRIVER' && role !== 'STUDENT') fail with InvalidRoleError`.
- [x] [Review][Patch] `findRoutesByDriver/Student` faz `r.route as RouteAssignedData` sem strip explícito [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts:2126,2145 do diff] — Type assertion mente: o Prisma `include: { route: true }` retorna o objeto Route completo (com `companyId` e quaisquer outros campos futuros). O `service.getMyRoutes` chama `strip(r)` antes de retornar (boa defesa), mas a tipagem mascara um leak potencial. Fix: usar `select` no Prisma para projetar apenas `{id, name, description, originCity, destinationCity}`.
- [x] [Review][Patch] Listings não filtram `user.isActive` [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts:1953-1971,2082-2110,2126,2145 do diff] — `findStudents/DriversByRoute` e `findRoutesByDriver/Student` retornam users desativados após `isActive=false` (a Story 2.4 desativa via PATCH). Adicionar `where: { ..., student/driver: { isActive: true } }` (ou filtrar role também — defensivo contra role-flip pós-assignment).
- [x] [Review][Patch] UUID regex inconsistente entre body schema e `ParseUUIDPipe` [api/src/domains/routing/core/schemas/assign-student.schema.ts, assign-driver.schema.ts] — Schema do body aceita non-v4 UUIDs (e o teste `'00000000-0000-0000-0000-000000000000'` explora isso). `ParseUUIDPipe` (default v4) é mais estrito nos params da URL. Padronizar — preferencialmente reusar o regex de `ParseUUIDPipe` ou validar versão do UUID no schema.
- [x] [Review][Patch] E2E silencia falhas com `if (!driverToken) return;` [api/test/route-assignment.e2e-spec.ts:172,255,273 do diff] — Se o login do driver/student falhar, esses testes passam silenciosamente sem assertion. Substituir por `expect(driverToken).toBeDefined()` ou mover login para `beforeAll` com `.expect(200)` falhando alto. Também: testes são order-dependent (DELETE depende de POST anterior); considerar fixtures isoladas por test.
- [x] [Review][Patch] E2E `expect(404)` em nil UUID test não verifica `code` específico [api/test/route-assignment.e2e-spec.ts:159-161 do diff] — Aceita qualquer 404, mascarando regressões cross-tenant (ex.: ROUTE_NOT_FOUND vazando quando deveria ser USER_NOT_FOUND). Asseverar `body.code === 'USER_NOT_FOUND'` (ou o esperado).
- [x] [Review][Patch] P2002 catch não inspeciona `meta.target` [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts:1885-1890,2019-2024 do diff] — Captura qualquer unique violation como `ASSIGNMENT_ALREADY_EXISTS`. Validar que `e.meta?.target` referencia o constraint específico (`route_students_routeId_studentId_key` ou equivalente) — defesa contra futuros índices únicos retornarem 409 enganoso.
- [x] [Review][Patch] Mobile snackbar não re-aparece após dismiss em erro persistente [mobile/src/app/(driver)/routes.tsx:51-57 do diff] — `useEffect([isError])` só dispara quando `isError` muda. Se usuário dismiss e a próxima refetch também falha, snackbar não reabre. Disparar com base em `dataUpdatedAt`/`errorUpdatedAt` ou em counter.
- [x] [Review][Patch] Mobile sem pull-to-refresh / retry manual [mobile/src/app/(driver)/routes.tsx do diff] — `retry: 2` esgota; `staleTime: 30_000` impede refetch ao re-entrar; sem `RefreshControl`. Em rede instável (cenário comum de motorista) não há recovery sem matar app. Adicionar `RefreshControl` ligado a `refetch` + tratamento de 401/403 (logout em vez de "verifique sua conexão").
- [x] [Review][Patch] Mobile renderiza empty-state em caso de erro [mobile/src/app/(driver)/routes.tsx:78 do diff] — Quando `isError && !routes`, mostra "Nenhuma rota atribuída ainda" + snackbar. Usuário entende como "sem rotas" em vez de "falha". Branchar `isError` antes de empty-state e mostrar componente de erro com retry.
- [x] [Review][Patch] Diferenciar internamente o motivo do 404 em `unassign*` [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts] — Conforme decisão: ao retornar `ASSIGNMENT_NOT_FOUND` em cross-tenant DELETE, classificar internamente se a falha foi por route inexistente, user inexistente ou assignment inexistente e logar com `logger.warn({reason})`. Response ao cliente permanece sempre 404 `ASSIGNMENT_NOT_FOUND` (sem vazar existence info).

**Deferidos (defer — pré-existentes ou fora de escopo):**

- [x] [Review][Defer] `Effect.orDie` em todos os adapters converte falhas infra recuperáveis em defects/500 sem retry/métrica — padrão pré-existente do projeto desde Story 1.3.
- [x] [Review][Defer] Falta outbox transacional para eventos de domínio (eventos podem ser perdidos se processo crashar entre commit e dispatch) — arquitetural, fora do escopo da story.
- [x] [Review][Defer] `Layer.merge` em `routing.module.ts` impede transações cross-aggregate (ex.: criar rota + assignar students atomicamente) — escolha arquitetural; não é bug.
- [x] [Review][Defer] `@Get('mine')` antes de `@Get(':id')` é forçado apenas por disciplina (ordem de método) — adicionar teste de regressão que prove resolução de `mine` na presença de `:id`.
- [x] [Review][Defer] `companyId` em `routeStudent.create`/`routeDriver.create` vem do parâmetro de input em vez de `route.companyId` validado dentro da tx — defense-in-depth contra futuros callers que passem companyId divergente; hoje o controller garante consistência.
- [x] [Review][Defer] `sprint-status.yaml` tem comentários de timestamp divergentes do dado YAML — gerenciamento manual; trivial.
