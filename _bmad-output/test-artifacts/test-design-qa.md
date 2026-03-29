---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
lastSaved: '2026-03-27'
workflowType: 'testarch-test-design'
inputDocuments: ['planning-artifacts/prd.md', 'planning-artifacts/architecture.md', 'planning-artifacts/epics.md']
---

# Test Design for QA: PureUrban

**Propósito:** Receita de execução de testes para o QA/Dev. Define o que testar, como testar, e o que é necessário de outros times.

**Data:** 2026-03-27
**Autor:** TEA Master Test Architect
**Status:** Draft
**Projeto:** PureUrban

**Relacionado:** Ver documento de Arquitetura (`test-design-architecture.md`) para preocupações de testabilidade e blockers arquiteturais.

---

## Sumário Executivo

**Escopo:** Testes para 5 bounded contexts (auth, routing, boarding, tracking, trip) cobrindo 37 FRs e 20 NFRs do PureUrban MVP.

**Resumo de Riscos:**
- Total: 10 (2 alta prioridade score ≥6, 3 médio, 5 baixo)
- Categorias críticas: TECH, DATA

**Resumo de Cobertura:**
- P0: ~12 testes (fluxos críticos, segurança)
- P1: ~18 testes (features importantes, integração)
- P2: ~15 testes (edge cases, regressão)
- P3: ~5 testes (exploratórios, benchmarks)
- **Total:** ~50 testes (~2-4 semanas com 1 QA/Dev)

---

## Fora do Escopo

| Item | Razão | Mitigação |
|---|---|---|
| **Dashboard administrativo (Dona Márcia)** | Fora do MVP (Fase 2) | Validado manualmente se necessário |
| **Push notifications complexas** | Fora do MVP | Básico via Expo Push API na Fase 2 |
| **Publicação em loja** | Distribuição via Expo Go | Testes de build de produção deferidos |
| **Testes E2E mobile automatizados** | Sem Detox/Maestro configurado | Testes manuais nos fluxos mobile |

---

## Dependências & Blockers de Teste

**Fonte:** Ver Architecture doc "Quick Guide" para planos de mitigação detalhados.

### Dependências de Backend/Arquitetura (Pré-Implementação)

1. **Seeding APIs / Data Factories** — Lucas — Story 1.2
   - QA precisa de: Prisma seed scripts para criar Company, User, Route, Trip de teste
   - Bloqueia: Qualquer teste de integração

2. **Padrão de teste Effect TS documentado** — Lucas — Story 1.3
   - QA precisa de: Exemplo funcional de `Effect.provide(TestLayer)` com ports mockados
   - Bloqueia: Testes de unit do functional core

### Infraestrutura QA (Pré-Implementação)

1. **Data Factories** — Lucas
   - Factory para `Company`, `User` (admin/driver/student), `Route`, `Trip`, `BoardingRecord`
   - Auto-cleanup via `afterEach()` ou fixture teardown

2. **Ambiente de Teste**
   - Local: Docker Compose (PostgreSQL + Redis) + `npm test`
   - CI: A configurar pós-MVP

**Padrão de factory recomendado:**

```typescript
// test/factories/user.factory.ts
import { faker } from '@faker-js/faker';

export const createTestUser = (overrides: Partial<UserCreateInput> = {}) => ({
  email: faker.internet.email(),
  name: faker.person.fullName(),
  password: 'test-password-123',
  role: 'student' as const,
  companyId: overrides.companyId ?? 'test-company-id',
  ...overrides,
});

export const createTestCompany = (overrides: Partial<CompanyCreateInput> = {}) => ({
  name: faker.company.name(),
  ...overrides,
});
```

---

## Risk Assessment

**Nota:** Detalhes completos no Architecture doc. Esta seção resume riscos relevantes para planejamento de testes.

### Riscos de Alta Prioridade (Score ≥6)

| Risk ID | Categoria | Descrição | Score | Cobertura QA |
|---|---|---|---|---|
| **R-001** | TECH | Integração Effect TS + NestJS | **6** | Testes de integração do EffectRuntimeModule — programa Effect executa via runtime |
| **R-003** | DATA | Perda de dados offline sync | **6** | Unit tests offline-queue, testes de persistência com crash simulado |

### Riscos Médios/Baixos

| Risk ID | Categoria | Descrição | Score | Cobertura QA |
|---|---|---|---|---|
| R-002 | PERF | Latência SSE/Redis | 4 | Testes de latência ponta-a-ponta com timer assertions |
| R-004 | SEC | Vazamento entre tenants | 3 | Testes multi-tenant: tenant A ≠ tenant B por endpoint |
| R-005 | SEC | QR code transferível | 4 | Validar que QR contém sessionId único por login |
| R-008 | PERF | GPS sem cobertura | 3 | Testar comportamento degradado (último ponto conhecido) |

---

## Entry Criteria

- [ ] Docker Compose (PostgreSQL + Redis) rodando
- [ ] Prisma migrations aplicadas
- [ ] Data factories implementadas
- [ ] Effect TS Composition Root funcional (Story 1.3 completa)
- [ ] API rodando em ambiente de teste local

## Exit Criteria

- [ ] Todos os testes P0 passando (100%)
- [ ] Todos os testes P1 passando (≥95%)
- [ ] Nenhum bug aberto de alta severidade
- [ ] Cobertura de código ≥ 80% no functional core

---

## Test Coverage Plan

**IMPORTANTE:** P0/P1/P2/P3 = **prioridade e nível de risco** (o que focar se tempo for limitado), NÃO timing de execução. Ver "Execution Strategy" para quando os testes rodam.

### P0 (Crítico)

**Critérios:** Bloqueia funcionalidade core + Alto risco (≥6) + Sem workaround

| Test ID | Requisito | Nível | Risk Link | Notas |
|---|---|---|---|---|
| **P0-001** | FR4/FR5: Login com credenciais válidas retorna JWT | Unit | — | Functional core: validação + geração de token |
| **P0-002** | FR4/FR5: Login com credenciais inválidas retorna 401 | Unit | — | Tagged error `InvalidCredentials` |
| **P0-003** | FR6: Aluno inativo rejeitado no check-in | Unit | — | Validação de permissão no core |
| **P0-004** | FR15-FR18: Check-in via QR code (happy path) | Integration | R-001 | REST → Effect → Prisma → response |
| **P0-005** | FR20: QR code inválido/expirado rejeitado | Integration | — | Tagged error `InvalidQRCode` |
| **P0-006** | FR26: Aluno notifica "não vou voltar" | Integration | — | Fluxo core → evento `boarding.not_returning` |
| **P0-007** | Multi-tenancy: TenantGuard filtra por companyId | Integration | R-004 | Tenant A não vê dados do Tenant B |
| **P0-008** | RBAC: Endpoint de admin rejeitado para student | Integration | — | RolesGuard + 403 |
| **P0-009** | Effect TS Runtime: programa executa via ManagedRuntime | Integration | R-001 | Composition Root funcional |
| **P0-010** | FR11: Motorista inicia viagem | Integration | — | Trip created com status ACTIVE |
| **P0-011** | NFR7: JWT access token expira em 15min, refresh funciona | Integration | — | Token lifecycle |
| **P0-012** | Formato de resposta padronizado (sucesso e erro) | Integration | — | `{ data, meta }` e `{ error: { code, message } }` |

**Total P0:** ~12 testes

---

### P1 (Alto)

**Critérios:** Features importantes + Risco médio (3-4) + Fluxos comuns

| Test ID | Requisito | Nível | Risk Link | Notas |
|---|---|---|---|---|
| **P1-001** | FR1: Cadastro de empresa com admin | Integration | — | POST /api/v1/auth/register |
| **P1-002** | FR7: CRUD de rotas (create, read, update, delete) | Integration | — | 4 operações filtradas por tenant |
| **P1-003** | FR8/FR9: Vínculo aluno-rota e motorista-rota | Integration | — | POST /api/v1/routes/:id/students |
| **P1-004** | FR2: Cadastro de motorista vinculado à empresa | Integration | — | companyId do admin |
| **P1-005** | FR3: Cadastro de aluno com permissão de embarque | Integration | — | isActive = true |
| **P1-006** | FR12: Motorista encerra viagem | Integration | — | status = COMPLETED, endedAt |
| **P1-007** | FR13: Viagem de retorno (type = RETURN) | Integration | — | Mesma rota |
| **P1-008** | FR22-FR25: Lista de alunos com contagem | Integration | — | "28/32 embarcados" |
| **P1-009** | FR27: Motorista recebe notificação de ausência | Integration | — | Evento emitido < 3s |
| **P1-010** | FR29: Cancelamento de ausência dentro de 2min | Integration | — | Período de segurança |
| **P1-011** | FR31/FR35: GPS via REST → Redis → SSE | Integration | R-002 | Fluxo real-time |
| **P1-012** | FR36: Motorista envia aviso geral | Integration | — | Broadcast para alunos da rota |
| **P1-013** | Domain Events: WithEvents retorna tupla correta | Unit | — | noEvents, withEvents |
| **P1-014** | Effect Schema: validação de DTOs | Unit | — | Pipe converte erro → HTTP 400 |
| **P1-015** | FR10: Motorista vê rotas atribuídas (GET /routes/mine) | Integration | — | Filtrado por motorista |
| **P1-016** | ExceptionFilter: tagged errors → HTTP status | Unit | — | StudentNotFound → 404 |
| **P1-017** | NFR17: Multi-tenancy — isolamento de dados | Integration | — | Queries filtradas por companyId |
| **P1-018** | FR14: Registro de horários início/fim de viagem | Integration | — | startedAt, endedAt persistidos |

**Total P1:** ~18 testes

---

### P2 (Médio)

**Critérios:** Features secundárias + Baixo risco (1-2) + Edge cases

| Test ID | Requisito | Nível | Risk Link | Notas |
|---|---|---|---|---|
| **P2-001** | FR21: Check-in offline — queue de persistência | Unit | R-003 | offline-queue.ts |
| **P2-002** | NFR12: Sync offline→online last-write-wins | Unit | R-003 | Resolução de conflitos |
| **P2-003** | FR34: Último ponto GPS conhecido (sem sinal) | Unit | R-008 | Comportamento degradado |
| **P2-004** | FR33: GPS para quando viagem encerra (trip.ended) | Integration | — | Event listener |
| **P2-005** | FR30: Lembrete automático check-in pendente | Integration | — | Push notification para aluno |
| **P2-006** | FR29: Cancelamento após período → erro CANCELLATION_PERIOD_EXPIRED | Unit | — | Regra de negócio |
| **P2-007** | NFR1: Check-in < 2s (benchmark) | Integration | R-007 | Timer assertion |
| **P2-008** | NFR2: Latência GPS ≤ 5s | Integration | R-002 | SSE latency |
| **P2-009** | NFR4: Lista de alunos < 1s com 50+ alunos | Integration | — | Performance |
| **P2-010** | FR19: Check-in com timestamp + identificação | Unit | — | Registro de boarding |
| **P2-011** | Swagger/OpenAPI: endpoints documentados | Integration | — | @ApiTags, @ApiOperation |
| **P2-012** | EventEmitter2: dispatch de domain events | Integration | — | Shell dispatch correto |
| **P2-013** | EffectEventDispatcher: runAndDispatch funcional | Unit | — | Helper utility |
| **P2-014** | Prisma adapter: CRUD operations | Integration | — | Port → Adapter → DB |
| **P2-015** | Redis adapter: GPS store/retrieve | Integration | — | LocationStore port |

**Total P2:** ~15 testes

---

### P3 (Baixo)

**Critérios:** Nice-to-have + Exploratório + Benchmarks

| Test ID | Requisito | Nível | Notas |
|---|---|---|---|
| **P3-001** | NFR5: App inicia < 3s em Android 8+ | Manual | Mobile performance |
| **P3-002** | Effect Schema: edge cases de validação | Unit | Inputs exóticos |
| **P3-003** | NFR13: Interface offline mode visual | Manual | "Modo Offline" indicador |
| **P3-004** | NFR18/NFR19: Botões grandes, max 2 toques | Manual | UX validation |
| **P3-005** | Redis Pub/Sub: reconexão após falha | Integration | Resiliência |

**Total P3:** ~5 testes

---

## Execution Strategy

**Filosofia:** Rodar tudo nos PRs se < 15 min. Deferir apenas testes caros ou de longa duração.

### Todo PR: Jest Tests (~2-5 min)

**Todos os testes funcionais** (de qualquer nível de prioridade):
- Unit tests do functional core (Effect TS) — ultrarrápidos (<100ms/suite)
- Integration tests via Supertest (API endpoints)
- Paralelizados via Jest `--maxWorkers`
- Total: ~45 testes Jest (P0 + P1 + P2 automatizados)

### Quando Configurado: Testes de Performance

- NFR benchmarks (check-in < 2s, lista < 1s, GPS ≤ 5s)
- Execução manual até CI/CD ser configurado

### Manual: Mobile + UX

- Testes de fluxo mobile (QR code, mapa GPS, "não vou voltar")
- Validação de NFR18/NFR19 (botões grandes, 2 toques máximo)
- Testes offline com dispositivo em modo avião

---

## QA Effort Estimate

| Prioridade | Qtd | Esforço | Notas |
|---|---|---|---|
| P0 | ~12 | ~15-25 horas | Setup complexo (Composition Root, multi-tenancy, security) |
| P1 | ~18 | ~15-25 horas | Cobertura padrão (CRUD, integração, domain events) |
| P2 | ~15 | ~8-15 horas | Edge cases, validações simples |
| P3 | ~5 | ~2-4 horas | Testes manuais, exploratórios |
| **Total** | **~50** | **~40-70 horas (~2-4 semanas)** | **1 dev, full-time (Lucas)** |

**Premissas:**
- Inclui design, implementação, debugging dos testes
- Exclui manutenção contínua (~10% esforço)
- Assume data factories e infraestrutura de teste prontas

---

## Implementation Planning Handoff

| Work Item | Dono | Target | Notas |
|---|---|---|---|
| Data factories (Company, User, Route, Trip) | Lucas | Story 1.2 | Pré-requisito para todos os testes de integração |
| Padrão de teste Effect TS (TestLayer) | Lucas | Story 1.3 | Documentar e criar exemplo funcional |
| Testes de integração EffectRuntimeModule | Lucas | Story 1.3 | Validar R-001 |
| Testes multi-tenancy | Lucas | Epic 2 | Validar R-004 por endpoint |
| Testes offline-queue | Lucas | Story 3.4 | Validar R-003 |
| Testes SSE/Redis Pub/Sub | Lucas | Epic 5 | Validar R-002 |

---

## Appendix A: Code Examples & Tagging

**Tags Jest para execução seletiva:**

```typescript
// Testes P0 — usar describe com prefixo
describe('[P0] CheckIn Use Case', () => {
  it('should register check-in for valid student', async () => {
    // Arrange: create test layer with mocked ports
    const testLayer = Layer.merge(
      Layer.succeed(BoardingRepository, mockBoardingRepo),
      Layer.succeed(StudentRepository, mockStudentRepo),
    );

    // Act: run Effect program with test layer
    const result = await Effect.runPromise(
      checkIn('student-1', 'trip-1').pipe(Effect.provide(testLayer))
    );

    // Assert: result and events
    const [boarding, events] = result;
    expect(boarding.studentId).toBe('student-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('boarding.checked_in');
  });
});

// Testes P1 — Integration test via Supertest
describe('[P1] POST /api/v1/boarding/check-in', () => {
  it('should return 201 with boarding record', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/boarding/check-in')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ studentId: 'student-1', tripId: 'trip-1' });

    expect(response.status).toBe(201);
    expect(response.body.data.studentId).toBe('student-1');
  });
});
```

**Rodar por prioridade:**

```bash
# Rodar apenas testes P0
npx jest --testPathPattern=".*" --verbose 2>&1 | grep "\[P0\]"

# Rodar todos os testes
npm test

# Rodar testes de um domínio
npx jest --testPathPattern="domains/boarding"
```

---

## Appendix B: Knowledge Base References

- **Risk Governance:** `risk-governance.md` — Metodologia de scoring de riscos
- **Probability-Impact:** `probability-impact.md` — Escala P×I
- **Test Levels Framework:** `test-levels-framework.md` — Seleção E2E vs API vs Unit
- **Test Quality:** `test-quality.md` — Definition of Done (sem hard waits, <300 linhas, <1.5 min)

---

**Gerado por:** BMad TEA Agent
**Workflow:** `bmad-testarch-test-design`
