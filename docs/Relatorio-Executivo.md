# PureUrban — Relatório Executivo de Progresso

**Projeto:** PureUrban — Plataforma de gestão de embarque para transporte universitário intermunicipal
**Contexto duplo:** Produto B2B2C (empresas/prefeituras → motoristas/alunos) + Trabalho de Conclusão de Curso (TCC) em Engenharia de Software
**Autor:** Lucas
**Data do relatório:** 11/05/2026
**Período coberto:** 14/03/2026 — 11/05/2026 (≈ 8 semanas)
**Fonte de verdade:** `_bmad-output/implementation-artifacts/sprint-status.yaml` + retrospectivas dos Épicos 1 e 2 (11/05/2026)

---

## 1. Visão Geral

O PureUrban substitui o processo manual de carteirinhas físicas e grupos de WhatsApp por um fluxo digital de check-in via QR Code, notificações estruturadas de ausência e visibilidade operacional da frota em tempo real. Nesta primeira fase de execução, o foco foi consolidar **fundação técnica** e **gestão de identidade/organização**, criando a base sobre a qual as features visíveis ao usuário final serão construídas.

As retrospectivas dos Épicos 1 e 2 foram realizadas em **11/05/2026**, encerrando formalmente os dois primeiros épicos com padrões arquiteturais estabilizados, débito técnico catalogado e ações de continuidade definidas.

### Status geral

| Indicador                       | Valor                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| **Conclusão por stories**       | **11 de 24 (≈ 46%)**                                                                   |
| **Épicos formalmente fechados** | 2 de 5 (Épicos 1 e 2 — 100% das stories `done` + retrospectivas concluídas)            |
| **Épico em execução ativa**     | Epic 3 — Gestão de Viagens e Embarque Digital                                          |
| **Épicos em backlog**           | Epic 4 (Comunicação) e Epic 5 (Localização em Tempo Real)                              |
| **Testes ao fim do Epic 2**     | 143                                                                                    |
| **Endpoints REST entregues**    | 30 (auth, drivers, students, routes, assignments)                                      |
| **Telas mobile entregues**      | 2 (`(auth)/login.tsx`, `(driver)/routes.tsx`)                                          |
| **Bloqueios atuais**            | Nenhum bloqueio formal — porém Story 3.1 exige re-validação antes da 3.2 (ver §6 / R2) |

---

## 2. Progresso por Épico

### Epic 1 — Fundação do Projeto e Infraestrutura · ✅ 5/5 stories `done` · Retro **concluída**

Toda a base estrutural foi entregue: monorepo inicializado, schema Prisma multi-schema (6 schemas PostgreSQL desde o dia 1), Effect TS com Composition Root, infraestrutura compartilhada (guards, filters, pipes — 52 testes) e setup mobile (Expo SDK 55 + offline-first com MMKV/expo-sqlite).

- 1.1 Inicialização dos Projetos e Repositório — done
- 1.2 Schema Prisma e Configuração do Banco de Dados — done
- 1.3 Setup Effect TS e Composition Root — done
- 1.4 Infraestrutura Compartilhada (Guards, Filters, Pipes) — done
- 1.5 Setup Mobile (Dependências e Configuração Offline) — done

**Conclusões da retrospectiva:** stack ousada (Effect TS + Prisma v7 + Expo SDK 55 + NestJS v11) entregou; pureza funcional do core mantida (zero imports `@nestjs/*` em `core/`); curva do Effect TS pesou na 1.3 (10 itens deferidos); padrões finais só emergiram com o primeiro bounded context real (3.1), não no scaffolding.

### Epic 2 — Identidade, Acesso e Organização · ✅ 6/6 stories `done` · Retro **concluída**

Pilar de identidade completo no backend: cadastro de empresa com seed, autenticação JWT com refresh token (interceptor mobile com mutex anti race-condition), gestão de motoristas e alunos, CRUD de rotas e vínculos aluno↔rota e motorista↔rota. Documentação OpenAPI/Swagger publicada como entregável complementar. FRs cobertos: **FR1–FR10**.

- 2.1 Cadastro de Empresa e Seed Inicial — done
- 2.2 Autenticação (Login e Refresh Token) — done
- 2.3 Cadastro e Gestão de Motoristas — done
- 2.4 Cadastro e Gestão de Alunos — done
- 2.5 CRUD de Rotas de Transporte — done (com patches pós-review aplicados)
- 2.6 Vínculos Aluno-Rota e Motorista-Rota — done

**Conclusões da retrospectiva:** padrão `domain-scoped runtime` (`AUTH_RUNTIME`, `STUDENT_RUNTIME`, `ROUTING_RUNTIME`) consolidado e replicável; bug latente em `RolesGuard` (class-level metadata) só descoberto na 2.6 — corrigido com `getAllAndOverride`; **11 débitos sistêmicos catalogados e aceitos como débito declarado de TCC** (segurança, performance, multi-tenancy, resiliência); Story 3.1 (Trip) ficou parcialmente implementada antes do Epic 2 com `JwtAuthGuard` comentado e `Trip.routeId` sem validação — requer re-validação como critical path.

### Epic 3 — Gestão de Viagens e Embarque Digital · 🟡 0/5 `done`, 1/5 `ready-for-dev`

É o épico em foco no momento — onde o produto começa a entregar valor visível ao usuário final.

- 3.1 Iniciar e Encerrar Viagem — **ready-for-dev** (parcialmente implementada antes do Epic 2; precisa re-validação antes de avançar — ver §6)
- 3.2 Geração e Exibição de QR Code do Aluno — backlog
- 3.3 Escaneamento de QR Code e Check-in — backlog (depende de 3.2 + novo bounded context `boarding/`)
- 3.4 Check-in Offline com Sincronização — backlog (depende de 3.3 + `offline_queue` SQLite)
- 3.5 Lista de Alunos e Status de Embarque — backlog

### Epic 4 — Notificação de Ausência e Comunicação · ⚪ 0/5 (backlog)

Ainda não iniciado. Inclui as funcionalidades de "Não Vou Voltar", recebimento pelo motorista, cancelamento dentro do período de segurança, lembrete automático de check-in pendente e avisos gerais.

### Epic 5 — Localização em Tempo Real · ⚪ 0/3 (backlog)

Ainda não iniciado. Inclui transmissão GPS via SSE, visualização do ônibus no mapa pelo aluno e tratamento de degradação por perda de sinal.

---

## 3. Resumo Visual

```
Epic 1  ██████████  100%  (5/5)   Fundação                    ✅ retro done
Epic 2  ██████████  100%  (6/6)   Identidade & Organização    ✅ retro done
Epic 3  ░░░░░░░░░░    0%  (0/5)   Viagens & Embarque          🟡 em execução
Epic 4  ░░░░░░░░░░    0%  (0/5)   Comunicação                 ⚪ backlog
Epic 5  ░░░░░░░░░░    0%  (0/3)   Localização em Tempo Real   ⚪ backlog
                              ─────
TOTAL                 46%  (11/24 stories)
```

---

## 4. Conquistas no Período

1. **Arquitetura de referência funcionando**: Functional Core (Effect TS) + Imperative Shell (NestJS) integrados via Composition Root com event dispatcher — alinhado ao recorte acadêmico do TCC.
2. **Bounded context de Identidade & Acesso completo**: empresa, motorista, aluno, autenticação e rotas operacionais via 16+ endpoints REST, com 143 testes passando.
3. **Padrão arquitetural estabilizado e replicável**: `domain-scoped runtime` + `Data.TaggedError` + Prisma error mapping (P2002/P2003/P2025) + service stripping de campos sensíveis. Story 2.4 nasceu pronta, validando a maturidade do padrão.
4. **Mobile preparado para produção**: cliente Expo com configuração offline, race-condition de refresh resolvida com mutex, tratamento de timeout HTTP e parsing JSON seguro.
5. **Disciplina de revisão**: code reviews aplicados em todas as stories implementadas, com itens não bloqueantes registrados em `deferred-work.md` (rastreabilidade preservada).
6. **Débito técnico transparente**: 11 lacunas de production-readiness catalogadas e formalmente aceitas como débito declarado de TCC, com plano de documentação no PRD/Architecture.
7. **Documentação operacional**: PRD, Arquitetura, Épicos, Sprint Plan, Test Design, OpenAPI/Swagger e retrospectivas dos Épicos 1 e 2 publicados.

---

## 5. Riscos & Itens de Atenção

| #   | Risco / Atenção                                                                                                          | Impacto                                   | Recomendação                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| R1  | Cadência irregular (13 dias ativos em 8 semanas)                                                                         | Médio — afeta previsibilidade do TCC      | Definir meta semanal mínima de stories durante Epic 3                                              |
| R2  | **Story 3.1 (Trip) parcialmente implementada antes do Epic 2** — `JwtAuthGuard` comentado e `Trip.routeId` sem validação | 🔴 **Alto** — critical path para 3.2      | Re-validar antes de iniciar 3.2 (religar guard, validar `routeId` no use-case, sincronizar status) |
| R3  | 11 débitos sistêmicos acumulados (segurança, performance, multi-tenancy, resiliência)                                    | Médio se for para produção; baixo no TCC  | Documentar como "Trabalhos Futuros — Production Readiness" no PRD/Architecture                     |
| R4  | Reviews adversariais sem severidade calibrada (CRITICAL/HIGH/MEDIUM/LOW)                                                 | Baixo — mas mistura crítico com cosmético | Aplicar template de severidade já a partir da Story 3.2                                            |
| R5  | Epic 5 (GPS/SSE) é o de maior incerteza técnica e está intocado                                                          | Médio — pode gerar surpresa tardia        | Antecipar spike técnico curto de SSE+Redis em paralelo ao Epic 3                                   |
| R6  | Mobile crescerá de 2 para 6+ telas no Epic 3 sem padrões de query keys, error boundary e offline indicator definidos     | Médio                                     | Estabelecer padrões mobile no `_layout.tsx` antes da 3.3                                           |

---

## 6. Próximos Passos (Sprint Imediato)

**Foco:** destravar Epic 3 com segurança, aplicando as ações capturadas nas retrospectivas.

### Critical path

1. **Re-validar Story 3.1 (Trip)** antes de iniciar a 3.2:
   - Religar `JwtAuthGuard` no `TripController`
   - Verificar `RolesGuard` com fix `getAllAndOverride` aplicado a `@Roles(['DRIVER'])`
   - Adicionar validação de `routeId` no use-case `startTrip` via `RouteRepository.findByIdAndCompany`
   - Sincronizar `sprint-status.yaml` (3.1 deve refletir o estado real: `review` ou `done`)

### Sprint 3 — execução

2. Após consolidar 3.1, criar e executar **Story 3.2 — Geração e Exibição de QR Code do Aluno** (decisão de design do payload).
3. Preparar contexto para **Story 3.3 — Escaneamento e Check-in** (novo bounded context `boarding/` seguindo o template de `routing/`).
4. **Definir padrões mobile** antes da 3.3: query keys TanStack Query, error boundary global no Expo Router, offline indicator via `useAppStore.isOnline`, pull-to-refresh com `RefreshControl`, distinção entre empty-state e error-state.

### Processo

5. **Calibrar reviews por severidade** já na Story 3.2 — apenas CRITICAL e HIGH obrigam patch antes de `done`; MEDIUM/LOW vão para `deferred-work.md`.
6. **Documentar "Trabalhos Futuros — Production Readiness"** no PRD ou Architecture, listando os 11 débitos sistêmicos com categoria, severidade e mitigação proposta — insumo direto para a defesa do TCC.

### Mitigação de risco antecipada

7. Avaliar spike técnico de SSE/Redis (preparação para Epic 5) em paralelo, sem desviar o foco do Epic 3.

---

## 7. Indicadores para o TCC

| Indicador                                                                    | Estado                                                                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| PRD formalizado                                                              | ✅ `_bmad-output/planning-artifacts/prd.md`                                                           |
| Arquitetura documentada (Hexagonal + DDD + Functional Core/Imperative Shell) | ✅ `_bmad-output/planning-artifacts/architecture.md` (com seção "Production Readiness" em elaboração) |
| Referencial teórico TCC                                                      | ✅ `_bmad-output/planning-artifacts/referencial-teorico-tcc.md`                                       |
| Retrospectivas com métricas e lições                                         | ✅ Épicos 1 e 2 (`epic-1-retro-2026-05-11.md`, `epic-2-retro-2026-05-11.md`)                          |
| Implementação validando a arquitetura proposta                               | 🟡 parcial — Epics 1 e 2 demonstram o padrão; Epics 3–5 consolidarão a evidência                      |
| Test design                                                                  | ✅ `_bmad-output/test-artifacts/`                                                                     |
| Débito técnico catalogado e justificado                                      | ✅ `deferred-work.md` + síntese na retro do Epic 2 (11 itens sistêmicos)                              |

---

_Relatório gerado pelo Scrum Master (persona Bob) com base no `sprint-status.yaml` e nas retrospectivas dos Épicos 1 e 2 em 11/05/2026. Próxima atualização recomendada após o fechamento da Story 3.3 (validação do bounded context `boarding/`) ou ao final do Epic 3._

