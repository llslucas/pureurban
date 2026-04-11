# Referencial Teórico — TCC PureUrban

Estrutura proposta para o referencial teórico, com tópicos organizados por eixo temático, autores-chave e fontes recomendadas.

---

## 1. Arquitetura de Software

### 1.1 Arquitetura Hexagonal (Ports & Adapters)

O pilar central da tese. O PureUrban implementa a separação `core/` (domínio puro) e `shell/` (adaptadores NestJS, Prisma, Redis), demonstrando na prática o isolamento do domínio.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Alistair Cockburn** (2005) | *Hexagonal Architecture* (artigo original) | Referência primária — define o padrão Ports & Adapters |
| **Mark Richards & Neal Ford** (2020) | *Fundamentals of Software Architecture* (O'Reilly) | Contextualiza hex. architecture dentro de estilos arquiteturais modernos |
| **Tom Hombergs** (2019) | *Get Your Hands Dirty on Clean Architecture* | Implementação prática em Java/Spring — paralelo direto com NestJS |
| **Robert C. Martin** (2017) | *Clean Architecture* | Variante Onion/Clean que dialoga com Ports & Adapters |

### 1.2 Functional Core, Imperative Shell (FC/IS)

O padrão que justifica a coexistência do Effect TS (core funcional puro) com NestJS (shell imperativo), separando decisões (core) de ações (shell).

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Gary Bernhardt** (2012) | *Boundaries* (palestra, Destroy All Software) | Referência primária — cunhou o termo FC/IS |
| **Gary Bernhardt** (2012) | *Functional Core, Imperative Shell* (screencast) | Demonstração prática do padrão |
| **Scott Wlaschin** (2018) | *Domain Modeling Made Functional* (Pragmatic) | Abordagem funcional para modelagem de domínio — inspiração direta para o uso de Effect TS |
| **Michael Feathers** (2004) | *Working Effectively with Legacy Code* | Fundamenta a testabilidade como driver arquitetural |

### 1.3 Domain-Driven Design (DDD)

Define os bounded contexts (`auth`, `routing`, `boarding`, `tracking`, `trip`), o shared kernel, e a estratégia de isolamento via multi-schema no PostgreSQL.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Eric Evans** (2003) | *Domain-Driven Design: Tackling Complexity in the Heart of Software* | **Referência canônica** — bounded contexts, shared kernel, ubiquitous language |
| **Vaughn Vernon** (2013) | *Implementing Domain-Driven Design* | Implementação prática de DDD, event-driven e aggregates |
| **Vaughn Vernon** (2016) | *Domain-Driven Design Distilled* | Versão condensada — ideal para contextualizar no TCC sem aprofundamento excessivo |
| **Alberto Brandolini** (2021) | *Introducing EventStorming* | Técnica de descoberta de domínio complementar ao DDD |

### 1.4 Monolito Modular

O PureUrban adota monolito modular como alternativa pragmática a microsserviços, com preparação arquitetural para extração futura.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Sam Newman** (2019) | *Monolith to Microservices* (O'Reilly) | Fundamenta quando e por que manter um monolito modular |
| **Martin Fowler** (2015) | *MonolithFirst* (artigo) | Argumento pragmático para começar monolítico |
| **Simon Brown** (2015) | *Software Architecture for Developers* | Modularidade como qualidade arquitetural |

---

## 2. Programação Funcional Tipada (Effect TS)

### 2.1 Programação Funcional em TypeScript

Fundamenta a escolha de Effect TS como functional core, com ênfase em composição de efeitos, erros tipados, e inversão de dependência funcional.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Documentação oficial Effect TS** | [effect.website](https://effect.website) | Referência técnica primária |
| **Giulio Canti** (criador do fp-ts) | Artigos e palestras sobre algebraic effects | Fundamentação teórica dos algebraic effects em TS |
| **Matija Pretnar** (2015) | *An Introduction to Algebraic Effects and Handlers* | Formalização acadêmica dos efeitos algébricos |
| **Bartosz Milewski** (2014) | *Category Theory for Programmers* | Base teórica de functor, monad, e composição — embasa o design do Effect |
| **Enrico Buonanno** (2017) | *Functional Programming in C#* (Manning) | Paralelo prático de FP em linguagem mainstream — útil para TCC |
| **Scott Wlaschin** (2018) | *Domain Modeling Made Functional* | Railway-Oriented Programming — inspiração para o pattern de erros tipados do Effect |

### 2.2 Tratamento de Erros como Tipos (Tagged Errors)

O core do PureUrban usa erros tipados (`StudentNotFound`, `TenantMismatch`) ao invés de exceções — fundamentar essa decisão.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Robert C. Martin** (2008) | *Clean Code* — Cap. 7: Error Handling | Contraste entre exceptions e tipos de retorno |
| **John Hughes** (1989) | *Why Functional Programming Matters* | Fundamentação clássica de composição funcional |
| **Scott Wlaschin** (2013) | *Railway Oriented Programming* (palestra/artigo) | Padrão Either/Result para tratar erros como dados |

---

## 3. Padrões de Integração e Infraestrutura

### 3.1 Inversão de Dependência e Injeção de Dependência

O projeto combina **dois sistemas de DI**: o container IoC do NestJS e os `Tag`/`Layer` do Effect TS, integrados via `ManagedRuntime` + `useFactory`.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Robert C. Martin** (2003) | *Agile Software Development: Principles, Patterns, and Practices* | Define o Dependency Inversion Principle (DIP) — o "D" do SOLID |
| **Martin Fowler** (2004) | *Inversion of Control Containers and the Dependency Injection Pattern* (artigo) | Fundamentação de IoC e DI |
| **Mark Seemann** (2012) | *Dependency Injection in .NET* (Manning) | Composition Root como padrão — paralelo direto com o `EffectRuntimeModule` |

### 3.2 Multi-Tenancy

Todas as queries filtram por `companyId` via `TenantGuard` — padrão arquitetural multi-tenant.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Microsoft** | *Multi-tenant SaaS patterns* (Azure Architecture Center) | Estratégias de isolamento (shared DB, shared schema, schema-per-tenant) |
| **Frederick Chong & Gianpaolo Carraro** (2006) | *Architecture Strategies for Catching the Long Tail* (Microsoft) | Referência clássica de multi-tenancy em SaaS |
| **Sam Newman** (2021) | *Building Microservices* 2ª ed. — Cap. sobre data isolation | Multi-tenancy em bounded contexts |

### 3.3 Comunicação em Tempo Real (SSE + Redis Pub/Sub)

Padrão REST → Redis → Pub/Sub → SSE para streaming de localização GPS.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **W3C** | *Server-Sent Events* (spec) | Especificação oficial de SSE |
| **Ian Hickson** (2015) | *EventSource* (HTML Living Standard) | Protocolo de SSE |
| **Documentação Redis** | [redis.io/docs/interact/pubsub](https://redis.io/docs/interact/pubsub/) | Referência técnica de Pub/Sub |
| **Martin Kleppmann** (2017) | *Designing Data-Intensive Applications* (O'Reilly) | Cap. sobre streaming, message brokers e event-driven architecture |

### 3.4 Offline-First e Sincronização

Estratégia em tiers: Tier 1 (leitura via TanStack Query + MMKV), Tier 2 (fila de escrita via expo-sqlite com idempotência).

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Martin Kleppmann** (2017) | *Designing Data-Intensive Applications* — Cap. 5, 9 e 12 | Replicação, consistência eventual, idempotência |
| **Pat Helland** (2012) | *Idempotence Is Not a Medical Condition* (ACM Queue) | Fundamenta a idempotência via `X-Idempotency-Key` |
| **Bradley Holt** (2015) | *Offline First* (slides/palestras, A List Apart) | Conceito de offline-first como premissa de design |
| **Documentação TanStack Query** | [tanstack.com/query](https://tanstack.com/query) | `persistQueryClient` e caching offline |

---

## 4. Qualidade de Software e Métricas

### 4.1 Métricas de Acoplamento e Coesão

O TCC propõe medir Instability e Abstractness (gráfico de distância da sequência principal) para validar a eficácia da arquitetura hexagonal.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Robert C. Martin** (2003) | *Agile Software Development* — Métricas de Pacotes | Define *Instability (I)*, *Abstractness (A)* e a *Main Sequence* |
| **Robert C. Martin** (2017) | *Clean Architecture* | Revisita métricas com exemplos modernos |
| **Chidamber & Kemerer** (1994) | *A Metrics Suite for Object-Oriented Design* (IEEE) | Suite clássica de métricas OO (CBO, RFC, LCOM) — base acadêmica sólida |

### 4.2 Testabilidade e Testes

A separação FC/IS permite testes de domínio rápidos (<100ms) sem setup de infraestrutura — argumento central da tese.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Kent Beck** (2003) | *Test-Driven Development: By Example* | Fundamenta TDD e design orientado por testes |
| **Gerard Meszaros** (2007) | *xUnit Test Patterns* | Padrões de testes unitários, mocks, stubs |
| **Martin Fowler** (2012) | *TestPyramid* (artigo) | Pirâmide de testes — justifica a priorização de unit tests no core |
| **Gary Bernhardt** (2012) | *Boundaries* | Novamente — FC/IS como estratégia de testabilidade |

---

## 5. Domínio de Aplicação

### 5.1 Transporte Educacional e Mobilidade Urbana

Contextualizar o problema real do transporte universitário intermunicipal em cidades do interior do Brasil.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Legislação brasileira** | Lei nº 10.709/2003 — Transporte escolar | Obrigação dos municípios com transporte escolar |
| **INEP/MEC** | Censo da Educação Superior (dados anuais) | Dados sobre deslocamento intermunicipal de universitários |
| **IPEA** | Estudos sobre mobilidade urbana e transporte público | Contextualização da mobilidade no interior |
| **Artigos acadêmicos** | Buscar em Google Scholar: *"transporte universitário intermunicipal"* | Literatura brasileira específica sobre o problema |
| **ANTP** (Associação Nacional de Transportes Públicos) | Relatórios e publicações | Dados de transporte público no Brasil |

### 5.2 Digitalização e Soluções de Mobilidade (EdTech/LogTech)

Posicionar o PureUrban no mercado de soluções de mobilidade educacional.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Revisão de literatura** | Buscar: *"school transport management system"* | Soluções internacionais de gestão de transporte escolar |
| **Análise de mercado** | Soluções existentes: Transapp, BusPlanner, SafeBus | Diferenciação: foco em K-12 vs. universitário adulto |
| **LGPD** | Lei nº 13.709/2018 | Conformidade com proteção de dados pessoais |

---

## 6. Engenharia de Software e Processo

### 6.1 Metodologias e Práticas

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Ian Sommerville** (2015) | *Software Engineering* 10ª ed. | Referência geral de engenharia de software |
| **Roger Pressman** (2021) | *Software Engineering: A Practitioner's Approach* 9ª ed. | Alternativa clássica para fundamentação |
| **Kent Beck et al.** (2001) | *Manifesto for Agile Software Development* | Fundamentar a abordagem ágil/iterativa do projeto |

### 6.2 Domain Events e Event-Driven Architecture

O padrão `WithEvents<A>` do PureUrban — core retorna eventos como dados, shell despacha.

| Autor / Fonte | Obra | Nota |
|---|---|---|
| **Eric Evans** (2003) | *DDD* — Domain Events | Conceito original de domain events |
| **Vaughn Vernon** (2013) | *IDDD* — Cap. sobre domain events | Implementação prática |
| **Martin Fowler** (2005) | *Event Sourcing* (artigo) | Referência complementar se quiser mencionar ES como trabalho futuro |

---

## Estrutura Sugerida para o Capítulo

```
2. REFERENCIAL TEÓRICO
   2.1 Engenharia de Software
       2.1.1 Processo de Desenvolvimento
       2.1.2 Qualidade de Software e Métricas
   2.2 Arquitetura de Software
       2.2.1 Estilos Arquiteturais (visão geral)
       2.2.2 Arquitetura Hexagonal (Ports & Adapters)
       2.2.3 Monolito Modular
   2.3 Domain-Driven Design
       2.3.1 Bounded Contexts e Shared Kernel
       2.3.2 Domain Events
   2.4 Programação Funcional Tipada
       2.4.1 Efeitos Algébricos e Composição
       2.4.2 Functional Core, Imperative Shell
       2.4.3 Tratamento de Erros como Tipos
   2.5 Padrões de Infraestrutura
       2.5.1 Inversão e Injeção de Dependência
       2.5.2 Multi-Tenancy
       2.5.3 Comunicação em Tempo Real (SSE)
       2.5.4 Offline-First e Sincronização
   2.6 Transporte Educacional
       2.6.1 Contexto do Transporte Universitário no Brasil
       2.6.2 Soluções Existentes e Lacuna de Mercado
       2.6.3 LGPD e Proteção de Dados
```

> [!TIP]
> **Priorize as referências primárias** (Cockburn, Evans, Bernhardt, Martin) — elas dão peso acadêmico. Use a documentação técnica (Effect, NestJS, Prisma) como referências de apoio, não como fundamento teórico.

> [!IMPORTANT]
> Para o TCC, o foco acadêmico é a **integração prática** de Hexagonal + DDD + FC/IS. Os tópicos 2.2–2.4 são o **coração** do referencial. Os demais (2.1, 2.5, 2.6) são contextuais e de apoio.
