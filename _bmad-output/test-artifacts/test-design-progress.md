---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability']
lastStep: 'step-03-risk-and-testability'
lastSaved: '2026-03-27'
inputDocuments:
  - planning-artifacts/prd.md
  - planning-artifacts/architecture.md
  - planning-artifacts/epics.md
  - implementation-artifacts/sprint-status.yaml
  - knowledge/adr-quality-readiness-checklist.md
  - knowledge/test-levels-framework.md
  - knowledge/risk-governance.md
  - knowledge/test-quality.md
  - knowledge/probability-impact.md
---

# Step 1: Detect Mode & Prerequisites

## Mode Detection

**Modo Selecionado:** System-Level

**Justificativa:** Todos os três tipos de entrada estão presentes:
- ✅ PRD: 37 Requisitos Funcionais (7 categorias) + 20 Requisitos Não-Funcionais
- ✅ Architecture/ADR: Arquitetura Hexagonal + DDD + Functional Core / Imperative Shell
- ✅ Epics + Stories: 5 épicos, 24 stories com critérios de aceitação

## Verificação de Pré-requisitos (System-Level)

| Pré-requisito | Status | Documento |
|---|---|---|
| PRD (requisitos funcionais e não-funcionais) | ✅ Presente | `planning-artifacts/prd.md` |
| ADR / Decisões arquiteturais | ✅ Presente | `planning-artifacts/architecture.md` |
| Documento de Arquitetura / tech-spec | ✅ Presente | `planning-artifacts/architecture.md` |

---

# Step 2: Load Context & Knowledge Base

## Configuração

| Parâmetro | Valor |
|---|---|
| `tea_use_playwright_utils` | `true` |
| `tea_use_pactjs_utils` | `true` |
| `tea_pact_mcp` | `mcp` |
| `tea_browser_automation` | `auto` |
| `test_stack_type` | `auto` → **fullstack** (detectado) |
| `test_framework` | `auto` → **Jest** (backend), nenhum configurado (mobile) |
| `communication_language` | Portuguese |
| `test_artifacts` | `_bmad-output/test-artifacts` |

## Detecção de Stack

**Stack Detectada:** `fullstack` (NestJS backend + Expo React Native mobile)

- Backend: NestJS v11, Effect TS, Prisma v7 (PostgreSQL), Redis, SSE, Jest + ts-jest
- Mobile: Expo SDK 55, React Native, Zustand, TanStack Query, MMKV, expo-sqlite
- Infra: Docker Compose (PostgreSQL + Redis)

## Fragmentos de Conhecimento Carregados

- ✅ `adr-quality-readiness-checklist.md` — 8 categorias, 29 critérios
- ✅ `test-levels-framework.md` — Unit, Integration, E2E guidelines
- ✅ `risk-governance.md` — Scoring matrix, gate decisions
- ✅ `test-quality.md` — Definition of done, anti-patterns
- ✅ `probability-impact.md` — Escala de probabilidade/impacto

---

# Step 3: Testability & Risk Assessment

## 1. Revisão de Testabilidade do Sistema

### 🚨 Preocupações de Testabilidade (Ações Necessárias)

#### T1: Ausência de Seeding APIs / Test Data Strategy
- **Categoria:** Controlabilidade
- **Descrição:** A architecture não define endpoints de seeding para testes (ex: `/api/test-data`). Não há menção de data factories ou estratégia de limpeza de dados de teste.
- **Impacto:** Setup de testes lento e manual; impossibilidade de testar edge cases (aluno inativo, QR expirado, viagem sem motorista).
- **Ação:** ACTIONABLE — Implementar seeding APIs (dev/staging) ou data factories com Prisma seed scripts.

#### T2: Ausência de Framework de Testes E2E/API
- **Categoria:** Controlabilidade
- **Descrição:** Nenhum framework de testes E2E (Playwright, Cypress) ou API (Supertest integrado ao fluxo completo) está configurado. Apenas Jest básico com `test:e2e` usando `jest-e2e.json`.
- **Impacto:** Testes de integração end-to-end (REST → Effect TS → Prisma → PostgreSQL) não têm framework dedicado. Testes mobile não têm framework definido.
- **Ação:** ACTIONABLE — Escolher e configurar framework: Supertest para API integration tests; Detox ou Maestro para mobile E2E.

#### T3: Testabilidade do Functional Core (Effect TS) — Parcialmente Definida
- **Categoria:** Isolamento
- **Descrição:** A architecture define que `core/` é Effect TS puro (testável sem NestJS), mas não especifica *como* testar programas Effect — ex: como fornecer Layers de teste, como mockar Tags Effect, qual runner usar.
- **Impacto:** Desenvolvedores podem criar testes acoplados ao NestJS ou testar incorretamente o functional core.
- **Ação:** ACTIONABLE — Documentar padrão de teste para Effect: `Effect.provide(TestLayer)` com ports mockados, executar via `Effect.runPromise`.

#### T4: Testes Offline / Mobile — Sem Estratégia
- **Categoria:** Controlabilidade
- **Descrição:** A architecture define MMKV + expo-sqlite + offline queue, mas não há estratégia de teste para cenários offline (mockagem de conectividade, validação de queue, sync conflict resolution).
- **Impacto:** Cenários offline (NFR11-NFR14) podem passar em ambiente de teste mas falhar em produção.
- **Ação:** ACTIONABLE — Definir abordagem: unit tests para offline-queue logic, mocks de NetInfo para simular offline.

#### T5: SSE / Real-time — Sem Mecanismo de Teste
- **Categoria:** Observabilidade
- **Descrição:** SSE (Server-Sent Events) para localização GPS + Redis Pub/Sub não tem padrão de teste definido. EventSource no client + SSE controller no server = ponto de integração complexo.
- **Impacto:** Bugs de latência, desconexão, e reconexão SSE podem passar despercebidos até staging/produção.
- **Ação:** ACTIONABLE — Implementar testes de integração para SSE: publish no Redis → assert mensagem no EventSource client (usar `supertest` com SSE parsing ou cliente EventSource em Jest).

#### T6: Multi-tenancy — Validação Transversal
- **Categoria:** Isolamento
- **Descrição:** `TenantGuard` filtra por `companyId` do JWT. Se qualquer query esquecer o filtro, há vazamento entre tenants. Não há teste automatizado para garantir que todas as queries filtram por tenant.
- **Impacto:** Vazamento de dados entre empresas — risco de segurança grave.
- **Ação:** ACTIONABLE — Implementar testes de integração que validem: usuário do tenant A não vê dados do tenant B, para cada endpoint.

---

### ✅ Avaliação de Testabilidade — Pontos Fortes

#### Controlabilidade
- ✅ **Inversão de dependência explícita:** Ports (interfaces Effect Tags) no `core/`, adapters no `shell/` — facilita mockar qualquer dependência.
- ✅ **Composition Root centralizado:** `EffectRuntimeModule` com `useFactory` permite montar Layers diferentes para teste.
- ✅ **Testes colocados junto ao código:** `*.spec.ts` ao lado do arquivo testado — convenção clara.
- ✅ **Docker Compose:** PostgreSQL + Redis para ambiente de teste local reproduzível.

#### Observabilidade
- ✅ **Erros tipados no Effect:** Tagged errors (`StudentNotFound`, `InvalidQRCode`) permitem assertions precisas em testes.
- ✅ **Domain Events como return tuple:** `WithEvents<A>` permite verificar eventos sem side effects — ideal para unit tests.
- ✅ **Formato de resposta padronizado:** `{ data, meta }` e `{ error: { code, message, details } }` — assertions estruturadas.
- ✅ **Swagger/OpenAPI:** Documentação automática permite contract testing futuro.

#### Confiabilidade
- ✅ **Functional Core puro:** Sem imports de NestJS/Prisma/Redis → testes ultrarrápidos (<100ms/suite).
- ✅ **Separação clara core/shell:** Permite dois níveis de teste independentes (core isolado, integração com infra).
- ✅ **Multi-tenancy por design:** `companyId` em todas as entidades — testável se enforced.

---

### Requisitos Arquiteturalmente Significativos (ASRs)

| # | ASR | Tipo | Justificativa |
|---|---|---|---|
| ASR-1 | Effect TS ↔ NestJS Composition Root | ACTIONABLE | Ponto de integração único — se quebrar, todo o sistema para. Requer testes de integração. |
| ASR-2 | SSE + Redis Pub/Sub para real-time | ACTIONABLE | Fluxo: REST → Redis → Pub/Sub → SSE → cliente. Múltiplos pontos de falha. |
| ASR-3 | Multi-tenancy via TenantGuard | ACTIONABLE | Isolamento de dados é requisito de segurança. Falha = vazamento entre empresas. |
| ASR-4 | Offline sync (MMKV + expo-sqlite + queue) | ACTIONABLE | Sincronização com conflitos (last-write-wins) pode perder dados se mal implementada. |
| ASR-5 | QR Code estático por sessão | FYI | Segurança adequada para MVP. QR dinâmico previsto para Fase 2. |
| ASR-6 | JWT access (15min) + refresh (7 dias) | FYI | Padrão bem estabelecido, baixo risco de implementação. |
| ASR-7 | Domain Events via WithEvents<A> | FYI | Padrão funcional puro — testável por design, baixo risco. |

---

## 2. Avaliação de Riscos

### Matriz de Risco (Probabilidade × Impacto)

| Impacto \ Probabilidade | Improvável (1) | Possível (2) | Provável (3) |
|---|---|---|---|
| **Crítico (3)** | 🟡 3 | 🟠 6 | 🔴 9 |
| **Degradado (2)** | 🟢 2 | 🟡 4 | 🟠 6 |
| **Menor (1)** | 🟢 1 | 🟢 2 | 🟢 3 |

### Riscos Identificados

| ID | Título | Categoria | P | I | Score | Ação | Dono |
|---|---|---|---|---|---|---|---|
| R-001 | Integração Effect TS + NestJS mais complexa que o esperado | TECH | 2 | 3 | 🟠 6 | MITIGATE | Lucas |
| R-002 | SSE/Redis Pub/Sub — latência ou desconexão em áreas rurais | PERF | 2 | 2 | 🟡 4 | MONITOR | Lucas |
| R-003 | Offline sync — perda de dados de check-in | DATA | 2 | 3 | 🟠 6 | MITIGATE | Lucas |
| R-004 | Vazamento de dados entre tenants (TenantGuard bypass) | SEC | 1 | 3 | 🟢 3 | DOCUMENT | Lucas |
| R-005 | QR code transferível entre alunos | SEC | 2 | 2 | 🟡 4 | MONITOR | Lucas |
| R-006 | Prazo de 2 meses insuficiente — features cortadas | BUS | 2 | 2 | 🟡 4 | MONITOR | Lucas |
| R-007 | Check-in > 2s em cenário online (NFR1) | PERF | 1 | 2 | 🟢 2 | DOCUMENT | Lucas |
| R-008 | GPS não funciona em áreas sem cobertura | PERF | 3 | 1 | 🟢 3 | DOCUMENT | Lucas |
| R-009 | Crash do app perde dados offline (NFR11) | DATA | 1 | 3 | 🟢 3 | DOCUMENT | Lucas |
| R-010 | Effect Schema + NestJS Pipe — edge cases de validação | TECH | 2 | 1 | 🟢 2 | DOCUMENT | Lucas |

### Detalhamento dos Riscos de Alta Prioridade

#### R-001: Integração Effect TS + NestJS (Score: 6 — MITIGATE)
- **Probabilidade:** 2 (Possível) — Integração manual sem bibliotecas de terceiros, `@nestjs-effect` descartada.
- **Impacto:** 3 (Crítico) — Se o Composition Root falhar, nenhum use case executa.
- **Mitigação:** Spike técnico na semana 1 — validar `ManagedRuntime` + `useFactory` com 1 use case simples antes de expandir. Testes de integração para o `EffectRuntimeModule`.
- **Timeline:** Semana 1 do desenvolvimento.

#### R-003: Offline sync — perda de dados de check-in (Score: 6 — MITIGATE)
- **Probabilidade:** 2 (Possível) — expo-sqlite + queue com sync é padrão, mas last-write-wins pode sobrescrever dados válidos.
- **Impacto:** 3 (Crítico) — Check-ins perdidos significam alunos não registrados no ônibus.
- **Mitigação:** Unit tests extensivos para offline-queue (enqueue, dequeue, conflict resolution). Testes com simulação de crash (kill + restart). Validar persistência com `expo-sqlite` crash-safe.
- **Timeline:** Epic 3 (Story 3.4).

---

## 3. Resumo dos Riscos

### Distribuição por Prioridade
- **P1 (Alta — MITIGATE):** 2 riscos (R-001, R-003)
- **P2 (Média — MONITOR):** 3 riscos (R-002, R-005, R-006)
- **P3 (Baixa — DOCUMENT):** 5 riscos (R-004, R-007, R-008, R-009, R-010)

### Plano de Ação Prioritário

1. **Semana 1:** Spike técnico para R-001 (Effect TS + NestJS) — validar Composition Root com testes de integração.
2. **Epic 3, Story 3.4:** Testes extensivos para R-003 (offline sync) — unit tests para queue, integration tests para sync.
3. **Cada endpoint:** Testes de multi-tenancy para R-004 (TenantGuard) — validar isolamento entre empresas.
4. **Epic 5:** Testes de latência para R-002 (SSE/Redis) — medir latência ponta-a-ponta com Redis Pub/Sub.

### Decisão de Gate (Pré-desenvolvimento)
- **Status:** ✅ PASS (sem blockers críticos score=9)
- **Preocupações:** 2 riscos com score 6 (R-001, R-003) — devem ter mitigação implementada antes do MVP.
