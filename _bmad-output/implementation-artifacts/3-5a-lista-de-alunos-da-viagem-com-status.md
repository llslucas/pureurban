---
baseline_commit: fe50b97
branch: feat/3-5a-lista-de-alunos-da-viagem
---

# Story 3.5a: Lista de Alunos da Viagem com Status (Backend)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como sistema,
Quero expor a lista de alunos da viagem com o status de embarque agregado,
Para que o app do motorista saiba quem entrou e quem falta.

## Acceptance Criteria

1. **Given** uma viagem ativa
   **When** `GET /api/v1/trips/:id/students` é chamado por um motorista da rota
   **Then** a resposta lista todos os alunos vinculados à rota da viagem (FR22)

2. **And** cada aluno traz seu status agregado: `CHECKED_IN`, `NOT_CHECKED_IN` ou `NOT_RETURNING` (FR23)

3. **And** a resposta inclui a contagem resumida (`{ boarded, total }`) — não é calculada no cliente (FR25)

4. **And** a query responde em menos de 1 segundo com 50+ alunos na rota (NFR4)

5. **And** a lista é filtrada por `companyId` e só é acessível ao motorista atribuído à rota

6. **And** o use case do core é testado sem infraestrutura (< 100ms por suite)

**Camada:** Backend · **Depende de:** 3.0 (done), 3.3a (done) · **FRs:** FR22, FR23, FR25 · **NFRs:** NFR4, NFR17 · **Bloqueia:** 3.6

---

## 🚨 O bloqueador que você vai encontrar primeiro — leia antes de tudo

**Hoje, os quatro endpoints do `TripController` retornam `401 MISSING_TENANT` para qualquer requisição.** Não é hipótese; é consequência mecânica de duas linhas:

```ts
// api/src/domains/trip/shell/http/trip.controller.ts:29-35
// TODO: habilitar JwtAuthGuard quando Epic 2 (Auth) estiver pronto
@UseGuards(TenantGuard, RolesGuard)   // ← JwtAuthGuard ausente
@Roles(['driver'])                    // ← minúsculo
```

1. Sem `JwtAuthGuard`, o Passport nunca popula `request.user`. O `TenantGuard` (`shared/shell/guards/tenant.guard.ts:14-20`) lança `401 MISSING_TENANT` quando `request.user` é `undefined`. **Todo request morre aí.**
2. Se o guard fosse ligado, `@Roles(['driver'])` ainda barraria tudo com `403 FORBIDDEN`: o `role` do JWT vem do enum Prisma `Role`, que é **UPPERCASE** (`ADMIN | DRIVER | STUDENT`), e o `RolesGuard` compara com `===` estrito (`roles.guard.ts:26-30`).

Não existe `api/test/trip.e2e-spec.ts` — por isso ninguém percebeu. O Épico 2 terminou em 10/05 e este TODO ficou.

**Esta story não pode contornar isso.** A AC #5 exige saber *qual motorista* está pedindo a lista, e essa identidade só existe em `req.user.userId`, que só existe com o `JwtAuthGuard` ligado. Consertar os guards é a **Task 1**, não um extra.

Escopo do conserto: **exatamente** as três linhas acima mais o `@ApiBearerAuth()` a nível de classe. Nada de mexer no `TRIP_NOT_OWNED` do `endTrip` (ver Questões Abertas #1).

---

## Tabela de Verdade do Endpoint — a referência única

Extraída do `api/openapi.json` commitado **e** do handler MSW `mobile/src/mocks/handlers/boarding.handlers.ts:208-230`, que a trilha mobile já consome. Divergir dela quebra a Story 3.6.

| Ordem | Condição | HTTP | `error.code` |
|---|---|---|---|
| 1 | Sem `Authorization: Bearer` válido | 401 | `HTTP_ERROR` (Passport → `EffectExceptionFilter` branch 2) |
| 2 | Token válido, `role != DRIVER` | 403 | `FORBIDDEN` (`RolesGuard`) |
| 3 | Viagem inexistente **ou** de outra empresa | 404 | `TRIP_NOT_FOUND` |
| 4 | Viagem existe, mas o motorista autenticado não é o `driverId` dela | 403 | `DRIVER_NOT_ASSIGNED` |
| 5 | Caminho feliz — viagem `ACTIVE` **ou** `COMPLETED` | 200 | — |

**Quatro decisões embutidas nessa tabela. Nenhuma é negociável dentro desta story:**

- **`:id` desconhecido → 404 `TRIP_NOT_FOUND`, não 409.** O check-in da 3.3a responde `409 TRIP_NOT_ACTIVE` para viagem inexistente porque **o contrato daquele endpoint não declara 404**. Este declara 404 e **não** declara 409. Os dois estão certos, cada um no seu contrato. Não "harmonize" — harmonizar é drift.
- **Não existe 400 neste endpoint.** `trips.id` é coluna `TEXT` (`migrations/20260411003947_add_trip_entities/migration.sql:9`), não `uuid` — um `:id` malformado não estoura cast no Postgres, só não encontra nada. Portanto **não** valide o param com pipe/schema: um UUID inválido cai naturalmente na linha 3. Adicionar um 400 seria inventar um código que o contrato não declara e que o mock não produz.
- **Viagem de outra empresa → 404, nunca 403.** O isolamento acontece no `where: { id, companyId }` do `findById`; para o cliente, viagem alheia é indistinguível de inexistente. Responder `DRIVER_NOT_ASSIGNED` vazaria a existência da viagem de outro tenant.
- **Viagem `COMPLETED` responde 200, não erro.** O motorista precisa poder revisar a lista depois de encerrar a viagem, e o mock devolve o roster para `MOCK_INACTIVE_TRIP_ID` (`boarding.handlers.ts:59`, que está no `rosters`). O filtro `status: 'ACTIVE'` existe no check-in (`prisma-trip-access.adapter.ts:24`) e **não** deve ser replicado aqui. Use `TripRepository.findById`, que não filtra status.

**Sobre a linha 4 — é mudança de contrato consciente.** O `openapi.json` declara o 403 deste endpoint só como "Acesso negado — somente motoristas", e o mock devolve **200** para `MOCK_OTHER_DRIVER_TRIP_ID`. Manter assim significaria que qualquer motorista da empresa lê a lista de embarque de qualquer viagem — inclusive nomes de crianças de outra rota — enquanto o **check-in da mesma viagem** já rejeita esse motorista com `DRIVER_NOT_ASSIGNED` (decisão do Lucas na review da 3.3a, 14/08). Um endpoint que deixa ler o que o endpoint irmão não deixa escrever é incoerente. A Task 8 propaga: contrato, tipos do mobile e mock.

---

## Tasks / Subtasks

- [x] **Task 1 — Shell: consertar os guards do `TripController`** (AC: #5 — pré-requisito de todas as outras)
  - [x] 1.1 Em `api/src/domains/trip/shell/http/trip.controller.ts`: adicionar `JwtAuthGuard` como **primeiro** guard — `@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)`. A ordem importa: o `TenantGuard` lê `request.user`, que só existe depois do Passport. Importar de `../../../auth/shell/guards/jwt-auth.guard.js` (o `BoardingController` faz exatamente isso — copiar de lá).
  - [x] 1.2 `@Roles(['driver'])` → `@Roles(['DRIVER'])`.
  - [x] 1.3 Remover as duas linhas de comentário `// TODO: habilitar JwtAuthGuard quando Epic 2 (Auth) estiver pronto` e o `// import { JwtAuthGuard } ...` comentado logo abaixo.
  - [x] 1.4 Mover `@ApiBearerAuth()` para **nível de classe** (junto do `@ApiTags('trips')`) e **remover** o `@ApiBearerAuth()` de método que hoje existe só no `getStudents`, junto do comentário de 3 linhas que o justificava. Consequência esperada e desejada no `openapi.json`: `security: [{ bearer: [] }]` passa a aparecer também em `TripController_create`, `_end` e `_getActive` — hoje as três declaram autenticação nenhuma, o que é mentira sobre o sistema.
  - [x] 1.5 **Não** alterar mais nada neste passo: nem os `@ApiResponse` dos outros três métodos, nem o `TRIP_NOT_OWNED` do `endTrip` (Questões Abertas #1).
  - [x] 1.6 Efeito colateral esperado e correto: `POST /trips`, `PATCH /trips/:id/end` e `GET /trips/active` saem de "401 sempre" para funcionais com token de motorista. Isso é conserto, não regressão — mas exige a rede de teste da Task 9.2 antes de você confiar nele.

- [x] **Task 2 — Core: ports novos no domínio `trip`** (AC: #1, #2)
  - [x] 2.1 `api/src/domains/trip/core/ports/trip-roster.port.ts` — visão anticorrupção do roster da rota:

    ```typescript
    import { Context, Effect } from 'effect';

    export interface RosterStudent {
      studentId: string;
      name: string;
    }

    export interface TripRosterApi {
      // Alunos ATIVOS vinculados à rota, da mesma empresa. Lista vazia quando
      // a rota não tem vínculos — nunca erro.
      findRouteStudents(
        routeId: string,
        companyId: string,
      ): Effect.Effect<RosterStudent[]>;
    }

    export class TripRoster extends Context.Tag('TripRoster')<
      TripRoster,
      TripRosterApi
    >() {}
    ```

  - [x] 2.2 `api/src/domains/trip/core/ports/boarding-status.port.ts`:

    ```typescript
    import { Context, Effect } from 'effect';

    export interface CheckedInStudent {
      studentId: string;
      checkedInAt: Date;
    }

    export interface BoardingStatusApi {
      // Check-ins registrados nesta viagem. A EXISTÊNCIA do registro é o
      // CHECKED_IN — não há coluna status em boarding_records (3.3a, Task 1.4).
      findCheckedInByTrip(
        tripId: string,
        companyId: string,
      ): Effect.Effect<CheckedInStudent[]>;
    }

    export class BoardingStatus extends Context.Tag('BoardingStatus')<
      BoardingStatus,
      BoardingStatusApi
    >() {}
    ```

  - [x] 2.3 Ambos com `R = never` — o `PrismaService` entra pelo DI do NestJS no adapter, nunca pelo contexto do Effect. Padrão desde a 3.1.
  - [x] 2.4 **Nenhum arquivo de erro novo.** Os dois erros desta story já existem: `TripNotFound` (404) vem do `TripRepository.findById`, e `DriverNotAssigned` já está declarado e **não usado** em `trip/core/errors/trip.errors.ts:31-37`. Criar `TripNotFoundError`/`DriverNotAssignedError` novos no boarding ou no trip é reinvenção.
  - [x] 2.5 Formas proibidas de resolver o mesmo problema — todas já rejeitadas por precedente:

    | Abordagem | Veredito |
    |---|---|
    | `trip/core` importar `BoardingRepository` de `boarding/core` | ❌ acopla os cores. Precedente inverso na 3.3a: o boarding declarou `TripAccess` em vez de importar `TripRepository` |
    | JOIN Prisma entre `trip.trips`, `boarding.boarding_records` e `routing.route_students` | ❌ os schemas PostgreSQL são a barreira física do DDD (project-context, Architecture §3) |
    | `TripService` injetar `BoardingService` via `imports: [BoardingModule]` | ❌ acopla módulos NestJS para atravessar uma fronteira que os ports já atravessam corretamente |
    | `trip/core` declara os ports que **ele** precisa; adapters de `trip/shell` fazem queries separadas | ✅ **é este** |

- [x] **Task 3 — Core: use case `getTripStudents`** (AC: #1, #2, #3, #5, #6)
  - [x] 3.1 Criar `api/src/domains/trip/core/use-cases/get-trip-students.use-case.ts`. O nome do arquivo é o que a Architecture §7 já previu para este domínio — não inventar outro.

    ```typescript
    export type TripBoardingStatus = 'CHECKED_IN' | 'NOT_CHECKED_IN';

    export interface TripStudentView {
      studentId: string;
      name: string;
      status: TripBoardingStatus;
      checkedInAt: Date | null;
    }

    export interface TripStudentsView {
      students: TripStudentView[];
      summary: { boarded: number; total: number };
    }

    export const getTripStudents = (input: {
      tripId: string;
      driverId: string;
      tenantId: string;
    }): Effect.Effect<
      WithEvents<TripStudentsView>,
      TripNotFound | DriverNotAssigned,
      TripRepository | TripRoster | BoardingStatus
    > => Effect.gen(function* () { ... });
    ```

  - [x] 3.2 Corpo, nesta ordem (linhas 3→5 da tabela de verdade):
    1. `repo.findById(input.tripId, input.tenantId)` → propaga `TripNotFound` (404, code `TRIP_NOT_FOUND` — já é o que o adapter constrói em `prisma-trip.adapter.ts:61`).
    2. `if (trip.driverId !== input.driverId)` ⇒ `Effect.fail(new DriverNotAssigned({ code: 'DRIVER_NOT_ASSIGNED', message: 'Motorista não é o responsável por esta viagem' }))`. **Sem `details`** — o mock devolve `{ error: { code, message } }` puro e a 3.6 compara corpo com corpo. `DriverNotAssigned` já carrega `httpStatus = 403`.
    3. As duas leituras em paralelo:
       ```typescript
       const [roster, checkedIn] = yield* Effect.all(
         [
           tripRoster.findRouteStudents(trip.routeId, input.tenantId),
           boardingStatus.findCheckedInByTrip(trip.id, input.tenantId),
         ],
         { concurrency: 2 },
       );
       ```
       Sequencial também passaria no NFR4, mas são duas queries independentes; serializar é desperdício gratuito no caminho mais chamado do épico.
    4. `const checkedInBy = new Map(checkedIn.map((c) => [c.studentId, c.checkedInAt]));` — **Map, nunca `roster.map(s => checkedIn.find(...))`**. Com 50 alunos o `find` aninhado é O(n·m) e o padrão vaza para listas maiores.
    5. Projetar o roster (`checkedInBy.get(studentId)` presente ⇒ `CHECKED_IN` + `checkedInAt`; ausente ⇒ `NOT_CHECKED_IN` + `null`).
    6. Ordenar **no core**, sobre uma cópia, determinístico: `name` asc via `localeCompare(b.name, 'pt-BR')`, desempate por `studentId` asc. Determinismo é o que torna a lista testável e evita a lista "pulando" entre refreshes na tela da 3.5b.
    7. `summary.boarded` = quantos ficaram `CHECKED_IN`; `summary.total` = `students.length`. **Derivados da lista projetada**, nunca de `checkedIn.length` — ver 3.3.
    8. `return noEvents(view)` — leitura não emite evento de domínio (acordo de time da retro do Épico 2: use case **sempre** retorna `WithEvents`).
  - [x] 3.3 **Registro de check-in de aluno que não está no roster é ignorado.** Acontece quando o aluno é desvinculado da rota ou desativado depois de embarcar. Se `boarded` viesse de `checkedIn.length`, a tela mostraria "5/4 embarcados". A fonte de verdade da lista é o roster; os check-ins só a colorem.
  - [x] 3.4 **`NOT_RETURNING` não é produzido nesta story.** A entidade de ausência é do Épico 4 (Story 4.1a) e não existe no schema. O valor continua no `enum` do DTO porque o contrato é o mesmo — a 3.5b já renderiza os três estados contra o mock. O tipo do **core** tem só dois valores de propósito: um terceiro valor inalcançável mentiria para o compilador e para quem ler o código. A 4.1a estende `TripBoardingStatus` e adiciona um terceiro port. **Não antecipar nada disso.**
  - [x] 3.5 Nenhuma regra nova sobre `trip.status` no core: a tabela de verdade responde 200 para `ACTIVE` e `COMPLETED`.

- [x] **Task 4 — Core: spec do use case** (AC: #6)
  - [x] 4.1 `get-trip-students.use-case.spec.ts` seguindo `routing/core/use-cases/assign-student.use-case.spec.ts` e `boarding/core/use-cases/check-in.use-case.spec.ts` (`Layer.succeed` + `Effect.provide` + `Effect.either`, mocks com `vi.fn()`). Casos obrigatórios:
    - feliz: 3 alunos, 1 com check-in ⇒ status corretos, `checkedInAt` da data do registro, `summary { boarded: 1, total: 3 }`, `events.length === 0`
    - roster vazio ⇒ `students: []`, `summary { boarded: 0, total: 0 }` (e **não** erro)
    - `TripNotFound` propagado quando `findById` falha — e `findRouteStudents` **nunca chamado** (`expect(roster.findRouteStudents).not.toHaveBeenCalled()`)
    - `DriverNotAssigned` quando `trip.driverId !== driverId` — e nenhum dos dois ports de leitura chamado
    - check-in de `studentId` fora do roster ⇒ ignorado; `boarded` não conta
    - `findRouteStudents` recebe o `routeId` **vindo da viagem** e o `companyId` do tenant — não do input do cliente (o cliente só manda `:id`)
    - ordenação: roster fora de ordem entra, sai ordenado por nome; dois nomes iguais desempatam por `studentId`
    - viagem `COMPLETED` ⇒ 200 com a lista (nenhuma checagem de status no core)
  - [x] 4.2 Suite sem infraestrutura, < 100ms (AC #6).

- [x] **Task 5 — Shell: adapters** (AC: #1, #4, #5)
  - [x] 5.1 `api/src/domains/trip/shell/adapters/prisma-trip-roster.adapter.ts` — `implements TripRosterApi` (a **interface**, nunca a `Context.Tag` — lição dos Debug Logs da 3.1), `constructor(private readonly prisma: PrismaService)`. **Duas queries separadas, sem `include` cross-schema**, espelhando `boarding/shell/adapters/prisma-student-eligibility.adapter.ts`:

    ```typescript
    const links = await prisma.routeStudent.findMany({
      where: { routeId, companyId },
      select: { studentId: true },
    });
    if (links.length === 0) return [];
    const students = await prisma.user.findMany({
      where: {
        id: { in: links.map((l) => l.studentId) },
        companyId,
        role: 'STUDENT',
        isActive: true,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return students.map((s) => ({ studentId: s.id, name: s.name }));
    ```

    O early-return evita um `IN ()` degenerado. `select` explícito sempre — nunca `include` (retro do Épico 2: "type assertions mentem em silêncio"; foi assim que `companyId` vazou no tipo da 2.6). O `orderBy` no banco é redundante com a ordenação do core e é intencional: mantém o resultado estável mesmo se alguém trocar a ordenação do core.
  - [x] 5.2 **Alunos inativos ficam fora da lista.** É o mesmo filtro que `routing`'s `findStudentsByRoute` (`prisma-route-assignment.adapter.ts:245`) e o mesmo que a elegibilidade de check-in exige (`prisma-student-eligibility.adapter.ts`). Um aluno desativado não pode embarcar; listá-lo como "não embarcou" para sempre seria mentira operacional para o motorista.
  - [x] 5.3 `api/src/domains/trip/shell/adapters/prisma-boarding-status.adapter.ts`:

    ```typescript
    prisma.boardingRecord.findMany({
      where: { tripId, companyId },
      select: { studentId: true, checkedInAt: true },
    });
    ```

    **Sempre** com `companyId` (multi-tenancy, regra absoluta — NFR17). Um adapter de `trip/shell/` lendo `boarding.boarding_records` é permitido e intencional — ver Dev Notes, "Fronteiras entre Bounded Contexts".
  - [x] 5.4 Os dois adapters: `Effect.tryPromise({ try, catch: toInfraError(...) })` + `Effect.orDie`, copiando o helper `toInfraError` local de `prisma-trip-access.adapter.ts`. Nenhum erro de domínio sai daqui — os dois ports declaram `Effect.Effect<T>` sem canal de erro.
  - [x] 5.5 Índices (nenhuma migração nesta story — confira, não crie):
    - `boarding_records` por `tripId`: prefixo à esquerda de `@@unique([tripId, studentId])` ✅
    - `route_students` por `routeId`: prefixo à esquerda de `@@unique([routeId, studentId])` ✅
    - `users` por `id IN (...)`: chave primária ✅

- [x] **Task 6 — Shell: module e service** (AC: #1, #3)
  - [x] 6.1 `api/src/domains/trip/shell/trip.module.ts` — adicionar os dois adapters em `providers` e ao `useFactory` do `TRIP_RUNTIME`. Três layers ⇒ **`Layer.mergeAll(a, b, c)`** (`Layer.merge` só aceita dois; o `boarding.module.ts` já tem a variante de três — copiar de lá). Atualizar o `inject: [...]` com os três adapters.
  - [x] 6.2 `api/src/domains/trip/shell/trip.service.ts` — **trocar `ManagedRuntime.ManagedRuntime<any, never>` por um contexto tipado**, espelhando `boarding.service.ts:11-23`:

    ```typescript
    type TripRuntimeContext = TripRepository | TripRoster | BoardingStatus;
    ```

    Isto **não** é limpeza opcional. Com `any`, o compilador aceita executar um use case que exige um layer que o runtime não provê, e a falha só aparece em runtime como `Service not found: TripRoster`. Esta story adiciona exatamente dois layers novos — é o momento em que esse `any` cobraria o preço.
  - [x] 6.3 Método novo no `TripService`:

    ```typescript
    async getTripStudents(tripId: string, driverId: string, tenantId: string) {
      const view = await this.eventDispatcher.runAndDispatch(
        this.runtime,
        getTripStudents({ tripId, driverId, tenantId }),
      );
      return {
        students: view.students.map((s) => ({
          studentId: s.studentId,
          name: s.name,
          status: s.status,
          checkedInAt: s.checkedInAt ? s.checkedInAt.toISOString() : null,
        })),
        summary: view.summary,
      };
    }
    ```

    Mapeamento explícito campo a campo — nunca `...spread` do objeto do core. `Date → ISO 8601 UTC` acontece **aqui**, na borda (Architecture §6). O `ResponseWrapperInterceptor` global envelopa em `{ data, meta }` sozinho; o service retorna o objeto cru.

- [x] **Task 7 — Shell: ligar o endpoint** (AC: #1, #5)
  - [x] 7.1 Em `trip.controller.ts`, substituir `getStudents(): never { throw new NotImplementedException(...) }` por:

    ```typescript
    async getStudents(
      @Param('id') id: string,
      @TenantId() tenantId: string,
      @Req() req: Request & { user: { userId: string } },
    ) {
      return this.tripService.getTripStudents(id, req.user.userId, tenantId);
    }
    ```

    O motorista vem do token, **nunca** de query param ou body — é ele que autoriza a leitura.
  - [x] 7.2 Remover o `@ApiResponse({ status: 501, ... })` **apenas** deste método, e o import de `NotImplementedException` se ficar órfão.
  - [x] 7.3 Atualizar a `description` do `@ApiOperation`: sai "Contrato declarado — implementação na Story 3.5a".
  - [x] 7.4 Atualizar a `description` do `@ApiResponse({ status: 403 })` para nomear os dois códigos: `FORBIDDEN` (role diferente de DRIVER) e `DRIVER_NOT_ASSIGNED` (motorista não é o responsável pela viagem). O 404 continua `TRIP_NOT_FOUND`. **Não** adicionar `@ApiResponse` de 400 nem de 409 — este endpoint não os produz.
  - [x] 7.5 `@Get(':id/students')` continua **depois** de `@Get('active')` no arquivo. Rotas literais antes de rotas `:id` — lição da 2.6, custa nada e quebra silenciosamente.
  - [x] 7.6 **Não** validar `:id` com pipe/schema — ver tabela de verdade, terceira decisão.

- [x] **Task 8 — Contrato: propagar e alinhar o mock** (AC: #5)
  - [x] 8.1 `cd api && npm run openapi:export`. Diff esperado no `api/openapi.json`, todo ele intencional:
    - `TripController_getStudents`: some o `501`, muda a `description` da operação e a do `403`
    - `TripController_create`, `_end`, `_getActive`: ganham `security: [{ bearer: [] }]` (Task 1.4)

    Commitar. Se aparecer qualquer outra coisa no diff, pare e entenda antes de seguir.
  - [x] 8.2 `cd mobile && npm run openapi:types` para regenerar `src/types/api.d.ts`. Commitar. **Nunca** editar à mão (Architecture §8, regra 11).
  - [x] 8.3 `cd mobile && npx tsc --noEmit`. Os handlers MSW são tipados contra `operations['TripController_getStudents']` — se o typecheck quebrar, a mudança de contrato quebrou a trilha mobile e se resolve **neste PR**. Baseline conhecido: **1 erro pré-existente** em `animated-icon.web.tsx` (módulo `.css` sem types), confirmado na 3.3a.
  - [x] 8.4 Alinhar o mock — `mobile/src/mocks/handlers/boarding.handlers.ts`, handler `http.get('*/api/v1/trips/:id/students')`: devolver `403 DRIVER_NOT_ASSIGNED` quando `tripId === MOCK_OTHER_DRIVER_TRIP_ID`, **antes** do lookup do roster. O sentinela e a constante já existem (criados na review da 3.3a); é um `if` de 3 linhas espelhando o que o handler de check-in já faz nas linhas 148-153. Sem isso, a 3.5b renderiza um estado que a API real não produz e a 3.6 quebra.
  - [x] 8.5 **Avisar o Dev 2** — a 3.5b consome esse handler.
  - [x] 8.6 Drift check manual (o CI ainda não existe — Architecture §12): rodar `npm run openapi:export` uma 2ª vez e conferir `git diff --exit-code api/openapi.json`.

- [x] **Task 9 — Testes** (AC: todos)
  - [x] 9.1 Specs de integração dos dois adapters, com banco **real** (`docker compose up -d`; mocks de banco são proibidos pelo project-context), seguindo `prisma-boarding.adapter.spec.ts`:
    - `findRouteStudents`: retorna só alunos `isActive` e `role STUDENT`; ignora aluno de outra empresa; rota sem vínculo ⇒ `[]`
    - `findCheckedInByTrip`: só registros da viagem pedida; `companyId` de outra empresa ⇒ `[]`
  - [x] 9.2 **`api/test/trip.e2e-spec.ts` — arquivo novo, é onde a Task 1 vira rede de segurança.** Espelhar a estrutura de `boarding.e2e-spec.ts` (registro de empresa → admin → driver → rota → vínculos, com `stamp = Date.now()` nos e-mails e `seedActiveTrip()` semeando a precondição **dentro de cada teste** — a 3.3a teve que reescrever o e2e justamente por acoplamento de ordem). Cobrir:
    - **Regressão dos guards:** `POST /api/v1/trips` sem token ⇒ 401; com token de **aluno** ⇒ 403; com token de motorista ⇒ 201. `GET /api/v1/trips/active` com token de motorista ⇒ 200. Sem esses três, a Task 1 não tem prova.
    - Lista: caminho feliz com 1 de 3 embarcados ⇒ status corretos e `summary { boarded: 1, total: 3 }`
    - `:id` inexistente ⇒ 404 `TRIP_NOT_FOUND`; `:id` malformado (`'nao-e-uuid'`) ⇒ 404, **não** 400
    - Viagem de **outra empresa** ⇒ 404 (não 403) — semear uma segunda empresa, como `boarding.e2e-spec.ts` já faz
    - Segundo motorista da **mesma** empresa ⇒ 403 `DRIVER_NOT_ASSIGNED` (prova que não é isolamento de tenant disfarçado)
    - Viagem `COMPLETED` ⇒ 200 com a lista
    - **Integração real com a 3.3a:** `POST /boarding/check-in` e, em seguida, `GET /trips/:id/students` refletindo `CHECKED_IN` com o mesmo `checkedInAt`
    - Aluno desativado após o check-in ⇒ some da lista e **não** conta em `boarded`
  - [x] 9.3 **NFR4 (AC #4):** semear 50 alunos vinculados à rota, metade com check-in, e medir o `GET` com `Date.now()` antes/depois — asserção `< 1000ms`. Rodar contra banco real. Se falhar, o suspeito é N+1 no adapter, não o banco.
  - [x] 9.4 Login nos e2e novos: `POST /api/v1/auth/login` retorna **201** (não há `@HttpCode` override). Usar `.expect(201)` — foi exatamente esse detalhe que deixou `route-assignment.e2e-spec.ts` vermelho na baseline. **Não silenciar falha com early-return de token ausente** (foi assim que a 2.6 mascarou o bug do `RolesGuard`).
  - [x] 9.5 Verificação final:
    - `cd api && npm run build` — 0 erros
    - `cd api && npm test` — baseline **178/178** verdes + os novos (exige Postgres no ar por causa de `prisma.service.spec.ts`)
    - `cd api && npm run test:e2e` — os novos verdes; `route-assignment.e2e-spec.ts` continua vermelho pelo bug pré-existente de login (item de defer, não seu)
    - `npm run format` limpo; `npm run lint` com baseline de ~149 erros/59 warnings **pré-existentes** — o critério é que **nenhum arquivo novo ou modificado desta story** apareça na saída
    - `cd mobile && npx tsc --noEmit` — só o erro pré-existente de `animated-icon.web.tsx`

### Review Findings

_Code review adversarial de 2026-08-15 — 3 camadas (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 5 decision-needed, 7 patch, 5 defer, 5 dismissed._

_Resolução: o Lucas optou por **corrigir tudo**. Os 12 itens acionáveis foram aplicados; os 5 defer seguem registrados em `deferred-work.md`._

- [x] [Review][Decision] **A garantia de AC #5 é contornável: `startTrip` não valida `routeId` contra `route_drivers`** — `get-trip-students.use-case.ts:39` autoriza por `trip.driverId`, mas `start-trip.use-case.ts:36-43` cria viagem com `routeId` vindo do cliente sem verificar existência, empresa ou vínculo do motorista com a rota (`Trip.routeId` sem FK). A Task 1 acabou de tornar `POST /trips` alcançável pela primeira vez, então o caminho `POST /trips {routeId: X}` → `GET /trips/:id/students` existe de fato. Mitigação prática: `GET /routes` e `GET /routes/:id` são ADMIN-only, então um motorista só enumera as próprias rotas via `GET /routes/mine` — precisaria adivinhar o UUID de outra rota. A Questão Aberta #3 discute o eixo "motorista da rota vs. da viagem" mas não registra que a checagem é contornável.
- [x] [Review][Decision] **Não existe `ValidationPipe` global na API — `POST /trips`, recém-exposto, transforma payload inválido em 500** — `grep -r "ValidationPipe|useGlobalPipes|APP_PIPE" src/` não retorna nada e `main.ts` não registra pipe algum. `@IsUUID()`/`@IsEnum()` de `create-trip.dto.ts` são decorativos: `{type: 'BOGUS'}` chega no `prisma.trip.create`, estoura, e `Effect.orDie` devolve 500. Já consta do `deferred-work.md` (review da 3.0) com escopo atribuído à 3.3a — que fechou sem tratar. A 3.5a é a primeira story que torna um endpoint de escrita não validado alcançável por cliente real.
- [x] [Review][Decision] **Aluno desativado depois de embarcar some da lista e do `boarded`** — `get-trip-students.use-case.ts:60-70` projeta estritamente sobre o roster e `prisma-trip-roster.adapter.ts:35-38` filtra `isActive: true`. `test/trip.e2e-spec.ts:411-425` consagra `summary { boarded: 0, total: 0 }` com o `boarding_record` existindo. A Task 5.2 decidiu isso conscientemente; a consequência operacional é que uma criança fisicamente no veículo desaparece da tela do motorista.
- [x] [Review][Decision] **`POST /trips`, `PATCH /:id/end` e `GET /active` passaram a declarar `bearer` sem declarar o 401/403 que produzem** — `api/openapi.json` após a Task 1.4: `create` → `[201,403,409]`, `end` → `[200,400,404]`, `getActive` → `[200]`, todos com `security: [{bearer:[]}]`. `mobile/src/types/api.d.ts` regenerado não tem ramo 401 para endpoints que agora rejeitam requisição não autenticada. A Task 1.5 proibiu explicitamente tocar nesses `@ApiResponse`.
- [x] [Review][Decision] **404 `TRIP_NOT_FOUND` sai com `details` e o mock MSW devolve `{ code, message }` puro** — `prisma-trip.adapter.ts:64` monta `details: { tripId: id }` e o `EffectExceptionFilter` espalha no corpo; `boarding.handlers.ts:224` emite sem `details`. `DriverNotAssigned` foi construído sem `details` justamente por isso (Task 3.2, passo 2), mas o 404 do mesmo endpoint não foi. É contrato-legal (`ErrorResponseDto.details` é opcional) e o produtor é pré-existente — só ficou alcançável porque o stub 501 saiu. Risco direto para a comparação corpo-a-corpo da 3.6.

- [x] [Review][Patch] `PATCH /trips/:id/end` está no título do `describe` mas nenhum teste o chama — o único outro endpoint mutador que a Task 1 tornou alcançável ficou sem rede [api/test/trip.e2e-spec.ts:168]
- [x] [Review][Patch] O filtro `companyId` da 2ª query do roster nunca é exercitado: o teste varia o `companyId` da *chamada*, que já curto-circuita no early-return da 1ª query — vínculo em A apontando para `users` em B fica sem cobertura [api/src/domains/trip/shell/adapters/prisma-trip-roster.adapter.spec.ts:138-150]
- [x] [Review][Patch] Testes de 401/403 verificam só o status, nunca `error.code` — as linhas 1 (`HTTP_ERROR`) e 2 (`FORBIDDEN`) da Tabela de Verdade ficam sem prova [api/test/trip.e2e-spec.ts:172,179,201,208]
- [x] [Review][Patch] `POST /trips ⇒ 201` tem acoplamento de ordem: passa só porque roda antes de qualquer `seedActiveTrip()`; com `.only`, shuffle ou retry vira 409 `TRIP_ALREADY_ACTIVE` — exatamente o que o comentário da linha 73 se gaba de evitar [api/test/trip.e2e-spec.ts:182]
- [x] [Review][Patch] NFR4 mede amostra única sem warmup: a primeira requisição paga pool frio e JIT, e a asserção `< 1000ms` flaca em runner de CI [api/test/trip.e2e-spec.ts:483-489]
- [x] [Review][Patch] Seed do NFR4 grava 50 linhas inválidas na face: `faker.internet.email() + randomUUID()` cola UUID depois do TLD e `password: 'hash'` entra em texto puro numa coluna que todo o resto do sistema bcrypta [api/test/trip.e2e-spec.ts:453-461]
- [x] [Review][Patch] O early-return novo tornou a entrada de roster de `MOCK_OTHER_DRIVER_TRIP_ID` inalcançável nos dois handlers, e o comentário que a justifica ficou obsoleto [mobile/src/mocks/handlers/boarding.handlers.ts:50 vs :210-216]

- [x] [Review][Defer] Suite e2e não limpa nada: ~57 usuários, 2 empresas, rotas, viagens e 25 boarding records ficam no banco a cada execução [api/test/trip.e2e-spec.ts:160-166] — deferred, pré-existente (`boarding.e2e-spec.ts:206-212` tem exatamente o mesmo `afterAll`)
- [x] [Review][Defer] JWT nunca é revalidado contra `isActive`/`role`: motorista desligado continua listando alunos até o token expirar [api/src/domains/auth/shell/strategies] — deferred, pré-existente
- [x] [Review][Defer] `toInfraError` foi copiado para o terceiro e quarto adapters em vez de viver em `shared/shell` [api/src/domains/trip/shell/adapters/prisma-trip-roster.adapter.ts:9, prisma-boarding-status.adapter.ts:8] — deferred, pré-existente (a Task 5.4 prescreveu copiar)
- [x] [Review][Defer] `@Req() req: Request & { user: ... }` resolve para o `Request` global do DOM, não o do Express — funciona só porque a metade não usada nunca é checada estruturalmente [api/src/domains/trip/shell/http/trip.controller.ts:48,68,79,117] — deferred, pré-existente (copiado de `boarding.controller.ts`)
- [x] [Review][Defer] Nada amarra a resposta em runtime ao DTO publicado: o service devolve literal com tipo inferido, o controller não tem anotação de retorno e `ErrorBodyDto.code` é `string` cru [api/src/domains/trip/shell/trip.service.ts:54-67] — deferred, pré-existente

#### Resolução das decisões — o que mudou no código depois da review

Três das cinco decisões **revogam regras escritas nas Tasks acima**. As Tasks ficam como registro histórico; o que vale é esta seção.

1. **Autorização de rota no `startTrip`** — port `RouteAccess` + `PrismaRouteAccessAdapter` novos no domínio `trip`. `startTrip` agora falha com `DriverNotAssigned` (403) quando o motorista não está em `routing.route_drivers` para aquela rota, **antes** de checar viagem ativa. Fecha o desvio: `trip.driverId` só é uma credencial confiável porque agora ninguém cria viagem numa rota alheia. Contrato: `POST /trips` passa a declarar 403 `DRIVER_NOT_ASSIGNED`. Rota inexistente cai no mesmo 403 (não há FK para distinguir).
2. **`ValidationPipe` global** — registrado como `APP_PIPE` em `app.module.ts` (e não em `main.ts`, para valer nos e2e, que montam a app pelo `AppModule`). **Sem `whitelist` e sem `transform`**: cinco controllers decodificam o `@Body` com `EffectSchemaPipe` e essas classes não têm metadata do class-validator — `whitelist: true` apagaria as propriedades de login, register, refresh, rotas e check-in. Payload inválido em `POST /trips` agora é 400, não 500. Encerra o item que estava no `deferred-work.md` desde a review da 3.0.
3. **Revoga a Task 3.3** — check-in de aluno fora do roster **não é mais ignorado**. `CheckedInStudent` ganhou `name`, o `PrismaBoardingStatusAdapter` faz uma 2ª query em `auth.users` (com `companyId`, **sem** `isActive`), e o use case anexa à lista quem embarcou mas saiu do roster. Entra no `boarded` **e** no `total`, então `boarded <= total` continua garantido — o problema do "5 de 4" que motivou a Task 3.3 não volta. A Task 5.2 continua valendo para quem **não** embarcou: aluno inativo sem check-in segue fora da lista.
4. **Contrato dos três endpoints da Task 1** — `create`, `end` e `getActive` passaram a declarar 401 e 403 (e 400 no `create`). Revoga a proibição da Task 1.5, que impedia tocar nesses `@ApiResponse`.
5. **Paridade de corpo do 404** — resolvido na direção **oposta** à proposta: o tipo gerado do mobile declara `details` como `Record<string, never>` (defeito de geração já registrado no defer da 3.0), então o mock é estruturalmente incapaz de emitir o campo. Removido o `details: { tripId }` das duas construções de `TripNotFound` em `prisma-trip.adapter.ts` — era redundante com o path e com a mensagem. **Afeta também o 404 do `PATCH /trips/:id/end`**, agora coberto por e2e. O mock passou a usar a mensagem exata da API.

Verificação após as correções: `npm run build` 0 erros · `npm test` **201/201** (44 arquivos) · `npm run test:e2e` **24/24** no `trip.e2e-spec.ts`, único vermelho é o `route-assignment.e2e-spec.ts` da baseline (login 201 vs 200) · `openapi:export` idempotente · `mobile: npx tsc --noEmit` só o erro conhecido de `animated-icon.web.tsx` · eslint sem nenhum arquivo desta story na saída.

---

## Dev Notes

### Fronteiras entre Bounded Contexts — o espelho da 3.3a

Esta é a segunda operação do sistema a atravessar três contextos, e ela atravessa **na direção oposta** à do check-in:

| | Story 3.3a (check-in) | Story 3.5a (lista) |
|---|---|---|
| Core dono da operação | `boarding` | `trip` |
| Pergunta feita ao vizinho | "esta viagem está ativa e é deste motorista?" | "quem são os alunos da rota?" / "quem já embarcou?" |
| Ports declarados | `TripAccess`, `StudentEligibility` | `TripRoster`, `BoardingStatus` |
| Tabelas lidas fora do próprio schema | `trip.trips`, `auth.users`, `routing.route_students` | `routing.route_students`, `auth.users`, `boarding.boarding_records` |

O padrão é o mesmo e a justificativa é a mesma: **o core declara o port que ele precisa; o adapter do próprio shell faz queries separadas nas tabelas dos outros contextos.** O `trip/core` não sabe que existe um domínio "boarding" — só sabe perguntar "quem já embarcou nesta viagem". Precedente direto além da 3.3a: `PrismaRouteAssignmentAdapter` lê `prisma.user` (schema `auth`) a partir do contexto `routing`.

Consequência prática: os ports `TripRoster` e `BoardingStatus` **não existem no desenho da Architecture §7** (que lista só `trip-repository.port.ts`). São adição consciente, pelo mesmo rationale que a 3.3a usou para `TripAccess`/`StudentEligibility`. Já `get-trip-students.use-case.ts` **está** no desenho — use esse nome.

### Por que o endpoint fica no `TripController` e não no `BoardingController`

Tentador, porque o dado agregado é status de embarque. Três razões para não mover:

1. **Architecture §7** já atribui `listar alunos` ao domínio `trip` na tabela de fronteiras da API, e prevê `trip/core/use-cases/get-trip-students.use-case.ts`. FR22–FR25 estão mapeados como `trip/` + `boarding/` — o `trip` é quem expõe.
2. **O path é `/api/v1/trips/:id/students`.** Movê-lo para o boarding exigiria um `@Controller('api/v1/trips')` dentro de `boarding/shell/http/` — dois controllers disputando o mesmo prefixo, sem ganho.
3. **Decisivo:** mover muda o `operationId` de `TripController_getStudents` para outro, e `mobile/src/mocks/handlers/boarding.handlers.ts:14` tipa o handler contra `operations['TripController_getStudents']`. A trilha do Dev 2 quebra na hora, por um refactor que não entrega nada.

### O que a 3.3a deixou pronto para você

- **`recordedBy`** já está em `boarding_records` — auditoria de quem registrou o embarque. **Esta story não o expõe:** o contrato de `TripStudentItemDto` tem exatamente quatro campos (`studentId`, `name`, `status`, `checkedInAt`) e adicionar um quinto seria drift. Ele existe para o Épico 4 e para auditoria.
- **`DRIVER_NOT_ASSIGNED` (403)** já é vocabulário do contrato, já está no `openapi.json` do check-in e já está nos tipos do mobile. Reusar o código aqui não inventa nada — só estende o alcance de uma decisão que o Lucas já tomou.
- **`EffectExceptionFilter` desembrulha `FiberFailure`** (bug pré-existente corrigido na 3.3a). É por isso que `TripNotFound` (404) e `DriverNotAssigned` (403) vão sair com o status certo através de `runAndDispatch` em vez de virarem 500. Antes da 3.3a, virariam 500 — se você ver 500 onde esperava 404, o filtro é o primeiro lugar a olhar, não o último.
- **A migração `20260814211717_add_boarding_records`** já criou a tabela e os dois `@@unique`. **Esta story não tem migração nenhuma.** Se você se pegar rodando `prisma migrate dev`, algo saiu do escopo.

### Padrões que já existem — não reinventar

| Precisa de | Já existe em | Nota |
|---|---|---|
| Port de leitura cross-context | `boarding/core/ports/trip-access.port.ts` | mesmo formato, direção inversa |
| Adapter com 2 queries e zero JOIN | `boarding/shell/adapters/prisma-student-eligibility.adapter.ts` | copiar a forma |
| Runtime com 3 layers | `boarding.module.ts` | `Layer.mergeAll` |
| Contexto de runtime tipado no service | `boarding.service.ts:11-23` | é o que a Task 6.2 replica |
| Spec de use case com mocks | `check-in.use-case.spec.ts`, `assign-student.use-case.spec.ts` | `Layer.succeed` + `Effect.either` |
| e2e com precondição própria por teste | `boarding.e2e-spec.ts` (`seedActiveTrip()`) | não repetir o acoplamento de ordem que a 3.3a teve que consertar |
| Envelope `{ data, meta }` | `ResponseWrapperInterceptor` (global) | service retorna objeto **cru** |
| `{ error: { code, message } }` | `EffectExceptionFilter` (global) | duck typing `_tag`+`code`+`message`, status por `httpStatus` |
| Guards corretos num controller | `boarding.controller.ts:37-38` | `JwtAuthGuard, TenantGuard, RolesGuard` + `@Roles(['DRIVER'])` |

Um tagged error sem `httpStatus` vira **500** no filtro. `TripNotFound` e `DriverNotAssigned` já têm o campo como class field (`trip.errors.ts`) — não precisa mexer.

### Estado atual dos arquivos que serão MODIFICADOS

- **`api/src/domains/trip/shell/http/trip.controller.ts`** (127 linhas) — 4 métodos: `create`, `end`, `getActive` (implementados) e `getStudents` (stub 501 com Swagger completo). Mudança: guards da classe (Task 1) + corpo do `getStudents` + 3 ajustes de decorator. **Os `@ApiResponse` dos outros três métodos ficam como estão.**
- **`api/src/domains/trip/shell/trip.module.ts`** (29 linhas) — 1 adapter, `TRIP_RUNTIME` com um único `Layer.succeed`. Mudança: +2 adapters, `Layer.mergeAll` de 3, `inject` atualizado.
- **`api/src/domains/trip/shell/trip.service.ts`** (44 linhas) — 3 métodos, runtime tipado como `any`. Mudança: tipo do runtime + método novo.
- **`api/openapi.json`** e **`mobile/src/types/api.d.ts`** — **gerados**. Editar à mão é violação de contrato; rodar os scripts.
- **`mobile/src/mocks/handlers/boarding.handlers.ts`** (231 linhas) — estado compartilhado entre os dois handlers do épico. Mudança: um `if` de sentinela no handler do GET (Task 8.4). Nada mais.

Todos os imports relativos da API levam extensão `.js` (module nodenext) — inclusive nos arquivos novos e nos `.spec.ts`.

### Fora de escopo (não fazer nesta story)

- **`NOT_RETURNING` / entidade de ausência** — Épico 4, Story 4.1a. Não criar tabela, não criar port, não criar valor de enum no core.
- **SSE / atualização em tempo real da lista** — Story 4.2a. Esta story entrega um `GET` REST; o "tempo real" da FR23 é resolvido no mobile por refetch do TanStack Query (3.5b) até o Épico 4.
- **Cache offline da lista** — Tier 1, TanStack Query, trilha mobile (3.5b).
- **Paginação** — a rota tem dezenas de alunos, não milhares; o contrato não declara `page`/`limit` e inventá-los é drift. O defer de "unbounded pagination" da 2.4 continua registrado.
- **Corrigir `TRIP_NOT_OWNED` no `endTrip`** — ver Questões Abertas #1.
- **`@@index([companyId])` em `boarding_records`** — removido conscientemente na review da 3.3a (redundante com o prefixo do `@@unique`). Não readicionar "por performance": as queries desta story filtram por `tripId` ou por `routeId`, ambos cobertos.
- **Migrar `@effect/schema` → `effect/Schema`** — story técnica própria, pós-Épico 3. Esta story nem precisa de schema: `GET` não tem body.
- **Qualquer tela mobile** — 3.5b, trilha do Dev 2. As únicas duas linhas de mobile aqui são geradas (`api.d.ts`) ou o `if` do mock (Task 8.4).
- **Workflow de CI com drift check** — o repo ainda não tem `.github/workflows/`; verificação manual na Task 8.6.

### Previous Story Intelligence

**Da 3.3a (done, commits `aa96755` + merge `fe50b97`):**
- A code review adversarial de 14/08 gerou 4 decision-needed, e o Lucas escolheu **corrigir agora** nos quatro, expandindo o contrato. Duas dessas decisões chegam diretamente aqui: `DRIVER_NOT_ASSIGNED` como código de 403 (a Task 8 estende para o GET) e a disciplina de o mock ser corrigido junto quando o contrato muda.
- **Dois bugs pré-existentes de infra compartilhada só apareceram na integração ponta a ponta**, nunca em teste unitário: o `FiberFailure` não desembrulhado e o `P2002.meta.target` vazio sob Prisma 7 + `@prisma/adapter-pg`. Lição direta para esta story: **rode o e2e contra banco real cedo**, não como último passo. O bug dos guards descrito no topo é da mesma família — código compartilhado que ninguém exercitou de ponta a ponta.
- O e2e da 3.3a precisou ser reescrito porque `DUPLICATE_CHECK_IN` só passava se o teste de caminho feliz tivesse rodado antes. Semeie a precondição dentro de cada teste desde o início.
- `npm run openapi:export` = `nest build && node dist/scripts/export-openapi.js`. **`ts-node` não funciona** com os imports `.js`/nodenext deste projeto — não tente "consertar".

**Da 3.1 (`review`) e da retro do Épico 2:**
- Adapter `implements` a **interface**, não a `Context.Tag`.
- `PrismaService` entra por DI do NestJS no adapter, mantendo `R = never` nos ports.
- Runtime domain-scoped `{X}_RUNTIME` é o padrão desde a 2.2.
- Use cases **sempre** retornam `WithEvents` — `noEvents(result)` quando não há evento (é o caso desta story inteira).
- "Bugs em código compartilhado só aparecem quando consumidores variam o uso" — o `RolesGuard` passou 5 stories quebrado. O `TripController` está quebrado desde a 3.1 pelo mesmo motivo: nenhum e2e.
- `Trip.routeId` sem FK (risco 🟡 aberto desde a retro do Épico 2) toca esta story: uma viagem com `routeId` inválido devolve lista **vazia** com `summary { boarded: 0, total: 0 }` — sem erro, sem explicação. Ver Questões Abertas #2.

### Git Intelligence

- `fe50b97` merge da 3.3a · `aa96755` feat(boarding): check-in + idempotência · `4930bbd` feat(boarding): contrato 3.0
- Conventional commits. Branch desta story: **`feat/3-5a-lista-de-alunos-da-viagem`** (já criada a partir de `fe50b97`).
- Commit sugerido: `feat(trip): expose trip students list with boarding status (story 3.5a)`
- Como na 3.3a, esta story é backend mas **precisa** commitar `mobile/src/types/api.d.ts` regenerado e o ajuste do mock — consequência mecânica da mudança de contrato, não invasão da trilha do Dev 2.

### Latest Tech Information (verificado em 2026-08-15)

- **Nenhuma dependência nova**, em nenhum dos dois projetos. Tudo que esta story precisa já está instalado.
- **Effect `^3.21.0`** — `Effect.all([...], { concurrency: 2 })` é a API atual para paralelismo de tuplas com tipagem preservada. `@effect/schema@^0.75.5` continua em modo compatibilidade (o Schema entrou no core do Effect em 3.10; o v4 está em beta desde abr/2026) — irrelevante aqui, esta story não valida body.
- **Prisma 7.6.0** com `@prisma/adapter-pg`, multi-schema, cliente em `src/generated/prisma`. `findMany` com `id: { in: [...] }` sobre a PK é index scan — sem risco para o NFR4 com 50 alunos.
- **@nestjs/swagger 11.2.7** — `@ApiBearerAuth()` a nível de classe propaga `security` para todos os métodos do controller; é isso que produz o diff esperado na Task 8.1.

### Testing Requirements

- Unit (core): `src/**/*.spec.ts`, Vitest, **sem infraestrutura**, < 100ms por suite. `Layer.succeed` para mocks de port.
- Integração (adapter): banco **real** via `docker compose up -d`. Mocks de banco são proibidos pelo project-context.
- e2e Vitest: `test/**/*.e2e-spec.ts` (`npm run test:e2e`, timeout 30s).
- Factories com `@faker-js/faker` quando precisar de volume (os 50 alunos do NFR4).
- Verde exigido: `npm run build`, `npm test` (178 pré-existentes + novos), `npm run test:e2e` (menos o `route-assignment.e2e-spec.ts` vermelho na baseline), `mobile: npx tsc --noEmit` (menos o erro conhecido em `animated-icon.web.tsx`).

### Project Structure Notes

```
api/
├── openapi.json                                        # [UPDATE — GERADO] 501 sai; security nos 3 endpoints de trip
└── src/domains/trip/
    ├── core/
    │   ├── ports/
    │   │   ├── trip-repository.port.ts                 # (intocado — findById já serve)
    │   │   ├── trip-roster.port.ts                     # [NEW]
    │   │   └── boarding-status.port.ts                 # [NEW]
    │   ├── errors/trip.errors.ts                       # (intocado — DriverNotAssigned já existe)
    │   └── use-cases/
    │       ├── get-trip-students.use-case.ts           # [NEW]
    │       └── get-trip-students.use-case.spec.ts      # [NEW]
    └── shell/
        ├── adapters/
        │   ├── prisma-trip-roster.adapter.ts           # [NEW] (+ .spec.ts)
        │   └── prisma-boarding-status.adapter.ts       # [NEW] (+ .spec.ts)
        ├── trip.service.ts                             # [UPDATE] runtime tipado + getTripStudents
        ├── trip.module.ts                              # [UPDATE] +2 adapters, Layer.mergeAll
        └── http/trip.controller.ts                     # [UPDATE] guards (Task 1) + endpoint ligado

api/test/trip.e2e-spec.ts                               # [NEW] — regressão dos guards + lista + NFR4

mobile/
├── src/types/api.d.ts                                  # [UPDATE — GERADO] nunca à mão
└── src/mocks/handlers/boarding.handlers.ts             # [UPDATE] 403 DRIVER_NOT_ASSIGNED no GET
```

**Nenhuma alteração em `prisma/schema.prisma` e nenhuma migração nesta story.**

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5a] — ACs e escopo
- [Source: _bmad-output/planning-artifacts/epics.md#Convenção de Fatiamento] — regras das trilhas `X.0`/`X.Ya`
- [Source: _bmad-output/planning-artifacts/architecture.md#6] — naming, envelope `{ data, meta }`, ISO 8601 UTC
- [Source: _bmad-output/planning-artifacts/architecture.md#7] — `get-trip-students.use-case.ts` no desenho do domínio trip; fronteiras da API por domínio; FR22–FR25 → `trip/` + `boarding/`
- [Source: _bmad-output/planning-artifacts/architecture.md#8] — regras obrigatórias 1-13 (guards em todo endpoint, lógica no core, tipos gerados)
- [Source: _bmad-output/planning-artifacts/architecture.md#12] — drift check manual, eventos internos vs. contrato
- [Source: _bmad-output/implementation-artifacts/3-3a-check-in-de-embarque.md] — ports cross-context, `DRIVER_NOT_ASSIGNED`, Review Findings
- [Source: _bmad-output/implementation-artifacts/3-0-contrato-de-api-embarque-digital.md] — contrato original do épico
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-05-11.md] — padrões estabilizados, acordos de time
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — defers que tocam esta story
- [Source: _bmad-output/project-context.md] — extensão `.js`, anti-patterns, multi-tenancy
- [Source: api/openapi.json#/paths//api/v1/trips/{id}/students] — contrato commitado, autoridade final
- [Source: mobile/src/mocks/handlers/boarding.handlers.ts:208-230] — comportamento de referência do GET
- [Source: api/src/domains/boarding/shell/adapters/prisma-student-eligibility.adapter.ts] — 2 queries, zero JOIN cross-schema
- [Source: api/src/domains/boarding/shell/boarding.module.ts] — `Layer.mergeAll` com 3 layers
- [Source: api/src/domains/shared/shell/guards/tenant.guard.ts:14-20] — origem do 401 sem `JwtAuthGuard`
- [Source: api/src/domains/shared/shell/guards/roles.guard.ts:26-30] — comparação estrita de role (UPPERCASE)
- [Source: api/src/domains/trip/core/errors/trip.errors.ts:31-37] — `DriverNotAssigned` já declarado

---

## Questões Abertas (para o Lucas, não bloqueiam o dev)

1. **`endTrip` responde `400 TRIP_NOT_OWNED` onde o resto do sistema responde `403 DRIVER_NOT_ASSIGNED`.** `end-trip.use-case.ts:26-34` usa `InvalidTripTransition` (400) para o caso "viagem não é deste motorista", enquanto o check-in (3.3a) e agora a lista (3.5a) usam `DriverNotAssigned` (403) — que, ironicamente, está declarado em `trip.errors.ts` e nunca foi usado pelo próprio domínio. Três endpoints, dois vocabulários para a mesma condição. **Não corrigido aqui porque:** (a) não é necessário para nenhuma AC desta story; (b) `PATCH /trips/:id/end` já é consumido pela trilha mobile da 3.1, que trata o 400 de hoje; (c) pertence à review da 3.1, que segue em `review`. Candidato natural a entrar junto do fechamento da 3.1.

2. **`Trip.routeId` continua sem FK nem validação** (risco 🟡 aberto desde a retro do Épico 2). Nesta story a consequência é silenciosa e específica: viagem criada com `routeId` inexistente devolve `200` com `students: []` e `summary { boarded: 0, total: 0 }` — indistinguível de uma rota legitimamente vazia. A correção pertence ao `startTrip` (review da 3.1), não aqui. Nenhuma AC pede erro para rota vazia, então a story entrega o caso como lista vazia, de propósito.

3. **A lista não distingue "motorista da viagem" de "motorista da rota".** A AC #5 diz "motorista atribuído à rota"; esta story implementa "motorista da viagem" (`trip.driverId`), que é o que o check-in da 3.3a já faz e o que mantém os dois endpoints coerentes. Consequência: um motorista vinculado à rota em `route_drivers`, mas que não iniciou **esta** viagem, recebe 403. Para o MVP isso é o comportamento desejado (a lista é uma ferramenta operacional de quem está dirigindo agora); registrado caso a operação real exija supervisão cruzada depois.

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

Nenhum log de debug fora do padrão foi necessário — build, testes unitários, testes de integração (banco real) e e2e passaram sem investigação adicional.

### Completion Notes List

- **Task 1** — Guards do `TripController` corrigidos: `JwtAuthGuard` adicionado como primeiro guard, `@Roles(['DRIVER'])` (uppercase), `@ApiBearerAuth()` movido para nível de classe. Efeito colateral esperado e verificado pela Task 9.2: `POST /trips`, `PATCH /trips/:id/end` e `GET /trips/active` saem de "401 sempre" para funcionais.
- **Task 2** — Ports `TripRoster` e `BoardingStatus` criados no core do domínio `trip`, seguindo o padrão anticorrupção de `TripAccess`/`StudentEligibility` do domínio `boarding` (direção oposta).
- **Task 3** — Use case `getTripStudents` implementado em `Effect.gen`, com leituras paralelas (`Effect.all` com `concurrency: 2`), `Map` para junção O(n), ordenação determinística por nome (`localeCompare('pt-BR')`) com desempate por `studentId`, e `summary` derivado da lista projetada (nunca de `checkedIn.length`).
- **Task 4** — Spec do use case com 8 casos (Layer.succeed + Effect.either), 0 infraestrutura, suite completa executando os testes em 124ms.
- **Task 5** — Adapters `PrismaTripRosterAdapter` e `PrismaBoardingStatusAdapter` criados, cada um com 2 queries sem JOIN cross-schema, `select` explícito (nunca `include`), filtro de aluno inativo/role incorreto no roster.
- **Task 6** — `trip.module.ts` com `Layer.mergeAll` de 3 layers; `trip.service.ts` com runtime tipado (`TripRuntimeContext = TripRepository | TripRoster | BoardingStatus`) substituindo `any`; mapeamento explícito campo a campo no service (Date → ISO 8601 na borda).
- **Task 7** — Endpoint `GET /trips/:id/students` ligado ao `TripService.getTripStudents`; stub 501 removido; Swagger atualizado (403 nomeia os dois códigos possíveis).
- **Task 8** — `openapi:export` gerou diff 100% intencional (security nos 3 endpoints de trip; 501 removido; descriptions atualizadas). Tipos mobile regenerados via `openapi:types`. Mock `boarding.handlers.ts` ajustado: `GET /trips/:id/students` devolve `403 DRIVER_NOT_ASSIGNED` para `MOCK_OTHER_DRIVER_TRIP_ID`, espelhando o handler de check-in. Drift check (rodar export 2x) confirmado via hash idêntico do `openapi.json`.
- **Task 9** — 5 specs de integração novos contra banco real (3 do roster, 2 do boarding-status) + `test/trip.e2e-spec.ts` novo com 14 casos, incluindo regressão dos guards, isolamento multi-tenant (404, não 403, para viagem de outra empresa), `DRIVER_NOT_ASSIGNED` para segundo motorista, integração real com check-in da 3.3a, aluno desativado após check-in, e NFR4 (50 alunos, medição < 1000ms). Suite completa: `npm run build` (0 erros), `npm test` (191/191 = 178 baseline + 13 novos), `npm run test:e2e` (todos os arquivos verdes exceto `route-assignment.e2e-spec.ts`, vermelho pré-existente fora de escopo), `npm run lint` (149 erros/56 warnings, nenhum arquivo desta story na saída), `mobile: npx tsc --noEmit` (só o erro pré-existente de `animated-icon.web.tsx`).

### File List

**Novos:**
- `api/src/domains/trip/core/ports/trip-roster.port.ts`
- `api/src/domains/trip/core/ports/boarding-status.port.ts`
- `api/src/domains/trip/core/use-cases/get-trip-students.use-case.ts`
- `api/src/domains/trip/core/use-cases/get-trip-students.use-case.spec.ts`
- `api/src/domains/trip/shell/adapters/prisma-trip-roster.adapter.ts`
- `api/src/domains/trip/shell/adapters/prisma-trip-roster.adapter.spec.ts`
- `api/src/domains/trip/shell/adapters/prisma-boarding-status.adapter.ts`
- `api/src/domains/trip/shell/adapters/prisma-boarding-status.adapter.spec.ts`
- `api/test/trip.e2e-spec.ts`

**Modificados:**
- `api/src/domains/trip/shell/http/trip.controller.ts`
- `api/src/domains/trip/shell/trip.module.ts`
- `api/src/domains/trip/shell/trip.service.ts`
- `api/openapi.json` (gerado)
- `mobile/src/types/api.d.ts` (gerado)
- `mobile/src/mocks/handlers/boarding.handlers.ts`

### Change Log

- 2026-08-15: Story 3.5a implementada — `GET /api/v1/trips/:id/students` retorna lista de alunos da viagem com status de embarque agregado (`CHECKED_IN`/`NOT_CHECKED_IN`) e `summary { boarded, total }`. Guards do `TripController` corrigidos (bloqueador pré-existente desde a 3.1). Contrato propagado para `openapi.json`, tipos mobile e mock MSW.
