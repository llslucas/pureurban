# Análise de Over-Engineering — PureUrban

**Data:** 2026-03-31
**Participantes:** Lucas + Winston (arquiteto)
**Contexto:** Revisão crítica da arquitetura sob perspectiva acadêmica

---

## 1. Avaliação Inicial (cenário original: dev solo, 2 meses)

**Veredito:** Moderado a Alto para um MVP solo, justificável pelo contexto acadêmico (TCC).

### Sinais de over-engineering identificados

**Effect TS — o elefante na sala:**
- Curva de aprendizado brutal para dev solo com prazo curto
- Dupla camada de DI (Effect Layers + NestJS Providers) é complexidade acidental
- Cada feature tem o dobro de boilerplate: definir Tag no Effect, implementar adapter no shell, registrar no Layer, injetar no runtime

**Multi-Schema PostgreSQL por bounded context:**
- Para monolito com Prisma e dev solo, schemas separados (`auth`, `routing`, `boarding`, `tracking`, `trip`, `public`) são cerimônia
- Prisma gera client único — isolamento real é limitado
- "Preparação para microserviços" num TCC com prazo = YAGNI clássico

**Domain Events via Return Tuple (`WithEvents<A>`):**
- Para 6 eventos numa aplicação solo, `EventEmitter` direto no service resolve com 1/3 do código

**SSE + Redis Pub/Sub:**
- Para tracking de ônibus escolar num MVP, polling a cada 5-10s resolve
- Adiciona infraestrutura e complexidade de gerenciamento de conexões

**Offline-first com sync queue + conflict resolution:**
- Last-write-wins com fila de operações é problema notoriamente difícil
- Para MVP onde motorista tem 4G, retry simples do TanStack Query seria suficiente

### O que se justifica pelo TCC

- **Effect TS + FC/IS** → demonstra coexistência de paradigmas (funcional + OO)
- **Multi-schema** → demonstra aplicação prática de bounded contexts do DDD
- **WithEvents** → demonstra pureza funcional e separação de side effects
- **SSE + Redis** → demonstra arquitetura orientada a eventos

---

## 2. Reavaliação (cenário revisado: 2 devs, 9 meses até dez/2026)

**Veredito revisado:** Adequada, com margem confortável.

### O que passou a se justificar

- **Effect TS em todos os bounded contexts** — Curva de aprendizado absorvida nos primeiros 2-3 meses. Functional core testável isoladamente ganha valor com 2 devs (um pode trabalhar no core sem pisar no código do outro).
- **SSE + Redis Pub/Sub** — Prazo confortável para implementar direito. Redis já serve para JWT blacklist e cache GPS.
- **Domain Events via WithEvents** — Com 2 devs em bounded contexts diferentes, domain events viram contrato de comunicação entre eles.
- **Multi-schema** — Já era justificável, custo baixo.

### O que continua merecendo atenção

**Offline sync** — Mesmo com mais tempo, é um rabbit hole. Decisão: simplificar em tiers (ver seção abaixo).

**Ramp-up do Dev 2 em Effect TS** — 3-4 semanas de curva. Estratégia: Dev 2 começa no mobile/shell, entra no core gradualmente.

### Decisões incorporadas ao MVP

| Antes deferido | Status | Rationale |
|---|---|---|
| CI/CD (GitHub Actions) | Incorporado | 2 devs = pipeline necessária |
| Testes E2E | Incorporado | Prazo permite cobertura adequada |
| Push notifications | Avaliar inclusão | Expo Push API é simples |

---

## 3. Análise Detalhada: Offline Sync

### Por que é um rabbit hole

O cenário aparentemente simples ("guardar e enviar depois") esconde 6 camadas de complexidade:

1. **Idempotência** — Requisição sai, servidor processa, resposta não chega (timeout). Reenvia ao reconectar. Exige UUID por operação + verificação server-side.

2. **Ordem de operações** — Offline: check-in (10:01), marca ausência (10:03), cancela ausência (10:05). Se envia fora de ordem, estado final fica errado. Exige timestamps lógicos ou processamento sequencial garantido.

3. **Conflitos** — Motorista offline marca "presente", aluno online avisa que não vai. Quem ganha? Cada regra é decisão de domínio que precisa estar no core, testada, documentada.

4. **Estado local stale** — Admin removeu alunos ontem, motorista vê lista desatualizada offline. Exige versionamento e estratégia de reconciliação.

5. **Fila persistente com garantias** — Sobreviver a crash (SQLite), retry com backoff, tratamento de falhas permanentes, limite de tamanho.

6. **UI de estado misto** — Cada item precisa de estado de sincronização (`synced | pending | failed`) com feedback visual.

### Decisão: Estratégia em Tiers

**Tier 1 (todos os domínios):** TanStack Query + `persistQueryClient` + MMKV. Cache de leitura offline + retry automático com backoff. Cobre ~90% dos cenários reais.

**Tier 2 (apenas check-in):** Fila em SQLite com idempotência via UUID, processamento FIFO, LWW para conflitos (motorista presente tem autoridade). O único cenário crítico de escrita offline.

**Tier 3 (trabalho futuro na tese):** Reconciliação bidirecional, CRDT/event sourcing, sync frameworks dedicados.

---

## 4. Argumento Extra para a Tese

A divisão core/shell da arquitetura hexagonal facilitou o trabalho paralelo entre dois desenvolvedores com bounded contexts independentes — argumento prático a favor da arquitetura em equipes pequenas.

---

## Resultado

A arquitetura foi atualizada no documento principal (`architecture.md`) para refletir:
- Novo prazo e equipe
- Simplificação do offline sync em tiers
- CI/CD e testes E2E incorporados ao MVP
- Nova seção de divisão de trabalho entre devs
