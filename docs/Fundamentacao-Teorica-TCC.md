# Fundamentação Teórica — Arquitetura do PureUrban

**Documento de apoio:** `Architecture.md` (PU-SAD-001) + `Guia-Diagramacao-ArchiMate.md`
**Autor:** Winston (System Architect) — para Lucas
**Data:** 13 de maio de 2026
**Propósito:** Consolidar a fundamentação teórica e normativa que sustenta as decisões arquiteturais do PureUrban, com referências citáveis no TCC.

---

## Sumário

1. [ArchiMate — Origem e Bases Teóricas](#1-archimate--origem-e-bases-teóricas)
2. [Conformidade Normativa (ISO/IEC/IEEE)](#2-conformidade-normativa-isoieciee)
3. [Mapeamento Views → Stakeholders → Concerns → Viewpoints](#3-mapeamento-views--stakeholders--concerns--viewpoints)
4. [Citações por View](#4-citações-por-view)
5. [Bibliografia Mínima Recomendada](#5-bibliografia-mínima-recomendada)
6. [Onde inserir no TCC](#6-onde-inserir-no-tcc)

---

## 1. ArchiMate — Origem e Bases Teóricas

### 1.1 Linhagem histórica

ArchiMate é um padrão acadêmico-corporativo com cerca de 20 anos de história:

| Período | Marco |
|---|---|
| **2002–2004** | Pesquisa colaborativa holandesa no **Telematica Instituut** (hoje Novay), com participação de ABN AMRO, ING, Belastingdienst (Receita Federal holandesa) e várias universidades. |
| **2008** | Doação ao **The Open Group** (mesmo consórcio que mantém o TOGAF). Padronização aberta. |
| **2012–2022** | Versões 2.0, 3.0, 3.1, **3.2 (atual, 2022)** — adição de camadas Strategy, Physical, Implementation & Migration. |

A obra de referência fundacional é **"Enterprise Architecture at Work"** (Marc Lankhorst, Springer, 1ª ed. 2005, atualmente em 4ª ed. 2017).

### 1.2 Bases teóricas

ArchiMate combina quatro tradições teóricas anteriores:

1. **Ontologia de Bunge-Wand-Weber (BWW)** — filosofia da informação. Define o que conta como "coisa" no mundo de sistemas (entidade, propriedade, estado, evento). É a base do **metamodelo** do ArchiMate (justifica a distinção rígida entre Actor, Role, Component, etc.).

2. **DEMO — Design & Engineering Methodology for Organizations** (Jan Dietz, TU Delft) — teoria comunicativa da ação organizacional. Raiz da **Business Layer** (processo como sequência de atos comunicativos entre atores).

3. **Service-Oriented Architecture (SOA)** — o conceito de **serviço como interface entre camadas** é o "cimento" do ArchiMate. Toda Realization vertical (Application realiza Business Service, Technology realiza Application Service) é SOA aplicada como princípio de modelagem.

4. **ISO/IEC/IEEE 42010** — padrão internacional de "Architecture Description" (sucessor do IEEE 1471). ArchiMate é uma das poucas notações **formalmente compatíveis** com 42010 — conceitos como *viewpoint*, *view*, *stakeholder concern* vêm desta norma literalmente.

### 1.3 Por que ArchiMate é pouco difundido em cursos de software

Não é por inferioridade técnica — é por **escopo diferente**:

| | UML | ArchiMate |
|---|---|---|
| **Nível** | Software (classes, objetos, sequência) | Enterprise (negócio + aplicação + tech) |
| **Audiência** | Engenheiros de software | Arquitetos corporativos, executivos, auditores |
| **Onde se ensina** | Cursos de Engenharia de Software | MBA em TI, certificações TOGAF |
| **Adoção** | Global, mainstream | Forte na Europa (NL, UK) e Brasil (setor público, bancos) |

### 1.4 Ganho retórico para o TCC

Usar ArchiMate (em vez de diagrama informal) oferece três alavancas argumentativas:

1. **Conformidade com norma internacional** (ISO 42010) — a arquitetura não é "uma opinião desenhada".
2. **Separação formal de viewpoints** — prova-se que múltiplas perspectivas foram pensadas (motivation, behavior, deployment), não apenas "o diagrama da arquitetura".
3. **Rastreabilidade entre camadas** — Realizations verticais (View 3) demonstram explicitamente como `Container API` realiza `NestJS API` que realiza `Serviço de Transporte` — isso é exatamente o que TOGAF chama de *traceability across architecture domains*.

---

## 2. Conformidade Normativa (ISO/IEC/IEEE)

### 2.1 Norma central: ISO/IEC/IEEE 42010:2022

**ISO/IEC/IEEE 42010** — *"Software, systems and enterprise — Architecture description"* (versão 2022, sucessora da 42010:2011 e da IEEE 1471:2000) — define **como descrever arquiteturas**.

Ela estabelece sete conceitos centrais. Mapeamento direto com o PureUrban:

| Conceito 42010 | Definição | Onde aparece no PureUrban |
|---|---|---|
| **System-of-interest** | O sistema sendo descrito | PureUrban (SAD § 1.1) |
| **Stakeholder** | Indivíduo/grupo com interesse no sistema | Aluno, Motorista, Admin, Universidade, Empresa de Transporte → **View 1** |
| **Concern** | Preocupação de um stakeholder | "Visibilidade em tempo real", "conectividade 4G intermitente", "acessibilidade" → Driver/Goal/Constraint na **View 1** |
| **Viewpoint** | Convenção para construir e interpretar uma view (template) | Os 7 viewpoints do ArchiMate utilizados |
| **View** | Representação do sistema a partir de um viewpoint | As 7 views concretas desenhadas |
| **Model kind** | Tipo de modelo dentro de uma view | Diagrama ArchiMate, tabela de elementos, nota textual |
| **Correspondence rule** | Regra que mantém consistência entre views | Realizations cross-layer da **View 3**; mesmos bounded contexts nas Views 3, 4 e 5 |

### 2.2 Cinco conformidades mínimas exigidas pela 42010

A norma exige cinco conformidades. O PureUrban atende todas:

1. **Identificar stakeholders e concerns** — View 1 (Motivation) faz isso explicitamente.
2. **Definir viewpoints antes de criar views** — cada view declara seu viewpoint no Archi (`Properties → Viewpoint`).
3. **Cada view aborda concerns específicos** — Tabela do § 3 deste documento estabelece a rastreabilidade.
4. **Correspondence rules entre views** — uso consistente dos nomes `Auth/Routing/Trip/Boarding/Tracking` em todas as views.
5. **Rationale arquitetural documentado** — `Architecture.md` § 3 (Decisões Arquiteturais) cumpre o papel de ADRs (Architecture Decision Records), conforme 42010 § 5.6.

### 2.3 Normas complementares aplicáveis

| Norma | O que define | Onde toca no PureUrban |
|---|---|---|
| **ISO/IEC 25010:2011** | Modelo de qualidade de software (8 características: performance, segurança, manutenibilidade, etc.) | NFR1–NFR20 do PRD mapeiam 1:1 com ISO 25010 — usabilidade (NFR16–19), confiabilidade (NFR7), eficiência (NFR1–2), portabilidade (NFR15), segurança (NFR8–11). |
| **ISO/IEC/IEEE 12207:2017** | Processos de ciclo de vida de software | Cobre o fluxo "PRD → SAD → stories → implementação → CI/CD". Justifica a metodologia BMad. |
| **ISO/IEC 25012** | Modelo de qualidade de dados | Aplicável ao schema multi-tenant (companyId, integridade referencial). |
| **TOGAF 10** (não é ISO, mas é Open Group) | Framework de Enterprise Architecture com o **ADM (Architecture Development Method)** | Os domínios B/A/T do TOGAF mapeiam exatamente nas 3 faixas da View 3. |
| **ISO 9241-11 e 9241-171** | Usabilidade e acessibilidade (base do WCAG) | Sustenta NFR18 (acessibilidade) e NFR19 (alto contraste). |

### 2.4 Parágrafo-modelo de conformidade para o SAD

Sugestão de texto a inserir em **Architecture.md § 1.5 (Conformidade Normativa)** ou seção equivalente do TCC:

> *"A descrição arquitetural deste documento segue a norma **ISO/IEC/IEEE 42010:2022** (Systems and software engineering — Architecture description), identificando stakeholders, concerns e viewpoints conforme tabela de rastreabilidade. A notação adotada é **ArchiMate® 3.2** (The Open Group, 2022), padrão aberto compatível com 42010. Os atributos de qualidade (NFRs) são classificados conforme **ISO/IEC 25010:2011** (Systems and software Quality Requirements and Evaluation — SQuaRE). As decisões arquiteturais são registradas como ADRs (Architecture Decision Records), conforme prática recomendada pela 42010 § 5.6."*

---

## 3. Mapeamento Views → Stakeholders → Concerns → Viewpoints

Esta tabela é a **"Architecture Viewpoint Library"** exigida pela 42010. Recomendado incluir como artefato auditável no SAD ou em apêndice do TCC.

| View | Stakeholder primário (42010) | Concern endereçado | Viewpoint ArchiMate |
|---|---|---|---|
| **View 1 — Motivation** | Universidade, Empresa de Transporte (sponsor) | "Por que investir? Que problema resolve?" | Stakeholder Viewpoint |
| **View 2 — Business** | Admin, gestor da empresa | "Quem opera o sistema? Que processos?" | Business Process Viewpoint |
| **View 3 — Layered Master** | Banca, gerente de projeto | "Visão integrada de ponta a ponta" | **Layered Viewpoint** (único cross-layer reconhecido) |
| **View 4 — Application Cooperation** | Arquiteto, dev sênior | "Como os contextos conversam?" | Application Cooperation Viewpoint |
| **View 5 — Hexagonal (Core/Shell)** | Dev, code reviewer, banca técnica | "A regra de dependência é respeitada?" | Application Structure Viewpoint |
| **View 6 — Behavior (Check-in)** | Dev mobile, QA | "Como o fluxo crítico se comporta?" | Application Behavior Viewpoint |
| **View 7 — Technology/Deployment** | DevOps, operador, professor de infra | "Onde roda? Que recursos?" | Implementation & Deployment Viewpoint |

---

## 4. Citações por View

Para cada view, as referências estão separadas em **canônicas** (cite no corpo do TCC) e **complementares** (notas de rodapé ou apêndice).

### 4.1 View 3 — Layered View (Master)

**Tese a defender:** *"Descrever o sistema em camadas (Business/Application/Technology) é prática estabelecida em Enterprise Architecture e essencial para rastreabilidade entre domínios."*

#### Canônicas

1. **THE OPEN GROUP.** *ArchiMate® 3.2 Specification*. Document Number: C226. The Open Group, 2022.
   *Seção a citar:* **Capítulo 14 — "Cross-Layer Dependencies"** e **§ 8 — "Layered Viewpoint"**. Referência normativa direta.

2. **LANKHORST, Marc.** *Enterprise Architecture at Work: Modelling, Communication and Analysis*. 4ª ed. Berlin: Springer, 2017. ISBN 978-3-662-53932-3.
   *Seções a citar:* **Cap. 4** (Linguagem ArchiMate) e **Cap. 8** (View and Viewpoint Mechanism). Autor principal da pesquisa original do ArchiMate (2002–2004).

3. **KRUCHTEN, Philippe.** "Architectural Blueprints — The '4+1' View Model of Software Architecture". *IEEE Software*, v. 12, n. 6, p. 42–50, 1995. DOI: 10.1109/52.469759.
   Ancestral conceitual da ideia de "múltiplas views para uma mesma arquitetura". Princípio "uma view ≠ a arquitetura toda".

4. **ISO/IEC/IEEE 42010:2022** — *Software, systems and enterprise — Architecture description*. Geneva: ISO, 2022.
   *Seção a citar:* **§ 5.5 — Architecture Views and Viewpoints**. A View 3 (Layered) é, formalmente, uma *composite view* no vocabulário 42010.

#### Complementares

5. **CLEMENTS, Paul; BACHMANN, Felix; BASS, Len; et al.** *Documenting Software Architectures: Views and Beyond*. 2ª ed. Boston: Addison-Wesley, 2010. ISBN 978-0-321-55268-6.
   Referência do SEI (Software Engineering Institute, Carnegie Mellon). Defende **module/component-and-connector/allocation views** — equivalente conceitual das 3 faixas Business/Application/Technology.

6. **THE OPEN GROUP.** *TOGAF® Standard, 10th Edition*. The Open Group, 2022.
   *Seção a citar:* **Part II — ADM, Phases B (Business), C (Information Systems), D (Technology)**. As 3 faixas da View 3 = os 3 domínios do TOGAF ADM.

---

### 4.2 View 4 — Application Cooperation (Bounded Contexts + Domain Events)

**Tese a defender:** *"A separação em 5 bounded contexts comunicando-se via Domain Events é fundamentada em DDD (Evans, Vernon) e em padrões consagrados de integração orientada a eventos (Hohpe & Woolf, Fowler)."*

#### Canônicas

1. **EVANS, Eric.** *Domain-Driven Design: Tackling Complexity in the Heart of Software*. Boston: Addison-Wesley, 2003. ISBN 978-0-321-12521-7.
   *Capítulo a citar:* **Cap. 14 — "Maintaining Model Integrity" — Bounded Context, Context Map**. Fonte primária do conceito de bounded context.

2. **VERNON, Vaughn.** *Implementing Domain-Driven Design*. Boston: Addison-Wesley, 2013. ISBN 978-0-321-83457-7.
   *Capítulos a citar:* **Cap. 2 — "Domains, Subdomains, and Bounded Contexts"** e **Cap. 8 — "Domain Events"**. Operacionaliza Evans — referência mais citada quando se trata de *implementar* DDD.

3. **HOHPE, Gregor; WOOLF, Bobby.** *Enterprise Integration Patterns: Designing, Building, and Deploying Messaging Solutions*. Boston: Addison-Wesley, 2003. ISBN 978-0-321-20068-6.
   *Padrões a citar:* **Publish-Subscribe Channel**, **Event Message**, **Message Endpoint**. Descrevem o que `EventEmitter2 + Redis Pub/Sub` implementa no PureUrban.

4. **FOWLER, Martin.** "What do you mean by 'Event-Driven'?". *martinfowler.com*, 2017. Disponível em: https://martinfowler.com/articles/201701-event-driven.html.
   Distingue **Event Notification**, **Event-Carried State Transfer**, **Event Sourcing** e **CQRS**. Os Domain Events do PureUrban caem na categoria **Event-Carried State Transfer**.

5. **THE OPEN GROUP.** *ArchiMate® 3.2 Specification*. 2022.
   *Seção a citar:* **§ 8.4 — Application Cooperation Viewpoint**.

#### Complementares

6. **EVANS, Eric.** *Domain-Driven Design Reference: Definitions and Pattern Summaries*. Domain Language, 2015. Disponível em: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf.
   PDF gratuito do próprio Evans com definições atualizadas dos patterns DDD.

7. **NEWMAN, Sam.** *Building Microservices*. 2ª ed. Sebastopol: O'Reilly, 2021. ISBN 978-1-492-03402-5.
   *Capítulo a citar:* **Cap. 4 — "Microservice Communication Styles" — Event-Driven**. Discute trade-offs entre comunicação síncrona e assíncrona — justifica o uso de eventos *dentro de um monolito modular*, não micro-serviços.

---

### 4.3 View 5 — Application Structure (Hexagonal + Core/Shell)

**Tese a defender:** *"A combinação Hexagonal Architecture + Functional Core/Imperative Shell garante testabilidade do domínio e isolamento de efeitos colaterais, fundamentando-se em Cockburn, Bernhardt e Martin."*

#### Canônicas

1. **COCKBURN, Alistair.** "Hexagonal Architecture" (Ports and Adapters). *alistair.cockburn.us*, 2005. Disponível em: https://alistair.cockburn.us/hexagonal-architecture/.
   Artigo original (2005, refinado em 2008). Cockburn cunhou o termo Hexagonal/Ports and Adapters.

2. **BERNHARDT, Gary.** "Boundaries". *SCNA — Software Craftsmanship North America Conference*, 2012. Transcrição e vídeo: https://www.destroyallsoftware.com/talks/boundaries.
   Fonte primária do termo **"Functional Core, Imperative Shell"**. Bernhardt cunhou o conceito nesta palestra. Citação rara e poderosa.

3. **MARTIN, Robert C.** *Clean Architecture: A Craftsman's Guide to Software Structure and Design*. Boston: Prentice Hall, 2017. ISBN 978-0-13-449416-6.
   *Capítulos a citar:* **Cap. 22 — "The Clean Architecture"** e **Cap. 23 — "Presenters and Humble Objects"**. Sintetiza Cockburn (Hexagonal), Jeffrey Palermo (Onion), Jacobson (BCE). A **Dependency Rule** justifica `core/` nunca importar de `shell/`.

4. **VERNON, Vaughn.** *Implementing Domain-Driven Design*. 2013.
   *Capítulo a citar:* **Cap. 4 — "Architecture" — Hexagonal Architecture (Ports and Adapters)**. Vernon mostra Hexagonal **aplicada a DDD** — ponte conceitual entre View 4 (DDD) e View 5 (Hexagonal).

5. **THE OPEN GROUP.** *ArchiMate® 3.2 Specification*. 2022.
   *Seção a citar:* **§ 8.3 — Application Structure Viewpoint**.

#### Complementares (sobre Functional Core especificamente)

6. **WLASCHIN, Scott.** *Domain Modeling Made Functional: Tackling Software Complexity with Domain-Driven Design and F#*. Raleigh: Pragmatic Bookshelf, 2018. ISBN 978-1-68050-254-1.
   *Capítulo a citar:* **Cap. 9 — "Implementation: Composing a Pipeline"**. Wlaschin combina DDD + Functional Programming — referência mais didática para defender a escolha de **Effect TS** no core.

7. **MILEWSKI, Bartosz.** *Category Theory for Programmers*. 2019. Disponível em: https://github.com/hmemcpy/milewski-ctfp-pdf.
   *Capítulo a citar:* **Cap. 20 — "Monads"**. Justifica formalmente `Effect<R, E, A>` como mônada de efeito. Fundamentação matemática para "por que separar efeitos do core".

8. **HICKEY, Rich.** "Simple Made Easy". *Strange Loop Conference*, 2011. Disponível em: https://www.infoq.com/presentations/Simple-Made-Easy/.
   Talk seminal sobre simplicidade (objetiva: não entrelaçar conceitos) vs. facilidade (subjetiva: familiaridade). Justifica "core puro = simples, shell = onde a complexidade vive". Bernhardt cita Hickey explicitamente.

---

## 5. Bibliografia Mínima Recomendada

Se houver limitação de espaço para citar no TCC, este conjunto de **8 referências** cobre as Views 3, 4 e 5:

| # | Referência | Cobre View(s) |
|---|---|---|
| 1 | ISO/IEC/IEEE 42010:2022 | Todas (norma-mãe) |
| 2 | The Open Group — ArchiMate 3.2 Specification (2022) | Todas (notação) |
| 3 | Lankhorst — *Enterprise Architecture at Work* (2017) | View 3 |
| 4 | Evans — *Domain-Driven Design* (2003) | View 4 |
| 5 | Vernon — *Implementing DDD* (2013) | Views 4 e 5 |
| 6 | Hohpe & Woolf — *Enterprise Integration Patterns* (2003) | View 4 |
| 7 | Cockburn — *Hexagonal Architecture* (2005) | View 5 |
| 8 | Bernhardt — *Boundaries* (2012) | View 5 |

**Refinamento opcional:** adicionar 2 a 4 complementares (Martin, Kruchten, Wlaschin, Fowler) eleva o trabalho de "TCC bem feito" para "TCC com revisão bibliográfica madura".

---

## 6. Onde inserir no TCC

Sugestão de distribuição dos conteúdos deste documento no TCC final:

| Conteúdo deste documento | Local sugerido no TCC |
|---|---|
| § 1 — Origem e bases teóricas do ArchiMate | Capítulo de **Referencial Teórico** (subseção "Notação Arquitetural") |
| § 2 — Conformidade Normativa | Capítulo de **Arquitetura**, seção 1 (introdução) — usar o parágrafo-modelo do § 2.4 |
| § 3 — Tabela Stakeholder → Concern → Viewpoint → View | **Apêndice de Arquitetura** ou abertura do Capítulo de Arquitetura |
| § 4 — Citações por View | Distribuídas: cada view ganha 1 parágrafo introdutório com 2–3 citações no Capítulo de Arquitetura |
| § 5 — Bibliografia mínima | Capítulo de **Referências** (consolidado com demais citações do trabalho) |

### Distribuição no `Architecture.md` (SAD interno)

- **§ 1.5 (nova subseção "Conformidade Normativa")** — inserir o parágrafo-modelo do § 2.4 deste documento.
- **§ 3 (Decisões Arquiteturais)** — cada decisão (Hexagonal, Functional Core, Event-driven entre contextos) ganha linha "Fonte:" com 1–2 citações.
- **§ 4 (Domain Events)** — abrir com 1 parágrafo citando Evans + Vernon + Hohpe&Woolf.
- **Apêndice** — Tabela do § 3 deste documento (rastreabilidade Stakeholder → View).

---

## Anexo — Glossário rápido das normas citadas

| Sigla | Nome completo | Foco |
|---|---|---|
| **42010** | ISO/IEC/IEEE 42010 — Architecture description | Como descrever arquiteturas (estrutura do documento e das views) |
| **25010** | ISO/IEC 25010 — SQuaRE | Modelo de qualidade de software (NFRs) |
| **25012** | ISO/IEC 25012 — Data quality model | Qualidade de dados |
| **12207** | ISO/IEC/IEEE 12207 — Software life cycle processes | Processos de ciclo de vida |
| **9241-11 / 9241-171** | ISO 9241 — Ergonomics of human-system interaction | Usabilidade e acessibilidade |
| **TOGAF** | The Open Group Architecture Framework | Método de desenvolvimento de Enterprise Architecture (ADM) |
| **ArchiMate** | The Open Group ArchiMate Specification | Notação visual compatível com 42010 |

---

*Documento de apoio ao TCC — PureUrban v1.0*
