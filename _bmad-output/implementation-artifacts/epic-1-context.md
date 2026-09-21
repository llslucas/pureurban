# Epic 1 Context: Fundação do Projeto e Infraestrutura

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Este épico coloca os dois projetos (API NestJS + Mobile Expo) de pé com toda a infraestrutura necessária — Docker Compose, Prisma, Effect TS, Composition Root, shared kernel e os ambientes de execução do mobile — prontos para receber funcionalidades. É um habilitador técnico: não entrega nenhum FR diretamente, mas define o esqueleto hexagonal e as convenções que todos os épicos seguintes (e a defesa do TCC) dependem. A arquitetura implementada aqui — Hexagonal + DDD + Functional Core / Imperative Shell — é parte da tese acadêmica, não opcional.

## Stories

- Story 1.1: Inicialização dos Projetos e Repositório
- Story 1.2: Schema Prisma e Configuração do Banco de Dados
- Story 1.3: Setup Effect TS e Composition Root
- Story 1.4: Infraestrutura Compartilhada (Guards, Filters, Pipes)
- Story 1.5: Setup Mobile — Dependências e Configuração Offline
- Story 1.6: Ambiente de Execução Web do App Mobile
- Story 1.7: Development Build Android para Validação Nativa
- Story 1.8: Shell de Navegação e Remoção do Template Expo
- Story 1.9: Corrigir o Seed do Banco sob Prisma 7

*Status corrente (sprint tracking, 13/09/2026): todas entregues, exceto a 1.7 (backlog — validação final). Duas stories técnicas adicionais (1.10 test runner do mobile; 1.11 revisão da paleta) existem apenas no tracking de implementação.*

## Requirements & Constraints

**Natureza do épico:** sucesso = os épicos seguintes conseguem ser construídos sobre a fundação sem retrabalho de infraestrutura. Nada de lógica de negócio do produto aqui.

**Infra local obrigatória:** `docker compose up` (PostgreSQL + Redis) é pré-requisito para e2e e testes de integração, que rodam contra banco real. `api/` e `mobile/` são projetos independentes (sem workspaces) — instalar e rodar comandos dentro de cada diretório; API exige Node 22.

**Convenções de teste (requisito do TCC):** testes colocados junto ao arquivo testado (`*.spec.ts`); testes de integração em `test/` na raiz da API; use cases do domínio executáveis sem infraestrutura, com menos de 100ms por suíte.

**Validação em device (Story 1.7):** mede NFR5 (boot operacional < 3s em Android 8+) e valida NFR18–NFR20 (operação com uma mão, tela de 5"/720p). Bloqueia a defesa do TCC, não o desenvolvimento — nenhuma story de feature depende dela.

**Alvo web (Story 1.6):** nenhuma alteração em código de aplicação — apenas configuração; `expo export --platform web` precisa continuar completando sem erro (vira smoke test de bundle).

## Technical Decisions

**Stack:** Expo SDK 55, NestJS v11, Prisma v7 com `moduleFormat = "cjs"` (compatibilidade com NestJS), Effect TS, PostgreSQL + Redis via Docker Compose, real-time com SSE nativo do NestJS + Redis Pub/Sub.

**Effect TS ↔ NestJS (Composition Root manual, sem bibliotecas de terceiros):** o `EffectRuntimeModule` usa `useFactory` para montar um `ManagedRuntime` com as dependências de infra; services do NestJS recebem o runtime via `@Inject('EFFECT_RUNTIME')` e executam programas com `runPromise`. Domain events são tupla de retorno (`WithEvents<A>`): o core *decide* os eventos, o shell *despacha* via EventEmitter2 (`EffectEventDispatcher.runAndDispatch`). O core nunca emite eventos nem importa NestJS/Prisma/Redis — regra absoluta: `core/` nunca importa de `shell/`.

**Estrutura hexagonal:** `api/src/domains/<contexto>/{core,shell}` com bounded contexts `auth`, `routing`, `trip`, `boarding`, `tracking` + `domains/shared` (shared kernel). Arquivos em `kebab-case` com sufixo de tipo (`.use-case.ts`, `.port.ts`, `.adapter.ts`, `.module.ts`).

**Prisma multi-schema:** um único `schema.prisma` com `@@schema()` por bounded context, reforçado por schemas PostgreSQL separados (`public`, `auth`, `routing`, `boarding`, `tracking`, `trip`) — FKs cross-schema são decisões arquiteturais explícitas. `Company` (tenant root) e enums compartilhados no schema `public`. Toda entidade tem `id`, `createdAt`, `updatedAt` e `companyId`. Após mudar o schema: `prisma migrate dev` e depois `prisma generate`.

**Shared kernel transversal (Story 1.4):** `RolesGuard` + decorator `@Roles()` (roles `admin`/`driver`/`student`); `TenantGuard` extrai `companyId` do JWT e toda query filtra por tenant, sem exceção; `EffectExceptionFilter` converte tagged errors do core → HTTP com body `{ error: { code, message, details } }`; `EffectSchemaPipe` converte erros de validação Effect Schema → 400; sucesso responde `{ data, meta }`. Validação de dados vive no functional core via Effect Schema.

**Fundação mobile (Story 1.5):** MMKV (tokens, sessão, preferências), expo-sqlite (persistência estruturada / futura fila offline), Zustand (um store por domínio), TanStack Query com `persistQueryClient` (cache offline Tier 1), React Native Paper (Material Design), `api-client.ts` como único ponto de contato com a API; Expo Router com grupos `(auth)/`, `(student)/`, `(driver)/`.

**Ambientes de execução (Stories 1.6/1.7):** Expo Go **não é alvo suportado** (MMKV/Nitro não roda nele). O alvo primário de desenvolvimento é o **web**: MMKV via `localStorage`, expo-sqlite via wa-sqlite/OPFS (exige `wasm` em `assetExts` e headers COOP/COEP no Metro), QR via webcam. O development build Android (EAS, `expo-dev-client`) existe só para validação nativa final. Toda dependência mobile nova precisa declarar suporte web ou ter variante `.web.tsx`.

**Contrato OpenAPI-first:** `api/openapi.json` versionado no repositório, regenerado com `npm run openapi:export`; os tipos de API do mobile são gerados a partir dele (`openapi-typescript`) — nunca escritos à mão. Drift check no guarda o contrato.

## UX & Interaction Patterns

- O shell de navegação (Story 1.8) roteia por papel: autenticado vai para o grupo correspondente ao seu `role` (inclusive reabertura com sessão hidratada do MMKV); não autenticado vai para `(auth)/login`, sem tela em branco.
- NFR18–NFR20 (uma mão, botões grandes, alto contraste, tela de 5") são apenas *medidos* neste épico (Story 1.7) — quem entrega é cada story de feature.

## Cross-Story Dependencies

- **Sequência interna:** 1.6 depende de 1.5; 1.8 depende de 1.6; 1.9 é independente (seed). As demais (1.1–1.5) seguem a ordem numérica.
- **Story 1.7** depende do Épico 5 concluído — é validação final antes da defesa, não pré-requisito de features.
- **O que este épico desbloqueia:** a fundação inteira é pré-requisito do Épico 2 (auth + primeiro bounded context). As Stories 1.6 e 1.8 desbloqueiam toda story mobile subsequente (3.3b, 3.4b, 3.5b, 3.6 em diante); a 1.9 desbloqueia qualquer story que dependa de dados semeados.
