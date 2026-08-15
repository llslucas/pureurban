# Deferred Work

## Deferred from: code review of 1-3-setup-effect-ts-e-composition-root.md (2026-04-03)
- Query manual `SELECT 1 as health` no health-check pode ser frágil (aceito como prova de conceito inicial)
- `DomainEvent.occurredAt` é `string` genérica (poderia usar Branded Type no futuro para maior segurança de domínio)
- Missing Effect Composition Primitives in WithEvents
- Typed Errors are Eviscerated
- Reckless Synchronous Event Dispatching
- Potentially Hanging Module Teardown
- Sloppy, Untyped Domain Events payload
- queryResult array exists but lacks expected health shape
- Health check bypasses event dispatcher entirely — too much complexity for a simple health check program
- Apathetic Process Teardown — onModuleDestroy swallows runtime disposal failures into a log instead of failing loudly. — deferred: Unecessary now due to complexity

## Deferred from: code review of 1-5-setup-mobile-dependencias-e-configuracao-offline.md (2026-04-05)
- Omitted SafeAreaProvider Integration [`mobile/src/app/_layout.tsx`] — deferred, pre-existing

## Deferred from: code review of 2-2-autenticacao-login-e-refresh-token.md (2026-05-03)
- Tratar erro de rede no refresh token — Se `attemptTokenRefresh` encontrar um erro de rede (offline) ou 5xx, ele retorna `false`, forçando o logout do usuário. Devemos manter os tokens e tentar novamente quando a rede voltar? — deferred, pre-existing. Reason: Recurso não essencial para a fase do projeto.

## Deferred from: code review of 2-3-cadastro-e-gestao-de-motoristas.md (2026-05-03)
- N+1 double-fetch em `updateDriver`: `findByIdAndCompanyAndRole` no use-case + `findFirst` interno do `updatePartial` no adapter (3 queries onde 1 bastaria) — padrão pre-existente, otimização futura.
- Sem guard de empresa ativa: JWT válido de empresa desativada ainda permite criação/gestão de motoristas — gap sistêmico pré-existente, não causado por esta story.
- `UserData` carrega campo `password` no tipo de domínio (core layer expõe hashed password no tipo de retorno dos use-cases) — constraint de design pré-existente; service faz stripping correto em todos os métodos.

## Deferred from: code review of 2-4-cadastro-e-gestao-de-alunos.md (2026-05-06)
- Session Hijacking / Lack of Invalidation on Password Change — deferred: pre-existing limitation
- Active Session Persistence Post-Deactivation — deferred: pre-existing limitation
- Denial of Service via Unbounded Pagination — deferred: pre-existing limitation in list-drivers
- Denial of Service via bcrypt Hashing — deferred: rate limiting is a cross-cutting concern
- Missing Audit Trail (No Actor Tracking) — deferred: actor tracking is not specified

## Deferred from: code review of 2-5-crud-de-rotas-de-transporte (2026-05-10)
- Unbounded memory consumption or timeout [api/src/domains/routing/shell/adapters/prisma-route.adapter.ts] — deferred, pre-existing
- Dupla Busca no Banco de Dados (Anti-Pattern de Performance) [api/src/domains/routing/shell/adapters/prisma-route.adapter.ts] — deferred, pre-existing

## Deferred from: code review of 2-6-vinculos-aluno-rota-e-motorista-rota (2026-05-10)
- `Effect.orDie` em todos os adapters converte falhas infra recuperáveis em defects/500 sem retry/métrica — padrão pré-existente desde Story 1.3.
- Falta outbox transacional para eventos de domínio (eventos podem ser perdidos se processo crashar entre commit e dispatch) — arquitetural, fora do escopo.
- `Layer.merge` em `routing.module.ts` impede transações cross-aggregate (criar rota + assignar students atomicamente) — escolha arquitetural.
- `@Get('mine')` antes de `@Get(':id')` é forçado apenas por disciplina — adicionar teste de regressão que prove resolução de `mine` quando `:id` existe.
- `companyId` em `routeStudent.create`/`routeDriver.create` vem do parâmetro de input em vez de `route.companyId` verificado na tx — defense-in-depth.
- `sprint-status.yaml` tem comentários de timestamp divergentes do dado YAML — gerenciamento manual; trivial.

## Deferred from: code review of 3-0-contrato-de-api-embarque-digital (2026-07-12)
- Tipos gerados são inúteis para 11 dos request bodies existentes: `TypeLiteralClass`/`RefineClass` colapsam em `Record<string, never>` colidentes (o mesmo schema vazio é `$ref`'d por login, register, refresh, create-driver, create-student, create-route, assign-student, assign-driver) [mobile/src/types/api.d.ts] — pré-existente: classes Effect Schema usadas como `@Body` não produzem metadata Swagger. Só ficou visível agora porque esta story congelou o documento como artefato. Não bloqueia o Épico 3 (os 2 endpoints novos usam DTOs de classe e geram tipos corretos), mas bloqueia qualquer trilha futura que queira consumir os endpoints antigos via tipos gerados.
- Não existe `ValidationPipe` global na API — `@IsUUID()` no `check-in.dto.ts` e todo class-validator nos DTOs do shell é código morto [api/src/main.ts] — pré-existente (mesmo padrão em `create-trip.dto.ts`). A decisão entre registrar um `ValidationPipe` global e padronizar no `EffectSchemaPipe` existente é escopo da 3.3a, quando o endpoint deixar de ser stub.
- `api-client.ts` não expõe headers por requisição: `post<T>(path, body)` é estruturalmente incapaz de enviar o `X-Idempotency-Key` que o contrato agora declara obrigatório [mobile/src/services/api-client.ts] — pré-existente; o cliente HTTP é escopo da 3.3b/3.4b. Registrado aqui porque o contrato passou a depender disso.

## Deferred from: code review of 3-3a-check-in-de-embarque (2026-08-14)
- Discriminador de `P2002` do domínio routing continua quebrado: `isExpectedUniqueViolation` inspeciona `e.meta?.target`, que vem `undefined` sob Prisma 7 + `@prisma/adapter-pg` — os campos do constraint só existem em `meta.driverAdapterError.cause.constraint.fields` [api/src/domains/routing/shell/adapters/prisma-route-assignment.adapter.ts:24-31]. A função retorna `false` incondicionalmente, então `ASSIGNMENT_ALREADY_EXISTS` quase certamente sai como 500. A Story 3.3a corrigiu o padrão apenas no adapter novo do boarding (escopo correto). Fica invisível porque a única suite que o exporia (`route-assignment.e2e-spec.ts`) está vermelha no `beforeAll` por motivo alheio. Candidato a story técnica do domínio routing.
- `test/route-assignment.e2e-spec.ts` falha na baseline: `POST /api/v1/auth/login` retorna 201 (sem override de `@HttpCode`) mas o teste espera 200 [api/test/route-assignment.e2e-spec.ts] — pré-existente, confirmado revertendo as mudanças da 3.3a. Mascara o item acima; corrigir os dois juntos.
- TOCTOU entre validação e persistência do check-in: a viagem pode transicionar `ACTIVE → COMPLETED` entre `findActiveTrip` e `recordCheckIn`, gravando embarque contra viagem já encerrada [api/src/domains/boarding/core/use-cases/check-in.use-case.ts:40-62] — janela estreita; exigiria transação com `SELECT ... FOR SHARE` na trip, o que atravessa a fronteira de bounded context (schemas diferentes). Decisão arquitetural, não correção pontual.
- `ManagedRuntime` criado por módulo e nunca descartado (sem `OnModuleDestroy` chamando `runtime.dispose()`) e dispatch de eventos de domínio best-effort pós-commit, sem outbox nem retry [api/src/domains/boarding/shell/boarding.module.ts, api/src/domains/shared/shell/effect-runtime/event-dispatcher.service.ts] — padrão pré-existente replicado em `trip.module.ts` e `routing.module.ts`; o boarding é a terceira cópia. O item do outbox já consta do defer da 2.6; registrado de novo porque a 3.3a é a primeira story em que o evento perdido tem consequência de segurança visível ao usuário (embarque de criança não notificado).

## Deferred from: code review of 3-5a-lista-de-alunos-da-viagem-com-status (2026-08-15)
- Suite e2e do trip não limpa dados: ~57 usuários, 2 empresas, rotas, viagens e 25 boarding records ficam no banco a cada execução [api/test/trip.e2e-spec.ts:160-166] — pré-existente: `boarding.e2e-spec.ts:206-212` tem exatamente o mesmo `afterAll` (só `app.close()`). Os specs de adapter da própria 3.5a limpam atrás de si, então a disciplina existe no repo — só não foi aplicada onde o volume é maior. Candidato a helper de teardown compartilhado em `test/`.
- JWT nunca é revalidado contra `isActive`/`role` do usuário: motorista desligado ou rebaixado continua listando alunos até o token expirar [api/src/domains/auth/shell/strategies] — pré-existente, decisão de design da autenticação (Épico 2). Ficou mais visível na 3.5a porque o dado exposto passou a ser nome de criança.
- `toInfraError` copiado para o terceiro e quarto adapters em vez de viver em `shared/shell` [api/src/domains/trip/shell/adapters/prisma-trip-roster.adapter.ts:9, prisma-boarding-status.adapter.ts:8] — a Task 5.4 prescreveu explicitamente copiar de `prisma-trip-access.adapter.ts`, então a duplicação foi intencional nesta story. Extrair junto com o item de `Effect.orDie` já registrado no defer da 2.6.
- `@Req() req: Request & { user: { userId: string } }` resolve para o `Request` global do DOM, não o do Express — funciona só porque a metade não usada nunca é checada estruturalmente [api/src/domains/trip/shell/http/trip.controller.ts:48,68,79,117] — pré-existente, copiado de `boarding.controller.ts`. Um `AuthenticatedRequest` em `shared/shell/http/` elimina as ocorrências repetidas em todos os controllers.
- Nada amarra a resposta em runtime ao DTO publicado: o service devolve objeto literal com tipo inferido, o controller não tem anotação de retorno, `@ApiDataResponse(...)` é só decoração e `ErrorBodyDto.code` é `string` cru [api/src/domains/trip/shell/trip.service.ts:54-67, api/src/domains/shared/shell/http/error-response.dto.ts:9] — pré-existente em todos os domínios. Prova de que já derivou: `BoardingStatusDto` declara `NOT_RETURNING` e o core só emite dois valores (divergência consciente da Task 3.4, mas que o compilador não vigia). Tipar `code` como union literal daria à trilha mobile algo melhor que comparar `string` com literal hardcoded.
