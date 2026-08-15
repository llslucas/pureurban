---
baseline_commit: 4930bbd11edb5f94b33f9a098a656a08c234b13c
---

# Story 3.3a: Check-in de Embarque (Backend)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como sistema,
Quero registrar o embarque de um aluno validando permissão e viagem ativa,
Para que o motorista tenha controle digital de quem entrou no ônibus.

## Acceptance Criteria

1. **Given** viagem ativa e aluno com permissão
   **When** `POST /api/v1/boarding/check-in` recebe `studentId`, `tripId` e `X-Idempotency-Key`
   **Then** o check-in é persistido com timestamp e identificação do aluno (FR19)

2. **And** o use case valida que o aluno está ativo e vinculado à rota da viagem (FR18)

3. **And** QR inválido, aluno sem permissão ou viagem encerrada retornam tagged errors → HTTP com `{ error: { code, message } }` usando os códigos declarados em 3.0 (FR20)

4. **And** requisição repetida com a mesma `X-Idempotency-Key` retorna o resultado anterior sem duplicar o check-in (Architecture §5 — pré-requisito da fila offline)

5. **And** domain event `boarding.checked_in` é emitido via `WithEvents`

6. **And** o processamento ocorre em menos de 2 segundos (NFR1)

7. **And** os use cases do core são testados sem infraestrutura (< 100ms por suite)

**Camada:** Backend · **Depende de:** 3.0 (done) · **FRs:** FR18, FR19, FR20 · **NFRs:** NFR1, NFR16 · **Bloqueia:** 3.5a, 3.6

---

## Tabela de Verdade do Endpoint — a referência única

Esta tabela É o contrato. Ela foi extraída do `api/openapi.json` commitado **e** do comportamento dos handlers MSW da Story 3.0 (`mobile/src/mocks/handlers/boarding.handlers.ts`), que já estão em uso pela trilha mobile. **Divergir dela quebra a Story 3.6.** Quando o mock e a sua intuição discordarem, o mock vence.

> **Revisada na code review de 2026-08-14.** A versão original tinha 7 linhas; esta tem 11. Mudanças: 2 códigos novos (`DRIVER_NOT_ASSIGNED`, `IDEMPOTENCY_KEY_CONFLICT`), 1 código de robustez (`INVALID_IDEMPOTENCY_KEY`), o campo opcional `occurredAt`, e **a validação de shape passou a vir antes do replay** (as antigas linhas 2 e 3 trocaram de posição). O mock MSW foi corrigido para acompanhar — ver Review Findings.

| Ordem | Condição | HTTP | `error.code` |
|---|---|---|---|
| 1 | Header `X-Idempotency-Key` ausente ou vazio (após trim) | 400 | `MISSING_IDEMPOTENCY_KEY` |
| 2 | Header acima de 200 caracteres | 400 | `INVALID_IDEMPOTENCY_KEY` |
| 3 | `studentId`/`tripId` ausente, não-string ou não-UUID; `occurredAt` presente e não-ISO | 400 | `INVALID_QR_CODE` |
| 4 | Key já usada com sucesso, **mesmo** par `[studentId, tripId]` | **201** | — (replay do resultado anterior) |
| 5 | Key já usada com sucesso, par `[studentId, tripId]` **diferente** | 409 | `IDEMPOTENCY_KEY_CONFLICT` |
| 6 | `occurredAt` no futuro além de 5min, ou mais de 24h no passado | 400 | `INVALID_QR_CODE` |
| 7 | Viagem inexistente, de outra empresa, ou `status != ACTIVE` | 409 | `TRIP_NOT_ACTIVE` |
| 8 | Viagem ativa, mas o motorista autenticado não é o responsável por ela | 403 | `DRIVER_NOT_ASSIGNED` |
| 9 | Aluno inexistente, inativo, de outra empresa, não-STUDENT, ou não vinculado à rota da viagem | 403 | `STUDENT_NOT_ALLOWED` |
| 10 | Aluno já tem check-in nesta viagem (com key **diferente**) | 409 | `DUPLICATE_CHECK_IN` |
| 11 | Caminho feliz | 201 | — |

**A ordem importa.**

- **Validação de shape (3) antes do replay (4).** Sem um body válido não existe `[studentId, tripId]` para comparar com o registro armazenado, e devolver o registro anterior às cegas reportaria embarque de outro aluno como sucesso. Esta é a inversão em relação à versão original da tabela, decidida na review.
- **O replay (4) vem antes de qualquer regra de negócio.** A fila offline reenvia com a MESMA key, e uma viagem que terminou entre o envio original e o reenvio não pode transformar um sucesso já registrado em erro — o item ficaria preso para sempre. Isso vale inclusive contra a sanidade de `occurredAt` (6), que por isso vem depois: um item antigo replayado sai da fila, um item antigo **novo** não entra.
- **`IDEMPOTENCY_KEY_CONFLICT` (5) não é `DUPLICATE_CHECK_IN` (10).** O primeiro é a mesma key para um aluno ou viagem diferente — reuso indevido de key. O segundo é o mesmo aluno na mesma viagem com key **diferente** — o motorista escaneou o mesmo QR duas vezes.
- **`TRIP_NOT_ACTIVE` (7) → `DRIVER_NOT_ASSIGNED` (8) → `STUDENT_NOT_ALLOWED` (9)**, do mais geral ao mais específico: não faz sentido dizer quem pode embarcar numa viagem que quem pergunta não opera.

**Viagem inexistente → 409 `TRIP_NOT_ACTIVE`, não 404.** O contrato deste endpoint não declara 404. Retornar 404 é drift.

**Viagem de outra empresa → 409 `TRIP_NOT_ACTIVE`, nunca 403.** O isolamento multi-tenant acontece na query (`findActiveTrip` filtra por `companyId`), então uma viagem de outra empresa é indistinguível de inexistente. Responder `DRIVER_NOT_ASSIGNED` aqui vazaria a existência da viagem alheia.

---

## Tasks / Subtasks

- [x] **Task 1 — Prisma: entidade `BoardingRecord`** (AC: #1, #4)
  - [x] 1.1 Adicionar ao `api/prisma/schema.prisma`, na seção `boarding` (criar a seção — hoje o schema `boarding` está declarado no generator/datasource mas não tem nenhum model):

    ```prisma
    // ─── BOARDING (Embarque Digital) ────────────────────────────

    model BoardingRecord {
      id             String   @id @default(uuid())
      companyId      String
      tripId         String
      studentId      String
      idempotencyKey String
      checkedInAt    DateTime @default(now())
      createdAt      DateTime @default(now())
      updatedAt      DateTime @updatedAt

      @@unique([companyId, idempotencyKey], name: "boarding_idempotency")
      @@unique([tripId, studentId], name: "boarding_one_per_student_per_trip")
      @@index([tripId])
      @@index([companyId])
      @@map("boarding_records")
      @@schema("boarding")
    }
    ```

  - [x] 1.2 Os **dois** `@@unique` são o coração da story: o primeiro garante idempotência sob concorrência, o segundo garante `DUPLICATE_CHECK_IN` no banco (não só na aplicação). Sem eles, dois check-ins simultâneos passam pela verificação de leitura e inserem duplicata.
  - [x] 1.3 Sem FK para `Trip` nem para `User` — cross-schema, mesmo padrão já usado em `Trip.routeId`/`Trip.driverId`. A integridade é validada nos use cases.
  - [x] 1.4 Sem coluna `status`. A existência do registro **é** o `CHECKED_IN`. `NOT_CHECKED_IN` é ausência e `NOT_RETURNING` é o Épico 4 (entidade separada, Story 4.1a) — a 3.5a deriva os três. Não antecipar.
  - [x] 1.5 `npx prisma migrate dev --name add_boarding_records` → `npx prisma generate`. Confirmar que `prisma.boardingRecord` existe no cliente gerado.

- [x] **Task 2 — Core: erros tagueados** (AC: #3)
  - [x] 2.1 Criar `api/src/domains/boarding/core/errors/boarding.errors.ts` seguindo **exatamente** o padrão de `routing/core/errors/routing.errors.ts` (`Data.TaggedError` + `static readonly create(...)` retornando `code`, `message`, `httpStatus`):
    - `InvalidQrCodeError` → `INVALID_QR_CODE`, 400
    - `StudentNotAllowedError` → `STUDENT_NOT_ALLOWED`, 403
    - `TripNotActiveError` → `TRIP_NOT_ACTIVE`, 409
    - `DuplicateCheckInError` → `DUPLICATE_CHECK_IN`, 409
  - [x] 2.2 Criar `api/src/domains/boarding/core/errors/index.ts` (barrel, padrão do routing/trip)
  - [x] 2.3 **NÃO importar** `TripNotFound` de `trip/core/errors` nem nada de `auth/core`. Bounded contexts não compartilham erros — precedente explícito em `routing.errors.ts:48-49` (`UserNotFoundError` foi duplicado local justamente por isso).

- [x] **Task 3 — Core: ports** (AC: #1, #2, #4)
  - [x] 3.1 `api/src/domains/boarding/core/ports/boarding-repository.port.ts`:

    ```typescript
    export interface BoardingRecordData {
      id: string; companyId: string; tripId: string; studentId: string;
      idempotencyKey: string; checkedInAt: Date; createdAt: Date; updatedAt: Date;
    }

    export interface BoardingRepositoryApi {
      findByIdempotencyKey(
        idempotencyKey: string, companyId: string,
      ): Effect.Effect<BoardingRecordData | null>;

      recordCheckIn(data: {
        companyId: string; tripId: string; studentId: string; idempotencyKey: string; checkedInAt: Date;
      }): Effect.Effect<BoardingRecordData, DuplicateCheckInError>;
    }

    export class BoardingRepository extends Context.Tag('BoardingRepository')<
      BoardingRepository, BoardingRepositoryApi
    >() {}
    ```

  - [x] 3.2 `api/src/domains/boarding/core/ports/trip-access.port.ts` — visão **read-only** da viagem, propriedade do boarding:

    ```typescript
    export interface ActiveTripView { id: string; routeId: string }

    export interface TripAccessApi {
      // null quando: não existe | outra empresa | status != ACTIVE
      findActiveTrip(tripId: string, companyId: string): Effect.Effect<ActiveTripView | null>;
    }
    export class TripAccess extends Context.Tag('TripAccess')<TripAccess, TripAccessApi>() {}
    ```

  - [x] 3.3 `api/src/domains/boarding/core/ports/student-eligibility.port.ts`:

    ```typescript
    export interface StudentEligibilityApi {
      // true somente se: user existe, role STUDENT, isActive, mesma company, vinculado à rota
      isAllowedOnRoute(
        studentId: string, routeId: string, companyId: string,
      ): Effect.Effect<boolean>;
    }
    export class StudentEligibility extends Context.Tag('StudentEligibility')<
      StudentEligibility, StudentEligibilityApi
    >() {}
    ```

  - [x] 3.4 Os três ports retornam `Effect` com `R = never` (o `PrismaService` entra pelo DI do NestJS no adapter, não pelo contexto do Effect) — mesma decisão registrada nos Debug Logs da Story 3.1.

- [x] **Task 4 — Core: schema de validação** (AC: #3)
  - [x] 4.1 Criar `api/src/domains/boarding/core/schemas/check-in.schema.ts` com `@effect/schema` (o pacote que o projeto usa — ver Dev Notes, seção Effect Schema):

    ```typescript
    import { Schema } from '@effect/schema';

    export const CheckInInput = Schema.Struct({
      studentId: Schema.UUID,
      tripId: Schema.UUID,
    });
    export type CheckInInput = typeof CheckInInput.Type;
    ```

  - [x] 4.2 `Schema.UUID` valida o formato exigido pela linha 3 da tabela de verdade. **Já verificado nesta versão** (`@effect/schema@0.75.5`): existe e aceita os UUIDs usados nos mocks (`660e8400-e29b-41d4-a716-446655440010` → `Right`). Não precisa de regex manual.

- [x] **Task 5 — Core: use case `checkIn`** (AC: #1, #2, #3, #4, #5, #7)
  - [x] 5.1 Criar `api/src/domains/boarding/core/use-cases/check-in.use-case.ts`. Assinatura:

    ```typescript
    export const checkIn = (input: {
      studentId: string; tripId: string; companyId: string; idempotencyKey: string;
    }): Effect.Effect<
      WithEvents<BoardingRecordData>,
      TripNotActiveError | StudentNotAllowedError | DuplicateCheckInError,
      BoardingRepository | TripAccess | StudentEligibility
    > => Effect.gen(function* () { ... });
    ```

  - [x] 5.2 Corpo, **nesta ordem** (linhas 2→7 da tabela de verdade):
    1. `findByIdempotencyKey` → se achou, `return noEvents(record)` **imediatamente**. Sem evento no replay: `boarding.checked_in` já foi despachado na primeira vez; reemitir duplicaria o efeito nos consumidores.
    2. `TripAccess.findActiveTrip` → `null` ⇒ `TripNotActiveError`
    3. `StudentEligibility.isAllowedOnRoute(studentId, trip.routeId, companyId)` → `false` ⇒ `StudentNotAllowedError`
    4. `BoardingRepository.recordCheckIn(...)` com `checkedInAt: new Date()` → pode falhar com `DuplicateCheckInError`
    5. `return withEvents(record, [{ type: 'boarding.checked_in', data: { boardingRecordId: record.id, studentId, tripId, checkedInAt: record.checkedInAt.toISOString() }, occurredAt: new Date().toISOString() }])`
  - [x] 5.3 `InvalidQrCodeError` **não** aparece no use case — a validação de shape acontece no pipe (Task 7). O erro existe no core porque é vocabulário do domínio e a 3.6 o exercita pela borda HTTP.
  - [x] 5.4 Escrever `check-in.use-case.spec.ts` seguindo o padrão de `routing/core/use-cases/assign-student.use-case.spec.ts` (`Layer.succeed` + `Effect.provide` + `Effect.either`, mocks com `vi.fn()`). Casos obrigatórios:
    - feliz: persiste e emite exatamente 1 evento `boarding.checked_in`
    - **replay**: `findByIdempotencyKey` retorna registro ⇒ resultado igual, `events.length === 0`, e `recordCheckIn` **nunca chamado** (`expect(repo.recordCheckIn).not.toHaveBeenCalled()`)
    - `TripNotActiveError` quando `findActiveTrip` → `null`
    - `StudentNotAllowedError` quando `isAllowedOnRoute` → `false`
    - `DuplicateCheckInError` propagado do repositório
    - **ordem**: viagem inativa **e** aluno não vinculado ⇒ o erro é `TripNotActiveError`; e `isAllowedOnRoute` não é chamado
    - `isAllowedOnRoute` recebe o `routeId` **vindo da viagem**, não do input (o cliente não envia routeId — é a garantia de que o vínculo checado é o certo)
  - [x] 5.5 Suite sem infraestrutura, < 100ms (AC #7)

- [x] **Task 6 — Shell: adapters** (AC: #1, #2, #4)
  - [x] 6.1 `api/src/domains/boarding/shell/adapters/prisma-boarding.adapter.ts` — `implements BoardingRepositoryApi` (a **interface**, nunca a Context.Tag — lição registrada nos Debug Logs da 3.1), `constructor(private readonly prisma: PrismaService)`.
  - [x] 6.2 `recordCheckIn`: `prisma.boardingRecord.create(...)`. Mapear `P2002` discriminando os dois constraints — reutilizar o padrão `isExpectedUniqueViolation` de `routing/shell/adapters/prisma-route-assignment.adapter.ts:24-31` (inspeciona `e.meta?.target`):
    - target contém `tripId` + `studentId` ⇒ `Effect.fail(DuplicateCheckInError.create())`
    - target contém `companyId` + `idempotencyKey` ⇒ **corrida de replay**: reler por `findByIdempotencyKey` e retornar o registro existente com sucesso. Falhar aqui quebraria a fila offline (dois reenvios simultâneos da mesma key).
    - qualquer outro erro ⇒ `Effect.orDie` (defeito de infra)
  - [x] 6.3 `findByIdempotencyKey`: `prisma.boardingRecord.findFirst({ where: { idempotencyKey, companyId } })`. **Sempre** com `companyId` (multi-tenancy, regra absoluta).
  - [x] 6.4 `api/src/domains/boarding/shell/adapters/prisma-trip-access.adapter.ts`:
    `prisma.trip.findFirst({ where: { id: tripId, companyId, status: 'ACTIVE' }, select: { id: true, routeId: true } })` → `null` quando não encontra. `select` explícito, nunca `include` (lição da retro do Épico 2: "type assertions mentem em silêncio").
  - [x] 6.5 `api/src/domains/boarding/shell/adapters/prisma-student-eligibility.adapter.ts` — **duas queries separadas, sem JOIN cross-schema**:

    ```typescript
    const [student, link] = await Promise.all([
      prisma.user.findFirst({
        where: { id: studentId, companyId, role: 'STUDENT', isActive: true },
        select: { id: true },
      }),
      prisma.routeStudent.findFirst({
        where: { routeId, studentId, companyId },
        select: { id: true },
      }),
    ]);
    return Boolean(student && link);
    ```

    Ler `auth.users` e `routing.route_students` a partir de um adapter de `boarding/shell/` é **permitido e intencional** — ver Dev Notes, seção Fronteiras entre Bounded Contexts.

- [x] **Task 7 — Shell: pipe com código de erro customizável** (AC: #3)
  - [x] 7.1 Estender `api/src/domains/shared/shell/pipes/effect-schema.pipe.ts` com um 2º parâmetro opcional no construtor:

    ```typescript
    constructor(
      private readonly schema: Schema.Schema<A, I>,
      private readonly errorCode: string = 'VALIDATION_ERROR',
    ) {}
    // e no throw: code: this.errorCode
    ```

    Default preservado ⇒ **zero regressão** nos 6 usos existentes no `routing.controller.ts`.
  - [x] 7.2 Motivo: o contrato exige `INVALID_QR_CODE` no 400 deste endpoint, e o pipe hoje emite `VALIDATION_ERROR` fixo. O mock retorna `INVALID_QR_CODE` — a 3.3b já está sendo desenvolvida contra ele.
  - [x] 7.3 O `effect-schema.pipe.spec.ts` existente ganha um teste **de consumo** com código customizado, além do default (acordo de time da retro do Épico 2: toda story que toca o shared kernel prova o consumo, não só o comportamento isolado — foi assim que o bug do `RolesGuard` passou 5 stories despercebido).

- [x] **Task 8 — Shell: decorator `@IdempotencyKey()`** (AC: #4)
  - [x] 8.1 Criar `api/src/domains/shared/shell/decorators/idempotency-key.decorator.ts` — `createParamDecorator` que lê `request.headers['x-idempotency-key']`, faz `trim()` e lança `BadRequestException({ code: 'MISSING_IDEMPOTENCY_KEY', message: 'Header X-Idempotency-Key é obrigatório' })` se vazio/ausente.
  - [x] 8.2 Vive no shared kernel, não no boarding: o Épico 4 declara `X-Idempotency-Key` em `not-returning`, `cancel-absence` e `broadcast` (Story 4.0). Criá-lo local seria garantir a reinvenção.
  - [x] 8.3 **Não** validar formato UUID — o mock só exige não-vazio. Exigir UUID rejeitaria o que o mock aceita e a 3.6 quebraria.
  - [x] 8.4 Cabeçalhos HTTP são case-insensitive no Express e chegam **em minúsculas**: ler `x-idempotency-key`.
  - [x] 8.5 Teste unitário do decorator (contexto HTTP mockado): presente, ausente, só espaços.

- [x] **Task 9 — Shell: service e module** (AC: #1, #5)
  - [x] 9.1 `api/src/domains/boarding/shell/boarding.service.ts` — espelhar `trip.service.ts`: `export const BOARDING_RUNTIME = 'BOARDING_RUNTIME'`, `@Inject(BOARDING_RUNTIME)` + `EffectEventDispatcher`, método `processCheckIn(...)` chamando `eventDispatcher.runAndDispatch(this.runtime, checkIn({...}))`.
  - [x] 9.2 **Mapear para o DTO de resposta no service** e nada mais:

    ```typescript
    return {
      id: record.id, studentId: record.studentId, tripId: record.tripId,
      checkedInAt: record.checkedInAt.toISOString(), status: 'CHECKED_IN' as const,
    };
    ```

    `companyId` e `idempotencyKey` **NUNCA** saem na resposta (retro do Épico 2 — "service stripping"). `checkedInAt` como ISO 8601 UTC explícito, conforme `CheckInResponseDto`.
  - [x] 9.3 `api/src/domains/boarding/shell/boarding.module.ts` — `imports: [SharedKernelModule]`, `controllers: [BoardingController]`, providers: os 3 adapters + `BoardingService` + `EffectEventDispatcher` + o factory do runtime. Três layers ⇒ **`Layer.mergeAll(a, b, c)`** (`Layer.merge` só aceita dois — o `routing.module.ts` usa a variante de dois).
  - [x] 9.4 `BoardingModule` **já está** importado no `app.module.ts`. Não adicionar de novo.

- [x] **Task 10 — Shell: ligar o controller** (AC: #1, #3, #4)
  - [x] 10.1 Em `api/src/domains/boarding/shell/http/boarding.controller.ts`: injetar `BoardingService` no construtor e trocar o corpo do `checkIn` pela chamada real. Assinatura:

    ```typescript
    async checkIn(
      @TenantId() companyId: string,
      @IdempotencyKey() idempotencyKey: string,
      @Body(new EffectSchemaPipe(CheckInInput, 'INVALID_QR_CODE')) body: CheckInInput,
    ) {
      return this.boardingService.processCheckIn({ ...body, companyId, idempotencyKey });
    }
    ```

  - [x] 10.2 **Ordem dos parâmetros importa para a tabela de verdade.** O NestJS resolve param decorators antes do pipe do `@Body`, então `@IdempotencyKey()` lançando primeiro produz `MISSING_IDEMPOTENCY_KEY` antes de `INVALID_QR_CODE` — que é a ordem 1→3 exigida. Verificar com um e2e enviando body inválido **sem** o header: deve vir `MISSING_IDEMPOTENCY_KEY`.
  - [x] 10.3 Guards, `@Roles(['DRIVER'])`, `@ApiTags`, `@ApiBearerAuth`, `@ApiHeader`, `@ApiBody`, `@ApiDataResponse` e `@ApiExtraModels(QrCodePayloadDto)` ficam **exatamente como estão**. Não mexer.
  - [x] 10.4 **Remover** o `@ApiResponse({ status: 501, ... })` **apenas** do `checkIn` — o endpoint deixou de retornar 501.
  - [x] 10.5 Atualizar a `description` do `@ApiOperation`: remover "Contrato declarado — implementação na Story 3.3a", manter a frase sobre idempotência.
  - [x] 10.6 **NÃO** tocar no `trip.controller.ts`. O `GET :id/students` continua stub 501 até a Story 3.5a, e o `JwtAuthGuard` comentado + `@Roles(['driver'])` minúsculo continuam sendo escopo da review da 3.1.

- [x] **Task 11 — Contrato: re-exportar e propagar** (AC: #3)
  - [x] 11.1 `cd api && npm run openapi:export`. O `openapi.json` **vai mudar** (o 501 do check-in sai, a description do `@ApiOperation` muda). Isso é esperado e é uma mudança de contrato consciente — commitar o arquivo.
  - [x] 11.2 `cd mobile && npm run openapi:types` para regenerar `src/types/api.d.ts`. Commitar. **Nunca** editar à mão (Architecture §8, regra 11).
  - [x] 11.3 `cd mobile && npx tsc --noEmit` — os handlers MSW são tipados contra `operations['BoardingController_checkIn']`; se o typecheck quebrar, a mudança de contrato quebrou a trilha mobile e precisa ser resolvida **neste PR**. Esperados: os 2 erros pré-existentes em `(auth)/login.tsx` (typed routes) permanecem.
  - [x] 11.4 Rodar `npm run openapi:export` uma 2ª vez e conferir `git diff --exit-code api/openapi.json` — drift check manual (Architecture §12; o CI ainda não existe).
  - [x] 11.5 **Não alterar** `check-in.dto.ts`, `qr-code-payload.dto.ts` nem os handlers MSW. Nenhum campo do contrato muda nesta story.

- [x] **Task 12 — Testes de integração e verificação** (AC: todos)
  - [x] 12.1 `api/src/domains/boarding/shell/adapters/prisma-boarding.adapter.spec.ts` com banco **real** (`docker compose up -d`; padrão do projeto — nunca mockar o banco). Cobrir o que só o banco prova:
    - inserção do mesmo `[tripId, studentId]` com keys diferentes ⇒ `DuplicateCheckInError`
    - inserção da mesma `[companyId, idempotencyKey]` ⇒ retorna o registro existente com sucesso (não erro)
    - `findByIdempotencyKey` com `companyId` de outra empresa ⇒ `null`
  - [x] 12.2 Se houver e2e do fluxo, colocar em `api/test/*.e2e-spec.ts`. Cobrir a **ordem** da tabela de verdade — em especial 10.2 (sem header + body inválido ⇒ `MISSING_IDEMPOTENCY_KEY`) e o replay retornando 201.
  - [x] 12.3 `cd api && npm run build` — 0 erros
  - [x] 12.4 `cd api && npm test` — os 144 testes existentes continuam verdes (o `prisma.service.spec.ts` exige Postgres no ar) + os novos
  - [x] 12.5 `npm run format` limpo. `npm run lint`: a baseline tem ~149 erros/59 warnings **pré-existentes** em arquivos não tocados — o critério é que **nenhum arquivo novo ou modificado desta story** apareça na saída.

---

## Dev Notes

### Fronteiras entre Bounded Contexts — leia antes de escrever qualquer linha

O check-in é a primeira operação do sistema que precisa de dados de **três** contextos: `boarding` (o registro), `trip` (a viagem está ativa?) e `routing` + `auth` (o aluno pode embarcar?). Existem três formas de resolver isso e duas estão proibidas:

| Abordagem | Veredito |
|---|---|
| `boarding/core` importa `TripRepository` de `trip/core` | ❌ **PROIBIDO** — acopla os cores. Precedente contrário explícito: `routing.errors.ts:48` duplicou `UserNotFoundError` em vez de importar de `auth/core` |
| Um JOIN Prisma entre `boarding.boarding_records` e `trip.trips` | ❌ **PROIBIDO** — os schemas PostgreSQL são a barreira física do DDD (project-context, Architecture §3) |
| `boarding/core` declara os ports que **ele** precisa; adapters de `boarding/shell` fazem queries **separadas** nas tabelas dos outros contextos | ✅ **É ESTE** |

A terceira é a Dependency Inversion aplicada à fronteira: o core do boarding não sabe que existe um domínio "trip", só sabe que precisa perguntar "esta viagem está ativa?". O `TripAccess` é uma **visão anticorrupção** que devolve `{ id, routeId }` — não `TripData` inteiro. Precedente direto: `PrismaRouteAssignmentAdapter` já lê `prisma.user` (schema `auth`) a partir do contexto `routing`, com queries separadas.

Consequência prática: **os ports `TripAccess` e `StudentEligibility` não existem no desenho da Architecture §7** (que lista `boarding-repository.port.ts` e `notification-service.port.ts`). São adição consciente desta story, com o rationale acima. `notification-service.port.ts` continua não existindo — é do Épico 4.

### Idempotência — a parte que a fila offline depende

A Story 3.4b (fila offline, trilha mobile) reenvia cada item com a **mesma** `X-Idempotency-Key` (que é o `id` da linha em `offline_queue`), com backoff, até 5 tentativas. O contrato dessa relação:

- **Mesma key ⇒ mesma resposta 201.** Não 200, não 409. O cliente não distingue "criou agora" de "já existia".
- **O replay é a primeira coisa checada**, antes de qualquer regra de negócio (linha 2 da tabela de verdade). Um item enfileirado às 7h05 e drenado às 7h40, quando a viagem já terminou, **precisa** sair da fila com sucesso — senão fica preso para sempre.
- **`DUPLICATE_CHECK_IN` é outra coisa**: mesmo aluno, mesma viagem, key **diferente**. É o motorista escaneando o mesmo QR duas vezes. Nunca confundir os dois — a Story 3.0 gastou um patch de review inteiro nessa distinção.
- **Corrida de dois reenvios simultâneos com a mesma key**: o `@@unique([companyId, idempotencyKey])` faz o segundo `INSERT` estourar `P2002`; o adapter relê e devolve sucesso (Task 6.2). Sem isso, um item da fila pode falhar por causa de si mesmo.

**Desvio consciente da Architecture §5**, que sugere `WHERE idempotency_key = ? AND trip_id = ?`: o escopo aqui é `(companyId, idempotencyKey)`. A key é UUID v4 gerada no cliente, portanto globalmente única; escopar por `tripId` deixaria passar um bug de cliente que reusa a key em viagens diferentes. `companyId` mantém o isolamento multi-tenant. É estritamente mais forte que o proposto, sem perda.

Caso de borda aceito no MVP: mesma key com payload **diferente** ⇒ retorna o registro armazenado (o payload novo é ignorado). Uma API madura responderia 422; aqui, com a key vindo 1:1 da linha da fila, o cenário é bug de cliente. Não implementar detecção de payload-mismatch.

### Effect Schema — usar `@effect/schema`, não `effect/Schema`

O projeto tem `effect@^3.21.0` **e** `@effect/schema@^0.75.5` instalados, e todo o código existente (`routing/core/schemas/*`, `auth/core/schemas/*`, `effect-schema.pipe.ts`) importa de `@effect/schema`. Desde o Effect 3.10 o módulo Schema foi absorvido pelo core (`import { Schema } from 'effect'`) e o pacote separado está em modo de compatibilidade; o Effect v4 (beta desde abr/2026) redesenha a API por completo.

**Nada disso é escopo desta story.** Migrar aqui criaria um PR misto — parte feature, parte refactor de 8 arquivos — e o `EffectSchemaPipe`, que esta story toca, é tipado contra `Schema.Schema<A, I>` do pacote antigo. Use `import { Schema } from '@effect/schema'` e siga o padrão de `create-route.schema.ts`. A migração é candidata a uma story técnica própria, pós-Épico 3.

### Padrões que já existem — não reinventar

| Precisa de | Já existe em | Nota |
|---|---|---|
| Estrutura de bounded context | `routing/` (mais completo) e `trip/` (mais próximo em tamanho) | template estabilizado na retro do Épico 2 |
| Tagged error com `static create` | `routing/core/errors/routing.errors.ts` | `trip.errors.ts` usa a variante sem `create` — prefira a do routing |
| Discriminar `P2002` por constraint | `routing/shell/adapters/prisma-route-assignment.adapter.ts:18-31` | copiar `isExpectedUniqueViolation` |
| Runtime domain-scoped | `trip.module.ts` (1 layer), `routing.module.ts` (2 layers) | você precisa de 3 ⇒ `Layer.mergeAll` |
| Service + `runAndDispatch` | `trip.service.ts` | espelhar |
| Controller com guards corretos | `routing.controller.ts` | roles em **UPPERCASE**; o `['driver']` minúsculo do trip.controller é legado |
| Spec de use case com mocks | `routing/core/use-cases/assign-student.use-case.spec.ts` | `Layer.succeed` + `Effect.either` |
| Envelope `{ data, meta }` | `ResponseWrapperInterceptor` (global) | o service retorna o objeto **cru**; o interceptor envelopa |
| `{ error: { code, message } }` | `EffectExceptionFilter` (global) | detecta tagged errors por duck typing (`_tag` + `code` + `message`) e usa `httpStatus` |

O `EffectExceptionFilter` só respeita o status HTTP se o erro carregar `httpStatus`. Um tagged error sem esse campo vira **500**. Os quatro erros da Task 2 precisam dele.

### Estado atual dos arquivos que serão MODIFICADOS

- **`api/prisma/schema.prisma`** (152 linhas) — models: `Company`, `User`, `Trip`, `Route`, `RouteStudent`, `RouteDriver`. Schema `boarding` declarado no generator e no datasource, **sem nenhum model**. Mudança: +1 model no fim do arquivo, seção nova. Preservar todo o resto.
- **`api/src/domains/boarding/shell/http/boarding.controller.ts`** (83 linhas) — stub completo com todos os decorators Swagger. Mudança: construtor + corpo do método + 3 params + remoção do `@ApiResponse` 501 + ajuste da description. Todos os outros decorators intactos.
- **`api/src/domains/boarding/shell/boarding.module.ts`** (7 linhas) — só `controllers: [BoardingController]`. Mudança: vira o module completo com runtime.
- **`api/src/domains/shared/shell/pipes/effect-schema.pipe.ts`** (44 linhas) — 6 consumidores hoje, todos no `routing.controller.ts`, todos passando só o schema. Mudança: +1 param opcional **com default**. Qualquer alteração que force os 6 call sites a mudar está errada.
- **`api/openapi.json`** e **`mobile/src/types/api.d.ts`** — ambos **gerados**. Editar à mão é violação de contrato; rodar os scripts.

### Domain event `boarding.checked_in`

Declarado na Architecture §4 (emissor `boarding`, consumidor `tracking` para contagem). **Nesta story só o dispatch existe — nenhum listener.** `EventEmitter2` sem listener é no-op; isso é esperado e correto. É evento **interno** entre bounded contexts, portanto **não** é contrato de cliente e **não** entra no `openapi.json` (Architecture §12: só eventos expostos em stream SSE viram contrato — o que acontece no Épico 4). Não criar handler, não criar SSE, não mockar no mobile.

Emitir apenas no check-in **novo**. No replay, `noEvents(record)`.

### Fora de escopo (não fazer nesta story)

- `GET /api/v1/trips/:id/students` — continua stub 501. É a Story 3.5a.
- Qualquer tela mobile, `api-client.ts`, fila offline, MSW. São 3.3b/3.4b, trilha do Dev 2.
- Religar `JwtAuthGuard` e corrigir `@Roles(['driver'])` no `trip.controller.ts` — review da Story 3.1.
- `ValidationPipe` global (deferido da 3.0, "escopo da 3.3a"): **decidido — não registrar.** A story padroniza no `EffectSchemaPipe`, coerente com Architecture §3 ("validação no functional core, testável sem NestJS") e com os 6 usos do routing. Registrar um `ValidationPipe` global ativaria de uma vez os `class-validator` hoje inertes em ~11 endpoints existentes — mudança de comportamento em massa, sem cobertura, fora do escopo. Consequência: o `@IsUUID()` em `check-in.dto.ts` continua decorativo; a validação real é o `CheckInInput`. Não remover os decorators (eles documentam o contrato via `format: uuid`).
- Migrar `@effect/schema` → `effect/Schema` — story técnica própria.
- Validar que o motorista autenticado é o dono da viagem — o contrato da 3.0 **não declara código de erro** para esse caso e inventar um seria drift. Ver Questões Abertas.
- Entidade de ausência / `NOT_RETURNING` — Épico 4, Story 4.1a.
- Workflow de CI com drift check — o repo ainda não tem `.github/workflows/`; verificação manual na Task 11.4.

### Previous Story Intelligence

**Da 3.0 (done, commit `4930bbd`):**
- O contrato está commitado e a trilha mobile **já consome os mocks**. A tabela de verdade acima é a tradução literal deles.
- 3 itens deferidos da review da 3.0 tocam esta story: (a) `ValidationPipe` global — decidido acima; (b) `api-client.ts` sem headers por requisição — problema da 3.3b, não seu; (c) tipos gerados inúteis para 11 request bodies antigos (`TypeLiteralClass`/`RefineClass` colapsam em `Record<string, never>`) — **não é regressão sua** se reaparecer no `tsc` do mobile; é pré-existente, causado por classes Effect Schema usadas como `@Body`.
- O `export-openapi.ts` roda **sem Postgres no ar**. Já o `npm test` precisa do banco (`prisma.service.spec.ts`).
- `npm run openapi:export` = `nest build && node dist/scripts/export-openapi.js`. `ts-node` **não funciona** com os imports `.js`/nodenext deste projeto — não tente "consertar".

**Da 3.1 (review) e da retro do Épico 2:**
- Adapter `implements` a **interface**, não a Context.Tag.
- `PrismaService` entra por DI do NestJS no adapter para manter `R = never` nos ports.
- Runtime domain-scoped `{X}_RUNTIME` é o padrão desde a 2.2.
- `RolesGuard` já foi corrigido (`getAllAndOverride`) na 2.6 — funciona com `@Roles` a nível de classe, que é o caso do `BoardingController`.
- Rotas literais antes de `:id` (não afeta esta story — `check-in` é o único path).
- Retro: "Adapters sempre mapeiam erros Prisma (P2002, P2003, P2025) — não engolir com `Effect.orDie`". `Effect.orDie` só para o inesperado.
- Retro: use cases **sempre** retornam `WithEvents` — `noEvents(result)` quando não há evento (é exatamente o caso do replay).

### Git Intelligence

- `4930bbd` feat(boarding): define digital boarding API contract (story 3.0) · `690bc5a` feat(routing): story 2.6 · `d2c3bc2` feat: swagger/openAPI
- Conventional commits, branch `main`. Sugestão: `feat(boarding): implement check-in use case and idempotency (story 3.3a)`
- A 3.0 tocou API **e** mobile no mesmo commit. Esta story é backend, mas **precisa** commitar `mobile/src/types/api.d.ts` regenerado (Task 11.2) — é consequência mecânica do contrato, não invasão da trilha do Dev 2.

### Latest Tech Information (verificado em 2026-08-14)

- **Effect** `^3.21.0` instalado. `@effect/schema@^0.75.5` está em compatibilidade desde que o Schema entrou no core do Effect (3.10); o Effect v4 está em beta desde abr/2026 com Schema redesenhado. **Não migrar nesta story** — ver seção Effect Schema.
- **Prisma 7.6.0** com `@prisma/adapter-pg`, multi-schema, `moduleFormat = "cjs"`, cliente em `src/generated/prisma`. `@@unique(..., name: "...")` nomeia o constraint; `P2002.meta.target` continua vindo como array de campos — é nele que a discriminação da Task 6.2 se apoia.
- **@nestjs/swagger 11.2.7** já instalado. **Nenhuma dependência nova** é necessária nesta story, em nenhum dos dois projetos.

### Testing Requirements

- Unit (core): `src/**/*.spec.ts`, Vitest, sem infraestrutura, < 100ms por suite. `Layer.succeed` para mocks de port.
- Integração (adapter): banco **real** via `docker compose up -d`. Mocks de banco são proibidos pelo project-context.
- e2e Vitest: `test/**/*.e2e-spec.ts` (`npm run test:e2e`, timeout 30s).
- **Não silenciar falha em e2e** com early-return de token ausente — foi assim que a 2.6 mascarou o bug do `RolesGuard`.
- Verde exigido: `npm run build`, `npm test` (144 pré-existentes + novos), `mobile: npx tsc --noEmit` (menos os 2 erros conhecidos em `login.tsx`).

### Project Structure Notes

```
api/
├── openapi.json                                          # [UPDATE — GERADO] 501 do check-in sai
├── prisma/
│   ├── schema.prisma                                     # [UPDATE] +model BoardingRecord
│   └── migrations/20260814xxxxxx_add_boarding_records/   # [NEW — GERADO]
└── src/domains/
    ├── boarding/
    │   ├── core/                                         # [NEW — toda a pasta]
    │   │   ├── errors/{boarding.errors.ts, index.ts}
    │   │   ├── ports/{boarding-repository.port.ts, trip-access.port.ts, student-eligibility.port.ts}
    │   │   ├── schemas/check-in.schema.ts
    │   │   └── use-cases/{check-in.use-case.ts, check-in.use-case.spec.ts}
    │   └── shell/
    │       ├── adapters/                                 # [NEW]
    │       │   ├── prisma-boarding.adapter.ts (+ .spec.ts)
    │       │   ├── prisma-trip-access.adapter.ts
    │       │   └── prisma-student-eligibility.adapter.ts
    │       ├── boarding.service.ts                       # [NEW]
    │       ├── boarding.module.ts                        # [UPDATE] runtime + providers
    │       └── http/boarding.controller.ts               # [UPDATE] liga o endpoint
    └── shared/shell/
        ├── decorators/idempotency-key.decorator.ts       # [NEW] (+ .spec.ts)
        └── pipes/effect-schema.pipe.ts                   # [UPDATE] +errorCode opcional (+ .spec.ts)

mobile/
└── src/types/api.d.ts                                    # [UPDATE — GERADO] nunca à mão
```

Todos os imports relativos da API levam extensão `.js` (module nodenext) — inclusive nos arquivos novos e nos `.spec.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3a] — ACs e escopo
- [Source: _bmad-output/planning-artifacts/epics.md#Convenção de Fatiamento] — regras das trilhas `X.0`/`X.Ya`
- [Source: _bmad-output/planning-artifacts/architecture.md#4] — `WithEvents`, `runAndDispatch`, tabela de domain events
- [Source: _bmad-output/planning-artifacts/architecture.md#5] — Tier 2, idempotência no servidor, LWW
- [Source: _bmad-output/planning-artifacts/architecture.md#6] — naming, envelope `{ data, meta }` / `{ error }`, ISO 8601
- [Source: _bmad-output/planning-artifacts/architecture.md#7] — estrutura hexagonal, fronteira core↔shell
- [Source: _bmad-output/planning-artifacts/architecture.md#8] — regras 1-13
- [Source: _bmad-output/planning-artifacts/architecture.md#12] — drift check, eventos internos vs. contrato
- [Source: _bmad-output/implementation-artifacts/3-0-contrato-de-api-embarque-digital.md] — contrato, decisões de review, semântica de `INVALID_QR_CODE`
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-05-11.md] — padrões estabilizados, acordos de time
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — 3 defers da 3.0 que caem aqui
- [Source: _bmad-output/project-context.md] — extensão `.js`, anti-patterns, multi-tenancy
- [Source: api/openapi.json#/paths//api/v1/boarding/check-in] — contrato commitado, autoridade final
- [Source: mobile/src/mocks/handlers/boarding.handlers.ts] — comportamento de referência da tabela de verdade
- [Source: api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts] — `isExpectedUniqueViolation`, queries cross-context separadas
- [Source: api/src/domains/routing/core/errors/routing.errors.ts] — tagged error com `static create`
- [Source: api/src/domains/trip/shell/{trip.service.ts,trip.module.ts}] — runtime domain-scoped
- [Source: api/src/domains/shared/shell/filters/effect-exception.filter.ts] — duck typing `_tag`/`code`/`httpStatus`
- Effect Schema no core desde 3.10 / v4 beta: https://effect.website · https://www.infoq.com/news/2026/04/effect-v4-beta/

---

## Questões Abertas (para o Lucas, não bloqueiam o dev)

1. ~~**Motorista não-dono da viagem.**~~ **FECHADA na code review de 2026-08-14.** O Lucas optou pela mudança de contrato aqui, não na 3.5a: `DRIVER_NOT_ASSIGNED` (403) na linha 8 da tabela de verdade, mais a coluna `recordedBy` como trilha de auditoria. A 3.5a herda a validação pronta.
2. **`Trip.routeId` sem FK nem validação** (risco 🟡 aberto desde a retro do Épico 2). O check-in confia no `routeId` da viagem para resolver o vínculo do aluno; uma viagem criada com `routeId` inválido faz todo check-in retornar `STUDENT_NOT_ALLOWED` sem explicação óbvia. A correção pertence ao `startTrip` (review da 3.1), não aqui.

### Review Findings

_Code review adversarial de 2026-08-14 — 3 camadas (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 4 decision-needed, 8 patch, 4 defer, 10 descartados como ruído._

**Decision-needed** — **todos resolvidos pelo Lucas em 2026-08-14; os 4 viraram patch.** As decisões expandem o contrato do endpoint com 2 códigos de erro novos (`DRIVER_NOT_ASSIGNED` 403, `IDEMPOTENCY_KEY_CONFLICT` 409) e 1 campo novo opcional (`occurredAt`), além de uma coluna nova (`recordedBy`). Consequências transversais: `openapi.json` e `mobile/src/types/api.d.ts` regenerados, tabela de verdade reescrita, e `mobile/src/mocks/handlers/boarding.handlers.ts` alterado — este último cancela conscientemente a Task 11.5 ("não alterar os handlers MSW") e atravessa para a trilha do Dev 2, que desenvolve a 3.3b contra esse mock.

- [x] [Review][Decision] **RESOLVIDO → opção 1 (corrigir agora).** Nenhuma validação de que o motorista autenticado é dono da viagem — `boarding.controller.ts:78-88` nunca lê `req.user.userId`; `prisma-trip-access.adapter.ts:24` filtra só por `id + companyId + status`. O domínio irmão **exige** essa checagem (`trip/core/use-cases/end-trip.use-case.ts:27`: `if (trip.driverId !== input.driverId)`), então este endpoint é estritamente mais fraco que o `endTrip` do qual depende. Agravante: `BoardingRecord` não tem coluna `recordedBy`/`driverId`, então um motorista que registra embarques na viagem de outro não deixa rastro algum — e adicionar a coluna depois exige backfill sem fonte de verdade. É a Questão Aberta #1 da própria story. **Decisão: adicionar a checagem agora.** `ActiveTripView` ganha `driverId`; a comparação fica no core (testável sem infra), não no adapter. Código novo `DRIVER_NOT_ASSIGNED` / **403** — mesma família semântica de `STUDENT_NOT_ALLOWED`, e 403 evita confusão com o 409 de `TRIP_NOT_ACTIVE`. Entra na tabela de verdade entre `TRIP_NOT_ACTIVE` e `STUDENT_NOT_ALLOWED`. `BoardingRecord` ganha coluna `recordedBy` (id do motorista autenticado). Fecha a Questão Aberta #1.
- [x] [Review][Decision] **RESOLVIDO → opção 1 (corrigir agora).** Replay com payload diferente retorna 201 com o registro de OUTRO aluno — `check-in.use-case.ts:32-37` e `prisma-boarding.adapter.ts:134-157` devolvem o registro armazenado sem comparar `studentId`/`tripId` com o body recebido. `prisma-boarding.adapter.spec.ts:87-102` **afirma isso como comportamento correto**. As Dev Notes aceitam conscientemente ("Não implementar detecção de payload-mismatch"), mas a consequência num sistema de transporte escolar é reportar embarque falso-positivo de uma criança que não embarcou. **Decisão: adicionar detecção de payload-mismatch.** Comparar `studentId`/`tripId` do registro armazenado com os do body; divergiu ⇒ `IDEMPOTENCY_KEY_CONFLICT` / **409**. Vale nos dois caminhos: o fast-path do use case e o branch `replay_race` do adapter. O teste `prisma-boarding.adapter.spec.ts:87-102`, que hoje afirma o comportamento oposto como correto, precisa ser reescrito — não é regressão, é a asserção que estava errada. Reforçado pelo fato de a key não ser validada como UUID (Task 8.3), o que torna colisão por cliente mal-comportado mais provável do que "UUID v4 globalmente único" sugere.
- [x] [Review][Decision] **RESOLVIDO → opção 1 (corrigir agora).** Linhas 2 e 3 da tabela de verdade estão invertidas na implementação — replay com body malformado retorna `400 INVALID_QR_CODE` em vez do `201` de replay. O pipe `@Body(new EffectSchemaPipe(CheckInInput, 'INVALID_QR_CODE'))` (`boarding.controller.ts:81`) roda até o fim antes do service, tornando a busca de replay (`check-in.use-case.ts:32`) inalcançável para payload inválido. O mock MSW — que a story declara como autoridade — consulta `idempotentSuccesses.get(...)` (`boarding.handlers.ts:80`) **antes** de validar UUID. Confirmado por probe ao vivo. Exposição real é baixa (a fila reenvia payload idêntico), mas é desvio de contrato declarado que pode aparecer na 3.6. **Decisão: corrigir o mock e a tabela de verdade — não a API.** A opção "mover replay para antes da validação" foi descartada por incoerência com a decisão anterior: sem body válido não há `studentId`/`tripId` para comparar com o registro armazenado, então replayar antes de validar reintroduziria exatamente o falso-positivo que a detecção de mismatch existe para impedir. Logo a ordem atual do código (validar body → replay) é a única coerente, e quem diverge é o mock. Ação: `boarding.handlers.ts` passa a validar shape antes de consultar `idempotentSuccesses`; a tabela de verdade troca as linhas 2 e 3 de lugar. **Cancela a Task 11.5** no que diz respeito aos handlers MSW — avisar o Dev 2 da trilha mobile.
- [x] [Review][Decision] **RESOLVIDO → opção 1 (corrigir agora).** `checkedInAt` grava o horário do servidor, não o do embarque real — `check-in.use-case.ts:62` usa `new Date()` no momento do processamento. A fila offline da 3.4b drena horas depois com a mesma key, então o registro de embarque das 7h05 fica carimbado com o horário do sync. O contrato não tem campo `occurredAt` e a Task 11.5 proíbe mexer nos DTOs. **Decisão: adicionar `occurredAt` opcional agora.** `CheckInInput` ganha `Schema.optional` para `occurredAt` (ISO 8601); `checkedInAt: input.occurredAt ?? new Date()`. Horário vindo do cliente é dado não-confiável, então exige sanidade: rejeitar timestamps no futuro e além de um limite no passado (`INVALID_QR_CODE`, que já é o código de erro de shape do body — evita um quinto código novo). Sem o campo, o comportamento é idêntico ao de hoje, então a 3.3b/3.4b podem adotá-lo quando estiverem prontas. Contrato + tipos mobile regenerados.

**Patch** — **todos os 8 aplicados em 2026-08-14**, junto com os 4 que vieram das decisões acima:

- [x] [Review][Patch] `boarding.checked_in` é emitido uma segunda vez na corrida de replay, violando AC #5 [api/src/domains/boarding/core/use-cases/check-in.use-case.ts:65] — o branch `replay_race` do adapter (`prisma-boarding.adapter.ts:134-157`) devolve o registro pré-existente como sucesso e o use case não consegue distingui-lo de um insert, caindo em `withEvents(...)`. As Dev Notes exigem "Emitir apenas no check-in novo". Causa raiz: `BoardingRepositoryApi.recordCheckIn` retorna `BoardingRecordData` puro, sem discriminador. Fix: retornar `{ created: boolean; record }` e ramificar entre `withEvents`/`noEvents`.
- [x] [Review][Patch] Discriminação de P2002 depende da ordem dos índices no Postgres e não tem fallback [api/src/domains/boarding/shell/adapters/prisma-boarding.adapter.ts:104-121] — numa corrida real da mesma key para o mesmo `[trip, student]`, **ambos** os constraints são violados mas o PG reporta só um; o código testa `BOARDING_ONE_PER_STUDENT_PER_TRIP` primeiro (linha 109), então pode devolver `409 DUPLICATE_CHECK_IN` onde o contrato promete `201`. A correção hoje depende da ordem de criação dos índices em `migration.sql:22` vs `:25`, o que não é contrato. Além disso, quando `fields.length === 0` (linha 48) o erro é relançado → `Effect.orDie` → **500** onde o `openapi.json` promete 409. Fix determinístico que resolve os dois: em qualquer P2002, reler por idempotency key primeiro; só tratar como duplicata se ausente.
- [x] [Review][Patch] Idempotency key sem limite de tamanho vira 500 [api/src/domains/shared/shell/decorators/idempotency-key.decorator.ts:13-14] — qualquer string não-vazia é aceita; uma key acima de ~2704 bytes estoura o limite de linha do índice btree do Postgres e o erro cai em `Effect.orDie` → 500 em vez de 400. A Task 8.3 proíbe validar formato UUID (quebraria o mock), mas um limite de comprimento não conflita com isso.
- [x] [Review][Patch] Teste e2e de `DUPLICATE_CHECK_IN` acoplado à ordem de execução [api/test/boarding.e2e-spec.ts:312-322] — só passa porque o teste de caminho feliz (`:263-286`) já consumiu o par `[activeTripId, allowedStudentId]`; os próprios comentários admitem o acoplamento. Rodado isolado (`-t`) ou se o caminho feliz falhar, ele quebra por motivo alheio ao que afirma verificar. Fix: semear a precondição dentro do próprio teste.
- [x] [Review][Patch] Lacunas de cobertura em isolamento multi-tenant e viagem encerrada [api/test/boarding.e2e-spec.ts] — o e2e monta uma única empresa; o caminho de maior risco (motorista da empresa A enviando `tripId` da empresa B) nunca é exercitado ponta a ponta. O filtro `status: 'ACTIVE'` (`prisma-trip-access.adapter.ts:24`), única coisa que impede check-in depois que o motorista encerra a viagem, tem cobertura zero — o e2e de `TRIP_NOT_ACTIVE` usa só UUID inexistente. Ambos foram probados manualmente na review e **funcionam**; falta a rede de regressão.
- [x] [Review][Patch] Evento `boarding.checked_in` sem `companyId` e com segunda leitura de relógio [api/src/domains/boarding/core/use-cases/check-in.use-case.ts:66-76] — o consumidor `tracking` do Épico 4 não consegue escopar por tenant a partir do evento e terá que re-consultar, reintroduzindo o acoplamento que o evento existe para quebrar. Além disso `occurredAt` (linha 74) é um `new Date()` separado de `checkedInAt` (linha 62); podem cair em segundos diferentes, fazendo evento e registro discordarem.
- [x] [Review][Patch] Lixo de working tree não declarado: `package-lock.json` vazio na raiz + 4.756 linhas de churn [package-lock.json, api/package-lock.json, mobile/package-lock.json] — arquivo de 88 bytes com `"packages": {}` na raiz do monorepo (que não tem `package.json`), criado por rodar npm no diretório errado. Os dois lockfiles reais somam +2801/−1955 linhas de drift transitivo (ex.: `@angular-devkit/core` 19.2.19→19.2.27, `ajv` 8.17.1→8.18.0) sem nenhuma mudança em `package.json` — não relacionado à story e não revisado. Fix: apagar o da raiz, reverter os outros dois.
- [x] [Review][Patch] Dois índices redundantes no `BoardingRecord` [api/prisma/schema.prisma:168-169] — `@@index([tripId])` é prefixo à esquerda de `@@unique([tripId, studentId])` e `@@index([companyId])` é prefixo à esquerda de `@@unique([companyId, idempotencyKey])`. São puro custo de escrita no caminho de escrita mais quente do épico. (Nota: os demais models do schema usam `@@index([companyId])` por convenção, mas lá não há unique com `companyId` à esquerda.)

**Defer** (pré-existente, não causado por esta mudança):

- [x] [Review][Defer] Discriminador de P2002 do domínio routing continua quebrado [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts:24-31] — deferred, pre-existing
- [x] [Review][Defer] `route-assignment.e2e-spec.ts` vermelho na baseline por `POST /auth/login` retornar 201 onde o teste espera 200 [api/test/route-assignment.e2e-spec.ts] — deferred, pre-existing
- [x] [Review][Defer] TOCTOU: a viagem pode transicionar de ACTIVE para COMPLETED entre `findActiveTrip` e `recordCheckIn` [api/src/domains/boarding/core/use-cases/check-in.use-case.ts:40-62] — deferred, pre-existing
- [x] [Review][Defer] `ManagedRuntime` nunca descartado nos módulos e dispatch de eventos best-effort sem outbox [api/src/domains/boarding/shell/boarding.module.ts] — deferred, pre-existing

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Bug pré-existente descoberto e corrigido (bloqueava a AC #3): `EffectExceptionFilter` não desembrulhava `FiberFailure`.**
  `ManagedRuntime.runPromise()` (usado por `EffectEventDispatcher.runAndDispatch`, consumido por `boarding.service.ts`, `trip.service.ts` e `routing.service.ts`) rejeita a Promise com um `FiberFailure` que **envelopa** a `Cause` — não com o tagged error em si. O duck-typing `isDomainError()` do filtro (`_tag`/`code`/`message` nas próprias chaves do objeto) sempre falhava para esse caminho, e todo `Effect.fail(...)` que atravessava um `*.service.ts` virava `500 INTERNAL_ERROR` em vez do status HTTP declarado no tagged error. Confirmado via probe manual contra `POST /api/v1/routes/:id/students` (endpoint pré-existente da Story 2.6, não tocado por mim) — mesmo sintoma, então não é regressão desta story, é bug de infraestrutura compartilhada nunca exercitado por e2e real (não há CI). Corrigido em `api/src/domains/shared/shell/filters/effect-exception.filter.ts` com um unwrap via `Runtime.isFiberFailure` + `Cause.failureOption` antes do duck-typing. Teste de consumo adicionado em `effect-exception.filter.spec.ts` usando um `Effect.fail` real através de `Effect.runPromise` (não só um objeto tagged-error à mão) para provar o unwrap.
- **Bug pré-existente descoberto e corrigido (bloqueava as ACs #3/#4): `P2002.meta.target` vem vazio nesta versão do Prisma.**
  A Task 6.2 instruía reusar o padrão `isExpectedUniqueViolation` de `prisma-route-assignment.adapter.ts`, que inspeciona `e.meta?.target`. Nesta stack (Prisma 7.x + `@prisma/adapter-pg`, driver adapters), `meta.target` vem `undefined`; os campos do constraint só aparecem em `meta.driverAdapterError.cause.constraint.fields`, com aspas duplas literais no nome (`"tripId"`). Confirmado com probe manual contra `RouteStudent` (mesmo padrão da 2.6) — o mesmo bug já existe lá, não é regressão minha, só nunca foi exercitado com banco real em e2e. Corrigi **apenas no meu adapter novo** (`prisma-boarding.adapter.ts`, função `extractUniqueViolationFields`), que agora suporta os dois formatos. **Não toquei** `prisma-route-assignment.adapter.ts` — fora do escopo desta story; registrando aqui para o Lucas decidir se abre uma story técnica para o domínio routing.
- `test/route-assignment.e2e-spec.ts` (não tocado) falha na baseline por um bug não relacionado: `POST /api/v1/auth/login` retorna `201` (sem `@HttpCode` override) mas o teste espera `200`. Pré-existente, confirmado revertendo minhas mudanças e reproduzindo. Meu `boarding.e2e-spec.ts` já usa `.expect(201)` corretamente.
- `mobile: npx tsc --noEmit` apresenta 1 erro pré-existente (`animated-icon.web.tsx` — módulo `.css` sem types), não os "2 erros em `login.tsx`" que a story antecipava — confirmado como pré-existente via `git stash` do meu único arquivo tocado no mobile (`api.d.ts`) e reprodução idêntica antes/depois.
- `api/.env` não existia no repo (correto — nunca commitado) e foi criado localmente a partir de `.env.example` para rodar migração/testes; permanece fora do controle de versão (`.gitignore` confirmado).

### Completion Notes List

- Todas as 12 tasks e subtasks completas. Todos os 7 ACs cobertos e verificados via testes automatizados (unit + integração com banco real + e2e).
- `BoardingRecord` criado com os dois `@@unique` compostos exigidos; migração `20260814211717_add_boarding_records` aplicada e cliente Prisma regenerado.
- Use case `checkIn` implementado com a ordem exata da tabela de verdade (replay → viagem ativa → elegibilidade do aluno → persistência). 7 testes unitários, suite roda em ~15ms sem infraestrutura.
- Dois bugs pré-existentes de infraestrutura compartilhada descobertos ao integrar de ponta a ponta (ver Debug Log) — ambos bloqueavam diretamente a AC #3 desta story (códigos de erro tipados retornando 500 em vez do status HTTP correto) e foram corrigidos no escopo mínimo necessário: o filtro global (`effect-exception.filter.ts`, beneficia routing/trip/boarding igualmente) e a discriminação de P2002 local ao meu adapter novo (não toquei o adapter do routing).
- Pipe `EffectSchemaPipe` ganhou `errorCode` opcional com default preservado — os 6 usos existentes em `routing.controller.ts` continuam emitindo `VALIDATION_ERROR` sem nenhuma alteração de código lá.
- Decorator `@IdempotencyKey()` criado no shared kernel (não no boarding), pronto para reuso no Épico 4.
- Contrato (`openapi.json` + `mobile/src/types/api.d.ts`) regenerado via scripts — nunca editado à mão. Drift check (export 2x) confirmou determinismo. `check-in.dto.ts`, `qr-code-payload.dto.ts` e os handlers MSW não foram tocados.
- `trip.controller.ts` não foi modificado (confirmado por `git status` no fim da sessão) — o Prettier/`eslint --fix` reformatavam esse arquivo como efeito colateral de rodar as ferramentas no projeto inteiro; revertido manualmente após cada rodada para preservar o escopo declarado na Task 10.6.
- Verificação final: `npm run build` 0 erros · `npm test` 160/160 (144 pré-existentes + 16 novos) · `npm run test:e2e` só falha no bug pré-existente de `route-assignment.e2e-spec.ts` (não tocado) · `npm run format` limpo · `npm run lint` 149 erros/59 warnings — idêntico ao baseline documentado na story, nenhum arquivo novo/modificado aparece na saída.
- Questões Abertas (routeId sem dono, `Trip.routeId` sem FK) não bloqueiam esta story — documentadas pelo Lucas para decisão futura, nada foi antecipado.

### File List

**Novos:**
- `api/prisma/migrations/20260814211717_add_boarding_records/migration.sql`
- `api/src/domains/boarding/core/errors/boarding.errors.ts`
- `api/src/domains/boarding/core/errors/index.ts`
- `api/src/domains/boarding/core/ports/boarding-repository.port.ts`
- `api/src/domains/boarding/core/ports/trip-access.port.ts`
- `api/src/domains/boarding/core/ports/student-eligibility.port.ts`
- `api/src/domains/boarding/core/schemas/check-in.schema.ts`
- `api/src/domains/boarding/core/use-cases/check-in.use-case.ts`
- `api/src/domains/boarding/core/use-cases/check-in.use-case.spec.ts`
- `api/src/domains/boarding/shell/adapters/prisma-boarding.adapter.ts`
- `api/src/domains/boarding/shell/adapters/prisma-boarding.adapter.spec.ts`
- `api/src/domains/boarding/shell/adapters/prisma-trip-access.adapter.ts`
- `api/src/domains/boarding/shell/adapters/prisma-student-eligibility.adapter.ts`
- `api/src/domains/boarding/shell/boarding.service.ts`
- `api/src/domains/shared/shell/decorators/idempotency-key.decorator.ts`
- `api/src/domains/shared/shell/decorators/idempotency-key.decorator.spec.ts`
- `api/test/boarding.e2e-spec.ts`

**Modificados:**
- `api/prisma/schema.prisma` — +model `BoardingRecord`
- `api/src/domains/boarding/shell/boarding.module.ts` — runtime `Layer.mergeAll` + providers
- `api/src/domains/boarding/shell/http/boarding.controller.ts` — endpoint ligado, stub 501 removido
- `api/src/domains/shared/shell/pipes/effect-schema.pipe.ts` — `errorCode` opcional (default preservado)
- `api/src/domains/shared/shell/pipes/effect-schema.pipe.spec.ts` — teste de consumo do `errorCode` customizado
- `api/src/domains/shared/shell/filters/effect-exception.filter.ts` — fix: unwrap de `FiberFailure` antes do duck-typing (bug pré-existente, ver Debug Log)
- `api/src/domains/shared/shell/filters/effect-exception.filter.spec.ts` — teste de consumo com `Effect.fail` real via `ManagedRuntime`
- `api/openapi.json` — gerado (501 do check-in removido, description atualizada)
- `mobile/src/types/api.d.ts` — gerado (`npm run openapi:types`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `3-3a-check-in-de-embarque`: `ready-for-dev` → `review`

### Post-Review Change Log (2026-08-14)

Os 12 patches da code review foram aplicados numa passada. O que mudou de contrato:

**Códigos de erro novos:** `DRIVER_NOT_ASSIGNED` (403), `IDEMPOTENCY_KEY_CONFLICT` (409), `INVALID_IDEMPOTENCY_KEY` (400).
**Campo novo:** `occurredAt` opcional no request (ISO 8601), janela de 5min no futuro a 24h no passado.
**Coluna nova:** `BoardingRecord.recordedBy`.

**Correções estruturais:**

- `ActiveTripView` ganhou `driverId`, e a comparação com o motorista autenticado vive no core — filtrar por `driverId` na query colapsaria `DRIVER_NOT_ASSIGNED` em `TRIP_NOT_ACTIVE` e vazaria menos informação do que o contrato pede.
- `recordCheckIn` passou a devolver `{ created, record }`. Sem esse discriminador o use case emitia `boarding.checked_in` uma segunda vez na corrida de replay, violando a AC #5.
- A discriminação de `P2002` foi **reescrita e simplificada**: em vez de inspecionar `meta.target`/`meta.driverAdapterError` (formato interno do driver, que a versão anterior parseava com `extractUniqueViolationFields`), o adapter agora relê pela idempotency key — achou é replay, não achou é duplicata. A tabela tem exatamente dois constraints únicos, então a releitura é decisiva. Isso elimina a dependência de detalhes internos do Prisma **e** resolve o caso em que os dois constraints são violados de uma vez e o Postgres reporta só um, à sua escolha.
- Migration `20260814211717` **editada no lugar** em vez de encadear um ALTER: ela nunca foi commitada nem aplicada fora do ambiente local. Removidos também os dois `@@index` redundantes (prefixo à esquerda dos `@@unique`).
- O evento `boarding.checked_in` ganhou `companyId` e `recordedBy`, e todo o use case passou a usar uma única leitura de relógio.

**Testes:** e2e reescrito com precondições próprias por teste (`seedActiveTrip()`) — o `DUPLICATE_CHECK_IN` dependia do teste de caminho feliz ter rodado antes. Cobertura nova: isolamento multi-tenant com viagem ativa de outra empresa, viagem encerrada, motorista não-dono, conflito de key, replay após encerramento, e as quatro bordas de `occurredAt`.

**Verificação:** `npm run build` 0 erros · `npm test` **178/178** · `npm run test:e2e` 22/22 no boarding, com o `route-assignment.e2e-spec.ts` continuando vermelho pelo bug pré-existente do login (item de defer) · drift check do `openapi.json` determinístico · `mobile: npx tsc --noEmit` só o erro pré-existente de `animated-icon.web.tsx` · `npm run format` e `eslint` limpos nos arquivos tocados · `trip.controller.ts` revertido após o format, permanece intocado.

**Pendência para a trilha mobile:** `mobile/src/mocks/handlers/boarding.handlers.ts` mudou (validação de shape antes do replay, conflito de key, `occurredAt`, e o sentinela novo `MOCK_OTHER_DRIVER_TRIP_ID`). A Story 3.3b está sendo desenvolvida contra esse mock — o Dev 2 precisa ser avisado.

### Change Log

- 2026-08-14: Implementado o use case `checkIn` completo (Prisma model, core, adapters, controller) e propagado o contrato (`openapi.json` + tipos mobile). Corrigidos dois bugs pré-existentes de infraestrutura compartilhada que impediam os tagged errors de retornarem o status HTTP correto (`EffectExceptionFilter` não desembrulhava `FiberFailure`; discriminação de `P2002` usava um formato de `meta.target` que não existe nesta versão do Prisma). Status → `review`.
