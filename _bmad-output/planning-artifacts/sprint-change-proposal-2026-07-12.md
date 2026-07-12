---
workflowType: 'correct-course'
project_name: 'pureurban'
user_name: 'Lucas'
date: '2026-07-12'
status: 'aprovado'
approvedBy: 'Lucas'
approvedAt: '2026-07-12'
scope_classification: 'moderate'
inputDocuments: ['planning-artifacts/prd.md', 'planning-artifacts/architecture.md', 'planning-artifacts/epics.md', 'implementation-artifacts/sprint-status.yaml']
---

# Sprint Change Proposal — Separação das Trilhas Back-end e Front-end

## 1. Resumo do Problema

### Gatilho

Mudança de plano solicitada pelo product owner (Lucas) em 12/07/2026, no ponto de transição entre a Story 3.1 (entregue) e a Story 3.2 (próxima). Não é uma falha técnica — é uma mudança de estratégia de fatiamento das stories.

### Problema

As stories dos Épicos 3, 4 e 5 são **fatias verticais full-stack**: cada uma entrega backend (Effect TS + NestJS + Prisma) e mobile (Expo + Zustand + TanStack Query + offline) na mesma unidade de trabalho. Exemplos no `epics.md` atual:

- **Story 3.3** — "Escaneamento de QR Code e Check-in (Backend + Mobile Motorista)": exige use case Effect com validação de permissão, adapter Prisma, controller, domain event, *e* tela com `expo-camera`, feedback visual e tratamento de erro — tudo numa entrega.
- **Story 3.5** — "Lista de Alunos e Status de Embarque (Backend + Mobile Motorista)": endpoint agregado, atualização em tempo real, cache offline via expo-sqlite e tela otimizada para uma mão.

Isso gera dois problemas concretos:

1. **Bloqueia o paralelismo dos 2 devs.** A própria Architecture (§10 — Divisão de Trabalho) afirma que a fronteira hexagonal cria uma divisão natural entre desenvolvedores, mas as stories como estão fatiadas colocam os dois devs no mesmo arquivo/story. A estrutura de trabalho contradiz a estrutura arquitetural.
2. **Ciclo de story longo e revisão difícil.** Uma story mistura cinco tecnologias distintas (Effect TS, Prisma, NestJS, Expo, SQLite). O code review precisa avaliar tudo de uma vez, e a story só fecha quando as duas pontas estão prontas.

### Evidência

- `_bmad-output/planning-artifacts/architecture.md` §10 já propõe divisão de trabalho por camada (Dev 1: core + Effect runtime; Dev 2: mobile + adapters), mas nenhum artefato de implementação reflete isso.
- Os títulos das stories 3.1, 3.3, 3.5 no `epics.md` carregam literalmente o sufixo "(Backend + Mobile Motorista)" — a natureza full-stack está explícita.
- Swagger/OpenAPI já está configurado (`api/src/main.ts`, commit `d2c3bc2`), mas o contrato **não é exportado como artefato** — não existe `openapi.json` versionado, então o mobile não tem como ser construído contra o contrato sem que o backend esteja pronto e rodando.

### Descoberta adicional (fora do gatilho, mas relevante)

O `sprint-status.yaml` marcava `3-1-iniciar-e-encerrar-viagem` como `ready-for-dev`, porém o código já está no HEAD — commit `36c7409 feat(trip): implement story 3-1` entregou `start-trip.use-case.ts`, `end-trip.use-case.ts` (com specs), `prisma-trip.adapter.ts`, `trip.controller.ts` e a tela `(driver)/trip.tsx` (241 linhas). O arquivo da story registra `Status: review` — ou seja, **implementada full-stack, mas com o code review ainda pendente**.

O `sprint-status.yaml` foi corrigido para `review` (não `done` — o review ainda precisa rodar). A Story 3.1 **não será refatiada**: ela já foi construída no modelo antigo e está correta. A separação em trilhas começa efetivamente na Story 3.2.

> **Ação pendente:** rodar `bmad-code-review` na Story 3.1 para fechá-la. Isso é independente desta mudança de plano e pode acontecer em paralelo à reorganização do backlog.

---

## 2. Análise de Impacto

### Impacto nos Épicos

| Épico | Status atual | Impacto |
|---|---|---|
| **Épico 1** — Fundação | done (5/5) | **Nenhum.** Não é refatiado. |
| **Épico 2** — Identidade e Acesso | done (6/6) | **Nenhum.** Não é refatiado. Stories 2.2 e 2.6 já entregaram mobile junto — trabalho preservado. |
| **Épico 3** — Viagens e Embarque | 3.1 entregue; 3.2–3.5 backlog | **Alto.** 4 stories refatiadas em 7 + 1 story de contrato. Objetivo e FRs do épico inalterados. |
| **Épico 4** — Ausência e Comunicação | backlog (5 stories) | **Alto.** 5 stories refatiadas em 10 + 1 story de contrato. |
| **Épico 5** — Localização | backlog (3 stories) | **Alto.** 3 stories refatiadas em 5 + 1 story de contrato. |

**Nenhum épico é criado, removido, renumerado ou reordenado.** A fronteira dos épicos permanece por capacidade de negócio (como manda o DDD do projeto); a separação por camada acontece **dentro** de cada épico. Isso preserva a rastreabilidade FR → Épico do `epics.md` (seção "FR Coverage Map") inteira.

### Impacto no PRD

**Nenhum.** Os 37 FRs e 20 NFRs permanecem idênticos. O escopo do MVP não muda — nada é adiado, nada é adicionado. Esta é uma mudança de *como* construir, não de *o que* construir. O PRD não precisa ser tocado.

### Impacto na Architecture

Quatro pontos precisam de atualização — nenhum deles altera decisões arquiteturais estruturais (hexagonal, DDD, Effect TS, multi-schema, offline em tiers permanecem intactos):

| Seção | Mudança necessária |
|---|---|
| **§9 — Sequência de Implementação** | Passa a refletir o padrão *contract-first por épico*: contrato → trilhas paralelas → integração. |
| **§10 — Divisão de Trabalho** | A tabela atual divide por domínio/camada informalmente. Passa a descrever as duas trilhas formais (API / Mobile) e o contrato como ponto de sincronização. |
| **Nova seção — Contrato de API e Desenvolvimento Paralelo** | Não existe hoje. Precisa definir: exportação do `openapi.json`, geração de tipos no mobile, camada de mock, e regra de drift no CI. É a peça que torna as trilhas paralelas viáveis. |
| **§8 — Regras Obrigatórias para Agentes** | Adicionar regra: tipos de API no mobile são **gerados** do `openapi.json`, nunca escritos à mão. |

### Impacto no Stack (novas dependências)

| Projeto | Dependência | Finalidade |
|---|---|---|
| `api/` | script `openapi:export` (usa `@nestjs/swagger` já instalado) | Emitir `api/openapi.json` versionado — o contrato como artefato |
| `mobile/` | `openapi-typescript` (dev) | Gerar `src/types/api.d.ts` a partir do `openapi.json` |
| `mobile/` | `msw` (dev) | Camada de mock HTTP para a trilha mobile trabalhar sem backend rodando |

Nenhuma dependência de runtime é adicionada ao app — ambas são de desenvolvimento.

### Impacto em Testes e CI

- **Positivo para o TCC:** a story de integração ao final de cada épico é o lugar natural dos testes E2E (já previstos no MVP pela Architecture, §"Decisões Incorporadas ao MVP").
- **CI:** adicionar verificação de drift — se o `openapi.json` commitado divergir do gerado a partir do código, o PR falha. É o que impede as trilhas de se separarem silenciosamente.
- **Contract testing (Pact):** o módulo TEA já está configurado com `tea_use_pactjs_utils = true`. Testes de contrato consumer-driven são a evolução natural desta mudança, mas **ficam deferidos** — o `openapi.json` + drift check no CI resolve o problema no nível de rigor que o MVP precisa.

### Impacto em UX

**N/A.** Não existe documento de UX Design no projeto (o `epics.md` registra isso explicitamente). Os NFRs de usabilidade (NFR18-NFR20) migram intactos para as stories mobile.

### Impacto no Código Existente

**Nenhuma refatoração de código é necessária.** Nada do que já foi entregue (Épicos 1, 2 e Story 3.1) precisa ser desfeito ou alterado. A mudança afeta apenas o planejamento do trabalho ainda não iniciado.

---

## 3. Caminho Recomendado

### Opções avaliadas

| Opção | Viável? | Esforço | Risco | Avaliação |
|---|---|---|---|---|
| **1. Ajuste Direto** — refatiar as stories restantes dentro dos épicos existentes | ✅ **Sim** | Médio | Baixo | Preserva épicos, FRs e todo o código entregue. Só reorganiza trabalho futuro. |
| **2. Rollback** — reverter trabalho concluído | ❌ Não | — | — | Não há nada a reverter. As stories full-stack já entregues estão corretas e funcionando; desfazê-las não simplifica nada. |
| **3. Revisão do MVP** — reduzir/redefinir escopo | ❌ Não | — | — | Desnecessário. O escopo não é o problema; o fatiamento é. Todos os 37 FRs continuam viáveis no prazo (dez/2026). |

### Recomendação: **Opção 1 — Ajuste Direto**, com uma adição arquitetural

Refatiar as stories dos Épicos 3, 4 e 5 em duas trilhas paralelas (API e Mobile), com um **contrato OpenAPI acordado antes de cada épico** como ponto de sincronização.

**Justificativa:**

- É a única opção que resolve o problema real (paralelismo bloqueado + stories grandes) sem custo em escopo, prazo ou retrabalho.
- Alinha o plano de execução à arquitetura que já existe — a Architecture §10 *já afirmava* que a fronteira hexagonal habilita trabalho paralelo, mas o backlog nunca refletiu isso. Esta mudança faz o plano cumprir a promessa da arquitetura.
- **Ganho para o TCC:** transforma uma afirmação teórica ("a arquitetura hexagonal facilita trabalho paralelo em equipes pequenas" — nota da §10) em **evidência empírica coletável**. Passa a ser possível medir e argumentar isso na tese.

**O que torna as trilhas paralelas seguras:** o `openapi.json` versionado. Sem ele, "trabalhar em paralelo" vira "trabalhar às cegas e integrar no escuro". Por isso a story de contrato (`X.0`) é **bloqueante** para as duas trilhas do épico, e a story de integração (`X.N`) é onde os mocks caem e o E2E roda.

### Padrão do ciclo por épico

```
  X.0  Contrato de API (OpenAPI-first)   ← bloqueia as duas trilhas
        │
        ├──────────────┬──────────────┐
        ↓              ↓              │
   Trilha API      Trilha Mobile      │  ← executam em paralelo
   (Dev 1)         (Dev 2, com mocks) │
        │              │              │
        └──────────────┴──────────────┘
                       ↓
  X.N  Integração + E2E (mocks → API real)
```

---

## 4. Propostas de Mudança Detalhadas

### 4.1 Convenção de nomenclatura

| Sufixo | Significado | Dono típico |
|---|---|---|
| `X.0` | Story de contrato — DTOs, stubs de controller, Swagger, `openapi.json`, tipos + mocks no mobile | Dev 1 (com revisão do Dev 2) |
| `X.Ya` | Story de **backend** — core Effect + shell NestJS + adapters + testes de domínio | Dev 1 |
| `X.Yb` | Story de **mobile** — telas, stores, services, offline (contra mock) | Dev 2 |
| `X.N` | Story de integração — troca de mocks pela API real + E2E do épico | Ambos |

Stories sem contraparte na outra camada (ex.: QR code é gerado localmente, sem chamada de API) mantêm apenas o sufixo da camada que existe.

---

### 4.2 Épico 3 — Gestão de Viagens e Embarque Digital

**Antes:** 5 stories full-stack. **Depois:** 1 entregue + 8 stories (1 contrato, 4 backend/mobile-only, 2 pares, 1 integração).

| Story | Título | Camada | Depende de |
|---|---|---|---|
| ~~3.1~~ | Iniciar e Encerrar Viagem | **implementada** (full-stack, em `review`) | — |
| **3.0** | Contrato de API — Embarque Digital | Contrato | — |
| **3.2b** | Geração e Exibição de QR Code do Aluno | Mobile | 3.0 |
| **3.3a** | Check-in de Embarque | Backend | 3.0 |
| **3.3b** | Escaneamento de QR Code | Mobile | 3.0 |
| **3.4b** | Check-in Offline com Fila de Sincronização | Mobile | 3.3b |
| **3.5a** | Lista de Alunos da Viagem com Status | Backend | 3.3a |
| **3.5b** | Lista de Alunos e Status de Embarque | Mobile | 3.0 |
| **3.6** | Integração e E2E do Épico 3 | Integração | todas acima |

#### Story 3.0 — Contrato de API: Embarque Digital *(nova)*

> Como desenvolvedor,
> Quero o contrato da API de embarque acordado e versionado antes de qualquer implementação,
> Para que as trilhas de backend e mobile trabalhem em paralelo sem divergir.

**Acceptance Criteria:**

**Given** os endpoints de embarque ainda não existem
**When** defino o contrato
**Then** `POST /api/v1/boarding/check-in` está declarado com DTO de entrada, DTO de resposta e decorators Swagger completos (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
**And** `GET /api/v1/trips/:id/students` está declarado com o shape da lista e os status possíveis (`CHECKED_IN`, `NOT_CHECKED_IN`, `NOT_RETURNING`)
**And** o payload do QR code está especificado como schema compartilhado (`studentId`, `sessionId`, formato de codificação) — é o contrato entre a tela do aluno (3.2b) e a validação do backend (3.3a)
**And** o header `X-Idempotency-Key` está documentado nos endpoints de escrita (pré-requisito do offline — Architecture §5, Tier 2)
**And** os códigos de erro tipados estão declarados (`INVALID_QR_CODE`, `STUDENT_NOT_ALLOWED`, `TRIP_NOT_ACTIVE`, `DUPLICATE_CHECK_IN`)
**And** `npm run openapi:export` gera `api/openapi.json` e o arquivo está commitado
**And** o mobile gera `src/types/api.d.ts` a partir do `openapi.json` via `openapi-typescript`
**And** handlers MSW para os endpoints do épico existem em `mobile/src/mocks/`, retornando respostas conformes ao contrato
**And** os controllers retornam `501 Not Implemented` — o contrato existe, a lógica não

#### Story 3.2b — QR Code do Aluno (Mobile)

Escopo idêntico à Story 3.2 original (o QR é gerado localmente, sem chamada de API). Muda apenas a dependência: o payload passa a seguir o schema definido em 3.0. FRs: FR15, FR17. NFRs: NFR8, NFR19.

#### Story 3.3a — Check-in de Embarque (Backend)

> Como sistema,
> Quero registrar o embarque de um aluno validando permissão e viagem ativa,
> Para que o motorista tenha controle digital de quem entrou no ônibus.

**Acceptance Criteria (extraídos da 3.3 original + idempotência da 3.4):**

**Given** viagem ativa e aluno com permissão
**When** `POST /api/v1/boarding/check-in` recebe `studentId`, `tripId` e `X-Idempotency-Key`
**Then** o check-in é persistido com timestamp (FR19)
**And** o use case valida que o aluno está ativo e vinculado à rota da viagem (FR18)
**And** QR inválido, aluno sem permissão ou viagem encerrada retornam tagged errors → HTTP com `{ error: { code, message } }` (FR20)
**And** requisição repetida com a mesma `X-Idempotency-Key` retorna o resultado anterior sem duplicar (Architecture §5 — pré-requisito da fila offline)
**And** domain event `boarding.checked_in` é emitido via `WithEvents`
**And** processamento em menos de 2 segundos (NFR1)
**And** use cases do core testados sem infraestrutura (< 100ms por suite)

#### Story 3.3b — Escaneamento de QR Code (Mobile Motorista)

Tela `(driver)/scan.tsx` com `expo-camera`, área de escaneamento clara, feedback visual de sucesso/erro por código de erro do contrato. **Trabalha contra o mock MSW** — não depende de 3.3a estar pronta. FRs: FR16. NFRs: NFR1 (percepção), NFR18.

#### Story 3.4b — Check-in Offline (Mobile)

Fila `expo-sqlite` conforme Architecture §5 Tier 2 (FIFO por `created_at`, backoff 1s→30s, máx. 5 tentativas, limite 500, badges `✓/⏳/✗`). Envia `X-Idempotency-Key` — a contraparte servidor **já existe** desde 3.3a. FRs: FR21. NFRs: NFR11, NFR12, NFR13, NFR14.

> **Nota:** esta story deixa de ter parte backend porque a idempotência foi puxada para 3.3a, onde ela pertence conceitualmente (é uma propriedade do endpoint, não do offline).

#### Story 3.5a — Lista de Alunos da Viagem (Backend)

`GET /api/v1/trips/:id/students` retornando alunos da rota com status de embarque agregado e contagem. Responde em < 1s com 50+ alunos (NFR4). FRs: FR22, FR23, FR25.

#### Story 3.5b — Lista de Alunos e Status (Mobile Motorista)

Tela `(driver)/student-list.tsx`, contagem no topo ("28/32 embarcados"), cache offline via TanStack Query persist (Tier 1), botões grandes e contraste alto. FRs: FR22, FR24, FR25. NFRs: NFR18.

#### Story 3.6 — Integração e E2E do Épico 3 *(nova)*

> Como desenvolvedor,
> Quero substituir os mocks pela API real e provar o fluxo end-to-end,
> Para que o épico seja considerado entregue de fato, não apenas nas duas metades.

**Acceptance Criteria:**

**Given** as trilhas API e Mobile do Épico 3 concluídas
**When** desligo os handlers MSW e aponto o `api-client.ts` para a API real
**Then** o fluxo completo funciona: motorista inicia viagem → aluno exibe QR → motorista escaneia → check-in registrado → lista atualiza com contagem
**And** o `openapi.json` commitado não diverge do gerado pelo código (drift check)
**And** teste E2E cobre o caminho feliz e a rejeição de QR inválido
**And** teste E2E cobre o cenário offline: check-in sem rede → reconexão → sincronização sem duplicata

---

### 4.3 Épico 4 — Notificação de Ausência e Comunicação

**Antes:** 5 stories full-stack. **Depois:** 12 stories (1 contrato, 5 pares, 1 integração).

| Story | Título | Camada |
|---|---|---|
| **4.0** | Contrato de API — Ausência e Comunicação | Contrato |
| **4.1a** | Registro de Ausência ("Não Vou Voltar") | Backend |
| **4.1b** | Botão "Não Vou Voltar" | Mobile Aluno |
| **4.2a** | Canal de Eventos de Embarque (SSE) | Backend |
| **4.2b** | Recebimento de Ausência em Tempo Real | Mobile Motorista |
| **4.3a** | Cancelamento de Ausência e Período de Segurança | Backend |
| **4.3b** | Cancelamento de Ausência | Mobile Aluno |
| **4.4a** | Lembrete Automático de Check-in (scheduler + Expo Push) | Backend |
| **4.4b** | Recebimento do Lembrete e Resposta Rápida | Mobile Aluno |
| **4.5a** | Avisos Gerais do Motorista (broadcast) | Backend |
| **4.5b** | Envio e Recebimento de Avisos | Mobile (motorista + aluno) |
| **4.6** | Integração e E2E do Épico 4 | Integração |

**Notas de decomposição:**

- A **Story 4.2 original** ("Recebimento de Notificação pelo Motorista") era, na prática, *dois trabalhos distintos*: um canal de push em tempo real no servidor e o consumo dele na tela. A separação torna isso explícito — **4.2a** é infraestrutura de entrega (SSE + Redis Pub/Sub, latência < 3s — NFR3) e **4.2b** é a experiência (status `NÃO VAI VOLTAR` em destaque, contagem que se ajusta, toast contextual).
- O contrato 4.0 precisa declarar **também o formato dos eventos SSE** (`boarding.not_returning`, `boarding.absence_cancelled`), não só os endpoints REST — é o que o mobile precisa mockar.
- A regra de negócio do período de 2 minutos (`CANCELLATION_PERIOD_EXPIRED`) vive em **4.3a**, no functional core, testável isoladamente. O mobile (4.3b) só exibe o countdown.

---

### 4.4 Épico 5 — Localização em Tempo Real

**Antes:** 3 stories full-stack. **Depois:** 7 stories (1 contrato, 2 pares, 1 mobile-only, 1 integração).

| Story | Título | Camada |
|---|---|---|
| **5.0** | Contrato de API — Localização em Tempo Real | Contrato |
| **5.1a** | Ingestão de GPS (Redis + Pub/Sub) | Backend |
| **5.1b** | Transmissão de GPS durante Viagem Ativa | Mobile Motorista |
| **5.2a** | SSE de Localização | Backend |
| **5.2b** | Mapa do Ônibus em Tempo Real | Mobile Aluno |
| **5.3b** | Comportamento Degradado e Perda de Sinal | Mobile Aluno |
| **5.4** | Integração e E2E do Épico 5 | Integração |

**Notas de decomposição:**

- **5.1a** cobre `POST /api/v1/tracking/location`, TTL curto no Redis e publicação de `location.updated` no Pub/Sub. **5.1b** cobre `expo-location`, envio a cada 5s e — criticamente — o **start/stop automático** amarrado aos eventos `trip.started`/`trip.ended` (FR33, NFR10: GPS não é coletado fora de viagem ativa).
- **5.3 (degradado)** vira mobile-only: "último ponto conhecido" e "sem sinal GPS há 15s" são estado de cliente. O backend não precisa saber que o sinal caiu — a ausência de eventos *é* o sinal.

---

### 4.5 Mudanças na Architecture

#### Nova seção: Contrato de API e Desenvolvimento Paralelo

Conteúdo a adicionar (proposta):

```markdown
## 12. Contrato de API e Desenvolvimento Paralelo (OpenAPI-first)

As trilhas de backend e mobile executam em paralelo. O `openapi.json` é o contrato
que impede que elas divirjam.

**Fluxo por épico:**
1. Story X.0 declara DTOs + controllers stub + decorators Swagger. Controllers
   retornam 501.
2. `npm run openapi:export` (api/) emite `api/openapi.json` — artefato versionado.
3. Mobile roda `openapi-typescript api/openapi.json -o src/types/api.d.ts`.
   Nenhum tipo de API é escrito à mão.
4. Mobile cria handlers MSW em `src/mocks/handlers/` a partir do contrato — a
   trilha mobile desenvolve sem backend rodando.
5. Trilhas A (backend) e B (mobile) executam em paralelo.
6. Story X.N desliga os mocks, aponta para a API real e roda os E2E.

**Drift check (CI):** o pipeline regenera o `openapi.json` a partir do código e
falha o PR se divergir do commitado. Mudança de contrato é mudança consciente,
com revisão das duas trilhas.

**Eventos SSE também são contrato:** o formato de cada evento (`location.updated`,
`boarding.not_returning`) é declarado junto ao endpoint que o emite.

**Deferido:** contract testing consumer-driven (Pact) — o drift check cobre a
necessidade do MVP. Ver módulo TEA (`tea_use_pactjs_utils` já habilitado).
```

#### §10 — Divisão de Trabalho (substituir tabela)

| Trilha API (Dev 1) | Trilha Mobile (Dev 2) |
|---|---|
| Stories `X.0` (contrato — com revisão do Dev 2) | Geração de tipos + handlers MSW |
| Stories `X.Ya` — core Effect + shell + adapters | Stories `X.Yb` — telas, stores, services |
| Domain events, SSE, Redis, idempotência | Offline (Tier 1 e Tier 2), cache, UX |
| Testes de domínio (< 100ms, sem infra) | Testes de componente contra mocks |
| Stories `X.N` — integração e E2E | Stories `X.N` — integração e E2E |

#### §9 — Sequência de Implementação

Substituir a lista linear atual pelo ciclo `contrato → trilhas paralelas → integração` por épico, mantendo a ordem dos épicos (3 → 4 → 5).

#### §8 — Regras Obrigatórias para Agentes (adicionar)

> 11. Tipos de API no mobile são **gerados** de `api/openapi.json` (`openapi-typescript`) — NUNCA escritos à mão.
> 12. Toda story de trilha mobile (`X.Yb`) desenvolve contra handlers MSW até a story de integração (`X.N`).
> 13. Nenhum endpoint entra em uma story `X.Ya` sem estar declarado no contrato da story `X.0` do épico.

---

### 4.6 Mudanças em outros artefatos

| Artefato | Mudança |
|---|---|
| `implementation-artifacts/sprint-status.yaml` | Regenerar via `bmad-sprint-planning`. `3-1-...` já corrigido de `ready-for-dev` para `review` (código no HEAD, review pendente). |
| `_bmad-output/project-context.md` | Adicionar as regras 11–13 acima à seção "Regras Críticas — Não Ignorar". |
| `api/package.json` | Novo script `openapi:export`. |
| `mobile/package.json` | Dev deps: `openapi-typescript`, `msw`. |
| CI (GitHub Actions) | Novo job: drift check do `openapi.json`. |

---

## 5. Handoff e Implementação

### Classificação de escopo: **MODERATE** — reorganização de backlog

Não é *Minor* (não é implementável direto por um agente dev — reescreve o backlog de 3 épicos). Não é *Major* (não replaneja produto: PRD intacto, escopo intacto, épicos intactos, código intacto).

### Sequência de execução

| # | Ação | Agente / Skill | Contexto |
|---|---|---|---|
| 1 | Reescrever Épicos 3, 4 e 5 no `epics.md` com o novo fatiamento | **John (PM)** — `bmad-agent-pm`, ou edição direta do `epics.md` | Janela nova |
| 2 | Atualizar `architecture.md` — §8, §9, §10 + nova §12 | **Winston (Architect)** — `bmad-agent-architect` | Janela nova |
| 3 | Regenerar `sprint-status.yaml` com as novas stories | `bmad-sprint-planning` | Janela nova |
| 4 | Criar a Story 3.0 (contrato) e iniciar o ciclo | `bmad-create-story` → `bmad-dev-story` | Janela nova |

> Os passos 1 e 2 são independentes entre si e podem rodar em paralelo. O passo 3 depende de ambos.

### Critérios de sucesso desta mudança

1. `epics.md` reflete as trilhas separadas; a rastreabilidade FR → Épico continua completa (37/37 FRs cobertos).
2. `architecture.md` documenta o padrão OpenAPI-first e a divisão em trilhas.
3. `api/openapi.json` existe, está versionado e é verificado no CI.
4. Dev 1 e Dev 2 conseguem trabalhar em stories distintas do mesmo épico sem conflito de merge.
5. Nenhuma linha de código entregue (Épicos 1, 2, Story 3.1) precisou ser refeita.

### Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Contrato diverge entre as trilhas | `openapi.json` versionado + drift check bloqueante no CI |
| Mobile "funciona no mock, quebra na API real" | Story de integração + E2E obrigatória ao fim de cada épico (`X.N`) |
| Número de stories quase dobra (12 → 27 restantes) | Cada story é ~metade do tamanho; a story de contrato é pequena. O custo é overhead de arquivo, não de trabalho. |
| Story de contrato vira gargalo (bloqueia as duas trilhas) | Mantê-la pequena e focada: stubs + Swagger + tipos + mocks. Zero lógica. |
| Fatias horizontais entregam menos valor demonstrável por story | O épico continua sendo a unidade de valor. A story `X.N` é o marco demonstrável. |

---

## 6. Checklist de Navegação de Mudança

| Seção | Item | Status |
|---|---|---|
| 1. Trigger e Contexto | 1.1 Story gatilho identificada (3.2, próxima da fila) | [x] |
| | 1.2 Problema categorizado: mudança de estratégia de execução | [x] |
| | 1.3 Evidência coletada (Architecture §10, títulos das stories, ausência de `openapi.json`) | [x] |
| 2. Impacto nos Épicos | 2.1 Épico 3 completável com modificações | [x] |
| | 2.2 Mudanças de épico: nenhuma criação/remoção — apenas refatiação interna | [x] |
| | 2.3 Épicos 4 e 5 revisados — mesmo padrão aplicado | [x] |
| | 2.4 Nenhum épico obsoleto; nenhum épico novo necessário | [x] |
| | 2.5 Ordem e prioridade dos épicos inalteradas | [x] |
| 3. Conflitos em Artefatos | 3.1 PRD — sem conflito (escopo e FRs intactos) | [N/A] |
| | 3.2 Architecture — §8, §9, §10 atualizar + nova §12 | [!] |
| | 3.3 UX — documento não existe no projeto | [N/A] |
| | 3.4 Outros — `sprint-status.yaml`, `project-context.md`, CI, `package.json` | [!] |
| 4. Caminho Adiante | 4.1 Ajuste Direto — **viável** (esforço médio, risco baixo) | [x] |
| | 4.2 Rollback — não viável (nada a reverter) | [N/A] |
| | 4.3 Revisão de MVP — não necessária | [N/A] |
| | 4.4 Selecionado: **Opção 1 + adição OpenAPI-first** | [x] |
| 5. Componentes da Proposta | 5.1–5.5 Resumo, impactos, caminho, plano e handoff | [x] |
| 6. Revisão Final | 6.3 Aprovação do usuário — **aprovado por Lucas em 12/07/2026** | [x] |
| | 6.4 `sprint-status.yaml` — 3.1 corrigida para `review`; regeneração completa pendente do novo `epics.md` | [!] |

**Item de ação fora do gatilho:** `3-1-iniciar-e-encerrar-viagem` foi implementada no commit `36c7409` e está em `review`. Rodar `bmad-code-review` para fechá-la — independente desta mudança de plano. [!]
