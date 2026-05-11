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
