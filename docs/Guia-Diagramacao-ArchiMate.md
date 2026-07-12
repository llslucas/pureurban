# Guia de Diagramação ArchiMate — PureUrban

**Documento de apoio:** PU-SAD-001 (Architecture.md v1.2)
**Autor:** Lucas
**Data:** 12 de maio de 2026
**Ferramenta recomendada:** [Archi](https://www.archimatetool.com/) — gratuito, suporte nativo a ArchiMate 3.2, export para PNG/SVG/PDF.

---

## 1. Estratégia geral — múltiplas views, não uma única

Um erro clássico em TCC é tentar colocar todas as camadas em uma "view única". Você vai produzir **múltiplas views**, cada uma respondendo a uma pergunta. ArchiMate chama isso de **viewpoints**.

Para o PureUrban, recomenda-se **7 views**, na ordem de baixa → alta complexidade:

| # | View | Pergunta que responde | Camadas envolvidas |
|---|------|----------------------|--------------------|
| 1 | **Stakeholder / Motivation** | Por que o PureUrban existe? Quem se beneficia? | Motivation |
| 2 | **Business / Context** | Quem usa e quais processos de negócio acontecem? | Business |
| 3 | **Layered View (Master)** | Visão geral em camadas — slide de abertura do TCC | Business + Application + Technology |
| 4 | **Application Cooperation** | Como os bounded contexts conversam? | Application |
| 5 | **Application Structure (Hexagonal)** | Como funciona Core/Shell dentro de um contexto? | Application |
| 6 | **Application Behavior (Check-in flow)** | Como o fluxo crítico (check-in offline) executa? | Application + Technology |
| 7 | **Technology / Deployment** | Onde isso roda? Que infraestrutura suporta? | Technology + Physical |

---

## 2. View 1 — Motivation (Stakeholder)

**Objetivo:** Justificar o projeto (perfeito para abrir o capítulo de arquitetura do TCC).

| Elemento ArchiMate | Instância PureUrban |
|---|---|
| **Stakeholder** | Aluno universitário, Motorista, Admin da empresa de transporte, Universidade |
| **Goal** | Reduzir falhas de comunicação no transporte universitário intermunicipal |
| **Driver** | Necessidade de visibilidade em tempo real do ônibus |
| **Constraint** | Conectividade 4G intermitente em zonas rurais; dispositivos de baixo custo |
| **Requirement** | NFR18 (acessibilidade), NFR19 (alto contraste), FR15–FR21 (QR check-in) |
| **Principle** | Functional Core / Imperative Shell; Boring technology that scales |

**Relações:** Stakeholder `motivates →` Goal `realized by →` Requirement `restricted by →` Constraint.

---

## 3. View 2 — Business

**Objetivo:** Atores, papéis (RBAC) e processos macro.

| Elemento ArchiMate | Instância |
|---|---|
| **Business Actor** | Aluno, Motorista, Admin |
| **Business Role** | `student`, `driver`, `admin` (espelha os 3 papéis RBAC do JWT) |
| **Business Process** | Realizar Embarque, Iniciar Viagem, Acompanhar Ônibus, Notificar Ausência |
| **Business Service** | "Gestão de Transporte Universitário" (serviço macro entregue ao mercado) |
| **Business Object** | Aluno, Rota, Viagem, Embarque, Localização |
| **Business Collaboration** | Empresa de Transporte ↔ Universidade |

**Dica:** O `TenantGuard` aparece aqui implicitamente — a "Empresa de Transporte" é o **tenant** (companyId), e cada processo é escopado a ela. Vale uma nota no diagrama.

---

## 4. View 3 — Layered View (a "master view")

**Objetivo:** Uma página em formato A3, dividida horizontalmente em 3 faixas. Costuma ser o diagrama de capa do capítulo de arquitetura.

```
+----------------------------------------------------------+
|  BUSINESS LAYER                                          |
|  [Aluno] [Motorista] [Admin] -> [Processos] -> [Servicos]|
+----------------------------------------------------------+
|  APPLICATION LAYER                                       |
|  [Mobile App (Expo)]   [NestJS API]   [Bounded Contexts] |
|           ^ REST/SSE ^    Auth, Routing, Trip,           |
|                           Boarding, Tracking             |
+----------------------------------------------------------+
|  TECHNOLOGY LAYER                                        |
|  [Smartphone] [Docker] [PostgreSQL] [Redis] [Node 22]    |
+----------------------------------------------------------+
```

Use **realization** (linha pontilhada com triângulo) entre camadas:
- Application Component → realiza → Business Service
- Technology Service → realiza → Application Service

---

## 5. View 4 — Application Cooperation (bounded contexts)

**Objetivo:** Mostrar os 5 bounded contexts e os Domain Events que circulam entre eles.

| Elemento ArchiMate | Instância |
|---|---|
| **Application Component** | `Auth`, `Routing`, `Trip`, `Boarding`, `Tracking` (5 caixas) |
| **Application Component** (compartilhado) | `Shared Kernel` (eventos, errors base) |
| **Application Interface** | REST endpoint (`/api/v1/*`), SSE endpoint |
| **Application Interaction** | Os 6 Domain Events da Seção 4.6 da arquitetura |
| **Data Object** | `Company`, `User`, `Route`, `Trip`, `BoardingRecord`, `Location` |

**Padrão de desenho:** Cada bounded context = uma `Application Component`. As setas entre eles são **flow relationships** rotuladas com o nome do evento (ex: `boarding.checked_in` saindo de Boarding e chegando em Tracking).

```
   +----------+   trip.started/ended   +----------+
   |   Trip   | ---------------------> | Tracking |
   +----------+                        +----------+
        ^                                    |
        | boarding.not_returning             | location.updated
        |                                    v
   +----------+   boarding.checked_in   +---------+
   | Boarding | ----------------------> |   SSE   |
   +----------+                         |Controller|
                                        +---------+
```

---

## 6. View 5 — Application Structure (Hexagonal — Core/Shell)

**Objetivo:** O diagrama mais importante do TCC. É aqui que se prova a tese (Functional Core / Imperative Shell + Hexagonal).

Faça **uma view dedicada para 1 bounded context** (recomendado: `Boarding`, porque é o mais rico — tem check-in, idempotência, eventos). Os outros reusam o mesmo padrão.

| Elemento ArchiMate | Instância PureUrban |
|---|---|
| **Application Component** ("Boarding Core") | Caixa interna com fundo claro |
| **Application Component** ("Boarding Shell") | Caixa externa envolvendo o core |
| **Application Function** (no core) | `checkIn.use-case`, `notifyNotReturning.use-case`, `cancelAbsence.use-case` |
| **Application Interface** (Port, no core) | `BoardingRepository`, `NotificationService` |
| **Application Component** (Adapter, no shell) | `PrismaBoardingAdapter`, `ExpoPushAdapter` |
| **Application Service** (no shell) | `BoardingService` (orquestra `runtime.runPromise`) |
| **Application Interface** (HTTP) | `BoardingController` REST |

**Convenção crítica:** desenhe o Core **dentro** do Shell (composition/aggregation). Os Adapters apontam para os Ports do Core com **realization** (a relação chave do hexagonal). Isso visualmente prova a regra: *"core/ nunca importa de shell/; shell/ implementa core/"*.

```
+-- Shell (NestJS) --------------------------------------+
|  [BoardingController] --> [BoardingService]            |
|                                  |                     |
|                                  | runPromise          |
|                                  v                     |
|         +-- Core (Effect TS) ------------+             |
|         |  [checkIn.use-case]            |             |
|         |       | uses                   |             |
|         |       v                        |             |
|         |  O BoardingRepository (Port)   |             |
|         +-----------^--------------------+             |
|                     | realizes                         |
|              [PrismaBoardingAdapter] --> PostgreSQL    |
+--------------------------------------------------------+
```

---

## 7. View 6 — Application Behavior (fluxo de check-in offline)

**Objetivo:** Mostrar o comportamento dinâmico de um fluxo crítico — combinando offline Tier 2 + idempotência + dispatch de evento.

Use ArchiMate **Application Process** + **Triggering** relationships (seta com ponta cheia), numerando os passos:

1. `(driver/scan.tsx)` lê QR → `boarding.service.ts` (mobile)
2. Service tenta `POST /boarding/check-in` com header `X-Idempotency-Key`
3. **Offline?** → enfileira em `expo-sqlite (offline_queue)` ; **Online?** → continua
4. NestJS Controller → `BoardingService` → `runtime.runPromise(checkIn)`
5. Use case retorna `WithEvents<A>`
6. `EffectEventDispatcher` emite `boarding.checked_in` via EventEmitter2
7. Tracking consome → atualiza contagem → publica em Redis Pub/Sub
8. `TrackingSseController` empurra para todos os clientes via SSE

**Elementos a usar:** `Application Process` (passos), `Application Service` (Boarding, Tracking), `Technology Service` (Redis Pub/Sub, SSE), `Data Object` (BoardingRecord), com setas de **triggering** numeradas.

---

## 8. View 7 — Technology / Deployment

**Objetivo:** Mostrar a topologia física e de execução.

| Elemento ArchiMate | Instância |
|---|---|
| **Device** | Smartphone Android 8+ / iOS 13+ (mín. 5") |
| **Node** | Container Docker `api`, `postgres`, `redis` |
| **Communication Network** | Wi-Fi/4G (público), Docker bridge (interno) |
| **System Software** | Expo Runtime SDK 55, Node 22, NestJS 11, PostgreSQL 16, Redis 7 |
| **Technology Service** | HTTPS, SSE, Pub/Sub, JWT auth |
| **Artifact** | `api.js` (build NestJS), Expo bundle, `schema.prisma` |
| **Technology Object** | DB schemas (`auth`, `routing`, `boarding`, `tracking`, `trip`, `public`) |

**Dica para o TCC:** desenhe 2 ambientes lado a lado: **Local (Docker Compose)** e **Demo (Railway/Render)** — isso ilustra a Seção 3.5 do `Architecture.md`.

---

## 9. Convenções e cuidados

**Cores (padrão do Archi):**
- Business = amarelo
- Application = azul claro
- Technology = verde
- Motivation = roxo

**Notação correta de relações** (as 6 mais usadas):

| Relação | Linha | Quando usar |
|---|---|---|
| **Realization** | tracejada + triângulo aberto | Adapter realiza Port; App Component realiza Business Service |
| **Composition** | sólida + losango cheio | Core está dentro de Shell |
| **Aggregation** | sólida + losango vazio | Bounded context agrega Use Cases |
| **Triggering** | sólida + seta cheia | Sequência temporal (eventos, fluxos) |
| **Flow** | tracejada + seta cheia | Troca de dados entre componentes |
| **Serving** (Used by) | sólida + bola | Controller usa Service |

**Anti-patterns a evitar:**
- Misturar Business e Technology na mesma view (use a Layered View para isso).
- Desenhar classes/tabelas — ArchiMate é arquitetural, não estrutural de código.
- Mais de ~15 elementos por view — quebre em sub-views.
- Esquecer de tipar as relações — uma seta sem rótulo é ambígua.

---

## 10. Sequência recomendada para desenhar

1. **Comece pela View 3 (Layered Master)** — esqueleto em 1 hora.
2. **View 4 (bounded contexts)** — refina a camada Application.
3. **View 5 (Hexagonal)** — o diagrama-chave para defender a tese.
4. **View 2 (Business)** + **View 1 (Motivation)** — fechou o "porquê".
5. **View 7 (Technology)** — fechou o "onde roda".
6. **View 6 (Behavior)** — opcional, mas excelente para 1 slide na defesa.

---

## 11. Arquivo `.archimate` companheiro

Junto a este guia está o arquivo `pureurban.archimate` na raiz de `docs/`, com:

- **Folders pré-populados** com todos os elementos das 4 camadas (Motivation, Business, Application, Technology) — basta arrastar para a tela.
- **Relacionamentos-chave** já modelados (Core↔Shell composition, Adapter→Port realization, fluxos entre bounded contexts).
- **7 views nomeadas**, com alguns elementos pré-posicionados para servir de partida.

Abrir no Archi: `File → Open` e selecionar `docs/pureurban.archimate`.

---

*Documento de apoio ao TCC — PureUrban v1.0*
