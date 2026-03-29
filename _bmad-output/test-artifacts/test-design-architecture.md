---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
lastSaved: '2026-03-27'
workflowType: 'testarch-test-design'
inputDocuments: ['planning-artifacts/prd.md', 'planning-artifacts/architecture.md', 'planning-artifacts/epics.md']
---

# Test Design for Architecture: PureUrban

**Propósito:** Preocupações arquiteturais, gaps de testabilidade e requisitos NFR para revisão pelo time de Arquitetura/Dev. Serve como contrato entre QA e Engenharia sobre o que deve ser resolvido antes do desenvolvimento de testes.

**Data:** 2026-03-27
**Autor:** TEA Master Test Architect
**Status:** Architecture Review Pending
**Projeto:** PureUrban
**PRD:** `planning-artifacts/prd.md`
**Architecture:** `planning-artifacts/architecture.md`

---

## Sumário Executivo

**Escopo:** Plataforma mobile (Expo/React Native) + API backend (NestJS) para gestão de transporte universitário intermunicipal — check-in digital via QR code, notificações de ausência, localização GPS em tempo real.

**Contexto de Negócio** (do PRD):
- **Impacto:** Eliminação de 30-60min de espera por alunos ausentes; digitalização do controle de embarque
- **Problema:** Carteirinhas físicas, comunicação caótica via WhatsApp, motoristas esperando alunos que já foram embora
- **Contexto:** TCC em Engenharia de Software (MVP ~maio/2026)

**Arquitetura** (do Architecture Document):
- **Decisão 1:** Hexagonal Architecture — Functional Core (Effect TS) / Imperative Shell (NestJS)
- **Decisão 2:** Integração manual via Composition Root (`ManagedRuntime` + `useFactory`)
- **Decisão 3:** SSE + Redis Pub/Sub para localização em tempo real
- **Decisão 4:** DDD com 5 bounded contexts (auth, routing, boarding, tracking, trip)

**Escala Esperada:**
- ~120 alunos, 3 motoristas, 3 rotas (por empresa)
- Dispositivos Android 8+ / iOS 13+ de baixo custo
- Trechos com ausência de sinal (áreas rurais)

**Resumo de Riscos:**
- **Total:** 10 riscos identificados
- **Alta prioridade (≥6):** 2 riscos requerendo mitigação imediata
- **Esforço de teste:** ~50-80 testes (~2-4 semanas para 1 QA/Dev)

---

## Quick Guide

### 🚨 BLOCKERS — Time Deve Decidir

**Caminho Crítico Pré-Implementação** — QA não consegue escrever testes de integração sem estes itens:

1. **T1: Seeding APIs / Test Data Strategy** — Implementar data factories ou Prisma seed scripts para cenários de teste (recomendado: Lucas)
2. **T3: Padrão de Teste para Effect TS** — Documentar como testar programas Effect com Layers de teste (recomendado: Lucas)

**O que precisamos:** Completar estes 2 itens pré-implementação ou o desenvolvimento de testes fica bloqueado.

---

### ⚠️ ALTA PRIORIDADE — Time Deve Validar

1. **T2: Framework de Testes E2E/API** — Escolher Supertest (API integration) + definir abordagem mobile (implementação)
2. **T5: Mecanismo de Teste para SSE** — Definir como testar fluxo Redis Pub/Sub → SSE Controller → EventSource client (implementação)
3. **T6: Validação de Multi-tenancy** — Testes que garantam que TenantGuard filtra corretamente em todos os endpoints (implementação)
4. **T4: Estratégia de Teste Offline** — Definir mocks de conectividade e validação de offline queue (Epic 3)

**O que precisamos:** Revisar recomendações e aprovar (ou sugerir alternativas).

---

### 📋 INFO — Soluções Fornecidas

1. **Estratégia de teste:** Unit (core Effect) + Integration (API + Prisma) + E2E limitado (fluxos críticos mobile)
2. **Tooling:** Jest (unit/integration backend), Supertest (API), a definir para mobile
3. **CI/CD:** PR: todos os testes funcionais; Nightly: performance (quando aplicável)
4. **Cobertura:** ~50-80 cenários priorizados P0-P3 com classificação baseada em risco
5. **Quality gates:** P0 = 100%, P1 ≥ 95%, cobertura ≥ 80%

---

## Para Arquitetos e Devs — Tópicos Abertos 👷

### Risk Assessment

**Total de riscos identificados:** 10 (2 alta prioridade score ≥6, 3 médio, 5 baixo)

#### Riscos de Alta Prioridade (Score ≥6)

| Risk ID | Categoria | Descrição | P | I | Score | Mitigação | Dono | Timeline |
|---|---|---|---|---|---|---|---|---|
| **R-001** | **TECH** | Integração Effect TS + NestJS mais complexa que o esperado | 2 | 3 | **6** | Spike técnico semana 1: validar ManagedRuntime + useFactory com 1 use case | Lucas | Semana 1 |
| **R-003** | **DATA** | Offline sync — perda de dados de check-in (last-write-wins) | 2 | 3 | **6** | Unit tests para offline-queue, testes com simulação de crash | Lucas | Epic 3 |

#### Riscos de Prioridade Média (Score 4-5)

| Risk ID | Categoria | Descrição | P | I | Score | Mitigação | Dono |
|---|---|---|---|---|---|---|---|
| R-002 | PERF | SSE/Redis Pub/Sub — latência ou desconexão em áreas rurais | 2 | 2 | 4 | Testes de latência ponta-a-ponta; fallback para polling | Lucas |
| R-005 | SEC | QR code transferível entre alunos (estático por sessão) | 2 | 2 | 4 | Aceitar no MVP; QR dinâmico na Fase 2 | Lucas |
| R-006 | BUS | Prazo de 2 meses insuficiente — features cortadas | 2 | 2 | 4 | Priorização rigorosa do backlog | Lucas |

#### Riscos de Baixa Prioridade (Score 1-3)

| Risk ID | Categoria | Descrição | P | I | Score | Ação |
|---|---|---|---|---|---|---|
| R-004 | SEC | Vazamento de dados entre tenants | 1 | 3 | 3 | Document |
| R-007 | PERF | Check-in > 2s (NFR1) | 1 | 2 | 2 | Document |
| R-008 | PERF | GPS não funciona em áreas sem cobertura | 3 | 1 | 3 | Document |
| R-009 | DATA | Crash do app perde dados offline (NFR11) | 1 | 3 | 3 | Document |
| R-010 | TECH | Effect Schema + NestJS Pipe — edge cases | 2 | 1 | 2 | Document |

#### Legenda de Categorias

- **TECH**: Técnico/Arquitetura (falhas de integração, escalabilidade)
- **SEC**: Segurança (controle de acesso, exposição de dados)
- **PERF**: Performance (latência, degradação)
- **DATA**: Integridade de dados (perda, corrupção)
- **BUS**: Impacto no negócio (UX, prazos)
- **OPS**: Operações (deploy, monitoramento)

---

### Preocupações de Testabilidade e Gaps Arquiteturais

**🚨 PREOCUPAÇÕES ACIONÁVEIS**

#### 1. Blockers para Feedback Rápido

| Preocupação | Impacto | O Que a Arquitetura Deve Fornecer | Dono | Timeline |
|---|---|---|---|---|
| **Sem Seeding APIs** | Impossível testar edge cases | Prisma seed scripts + data factories para cenários de teste | Lucas | Pré-implementação |
| **Padrão de teste Effect TS indefinido** | Testes acoplados ao NestJS | Documentar: `Effect.provide(TestLayer)` com ports mockados | Lucas | Story 1.3 |

#### 2. Melhorias Arquiteturais Necessárias

1. **Framework de testes E2E/API**
   - **Problema:** Apenas Jest + jest-e2e.json configurados. Sem Supertest integrado ao fluxo completo.
   - **Mudança:** Configurar Supertest para testes de API; avaliar Detox/Maestro para mobile.
   - **Impacto se não feito:** Testes de integração REST → Effect TS → Prisma não têm framework.
   - **Dono:** Lucas — **Timeline:** Story 1.1

2. **Mecanismo de teste SSE**
   - **Problema:** SSE + Redis Pub/Sub sem padrão de teste definido.
   - **Mudança:** Implementar testes com publish no Redis → assert no EventSource client.
   - **Impacto se não feito:** Bugs de latência/desconexão SSE passam despercebidos.
   - **Dono:** Lucas — **Timeline:** Epic 5

3. **Validação transversal de multi-tenancy**
   - **Problema:** Se qualquer query esquecer o filtro `companyId`, há vazamento entre tenants.
   - **Mudança:** Testes de integração: tenant A não vê dados do tenant B, por endpoint.
   - **Impacto se não feito:** Vazamento de dados entre empresas (risco de segurança).
   - **Dono:** Lucas — **Timeline:** Epic 2

---

### Testability Assessment Summary

#### O Que Funciona Bem

- ✅ Inversão de dependência explícita — Ports (Effect Tags) no `core/`, Adapters no `shell/`
- ✅ Domain Events como return tuple — `WithEvents<A>` permite verificar eventos sem side effects
- ✅ Erros tipados via Effect — `StudentNotFound`, `InvalidQRCode` permitem assertions precisas
- ✅ Functional Core puro — testes ultrarrápidos (<100ms) sem NestJS/Prisma/Redis
- ✅ Formato de resposta padronizado — `{ data, meta }` e `{ error: { code, message, details } }`
- ✅ Swagger/OpenAPI — documentação automática útil para contract testing futuro

#### Trade-offs Aceitos (Sem Ação Necessária)

- **QR code estático por sessão (NFR8):** Segurança adequada para protótipo/TCC. QR dinâmico na Fase 2.
- **Refresh token sem rotation:** Simples para MVP. Interface de token store já prevê rotation futura.
- **Sem CI/CD (GitHub Actions):** Dev solo, distribuição via Expo Go. Deferido para pós-MVP.
- **Sem rate limiting:** Sem exposição pública no MVP.

---

### Planos de Mitigação (Riscos Alta Prioridade ≥6)

#### R-001: Integração Effect TS + NestJS (Score: 6)

**Estratégia de Mitigação:**
1. Spike técnico na semana 1: implementar `EffectRuntimeModule` com 1 use case simples (health check)
2. Validar `ManagedRuntime` + `useFactory` com PrismaService injetado
3. Criar teste de integração que execute programa Effect via `runtime.runPromise()`

**Dono:** Lucas
**Timeline:** Semana 1 (Story 1.3)
**Status:** Planejado
**Verificação:** Teste de integração passa — programa Effect executa e retorna resultado correto via NestJS service.

#### R-003: Offline Sync — Perda de Dados (Score: 6)

**Estratégia de Mitigação:**
1. Unit tests extensivos para `offline-queue.ts` (enqueue, dequeue, conflict resolution)
2. Testes com simulação de crash (kill + restart) validando persistência
3. Validar last-write-wins com cenários de conflito documentados

**Dono:** Lucas
**Timeline:** Epic 3 (Story 3.4)
**Status:** Planejado
**Verificação:** Dados de check-in persistem após crash simulado; conflitos resolvidos conforme regra.

---

### Premissas e Dependências

#### Premissas

1. Expo SDK 55 + NestJS v11 + Prisma v7 + Effect TS não possuem conflitos de compatibilidade (verificado na Architecture)
2. `ManagedRuntime` do Effect TS funciona com `useFactory` do NestJS sem dependências externas
3. SSE nativo do NestJS + Redis Pub/Sub seguem padrão documentado
4. Prisma v7 `moduleFormat = "cjs"` resolve compatibilidade ESM/CJS com NestJS

#### Dependências

1. Docker Compose (PostgreSQL + Redis) funcional — Necessário para testes de integração (Story 1.1)
2. Prisma schema + migrations — Necessário antes dos testes de persistência (Story 1.2)
3. Effect TS Composition Root — Necessário antes de qualquer teste de domínio (Story 1.3)

---

**Fim do Documento de Arquitetura**

**Próximos Passos:**
1. Revisar Quick Guide (🚨/⚠️/📋) e priorizar blockers
2. Atribuir donos e timelines para riscos de alta prioridade (≥6)
3. Validar premissas e dependências
4. Consultar documento QA (`test-design-qa.md`) para cenários de teste
