---
title: 'TEA Test Design → BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments: ['test-artifacts/test-design-architecture.md', 'test-artifacts/test-design-qa.md']
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-03-27T21:20:00-03:00'
projectName: 'pureurban'
---

# TEA → BMAD Integration Handoff

## Propósito

Este documento conecta os outputs do TEA test design com o workflow de decomposição em épicos/stories do BMAD (`create-epics-and-stories`). Fornece orientação estruturada para que requisitos de qualidade, avaliações de risco e estratégias de teste fluam para o planejamento de implementação.

## TEA Artifacts Inventory

| Artefato | Caminho | Ponto de Integração BMAD |
|---|---|---|
| Test Design Architecture | `_bmad-output/test-artifacts/test-design-architecture.md` | Requisitos de qualidade por épico, gates |
| Test Design QA | `_bmad-output/test-artifacts/test-design-qa.md` | Cenários de teste por story, ACs |
| Risk Assessment | (embedded nos docs acima) | Classificação de risco por épico, prioridade de story |
| Progress Tracker | `_bmad-output/test-artifacts/test-design-progress.md` | Rastreamento de progresso |

## Epic-Level Integration Guidance

### Risk References

| Risk ID | Épico Impactado | Score | Ação no Épico |
|---|---|---|---|
| R-001 | Epic 1 (Fundação) | 6 | Spike técnico na Story 1.3 — validar Effect TS + NestJS antes de expandir |
| R-003 | Epic 3 (Embarque Digital) | 6 | Testes de persistência offline na Story 3.4 |
| R-002 | Epic 5 (Localização) | 4 | Testes de latência SSE em Story 5.1 |
| R-004 | Epic 2 (Identidade) | 3 | Testes multi-tenancy em cada endpoint |
| R-005 | Epic 3 (Embarque Digital) | 4 | Aceitar no MVP; QR dinâmico na Fase 2 |

### Quality Gates por Épico

| Épico | Gate de Qualidade |
|---|---|
| Epic 1 | Effect Runtime funcional; Composition Root testável; Docker Compose operacional |
| Epic 2 | Multi-tenancy validado por endpoint; JWT lifecycle completo; RBAC enforced |
| Epic 3 | Check-in end-to-end testado; offline queue persistente; QR validation funcional |
| Epic 4 | Notificação < 3s; cancelamento com período de segurança; lembrete automático |
| Epic 5 | GPS → Redis → SSE latência ≤ 5s; comportamento degradado (sem sinal) |

## Story-Level Integration Guidance

### P0/P1 Test Scenarios → Story Acceptance Criteria

| Cenário de Teste | Story Recomendada | Acceptance Criteria Sugerido |
|---|---|---|
| P0-004: Check-in via QR code (happy path) | Story 3.3 | "Check-in registrado com studentId, tripId, timestamp" |
| P0-006: Notificação "não vou voltar" | Story 4.1 | "Evento boarding.not_returning emitido com studentId, tripId" |
| P0-007: TenantGuard filtra por companyId | Stories 2.3-2.6 | "Dados de outra empresa não são visíveis (TenantGuard)" |
| P0-009: Effect Runtime executa programa | Story 1.3 | "Programa Effect executa via ManagedRuntime com sucesso" |
| P1-011: GPS via REST → Redis → SSE | Story 5.1/5.2 | "Localização atualizada com latência ≤ 5s via SSE" |

### Data-TestId Requirements

| Componente | data-testid Recomendado | Story |
|---|---|---|
| Botão "Não vou voltar" | `not-returning-button` | Story 4.1 |
| QR Code do aluno | `student-qr-code` | Story 3.2 |
| Scanner de QR (motorista) | `qr-scanner` | Story 3.3 |
| Lista de alunos | `student-list` | Story 3.5 |
| Contagem de embarque | `boarding-count` | Story 3.5 |
| Mapa de localização | `bus-map` | Story 5.2 |
| Indicador offline | `offline-indicator` | Story 3.4 |
| Botão iniciar viagem | `start-trip-button` | Story 3.1 |

## Risk-to-Story Mapping

| Risk ID | Categoria | P×I | Story Recomendada | Nível de Teste |
|---|---|---|---|---|
| R-001 | TECH | 2×3=6 | Story 1.3 (Effect TS Setup) | Integration |
| R-002 | PERF | 2×2=4 | Story 5.1 (GPS Transmissão) | Integration |
| R-003 | DATA | 2×3=6 | Story 3.4 (Check-in Offline) | Unit + Integration |
| R-004 | SEC | 1×3=3 | Stories 2.3-2.6 (CRUD endpoints) | Integration |
| R-005 | SEC | 2×2=4 | Story 3.2 (QR Code) | Unit |
| R-006 | BUS | 2×2=4 | N/A (gestão de projeto) | — |
| R-007 | PERF | 1×2=2 | Story 3.3 (Check-in) | Integration |
| R-008 | PERF | 3×1=3 | Story 5.3 (GPS Degradado) | Unit |
| R-009 | DATA | 1×3=3 | Story 3.4 (Check-in Offline) | Unit |
| R-010 | TECH | 2×1=2 | Story 1.4 (Shared Kernel) | Unit |

## Sequência Recomendada BMAD → TEA

1. **TEA Test Design** (`TD`) → produz este documento de handoff ✅
2. **BMAD Create Epics & Stories** → consome este handoff, embute requisitos de qualidade
3. **TEA ATDD** (`AT`) → gera testes de aceitação por story
4. **BMAD Implementation** → devs implementam com orientação test-first
5. **TEA Automate** (`TA`) → gera suite de testes completa
6. **TEA Trace** (`TR`) → valida completude da cobertura

## Phase Transition Quality Gates

| De | Para | Critérios do Gate |
|---|---|---|
| Test Design | Criação de Epic/Story | Todos os riscos P0 têm estratégia de mitigação |
| Criação de Epic/Story | ATDD | Stories têm ACs derivados do test design |
| ATDD | Implementação | Testes de aceitação falhando existem para P0/P1 |
| Implementação | Automação de Testes | Todos os testes de aceitação passando |
| Automação de Testes | Release | Matriz de rastreabilidade mostra ≥80% cobertura P0/P1 |
