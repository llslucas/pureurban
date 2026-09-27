---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments: ['planning-artifacts/prd.md', 'planning-artifacts/architecture.md', 'planning-artifacts/sprint-change-proposal-2026-07-12.md']
lastUpdated: '2026-07-12'
revision: 'Épicos 3, 4 e 5 refatiados em trilhas backend/mobile com contrato OpenAPI-first (sprint-change-proposal-2026-07-12, aprovado). Épicos 1 e 2 e a Story 3.1 não foram alterados.'
---

# PureUrban - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for PureUrban, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Gestão de Identidade e Acesso:**
- FR1: Empresa pode cadastrar sua organização na plataforma
- FR2: Empresa pode cadastrar e gerenciar motoristas vinculados à sua organização
- FR3: Empresa pode cadastrar e gerenciar alunos, definindo permissão de embarque por rota
- FR4: Motorista pode autenticar-se no app com credenciais vinculadas à empresa
- FR5: Aluno pode autenticar-se no app com credenciais vinculadas à empresa
- FR6: Sistema valida que apenas alunos com permissão ativa podem acessar informações de rotas e realizar check-in

**Gestão de Rotas e Turmas:**
- FR7: Empresa pode criar, editar e remover rotas de transporte
- FR8: Empresa pode vincular alunos a rotas específicas
- FR9: Empresa pode vincular motoristas a rotas específicas
- FR10: Motorista pode visualizar as rotas atribuídas a ele

**Gestão de Viagens:**
- FR11: Motorista pode iniciar uma viagem (ida) para uma rota atribuída
- FR12: Motorista pode encerrar uma viagem em andamento
- FR13: Motorista pode iniciar uma viagem de retorno para a mesma rota
- FR14: Sistema registra horários de início e fim de cada viagem

**Embarque Digital (QR Code):**
- FR15: Sistema gera QR code único vinculado à sessão do aluno autenticado (estático por sessão para o MVP)
- FR16: Motorista pode escanear QR code do aluno para registrar embarque
- FR17: Aluno pode apresentar seu QR code para embarque
- FR18: Sistema valida que o aluno tem permissão para embarcar naquela rota
- FR19: Sistema registra check-in com timestamp e identificação do aluno
- FR20: Sistema rejeita QR codes inválidos, expirados ou de alunos sem permissão
- FR21: Check-in via QR code funciona em modo offline, sincronizando quando a conexão retornar

**Lista de Alunos e Status de Embarque:**
- FR22: Motorista pode visualizar lista completa de alunos da viagem atual
- FR23: Motorista pode ver o status de cada aluno em tempo real (embarcou, não embarcou, não vai voltar)
- FR24: Lista de alunos é acessível em modo offline
- FR25: Sistema exibe contagem resumida (ex: "28/32 embarcados")

**Notificação de Ausência:**
- FR26: Aluno pode notificar que não retornará na viagem de volta com uma ação simples
- FR27: Motorista recebe notificação imediata quando aluno informa que não retornará
- FR28: Motorista pode ver quais alunos notificaram ausência na lista de embarque
- FR29: Sistema permite que aluno cancele a notificação de ausência dentro de um período de segurança
- FR30: Sistema envia lembrete automático ao aluno que embarcou na ida mas não fez check-in na volta após um período definido — **no MVP entregue in-app** (canal SSE + estado lido na abertura do app); push fica para a Fase 2

**Localização em Tempo Real:**
- FR31: App do motorista transmite localização GPS durante viagens ativas
- FR32: Aluno pode visualizar a localização do ônibus em tempo real — **no MVP como última posição conhecida + distância/ETA até o ponto do aluno**; mapa cartográfico fica para a Fase 2
- FR33: Sistema interrompe transmissão de GPS quando a viagem é encerrada
- FR34: Sistema exibe último ponto conhecido quando há perda de sinal GPS
- FR35: Localização é atualizada via SSE com armazenamento em Redis

**Comunicação — diferido para a Fase 2 (revisão de 28/08/2026):**
- ~~FR36~~ *(Fase 2)*: Motorista pode enviar aviso geral para todos os alunos da rota (ex: atraso, mudança)
- ~~FR37~~ *(Fase 2)*: Aluno recebe avisos enviados pelo motorista da sua rota

### NonFunctional Requirements

**Performance:**
- NFR1: Check-in via QR code deve ser processado em menos de 2 segundos em cenário online
- NFR2: Atualização de localização GPS entregue aos alunos com latência máxima de 5 segundos
- NFR3: Notificação de "não vou voltar" entregue ao motorista em menos de 3 segundos
- NFR4: Lista de alunos deve carregar em menos de 1 segundo, mesmo com 50+ alunos por rota
- NFR5: App deve iniciar e estar operacional em menos de 3 segundos em dispositivos Android 8+

**Segurança (Simplificada para Protótipo):**
- NFR6: Comunicações entre app e API via HTTPS (TLS 1.2+)
- NFR7: Autenticação JWT com access token (15min) e refresh token (7 dias)
- NFR8: QR code estático por sessão de login do aluno — segurança suficiente para protótipo
- NFR9: Dados de usuários utilizados apenas para fins de demonstração acadêmica. Conformidade completa com LGPD prevista para Fase 2
- NFR10: GPS do motorista coletado e transmitido apenas durante viagens ativas

**Confiabilidade:**
- NFR11: Dados de check-in offline devem persistir localmente sem perda, mesmo com crash do app
- NFR12: Sincronização offline→online com resolução automática de conflitos (last-write-wins)
- NFR13: Interface exibe estado degradado claro quando offline ("Modo Offline — dados serão sincronizados")
- NFR14: Falha na API não impede funcionalidades offline (check-in, visualização de lista)

**Escalabilidade (Preparação Arquitetural):**
- NFR15: Arquitetura modular (DDD) permite adição de novos bounded contexts sem refatoração do core
- NFR16: Separação functional core / imperative shell permite troca de adaptadores sem alterar lógica de negócio
- NFR17: Sistema suporta múltiplas empresas com isolamento de dados (multi-tenancy por empresa)

**Acessibilidade e Usabilidade:**
- NFR18: Interface do motorista otimizada para operação com uma mão e em movimento (botões grandes, contraste alto)
- NFR19: Fluxos críticos (check-in, "não vou voltar") exigem no máximo 2 toques
- NFR20: App utilizável em dispositivos com tela de 5" e resolução mínima de 720p

### Additional Requirements

**Requisitos de Infraestrutura e Setup (da Architecture):**
- Inicialização via starters: `npx create-expo-app@latest ./mobile --template default` + `npx @nestjs/cli@latest new ./api --strict --package-manager npm`
- Docker Compose para PostgreSQL + Redis (ambiente de desenvolvimento local)
- Prisma schema com `moduleFormat = "cjs"` para compatibilidade com NestJS
- Effect TS setup + Composition Root (`EffectRuntimeModule` com `useFactory` + `ManagedRuntime`)
- Swagger/OpenAPI via `@nestjs/swagger` para documentação da API

**Requisitos de Integração Effect TS ↔ NestJS:**
- Integração manual via Composition Root (sem bibliotecas de terceiros)
- Functional core (Effect TS puro) define interfaces (Tags) — zero imports de NestJS
- Shell (NestJS) injeta runtime via `@Inject('EFFECT_RUNTIME')` e executa programas com `runtime.runPromise()`
- Domain events via return tuple (`WithEvents<A>`) — core decide eventos, shell despacha via EventEmitter2

**Requisitos de Segurança e Multi-tenancy:**
- RBAC via NestJS Guards + decorators customizados (`@Roles('admin', 'driver', 'student')`)
- `TenantGuard` extrai `tenantId` do JWT — todas as queries filtradas por tenant
- Toda entidade DEVE ter `id`, `createdAt`, `updatedAt` e `companyId`

**Requisitos de Validação e Tratamento de Erros:**
- Validação de dados via Effect Schema (mantém validação no functional core)
- Pipe customizado NestJS converte erros Effect Schema → respostas HTTP
- ExceptionFilter converte tagged errors do core → HTTP status + body padronizado
- Formato de resposta padronizado: `{ data: {...}, meta: {...} }` (sucesso) e `{ error: { code, message, details } }` (erro)

**Requisitos Mobile (Pós-inicialização):**
- Storage offline: expo-sqlite (lista de alunos, queue de check-ins) + MMKV (tokens, preferências)
- Gerenciamento de estado: Zustand (sessão, viagem ativa) + TanStack Query (cache API, suporte offline)
- UI: React Native Paper (Material Design) para componentes acessíveis
- expo-camera para leitura de QR code
- EventSource para SSE (localização em tempo real)

**Requisitos de Testes (TCC):**
- Testes colocados junto ao arquivo testado (`*.spec.ts`)
- Testes de integração na pasta `test/` na raiz do projeto API
- Testes de domínio executáveis sem infraestrutura (< 100ms por suite)

**Sequência de Implementação Definida na Architecture:**
1. Inicialização dos projetos (Expo + NestJS starters)
2. Docker Compose (PostgreSQL + Redis)
3. Prisma schema + migrations
4. Effect TS setup + Composition Root
5. Auth module (JWT + Guards + RBAC)
6. Primeiro bounded context com CRUD (Rotas/Turmas)
7. Embarque digital (QR code + offline sync)
8. Localização em tempo real (SSE + Redis)
9. Notificações de ausência
10. Swagger documentation

### UX Design Requirements

**Atualização 26/09/2026:** a especificação de UX existe desde o Épico 6 — `ux-designs/ux-pureurban-2026-09-26/` (`DESIGN.md` + `EXPERIENCE.md`). Até então: nenhum documento de UX Design foi encontrado. Requisitos de UX derivados dos NFRs do PRD (NFR18-NFR20) e das decisões de Architecture (React Native Paper, Zustand stores por domínio).

### FR Coverage Map

- FR1: Epic 2 — Cadastro de empresa
- FR2: Epic 2 — Cadastro de motoristas
- FR3: Epic 2 — Cadastro de alunos
- FR4: Epic 2 — Autenticação do motorista
- FR5: Epic 2 — Autenticação do aluno
- FR6: Epic 2 — Validação de permissão de acesso
- FR7: Epic 2 — CRUD de rotas
- FR8: Epic 2 — Vínculo aluno-rota
- FR9: Epic 2 — Vínculo motorista-rota
- FR10: Epic 2 — Visualização de rotas do motorista
- FR11: Epic 3 — Iniciar viagem (ida)
- FR12: Epic 3 — Encerrar viagem
- FR13: Epic 3 — Iniciar viagem de retorno
- FR14: Epic 3 — Registro de horários de viagem
- FR15: Epic 3 — Geração de QR code do aluno
- FR16: Epic 3 — Escaneamento de QR code pelo motorista
- FR17: Epic 3 — Apresentação do QR code pelo aluno
- FR18: Epic 3 — Validação de permissão de embarque
- FR19: Epic 3 — Registro de check-in com timestamp
- FR20: Epic 3 — Rejeição de QR codes inválidos
- FR21: Epic 3 — Check-in offline com sync
- FR22: Epic 3 — Lista de alunos da viagem
- FR23: Epic 3 — Status de embarque em tempo real
- FR24: Epic 3 — Lista de alunos offline
- FR25: Epic 3 — Contagem resumida de embarque
- FR26: Epic 4 — Notificação "não vou voltar"
- FR27: Epic 4 — Recebimento de notificação de ausência
- FR28: Epic 4 — Visualização de ausências na lista
- FR29: Epic 4 — Cancelamento de notificação de ausência
- FR30: Epic 4 — Lembrete automático de check-in pendente
- FR31: Epic 5 — Transmissão de GPS do motorista
- FR32: Epic 5 — Visualização de localização no mapa
- FR33: Epic 5 — Interrupção de GPS ao encerrar viagem
- FR34: Epic 5 — Exibição de último ponto conhecido
- FR35: Epic 5 — Atualização via SSE + Redis
- ~~FR36~~: **Fase 2** — Aviso geral do motorista (diferido em 28/08/2026)
- ~~FR37~~: **Fase 2** — Recebimento de avisos pelo aluno (diferido em 28/08/2026)

## Epic List

### Epic 1: Fundação do Projeto e Infraestrutura
Ambos os projetos (API + Mobile) inicializados com toda a infraestrutura necessária — Docker, Prisma, Effect TS, Composition Root — prontos para receber funcionalidades.
**FRs cobertos:** Nenhum diretamente (habilitador técnico)

### Epic 2: Identidade, Acesso e Organização
Empresa cadastrada, motoristas e alunos criados com suas credenciais, rotas configuradas com vínculos — todos podem fazer login e ver suas rotas. O sistema está pronto para operação.
**FRs cobertos:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10

### Epic 3: Gestão de Viagens e Embarque Digital
Motorista inicia viagem, alunos fazem check-in via QR code, motorista vê lista de embarque atualizada com contagem — o fluxo principal do produto funciona end-to-end.
**FRs cobertos:** FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25

### Epic 4: Notificação de Ausência e Comunicação
Aluno pode avisar "não vou voltar" com um toque, motorista recebe instantaneamente, sistema envia lembrete automático in-app — o maior problema (espera indevida) é eliminado.
**FRs cobertos:** FR26, FR27, FR28, FR29, FR30 *(FR36 e FR37 diferidos para a Fase 2 — revisão de 28/08/2026)*

### Epic 5: Localização em Tempo Real
Aluno acompanha o ônibus em tempo real — última posição conhecida com distância e tempo estimado até seu ponto — e o motorista transmite GPS automaticamente durante as viagens. Ansiedade de espera no ponto eliminada.
**FRs cobertos:** FR31, FR32, FR33, FR34, FR35

### Epic 6: Redesign da Interface Mobile
Design system e redesign visual + microinterações das telas da demo, sem mudar fluxos — o app deixa de parecer protótipo e cumpre de fato a usabilidade em campo. Fase 2 do PRD ("Polish de UX"), criado em 26/09/2026.
**FRs cobertos:** Nenhum novo (qualidade de experiência) · **NFRs:** NFR13, NFR18, NFR19, NFR20

### Epic 7: Mapa Cartográfico no Acompanhamento do Ônibus
O aluno vê o ônibus e a si mesmo num mapa, acima do card de ETA, no app nativo. Polish de apresentação da Fase 2 do PRD ("Mapa cartográfico", evolução do FR32), criado em 27/09/2026. No Expo Web a tela segue como está.
**FRs cobertos:** FR32 (evolução da forma de entrega)

---

## Epic 1: Fundação do Projeto e Infraestrutura

Ambos os projetos (API + Mobile) inicializados com toda a infraestrutura necessária — Docker, Prisma, Effect TS, Composition Root — prontos para receber funcionalidades.

### Story 1.1: Inicialização dos Projetos e Repositório

Como desenvolvedor,
Quero inicializar os projetos Expo e NestJS com a estrutura de monorepo definida na Architecture,
Para que eu tenha a base de código pronta para desenvolvimento.

**Acceptance Criteria:**

**Given** nenhum projeto existe
**When** executo os comandos de inicialização
**Then** os diretórios `api/` e `mobile/` são criados com as dependências base
**And** a estrutura de diretórios hexagonal (`domains/`, `core/`, `shell/`) está criada no backend
**And** o Expo Router com as rotas `(auth)/`, `(student)/`, `(driver)/` está configurado
**And** `docker-compose.yml` na raiz com PostgreSQL e Redis está funcional

### Story 1.2: Schema Prisma e Configuração do Banco de Dados

Como desenvolvedor,
Quero configurar o Prisma com o schema inicial e executar a primeira migration,
Para que o banco de dados esteja pronto para as entidades dos próximos épicos.

**Acceptance Criteria:**

**Given** Docker Compose rodando
**When** configuro o Prisma
**Then** a conexão com PostgreSQL é estabelecida com `moduleFormat = "cjs"`
**And** o schema contém a entidade `Company` com campos `id`, `name`, `createdAt`, `updatedAt` (seed mínimo para multi-tenancy)
**And** `npx prisma migrate dev` executa com sucesso
**And** `PrismaService` está criado no shared kernel (`shared/shell/infra/`)

### Story 1.3: Setup Effect TS e Composition Root

Como desenvolvedor,
Quero configurar Effect TS com o Composition Root (EffectRuntimeModule),
Para que o padrão Functional Core / Imperative Shell esteja operacional.

**Acceptance Criteria:**

**Given** NestJS configurado
**When** crio o EffectRuntimeModule
**Then** `useFactory` instancia um `ManagedRuntime` com PrismaService injetado
**And** `@Inject('EFFECT_RUNTIME')` está disponível para qualquer service do NestJS
**And** `EffectEventDispatcher` está implementado com `runAndDispatch` funcional
**And** shared kernel contém `DomainEvent`, `WithEvents<A>`, `noEvents`, `withEvents`
**And** um programa Effect de teste (health check) executa com sucesso via runtime

### Story 1.4: Infraestrutura Compartilhada (Guards, Filters, Pipes)

Como desenvolvedor,
Quero implementar os componentes transversais do shared kernel,
Para que todos os bounded contexts futuros herdem RBAC, tratamento de erros tipado e validação.

**Acceptance Criteria:**

**Given** Effect TS configurado
**When** implemento o shared kernel
**Then** `RolesGuard` com decorator `@Roles()` está funcional
**And** `TenantGuard` extrai `companyId` do JWT e injeta no request
**And** `EffectExceptionFilter` converte tagged errors Effect → HTTP status + body `{ error: { code, message, details } }`
**And** `EffectSchemaPipe` converte erros de validação Effect Schema → respostas HTTP 400
**And** formato de resposta padronizado (`{ data, meta }`) está implementado

### Story 1.5: Setup Mobile — Dependências e Configuração Offline

Como desenvolvedor,
Quero instalar e configurar as dependências do app mobile (storage, estado, UI),
Para que o app esteja pronto para receber funcionalidades com suporte offline.

**Acceptance Criteria:**

**Given** Expo inicializado
**When** configuro as dependências
**Then** MMKV está funcional para leitura/escrita rápida
**And** expo-sqlite está configurado para persistência estruturada
**And** Zustand está configurado com store de exemplo
**And** TanStack Query com `persistQueryClient` (via MMKV) está funcional
**And** React Native Paper está instalado com tema base configurado
**And** `api-client.ts` está criado com URL base configurável

---

### Story 1.6: Ambiente de Execução Web do App Mobile

Como desenvolvedor,
Quero executar o app mobile no alvo web,
Para que exista um ambiente onde as stories mobile possam ser desenvolvidas e verificadas.

**Acceptance Criteria:**

**Given** o app mobile sem ambiente de execução viável (Expo Go incompatível com MMKV/Nitro)
**When** configuro o alvo web
**Then** `mobile/metro.config.js` existe, estende `expo/metro-config` e registra `wasm` em `resolver.assetExts`
**And** o dev server envia os headers `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: credentialless`, exigidos pelo `SharedArrayBuffer` do wa-sqlite
**And** `npx expo export --platform web` completa sem erro
**And** `npm run web` sobe o app e o login autentica de ponta a ponta com a API local
**And** o MMKV opera via `localStorage` — tokens e cache do TanStack Query sobrevivem a reload (Tier 1)
**And** o `expo-sqlite` abre a base e roda as migrations em wa-sqlite/OPFS (Tier 2)
**And** a leitura de QR code funciona em `(driver)/scan.tsx` via webcam
**And** nenhuma alteração é feita em código de aplicação — apenas configuração
**And** o README documenta o comando e as limitações do alvo web (Architecture §3)

**Camada:** Infraestrutura · **Depende de:** 1.5 · **FRs:** habilitador · **Desbloqueia:** 3.3b, 3.4b, 3.5b, 3.6

---

### Story 1.7: Development Build Android para Validação Nativa

Como desenvolvedor,
Quero um development build Android instalável,
Para que os recursos nativos e os NFRs de device possam ser validados de fato.

**Acceptance Criteria:**

**Given** o alvo web cobre lógica e telas, mas não recursos nativos
**When** configuro o development build
**Then** `expo-dev-client` está instalado e `mobile/eas.json` define o profile `development`
**And** `eas build -p android --profile development` produz um APK instalável
**And** o APK roda em emulador Android no Windows, conectado ao dev server via `adb reverse`
**And** o MMKV opera nativamente (mmap) e o `expo-sqlite` usa SQLite nativo
**And** a leitura de QR funciona pela câmera do device/emulador (virtual scene)
**And** NFR5 é medido: boot operacional em menos de 3s
**And** o README documenta o fluxo de build e instalação
**And** nenhuma conta Apple Developer nem hardware macOS é necessário

**Camada:** Infraestrutura · **Depende de:** Épico 5 concluído · **FRs:** habilitador ·
**Desbloqueia:** NFR5, NFR18-NFR20 · **Momento:** validação final, antes da defesa

> **Revisão de 28/08/2026:** demovida de bloqueio para validação final. Push saiu do MVP,
> o GPS usa a Geolocation API no alvo web e o Tier 2 foi verificado em wa-sqlite/OPFS na
> Story 1.6 — nenhuma story de feature depende mais do build nativo. Restam NFR5 e
> NFR18-NFR20. **Bloqueia a defesa, não o desenvolvimento.**

---

### Story 1.8: Shell de Navegação e Remoção do Template Expo

Como desenvolvedor,
Quero que o app monte um navegador funcional e roteie por papel de usuário,
Para que as telas do produto sejam alcançáveis e as stories mobile possam ser verificadas.

**Acceptance Criteria:**

**Given** `mobile/src/app/_layout.tsx` sem `<Slot />`, `<Stack />` nem `<Tabs />` — nenhuma tela alcançável em nenhum estado de autenticação (verificado em Chromium na Story 1.6)
**When** implemento o shell de navegação
**Then** o layout raiz renderiza saída de router e as rotas `(auth)`, `(driver)`, `(student)` e `(admin)` são alcançáveis pela barra de endereços no alvo web
**And** o usuário autenticado é roteado para o grupo correspondente ao seu `role`, tanto no login novo quanto na reabertura com sessão hidratada do MMKV
**And** o usuário não autenticado é roteado para `(auth)/login` sem tela em branco
**And** `enableMocking()` torna-se idempotente por guarda ancorada em `globalThis` (promise de boot memoizada) — uma guarda de módulo NÃO resolve, porque o Fast Refresh reavalia o módulo e zera a flag (diagnóstico registrado no `deferred-work.md`). **Correção de 28/08/2026:** a versão anterior deste texto prescrevia `server.listening` como âncora; essa propriedade NÃO existe em `msw@2.15` (`grep -c listening` nos builds `node` e `native` devolve 0)
**And** o cluster de template do Expo é removido: `app/index.tsx`, `app/explore.tsx`, `components/animated-icon*`, `components/app-tabs*`, `components/themed-text`, `components/themed-view`, `components/ui/collapsible`, `components/hint-row`, `components/web-badge`, `components/external-link` e os assets órfãos — ~910 linhas sem nenhum importador de produto
**And** `npx expo export --platform web` continua completando sem erro
**And** a AC #5 da Story 3.2b (fluxo de 1 toque até o QR, NFR19) passa a ser demonstrável
**And** as ACs #4, #5 e #7 da Story 1.6, fechadas como diferidas, são verificadas e fechadas

**Camada:** Infraestrutura · **Depende de:** 1.6 · **FRs:** habilitador · **Desbloqueia:** 3.3b, 3.4b, 3.5b, 3.6 e toda story mobile subsequente

> **Criada em 28/08/2026** (`sprint-change-proposal-2026-08-28`, aprovado), extraída da
> Story 3.6. Estava sequenciada **depois** das três stories que bloqueia.

---

### Story 1.9: Corrigir o Seed do Banco sob Prisma 7

Como desenvolvedor,
Quero um comando de seed que funcione,
Para que qualquer story que dependa de dados semeados tenha ambiente reproduzível.

**Acceptance Criteria:**

**Given** o seed quebrado em três camadas (achado do code review da Story 1.6)
**When** corrijo o fluxo de seed
**Then** existe um comando documentado e funcional para semear o banco
**And** `prisma/seed.ts` instancia o `PrismaClient` com o `adapter` exigido pelo Prisma 7
**And** a configuração de seed vive onde o Prisma 7 a espera (`prisma.config.ts`), não como hook órfão em `package.json`
**And** o README documenta o comando correto — hoje as stories prescrevem `npm run seed`, que não existe
**And** rodar o seed duas vezes não quebra nem duplica dados

**Camada:** Infraestrutura · **Depende de:** — · **FRs:** habilitador · **Desbloqueia:** qualquer story que dependa de dados semeados · **Momento:** antes do Épico 4

> **Renumerada de 1.8 para 1.9 em 28/08/2026** para liberar o número 1.8 ao shell de
> navegação, que executa antes. Conteúdo e posição na sequência inalterados.

---

## Epic 2: Identidade, Acesso e Organização

Empresa cadastrada, motoristas e alunos criados com suas credenciais, rotas configuradas com vínculos — todos podem fazer login e ver suas rotas. O sistema está pronto para operação.

### Story 2.1: Cadastro de Empresa e Seed Inicial

Como administrador de empresa de transporte,
Quero cadastrar minha organização na plataforma,
Para que eu possa gerenciar motoristas, alunos e rotas.

**Acceptance Criteria:**

**Given** a API está rodando
**When** envio POST `/api/v1/auth/register` com dados da empresa
**Then** a empresa é criada com `id`, `name`, `createdAt`, `updatedAt`
**And** um usuário admin é criado vinculado à empresa com role `admin`
**And** a resposta retorna tokens JWT (access + refresh) com `companyId` no payload
**And** requisições sem dados obrigatórios retornam 400 com erro tipado

### Story 2.2: Autenticação (Login e Refresh Token)

Como usuário (admin, motorista ou aluno),
Quero fazer login e manter minha sessão ativa,
Para que eu acesse o sistema de forma segura.

**Acceptance Criteria:**

**Given** um usuário cadastrado
**When** envio POST `/api/v1/auth/login` com credenciais válidas
**Then** recebo access token (15min) e refresh token (7 dias)
**And** o JWT contém `userId`, `companyId`, `role`
**Given** access token expirado
**When** envio POST `/api/v1/auth/refresh` com refresh token válido
**Then** recebo novos tokens
**And** credenciais inválidas retornam 401 com erro `INVALID_CREDENTIALS`
**And** a tela de login no mobile (`(auth)/login.tsx`) permite login com email/senha
**And** tokens são persistidos via MMKV no mobile
**And** `authStore` (Zustand) gerencia estado de autenticação

### Story 2.3: Cadastro e Gestão de Motoristas

Como administrador da empresa,
Quero cadastrar e gerenciar motoristas vinculados à minha organização,
Para que eles possam operar as rotas de transporte.

**Acceptance Criteria:**

**Given** admin autenticado
**When** envio POST `/api/v1/drivers` com dados do motorista
**Then** o motorista é criado com `companyId` do admin (multi-tenancy automático)
**And** posso listar motoristas via GET `/api/v1/drivers` (filtrado por tenant)
**And** posso editar motorista via PATCH `/api/v1/drivers/:id`
**And** posso desativar motorista via DELETE `/api/v1/drivers/:id`
**And** motorista de outra empresa não é visível (TenantGuard)
**And** apenas role `admin` pode acessar esses endpoints (RolesGuard)

### Story 2.4: Cadastro e Gestão de Alunos

Como administrador da empresa,
Quero cadastrar e gerenciar alunos com permissão de embarque,
Para que eles possam utilizar o transporte digital.

**Acceptance Criteria:**

**Given** admin autenticado
**When** envio POST `/api/v1/students` com dados do aluno
**Then** o aluno é criado com `companyId` e `isActive = true`
**And** posso listar alunos via GET `/api/v1/students` (filtrado por tenant)
**And** posso editar aluno via PATCH `/api/v1/students/:id`
**And** posso desativar permissão de embarque via PATCH (campo `isActive`)
**And** apenas role `admin` pode acessar esses endpoints
**And** alunos inativos não podem fazer check-in (FR6)

### Story 2.5: CRUD de Rotas de Transporte

Como administrador da empresa,
Quero criar e gerenciar rotas de transporte,
Para que motoristas e alunos sejam organizados por rota.

**Acceptance Criteria:**

**Given** admin autenticado
**When** envio POST `/api/v1/routes` com dados da rota
**Then** a rota é criada com nome, descrição, cidade de origem e destino
**And** posso listar rotas via GET `/api/v1/routes`
**And** posso editar rota via PATCH `/api/v1/routes/:id`
**And** posso deletar rota via DELETE `/api/v1/routes/:id`
**And** todas as operações filtradas por `companyId`

### Story 2.6: Vínculos Aluno-Rota e Motorista-Rota

Como administrador da empresa,
Quero vincular alunos e motoristas a rotas específicas,
Para que o sistema saiba quem pode embarcar em qual rota e qual motorista opera cada rota.

**Acceptance Criteria:**

**Given** alunos, motoristas e rotas cadastrados
**When** envio POST `/api/v1/routes/:id/students`
**Then** o aluno é vinculado à rota
**And** posso vincular motorista via POST `/api/v1/routes/:id/drivers`
**And** posso remover vínculos
**And** posso listar alunos de uma rota e rotas de um aluno
**Given** motorista autenticado
**When** acessa GET `/api/v1/routes/mine`
**Then** vê apenas as rotas atribuídas a ele (FR10)
**And** a tela mobile do motorista exibe suas rotas atribuídas

---

## Convenção de Fatiamento (Épicos 3, 4 e 5)

A partir do Épico 3, as stories são fatiadas **por trilha de execução**, não como fatias verticais full-stack. A decisão está registrada no `sprint-change-proposal-2026-07-12.md` (aprovado em 12/07/2026). O objetivo é habilitar os dois desenvolvedores a trabalharem em paralelo dentro do mesmo épico, usando o contrato OpenAPI como ponto de sincronização.

| Sufixo | Significado | Dono típico |
|---|---|---|
| `X.0` | Story de contrato — DTOs, controllers stub, decorators Swagger, `openapi.json`, tipos gerados + handlers MSW no mobile. Zero lógica. | Dev 1 (revisada pelo Dev 2) |
| `X.Ya` | Story de **backend** — functional core (Effect) + shell (NestJS) + adapters + testes de domínio | Dev 1 |
| `X.Yb` | Story de **mobile** — telas, stores, services, offline. Desenvolve contra handlers MSW. | Dev 2 |
| `X.N` | Story de **integração** — mocks desligados, API real ligada, E2E do épico | Ambos |

Stories sem contraparte na outra camada mantêm apenas o sufixo da camada que existe (ex.: o QR code é gerado localmente no dispositivo, então a Story 3.2b não tem par backend).

**Regras que valem para todas as stories destes épicos:**

- A story `X.0` é **bloqueante** para as duas trilhas do épico.
- Nenhum endpoint aparece numa story `X.Ya` sem estar declarado no contrato da story `X.0`.
- Tipos de API no mobile são **gerados** a partir de `api/openapi.json` — nunca escritos à mão.
- A story `X.N` é o marco demonstrável do épico: antes dela, o épico não está entregue.

> **Exceção:** a Story 3.1 foi implementada full-stack antes desta mudança e **não é refatiada**. Ela permanece como está, em `review`.

> **Revisão de 28/08/2026 (`sprint-change-proposal-2026-08-28`, aprovado):** esta convenção
> vale integralmente para o **Épico 3**, que executa até o fim sob ela. A partir do **Épico 4**
> o projeto voltou ao **fatiamento vertical**, porque o segundo desenvolvedor não se
> materializou e o paralelismo — único motivo da convenção — deixou de existir.
>
> | Sufixo | Épico 3 | Épicos 4 e 5 |
> |---|---|---|
> | `X.0` | contrato + tipos + handlers MSW | contrato + tipos, **sem MSW** |
> | `X.Ya` / `X.Yb` | duas trilhas paralelas | **não se aplica** |
> | `X.n` | — | fatia vertical por FR (core + shell + tela) |
> | `X.N` | integração: desligar mocks + E2E | **E2E apenas** |
>
> **Guarda-corpo:** fatia vertical acima de ~8 ACs ou ~15 arquivos é dividida por camada,
> em sequência (backend, depois mobile contra a API local), dentro do mesmo épico — nunca
> voltando à camada de mock.

---

## Epic 3: Gestão de Viagens e Embarque Digital

Motorista inicia viagem, alunos fazem check-in via QR code, motorista vê lista de embarque atualizada com contagem — o fluxo principal do produto funciona end-to-end.

**Composição:** 1 story entregue (3.1, full-stack) + 8 stories (1 contrato, 2 backend, 4 mobile, 1 integração).

### Story 3.0: Contrato de API — Embarque Digital

Como desenvolvedor,
Quero o contrato da API de embarque acordado e versionado antes de qualquer implementação,
Para que as trilhas de backend e mobile trabalhem em paralelo sem divergir.

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

**Camada:** Contrato · **Depende de:** — · **FRs:** habilitador (nenhum diretamente)

### Story 3.1: Iniciar e Encerrar Viagem (Backend + Mobile Motorista)

> **Status: implementada** (commit `36c7409`), em `review`. Entregue no modelo full-stack anterior — **não é refatiada**. Mantida aqui na íntegra para preservar a rastreabilidade.

Como motorista,
Quero iniciar e encerrar viagens para minhas rotas,
Para que o sistema saiba quando o transporte está ativo.

**Acceptance Criteria:**

**Given** motorista autenticado com rota atribuída
**When** toca "Iniciar Viagem" no app
**Then** POST `/api/v1/trips` cria viagem com `status = ACTIVE`, `type = OUTBOUND`, `startedAt = now`
**And** a tela `(driver)/trip.tsx` exibe viagem ativa com status e contagem de alunos
**Given** viagem ativa
**When** motorista toca "Encerrar Viagem"
**Then** viagem atualiza para `status = COMPLETED`, `endedAt = now`
**And** motorista pode iniciar viagem de retorno (`type = RETURN`) para a mesma rota
**And** domain event `trip.started` e `trip.ended` são emitidos via `WithEvents`
**And** apenas role `driver` pode iniciar/encerrar viagens
**And** registro de horários de início e fim é persistido (FR14)

**Camada:** Full-stack (legado) · **Depende de:** — · **FRs:** FR11, FR12, FR13, FR14

### Story 3.2b: Geração e Exibição de QR Code do Aluno (Mobile Aluno)

Como aluno,
Quero ver meu QR code exclusivo no app,
Para que eu possa fazer check-in no embarque.

**Acceptance Criteria:**

**Given** aluno autenticado
**When** acessa tela `(student)/qr-code.tsx`
**Then** QR code é exibido contendo o payload definido no schema compartilhado da Story 3.0 (`studentId`, `sessionId`)
**And** QR code é estático por sessão de login (NFR8)
**And** QR code é gerado localmente no dispositivo, sem chamada à API
**And** tela exibe nome do aluno e rota vinculada
**And** fluxo requer no máximo 2 toques para exibir o QR code (NFR19)
**And** o payload é validado contra o tipo gerado de `api.d.ts` — não há schema escrito à mão

> **Nota:** não existe contraparte backend (`3.2a`) porque o QR é gerado no cliente. A validação do payload acontece na Story 3.3a, no check-in.

**Camada:** Mobile · **Depende de:** 3.0 · **FRs:** FR15, FR17 · **NFRs:** NFR8, NFR19

### Story 3.3a: Check-in de Embarque (Backend)

Como sistema,
Quero registrar o embarque de um aluno validando permissão e viagem ativa,
Para que o motorista tenha controle digital de quem entrou no ônibus.

**Acceptance Criteria:**

**Given** viagem ativa e aluno com permissão
**When** `POST /api/v1/boarding/check-in` recebe `studentId`, `tripId` e `X-Idempotency-Key`
**Then** o check-in é persistido com timestamp e identificação do aluno (FR19)
**And** o use case valida que o aluno está ativo e vinculado à rota da viagem (FR18)
**And** QR inválido, aluno sem permissão ou viagem encerrada retornam tagged errors → HTTP com `{ error: { code, message } }` usando os códigos declarados em 3.0 (FR20)
**And** requisição repetida com a mesma `X-Idempotency-Key` retorna o resultado anterior sem duplicar o check-in (Architecture §5 — pré-requisito da fila offline)
**And** domain event `boarding.checked_in` é emitido via `WithEvents`
**And** o processamento ocorre em menos de 2 segundos (NFR1)
**And** os use cases do core são testados sem infraestrutura (< 100ms por suite)

**Camada:** Backend · **Depende de:** 3.0 · **FRs:** FR18, FR19, FR20 · **NFRs:** NFR1, NFR16

### Story 3.3b: Escaneamento de QR Code (Mobile Motorista)

Como motorista,
Quero escanear o QR code dos alunos para registrar embarque,
Para que eu tenha controle digital de quem entrou no ônibus.

**Acceptance Criteria:**

**Given** viagem ativa
**When** motorista abre `(driver)/scan.tsx`
**Then** a câmera (`expo-camera`) abre rapidamente com área de escaneamento clara
**And** ao ler um QR válido, o app chama `POST /api/v1/boarding/check-in` **contra o handler MSW** e exibe feedback visual de sucesso
**And** cada código de erro do contrato (`INVALID_QR_CODE`, `STUDENT_NOT_ALLOWED`, `TRIP_NOT_ACTIVE`, `DUPLICATE_CHECK_IN`) tem um feedback visual distinto e legível em movimento
**And** o retorno visual acontece em menos de 2 segundos na percepção do usuário (NFR1)
**And** a tela é operável com uma mão, com botões grandes e contraste alto (NFR18)
**And** a story fecha sem que a Story 3.3a esteja pronta — a validação real é exercida na Story 3.6

**Camada:** Mobile · **Depende de:** 3.0 · **FRs:** FR16 · **NFRs:** NFR1, NFR18

### Story 3.4b: Check-in Offline com Fila de Sincronização (Mobile Motorista)

Como motorista,
Quero registrar check-ins mesmo sem internet,
Para que trechos sem sinal não impeçam o embarque digital.

**Acceptance Criteria:**

**Given** motorista sem conexão de internet
**When** escaneia um QR code
**Then** o check-in é enfileirado em `expo-sqlite` conforme Architecture §5 Tier 2 — FIFO por `created_at`, limite de 500 itens
**And** a interface exibe "Modo Offline — dados serão sincronizados" (NFR13)
**And** quando a conexão retorna, a fila é drenada automaticamente com backoff de 1s a 30s e no máximo 5 tentativas por item
**And** cada requisição envia o header `X-Idempotency-Key` — a contraparte servidor já existe desde a Story 3.3a, então reenvios não duplicam check-ins (NFR12)
**And** os dados persistem mesmo com crash do app (NFR11)
**And** a falha da API não impede escanear e enfileirar novos check-ins (NFR14)

> **Nota:** esta story deixou de ter parte backend. A idempotência foi puxada para a Story 3.3a, onde pertence conceitualmente — é uma propriedade do endpoint, não do offline.

**Camada:** Mobile · **Depende de:** 3.3b, 1.8 · **FRs:** FR21 · **NFRs:** NFR11, NFR12, NFR13, NFR14

> **Revisão de 28/08/2026:** a interface da fila foi enxugada para banner global
> ("Modo Offline — dados serão sincronizados", NFR13). O badge por item saiu e o limite de
> 500 permanece como regra da fila, sem representação na interface. O mecanismo da fila, a
> idempotência e a persistência a crash (NFR11, NFR12, NFR14) são preservados integralmente
> — é o que demonstra o Tier 2 da Architecture §5.

### Story 3.5a: Lista de Alunos da Viagem com Status (Backend)

Como sistema,
Quero expor a lista de alunos da viagem com o status de embarque agregado,
Para que o app do motorista saiba quem entrou e quem falta.

**Acceptance Criteria:**

**Given** uma viagem ativa
**When** `GET /api/v1/trips/:id/students` é chamado por um motorista da rota
**Then** a resposta lista todos os alunos vinculados à rota da viagem (FR22)
**And** cada aluno traz seu status agregado: `CHECKED_IN`, `NOT_CHECKED_IN` ou `NOT_RETURNING` (FR23)
**And** a resposta inclui a contagem resumida (`{ boarded, total }`) — não é calculada no cliente (FR25)
**And** a query responde em menos de 1 segundo com 50+ alunos na rota (NFR4)
**And** a lista é filtrada por `companyId` e só é acessível ao motorista atribuído à rota
**And** o use case do core é testado sem infraestrutura (< 100ms por suite)

**Camada:** Backend · **Depende de:** 3.3a · **FRs:** FR22, FR23, FR25 · **NFRs:** NFR4, NFR17

### Story 3.5b: Lista de Alunos e Status de Embarque (Mobile Motorista)

Como motorista,
Quero ver a lista completa dos alunos da viagem com status de embarque,
Para que eu saiba quem entrou e quem falta.

**Acceptance Criteria:**

**Given** viagem ativa
**When** motorista acessa `(driver)/student-list.tsx`
**Then** a lista exibe todos os alunos com os status do contrato (`embarcou`, `não embarcou`, `não vai voltar`)
**And** a contagem resumida aparece no topo (ex.: "28/32 embarcados") (FR25)
**And** a lista é cacheada offline via TanStack Query `persistQueryClient` (Architecture §5, Tier 1) e continua legível sem rede (FR24)
**And** um check-in feito na tela de scan reflete na lista sem recarregar a tela
**And** a interface é otimizada para uma mão — botões grandes, contraste alto (NFR18)
**And** a story é desenvolvida contra os handlers MSW da Story 3.0

**Camada:** Mobile · **Depende de:** 3.0 · **FRs:** FR22, FR24, FR25 · **NFRs:** NFR18

### Story 3.6: Integração e E2E do Épico 3

Como desenvolvedor,
Quero substituir os mocks pela API real e provar o fluxo end-to-end,
Para que o épico seja considerado entregue de fato, não apenas nas duas metades.

**Acceptance Criteria:**

**Given** as trilhas API e Mobile do Épico 3 concluídas
**When** desligo os handlers MSW e aponto o `api-client.ts` para a API real
**Then** o fluxo completo funciona: motorista inicia viagem → aluno exibe QR → motorista escaneia → check-in registrado → lista atualiza com a contagem
**And** o `openapi.json` commitado não diverge do gerado a partir do código (drift check)
**And** teste E2E cobre o caminho feliz e a rejeição de QR inválido
**And** teste E2E cobre o cenário offline: check-in sem rede → reconexão → sincronização sem duplicata
**And** os tempos de resposta de NFR1 (< 2s no check-in) e NFR4 (< 1s na lista) são verificados contra a API real

**Camada:** Integração · **Depende de:** 1.8, 3.2b, 3.3a, 3.3b, 3.4b, 3.5a, 3.5b · **FRs:** valida FR11–FR25

> **Revisão de 28/08/2026:** o shell de navegação e a idempotência do `enableMocking()`,
> antes escopados para esta story, migraram para a **Story 1.8**. A 3.6 passa a ser
> exclusivamente a integração e o E2E do épico.

### Rastreabilidade FR → Story (Épico 3)

| FR | Story |
|---|---|
| FR11, FR12, FR13, FR14 | 3.1 (entregue) |
| FR15, FR17 | 3.2b |
| FR16 | 3.3b |
| FR18, FR19, FR20 | 3.3a |
| FR21 | 3.4b |
| FR22, FR25 | 3.5a + 3.5b |
| FR23 | 3.5a (agregação) + 3.5b (exibição) |
| FR24 | 3.5b |

**Cobertura do épico: 15/15 FRs (FR11–FR25).**

---

## Epic 4: Notificação de Ausência e Comunicação

Aluno pode avisar "não vou voltar" com um toque, motorista recebe instantaneamente, sistema envia lembrete automático — o maior problema (espera indevida) é eliminado. Motorista pode enviar avisos gerais.

**Composição:** 6 stories (1 contrato, 4 fatias verticais, 1 E2E) — revisão de 28/08/2026.

### Story 4.0: Contrato de API — Ausência e Comunicação

Como desenvolvedor,
Quero o contrato de ausência e comunicação acordado e versionado antes da implementação,
Para que as trilhas de backend e mobile trabalhem em paralelo sem divergir.

**Acceptance Criteria:**

**Given** os endpoints de ausência e comunicação ainda não existem
**When** defino o contrato
**Then** `POST /api/v1/boarding/not-returning` está declarado com DTO de entrada (`tripId`), DTO de resposta (incluindo `notifiedAt` e `cancellableUntil`) e decorators Swagger completos
**And** `POST /api/v1/boarding/cancel-absence` está declarado
**And** `GET /api/v1/boarding/events` está declarado como stream SSE
**And** o **formato dos eventos SSE** está declarado como schema compartilhado: `boarding.not_returning`, `boarding.absence_cancelled`, `boarding.checkin_reminder` — o schema de cada evento é contrato tanto quanto os endpoints REST
**And** os códigos de erro tipados estão declarados (`CANCELLATION_PERIOD_EXPIRED`, `ALREADY_NOT_RETURNING`, `STUDENT_NOT_ON_TRIP`, `TRIP_NOT_ACTIVE`)
**And** o header `X-Idempotency-Key` está documentado nos endpoints de escrita
**And** `npm run openapi:export` regenera `api/openapi.json` com os novos endpoints e o arquivo está commitado
**And** o mobile regenera `src/types/api.d.ts` a partir do contrato
**And** os controllers retornam `501 Not Implemented`
**And** **nenhum handler MSW é criado** — a partir deste épico as fatias são desenvolvidas contra a API local (Architecture §10)

**Camada:** Contrato · **Depende de:** Épico 3 concluído · **FRs:** habilitador

### Story 4.1: Registro de Ausência "Não Vou Voltar" (Fatia Vertical)

Como aluno,
Quero avisar com um toque que não retornarei no ônibus,
Para que o motorista não precise esperar por mim.

**Acceptance Criteria:**

**Backend**

**Given** um aluno que fez check-in na viagem de ida
**When** `POST /api/v1/boarding/not-returning` é chamado com `tripId`
**Then** a ausência é persistida com `notifiedAt` e o status do aluno na viagem passa a `NOT_RETURNING` (FR26)
**And** o use case valida que o aluno pertence à rota da viagem — caso contrário retorna `STUDENT_NOT_ON_TRIP`
**And** notificar duas vezes retorna `ALREADY_NOT_RETURNING` sem duplicar o registro
**And** domain event `boarding.not_returning` é emitido via `WithEvents`
**And** a resposta inclui `cancellableUntil` (`notifiedAt` + 2 minutos) — o cliente não calcula essa janela
**And** o use case do core é testado sem infraestrutura (< 100ms por suite)

**Mobile (Aluno)**

**And** o botão "Não vou voltar" é proeminente em `(student)/home.tsx`
**And** o fluxo completo exige no máximo 2 toques, incluindo a confirmação (NFR19)
**And** após confirmar, a tela mostra "Ausência registrada" com o countdown alimentado por `cancellableUntil`
**And** os erros do contrato (`ALREADY_NOT_RETURNING`, `STUDENT_NOT_ON_TRIP`, `TRIP_NOT_ACTIVE`) têm mensagens claras ao aluno
**And** a tela é desenvolvida contra a **API local**, não contra mocks

**Camada:** Fatia vertical · **Depende de:** 4.0 · **FRs:** FR26 · **NFRs:** NFR19

---

### Story 4.2: Canal SSE de Embarque e Recebimento em Tempo Real (Fatia Vertical)

Como motorista,
Quero ser notificado instantaneamente quando um aluno informa que não retornará,
Para que eu possa partir sem espera desnecessária.

**Acceptance Criteria:**

**Backend**

**Given** um motorista autenticado com viagem ativa
**When** abre `GET /api/v1/boarding/events`
**Then** o controller faz subscribe no canal Redis Pub/Sub da viagem e faz streaming dos eventos declarados na Story 4.0 (FR27)
**And** cada evento entregue segue exatamente o schema do contrato
**And** a entrega ao motorista acontece em menos de 3 segundos após o registro da ausência (NFR3)
**And** apenas o motorista atribuído à rota consegue abrir o stream daquela viagem
**And** a conexão SSE é encerrada elegantemente quando a viagem termina
**And** múltiplos clientes na mesma viagem compartilham o mesmo subscribe

**Mobile (Motorista)**

**And** com `(driver)/student-list.tsx` aberta, um evento `boarding.not_returning` muda o status do aluno para `NÃO VAI VOLTAR` com destaque visual (FR28)
**And** a contagem resumida se ajusta automaticamente (ex.: "28/32" → "28/31")
**And** um toast contextual anuncia a ausência sem bloquear a tela
**And** um evento `boarding.absence_cancelled` reverte o status e a contagem
**And** a reconexão do EventSource é automática após queda de rede, sem duplicar entradas na lista

**Camada:** Fatia vertical · **Depende de:** 4.1, 3.5b · **FRs:** FR27, FR28 · **NFRs:** NFR3, NFR18

---

### Story 4.3: Cancelamento de Ausência (Fatia Vertical)

Como aluno,
Quero poder cancelar minha notificação de ausência dentro de um período seguro,
Para que eu possa mudar de ideia caso tenha apertado por engano.

**Acceptance Criteria:**

**Backend**

**Given** uma ausência registrada há menos de 2 minutos
**When** `POST /api/v1/boarding/cancel-absence` é chamado
**Then** a ausência é revertida e o status do aluno volta ao anterior (FR29)
**And** fora da janela, o endpoint retorna `CANCELLATION_PERIOD_EXPIRED`
**And** a decisão da janela é do **servidor** — o cliente apenas exibe o countdown
**And** domain event `boarding.absence_cancelled` é emitido via `WithEvents`
**And** o use case do core é testado sem infraestrutura, com relógio injetado

**Mobile (Aluno)**

**And** um botão "Cancelar" é exibido com countdown regressivo alimentado por `cancellableUntil`
**And** ao tocar "Cancelar" dentro da janela, o estado volta a "Retorno confirmado"
**And** quando a janela expira, o botão desaparece e a ausência é apresentada como consolidada
**And** o erro `CANCELLATION_PERIOD_EXPIRED` (corrida entre o toque e a expiração) é tratado com mensagem clara, sem travar a tela

**Camada:** Fatia vertical · **Depende de:** 4.1 · **FRs:** FR29 · **NFRs:** NFR19

---

### Story 4.4: Lembrete Automático de Check-in Pendente (Fatia Vertical)

Como aluno que embarcou na ida mas não fez check-in na volta,
Quero ser lembrado de confirmar se vou retornar,
Para que o motorista não espere sem necessidade — a jornada da Ana.

**Acceptance Criteria:**

**Backend**

**Given** um aluno que fez check-in na ida e uma viagem de retorno ativa na mesma rota
**When** passam 15 minutos do início da viagem de retorno sem check-in nem ausência registrada
**Then** o scheduler emite o evento `boarding.checkin_reminder` no stream da Story 4.2, com `tripId` e `studentId` (FR30)
**And** o lembrete é emitido no máximo uma vez por aluno por viagem
**And** alunos que já notificaram ausência ou já fizeram check-in de retorno não recebem lembrete
**And** o período (15 min) é configuração do core, testável com relógio injetado
**And** o disparo do scheduler é lógica do shell; a decisão de "quem deve ser lembrado" é um use case do core, testado sem infraestrutura
**And** o estado "lembrete pendente" é derivável na abertura do app, para o aluno que não estava conectado ao stream

**Mobile (Aluno)**

**And** o lembrete aparece em `(student)/home.tsx` como aviso in-app com a ação "Não vou voltar"
**And** responder pelo aviso produz exatamente os mesmos efeitos do botão da Story 4.1 (mesma chamada, mesmo estado)
**And** o aluno que abre o app depois do disparo vê o lembrete pendente, sem depender de ter estado conectado
**And** a jornada da Ana (edge case do PRD) é coberta ponta a ponta

> **Revisão de 28/08/2026:** a entrega por **push notification** foi diferida para a Fase 2.
> O FR30 exige "lembrete automático", não prescreve o meio. O scheduler e o use case do core
> — a parte arquiteturalmente relevante — são preservados integralmente; sai o registro de
> push token e as notification actions.

**Camada:** Fatia vertical · **Depende de:** 4.2 · **FRs:** FR30 · **NFRs:** NFR19

---

### Story 4.5: E2E do Épico 4

Como desenvolvedor,
Quero provar os fluxos de ausência end-to-end contra a API real,
Para que o épico seja considerado entregue de fato.

**Acceptance Criteria:**

**Given** as fatias 4.1 a 4.4 concluídas
**When** rodo o app contra a API local
**Then** o fluxo completo funciona: aluno toca "não vou voltar" → motorista vê o status mudar e a contagem se ajustar em menos de 3 segundos (NFR3)
**And** o fluxo de cancelamento funciona dentro da janela e é corretamente rejeitado fora dela
**And** o lembrete automático dispara para um aluno que embarcou na ida e não fez check-in na volta, e a resposta pelo aviso in-app registra a ausência
**And** o `openapi.json` commitado não diverge do gerado a partir do código (drift check)
**And** teste E2E cobre: notificar ausência, cancelar dentro da janela, tentar cancelar fora da janela, receber lembrete
**And** a latência de NFR3 é medida contra a API real

> **Não há mocks a desligar** — as fatias verticais foram desenvolvidas contra a API local
> desde o início (Architecture §10).

**Camada:** E2E · **Depende de:** 4.1–4.4 · **FRs:** valida FR26–FR30

---

### Rastreabilidade FR → Story (Épico 4)

| FR | Story |
|---|---|
| FR26 | 4.1 |
| FR27, FR28 | 4.2 |
| FR29 | 4.3 |
| FR30 | 4.4 |
| ~~FR36, FR37~~ | **Diferidos para a Fase 2** (revisão de 28/08/2026) |

**Cobertura do épico: 5/5 FRs de MVP (FR26–FR30).**

---
## Epic 5: Localização em Tempo Real

Aluno vê o ônibus no mapa em tempo real, motorista transmite GPS automaticamente durante viagens — ansiedade de espera no ponto eliminada.

**Composição:** 4 stories (1 contrato, 2 fatias verticais, 1 E2E) — revisão de 28/08/2026.

### Story 5.0: Contrato de API — Localização em Tempo Real

Como desenvolvedor,
Quero o contrato de rastreamento acordado e versionado antes da implementação,
Para que as trilhas de backend e mobile trabalhem em paralelo sem divergir.

**Acceptance Criteria:**

**Given** os endpoints de rastreamento ainda não existem
**When** defino o contrato
**Then** `POST /api/v1/tracking/location` está declarado com DTO de entrada (`tripId`, `latitude`, `longitude`, `accuracy`, `capturedAt`) e decorators Swagger completos
**And** `GET /api/v1/tracking/trips/:id/stream` está declarado como stream SSE
**And** `GET /api/v1/tracking/trips/:id/location` está declarado para o **último ponto conhecido** — é o estado inicial da tela antes do primeiro evento SSE chegar, e o que fica visível quando o sinal cai (pré-requisito da Story 5.2)
**And** o formato do evento `location.updated` está declarado como schema compartilhado (coordenadas, `tripId`, `timestamp`)
**And** os códigos de erro tipados estão declarados (`TRIP_NOT_ACTIVE`, `NO_LOCATION_AVAILABLE`)
**And** `npm run openapi:export` regenera `api/openapi.json` e o arquivo está commitado
**And** o mobile regenera `src/types/api.d.ts` a partir do contrato
**And** os controllers retornam `501 Not Implemented`
**And** **nenhum handler MSW é criado** — a Story 5.2 é desenvolvida contra o stream SSE da API local (Architecture §10)

**Camada:** Contrato · **Depende de:** Épico 4 concluído · **FRs:** habilitador

### Story 5.1: Ingestão e Transmissão de GPS (Fatia Vertical)

Como motorista,
Quero que minha localização seja transmitida automaticamente durante as viagens,
Para que os alunos possam me acompanhar sem que eu precise fazer nada.

**Acceptance Criteria:**

**Backend**

**Given** uma viagem ativa
**When** `POST /api/v1/tracking/location` recebe as coordenadas do motorista
**Then** a posição é armazenada no Redis com TTL curto, sobrescrevendo a anterior (FR35)
**And** o Redis Pub/Sub publica `location.updated` com coordenadas, `tripId` e `timestamp`
**And** coordenadas enviadas para uma viagem não ativa são rejeitadas com `TRIP_NOT_ACTIVE`
**And** `GET /api/v1/tracking/trips/:id/location` retorna o último ponto conhecido ou `NO_LOCATION_AVAILABLE`
**And** posições **não são persistidas no PostgreSQL** — o histórico de trajeto está fora do escopo do MVP
**And** apenas o motorista atribuído à viagem pode enviar coordenadas
**And** a lógica de ingestão é testada sem infraestrutura real (Redis via port do core)

**Mobile (Motorista)**

**And** quando a viagem passa a `ACTIVE`, o app captura GPS via `expo-location` e envia a posição a cada 5 segundos (FR31)
**And** a permissão de localização é solicitada com justificativa clara antes da primeira viagem
**And** ao encerrar a viagem, a captura de GPS **para automaticamente** (FR33)
**And** o GPS não é coletado em nenhum momento fora de uma viagem ativa (NFR10) — o start/stop é amarrado ao ciclo de vida da viagem, nunca a um toque manual
**And** perda temporária de rede não derruba a captura: as posições são descartadas (posição velha não tem valor) e o envio retoma sozinho
**And** no alvo web o `expo-location` opera pela Geolocation API do browser

**Camada:** Fatia vertical · **Depende de:** 5.0 · **FRs:** FR31, FR33, FR35 · **NFRs:** NFR10

---

### Story 5.2: Acompanhamento do Ônibus em Tempo Real (Fatia Vertical)

Como aluno,
Quero saber onde o ônibus está e em quanto tempo ele chega ao meu ponto,
Para que eu não precise esperar sem informação.

**Acceptance Criteria:**

**Backend**

**Given** um aluno vinculado à rota de uma viagem ativa
**When** abre `GET /api/v1/tracking/trips/:id/stream`
**Then** o `tracking-sse.controller.ts` faz subscribe no canal Redis Pub/Sub daquela viagem e faz streaming dos eventos `location.updated` (FR35)
**And** o evento entregue segue exatamente o schema declarado na Story 5.0
**And** a latência entre o `POST` do motorista e a entrega ao aluno é menor que 5 segundos (NFR2)
**And** apenas alunos vinculados à rota conseguem abrir o stream daquela viagem (FR6)
**And** a conexão SSE é encerrada elegantemente quando a viagem termina
**And** múltiplos alunos assistindo à mesma viagem compartilham o mesmo subscribe

**Mobile (Aluno)**

**And** `(student)/track-bus.tsx` carrega o último ponto conhecido (`GET /tracking/trips/:id/location`) e depois passa a atualizar via SSE (FR32)
**And** a tela apresenta **a última posição conhecida com a distância e o tempo estimado até o ponto do aluno** — não um mapa cartográfico
**And** as atualizações aparecem com latência máxima de 5 segundos na percepção do aluno (NFR2)
**And** quando nenhum evento `location.updated` chega por mais de 15 segundos, a tela mantém o último ponto conhecido com o indicador "Sem sinal GPS" (FR34, NFR13)
**And** quando os eventos voltam, o indicador some e a tela atualiza para a posição atual
**And** com a viagem encerrada, a mensagem "Nenhuma viagem ativa no momento" é exibida e a conexão SSE é encerrada elegantemente
**And** a reconexão do EventSource após queda de rede é automática, com backoff
**And** a tela é utilizável em dispositivo de 5" a 720p (NFR20)

> **Revisão de 28/08/2026:** o **mapa cartográfico e o marcador animado foram diferidos para
> a Fase 2**. A Jornada 1 do PRD descreve o valor como *"o ônibus está a 3 pontos de
> distância, chegando em ~8 minutos"* — proximidade e tempo, não cartografia. A substituição
> elimina a dependência de uma biblioteca de mapas com suporte web (Architecture §8, regra 14),
> nunca escolhida, e **preserva integralmente** o SSE + Redis Pub/Sub, que é o que o épico
> demonstra. A antiga Story 5.3b (comportamento degradado) foi incorporada aqui.

**Camada:** Fatia vertical · **Depende de:** 5.1 · **FRs:** FR32, FR34, FR35 · **NFRs:** NFR2, NFR13, NFR20

---

### Story 5.3: E2E do Épico 5

Como desenvolvedor,
Quero provar o rastreamento end-to-end contra a API real,
Para que o épico seja considerado entregue de fato.

**Acceptance Criteria:**

**Given** as fatias 5.1 e 5.2 concluídas
**When** rodo o app contra a API local
**Then** o fluxo completo funciona: motorista inicia viagem → GPS começa a transmitir → aluno abre a tela e vê a posição e o ETA se atualizando
**And** encerrar a viagem interrompe a transmissão de GPS e encerra o stream do aluno (FR33, NFR10)
**And** o `openapi.json` commitado não diverge do gerado a partir do código (drift check)
**And** teste E2E cobre o caminho feliz (posição atualizando) e o degradado (sem eventos por 15s → "Sem sinal GPS" → recuperação)
**And** a latência de NFR2 (< 5s) é medida contra a API real

**Camada:** E2E · **Depende de:** 5.1, 5.2 · **FRs:** valida FR31–FR35

---

### Rastreabilidade FR → Story (Épico 5)

| FR | Story |
|---|---|
| FR31, FR33 | 5.1 |
| FR32, FR34 | 5.2 |
| FR35 | 5.1 (Redis + Pub/Sub) + 5.2 (SSE) |

**Cobertura do épico: 5/5 FRs (FR31–FR35).**

---
## Epic 6: Redesign da Interface Mobile

O app funciona, mas parece amador: cada tela inventa o próprio estilo, emojis viram caixas vazias,
o card da viagem mostra UUID e o motorista não lê o status de relance sob o sol. Este épico entrega
um design system e redesenha as telas da demo — **visual + microinterações, sem mudar fluxos** —
para que o app pareça produto diante da banca do TCC e cumpra de fato os NFR13 e NFR18–NFR20.

**Origem:** Fase 2 do PRD ("Polish de UX e tratamento de edge cases"). Especificação de UX
aprovada em 26/09/2026: `planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md` e
`EXPERIENCE.md` (decisões D-UX-1 a D-UX-13 registradas no fim do `EXPERIENCE.md`).

**Composição:** 14 stories — 3 de fundação, 7 de tela (P0), 1 de polimento (P1), 1 gate da demo
e 2 opcionais pós-marco (P2). **Prazo:** o marco (Story 6.12) fecha antes da defesa; 6.13 e 6.14
só entram se sobrar tempo.

**Regras que valem para todas as stories deste épico:**

- **Fluxos e navegação não mudam.** Únicas exceções aprovadas: "Sair" para motorista e aluno
  (D-UX-5, Story 6.3) e confirmação em "Encerrar viagem" (D-UX-7, Story 6.5). "Minhas rotas"
  continua sem entrada (D-UX-6 recusada).
- **Contrato de teste preservado:** todo texto visível, nome acessível, `id`/`testID` e
  `accessibilityRole` usados pelos testes Jest e Playwright permanecem idênticos. Se uma mudança
  de copy for inevitável (ex.: remover emoji), a story adiciona `testID` primeiro e atualiza Jest
  e e2e **no mesmo PR**.
- **Nenhum hex fora de `lib/palette.ts`**; telas consomem `theme.colors`/`theme.custom` via
  `useTheme<AppTheme>()` — nunca `lightPalette` direto. A guarda `palette.guard.test.ts` continua
  verde e é atualizada na mesma story que mudar token.
- **Dependências nativas só na Story 6.1** (uma única rebuild do dev build).
- **Evidência visual:** cada story de tela anexa capturas "antes/depois" dos estados listados no
  `EXPERIENCE.md`, no alvo web (390×844), com os mocks do app.
- Tema claro apenas (D-UX-4); o `darkTheme` não é consumido antes da Story 6.14.
- **Guarda-corpo:** story acima de ~8 ACs ou ~15 arquivos é dividida. Telas grandes (`scan.tsx`,
  `trip.tsx`) começam com um commit de extração de componentes **sem mudança de comportamento**,
  com a suíte verde, antes do restyle.

### Story 6.1: Tokens, Tema Paper e Dependências de Marca

Como desenvolvedor,
Quero uma fonte única de tokens e um tema Paper tipado,
Para que todas as telas do redesign consumam o mesmo vocabulário visual.

**Acceptance Criteria:**

**Given** o `DESIGN.md` aprovado
**When** implemento a fundação
**Then** `lib/tokens.ts` define escala tipográfica, spacing, radius, elevation e motion conforme o `DESIGN.md`
**And** `lib/theme.ts` exporta `AppTheme` (MD3 + `configureFonts` com Inter + `custom: { spacing, radius, motion }`) e o `useTheme<AppTheme>()` tipado
**And** os fundos divergentes (`#fffbfe`, `#f2f2f2`) somem: `background`/`surface` usam os papéis `surface-soft`/`canvas`, e o tema do React Navigation é alinhado
**And** o amarelo-escolar é adotado como papel de marca full-bleed (D-UX-1) e a guarda de paleta é atualizada
**And** `@expo-google-fonts/inter` e `expo-haptics` são instalados (D-UX-2, D-UX-3) e o dev build Android é regenerado uma única vez
**And** `app.json` passa a se chamar "PureUrban", com ícone e splash de marca (D-UX-11)
**And** o código morto do template (`Colors` em `constants/theme.ts`, `hooks/use-theme.ts` sem consumidores) é removido ou substituído
**And** nenhuma tela muda visualmente além do fundo e da fonte; suíte Jest e e2e verdes

**Camada:** Mobile · **Depende de:** — · **NFRs:** habilitador (NFR18)

### Story 6.2: Componentes Base de Estado e Ação

Como desenvolvedor,
Quero componentes compartilhados para os padrões que hoje são copiados entre telas,
Para que o redesign de cada tela seja composição, não reinvenção.

**Acceptance Criteria:**

**Given** a fundação da 6.1
**When** crio `components/ui/`
**Then** existem `Screen`, `PrimaryAction`, `StickyActionBar`, `StatusChip`, `StateView` (loading/empty/error/blocked), `Skeleton`, `Banner` e `ConfirmDialog`, com os estados definidos no `EXPERIENCE.md`
**And** alvos de toque ≥ 48dp (ações principais 56dp) e contraste AA nos textos de status
**And** as três cópias de `Loading` (`scan`, `student-list`, `track-bus`) e de `Centered`/`Blocked` são substituídas por `StateView`, **sem mudança de texto**
**And** `StatusChip` mapeia os estados do aluno como no código: embarcou = verde, não vai voltar = âmbar, aguardando = neutro (D-UX-12)
**And** cada componente tem teste de render (Jest) cobrindo seus estados
**And** ícones são desenhados (MaterialCommunityIcons do Paper), nunca emoji ou glifo de texto

**Camada:** Mobile · **Depende de:** 6.1 · **NFRs:** NFR18, NFR20

### Story 6.3: Cabeçalho Padrão e Saída da Conta

Como motorista ou aluno,
Quero um cabeçalho consistente com a opção de sair da conta,
Para que eu consiga trocar de usuário sem limpar os dados do app.

**Acceptance Criteria:**

**Given** qualquer tela dos grupos `(driver)` e `(student)`
**When** ela é exibida
**Then** o cabeçalho segue o `AppHeader` do `DESIGN.md` via `screenOptions` dos `_layout`, e os títulos H1 duplicados sob o header são removidos
**And** um menu de overflow oferece "Sair" (D-UX-5)
**And** ao sair, a sessão é encerrada por `useAuthStore().logout()` — o mesmo caminho do admin e do refresh rejeitado — e o app volta ao login
**And** como o logout purga a fila offline (D5/AC7 da spec-wrap-5), se houver check-ins pendentes um `ConfirmDialog` avisa que eles serão descartados antes de sair
**And** teste Jest cobre o logout e o aviso de fila pendente

**Camada:** Mobile · **Depende de:** 6.2 · **FRs:** exceção de fluxo aprovada (D-UX-5)

### Story 6.4: Redesign — Login

Como usuário,
Quero uma tela de entrada com identidade clara,
Para que o primeiro contato com o app transmita confiança.

**Acceptance Criteria:**

**Given** a especificação "Login — P0" do `EXPERIENCE.md`
**When** abro o app sem sessão
**Then** vejo o hero amarelo com ícone de ônibus, o wordmark "PureUrban" e a tagline
**And** o formulário tem e-mail, senha com botão de mostrar (48dp) e "Entrar" (56dp)
**And** o erro de validação aparece em `Banner` de erro inline, acima do botão
**And** com o teclado aberto, o formulário sobe e o hero encolhe
**And** os ids `#login-email`, `#login-password` e `#login-submit` e os textos usados pelos testes são preservados

**Camada:** Mobile · **Depende de:** 6.2 · **Prioridade:** P0

### Story 6.5: Redesign — Viagem do Motorista

Como motorista,
Quero ver o estado da viagem e a contagem de embarque de relance,
Para que eu opere com uma mão, em movimento, sem ler texto miúdo.

**Acceptance Criteria:**

**Given** a especificação "Motorista › Viagem — P0"
**When** abro a tela com viagem ativa
**Then** o `TripCard` mostra tipo de viagem, **nome da rota** (nunca UUID), `StatusChip` "Em andamento", `BoardingCounter` grande e "Iniciada às HH:MM"
**And** "Escanear QR" fica na `StickyActionBar` como ação primária; "Ver alunos da viagem" vira item de lista de 56dp
**And** "Encerrar viagem" sai do destaque (secundário, vermelho) e pede confirmação em `ConfirmDialog` (D-UX-7); o e2e do Playwright é atualizado para confirmar
**And** os estados "sem viagem", "ida concluída" e "turma vazia" usam `StateView`/`TripCard` conforme a especificação
**And** o primeiro commit extrai os blocos de `trip.tsx` em componentes sem mudança de comportamento, com a suíte verde
**And** o emoji de "✅ Concluída" é substituído por ícone, com o e2e `tracking-live` atualizado no mesmo PR

**Camada:** Mobile · **Depende de:** 6.2 · **Prioridade:** P0 · **NFRs:** NFR18, NFR19

### Story 6.6: Redesign — Escanear QR (Clímax da Demo)

Como motorista,
Quero feedback imediato e inconfundível a cada leitura,
Para que eu saiba sem olhar duas vezes se o aluno embarcou.

**Acceptance Criteria:**

**Given** a especificação "Motorista › Escanear — P0" e a Tabela de Verdade da Story 3.3b
**When** escaneio um QR
**Then** o `ScanResultOverlay` mostra o **nome do aluno**, ícone do tom, barra regressiva e dispara háptico de sucesso/aviso/erro (`expo-haptics`), mapeado a partir de `utils/scan-feedback.ts`
**And** o `ScanHud` mostra o contador da viagem "X/Y embarcados" a partir do roster em cache (D-UX-8) e o atalho "Ver lista" (48dp)
**And** o `ScanFrame` tem moldura com linha de varredura animada (Reanimated) e dica de enquadramento
**And** tons, códigos e regras de repetição da 3.3b ficam inalterados — só a apresentação muda
**And** estados bloqueados (sem viagem, sem permissão de câmera) usam `StateView`/`PermissionCard`
**And** o primeiro commit extrai overlay e estados bloqueados de `scan.tsx` sem mudança de comportamento
**And** o overlay âmbar atinge contraste com tipo grande (D-UX-9)

**Camada:** Mobile · **Depende de:** 6.2 · **Prioridade:** P0 · **NFRs:** NFR1, NFR18

### Story 6.7: Redesign — Alunos da Viagem

Como motorista,
Quero a lista de embarque legível e com totais claros,
Para que eu saiba quem falta sem contar linha a linha.

**Acceptance Criteria:**

**Given** a especificação "Motorista › Alunos da viagem — P0"
**When** abro a lista
**Then** um cabeçalho fixo mostra o `BoardingCounter` e a mini-legenda ("N embarcaram · N não vão voltar · N aguardando")
**And** cada aluno é um `StudentRow` com avatar de iniciais e `StatusChip` com ícone; a ordem do servidor é mantida
**And** uma mudança recebida por SSE faz a linha pulsar (Reanimated), mantendo o Snackbar atual
**And** o banner de dado desatualizado e o estado vazio usam `Banner`/`StateView`
**And** a lista de 60 alunos continua dentro do NFR4

**Camada:** Mobile · **Depende de:** 6.2 · **Prioridade:** P0 · **NFRs:** NFR4, NFR13

### Story 6.8: Redesign — Início do Aluno

Como aluno,
Quero um painel do dia em vez de uma pilha de botões,
Para que eu veja meu status e chegue ao que preciso em um toque.

**Acceptance Criteria:**

**Given** a especificação "Aluno › Início — P0"
**When** abro o início
**Then** vejo a saudação alinhada à esquerda e um cartão de status da viagem com `StatusChip` (aguardando / embarcou / não vai voltar) e horário
**And** "Meu QR" e "Onde está o ônibus" são dois cartões tocáveis lado a lado (112dp), com espaçamento entre eles
**And** o lembrete "E a volta?" aparece como `Banner` de aviso quando existe
**And** "Não vou voltar" fica como ação secundária na `StickyActionBar`, ainda em no máximo 2 toques (NFR19)
**And** ausência registrada mostra o cartão com `CountdownPill` e "Desfazer"
**And** os textos usados pelos testes Jest da home (94 consultas por texto) são preservados ou migrados para `testID` no mesmo PR

**Camada:** Mobile · **Depende de:** 6.2 · **Prioridade:** P0 · **NFRs:** NFR19

### Story 6.9: Redesign — Meu QR Code

Como aluno,
Quero um "cartão de embarque" com meu QR,
Para que o motorista me escaneie rápido e a tela transmita identidade.

**Acceptance Criteria:**

**Given** a especificação "Aluno › Meu QR Code — P0"
**When** abro o QR
**Then** o `QrPass` mostra faixa amarela com ícone, nome e rota, o QR no tamanho atual com quiet zone intacta e o rodapé "Mostre ao motorista"
**And** os estados de rota (carregando/erro/sem rota) aparecem como linha discreta dentro da faixa
**And** sessão inválida usa `StateView` bloqueado
**And** o QR continua sendo lido pelo scanner do motorista (verificado no alvo web)

**Camada:** Mobile · **Depende de:** 6.2 · **Prioridade:** P0

### Story 6.10: Redesign — Acompanhar Ônibus

Como aluno,
Quero ver em quanto tempo o ônibus chega, não coordenadas,
Para que eu decida quando sair de casa.

**Acceptance Criteria:**

**Given** a especificação "Aluno › Acompanhar ônibus — P0"
**When** há viagem ativa com posição
**Then** o `BusEtaCard` herói mostra ETA ("~8 min"), distância e chip "Ao vivo" ou "Sem sinal GPS há N min"
**And** a última posição e a precisão aparecem em legenda; coordenadas brutas saem do herói
**And** aguardando, sem viagem e erro usam `StateView`; permissão de localização negada usa `PermissionCard`
**And** o comportamento de SSE e fallback da Story 5.2 não muda

**Camada:** Mobile · **Depende de:** 6.2 · **Prioridade:** P0 · **NFRs:** NFR2

### Story 6.11: Polimento de Estados (P1)

Como usuário,
Quero estados de carregamento, offline e permissão consistentes em todas as telas,
Para que o app nunca pareça quebrado nos momentos intermediários.

**Acceptance Criteria:**

**Given** as telas P0 redesenhadas
**When** estão carregando, offline ou sem permissão
**Then** usam `Skeleton` no lugar de spinners genéricos
**And** o `OfflineBanner` é restilizado mantendo o texto do NFR13, o `testID` `offline-banner-dismiss` e `role=alert`
**And** as solicitações de permissão (câmera, localização) usam `PermissionCard`
**And** `+not-found` segue os tokens

**Camada:** Mobile · **Depende de:** 6.5–6.10 · **Prioridade:** P1 · **NFRs:** NFR13

### Story 6.12: Gate Visual da Demo (Marco do Épico)

Como autor do TCC,
Quero o redesign verificado ponta a ponta e documentado,
Para que a demo e a monografia mostrem o "antes/depois" com evidência.

**Acceptance Criteria:**

**Given** as stories 6.1–6.11 concluídas
**When** rodo o gate
**Then** lint, Jest (mobile e API), supertest, `pw:api` e `pw:e2e` estão verdes, com os NFRs de performance dentro do budget
**And** as 25 capturas "depois" são geradas nos mesmos estados das capturas `audit/` (antes) e versionadas lado a lado (D-UX-13)
**And** os fluxos da demo (embarque na ida, partida da volta, "onde está o ônibus", "não vou voltar") são percorridos no alvo web e no dev build Android (fonte Inter, háptico, ícone e splash conferidos em device)
**And** nenhum hex fora da paleta e nenhum import de `lightPalette` em telas (verificado por busca)

**Camada:** Verificação · **Depende de:** 6.1–6.11 · **Marco demonstrável do épico**

### Story 6.13 (P2, opcional): Redesign — Minhas Rotas e Painel Admin

Como motorista ou administrador,
Quero as telas secundárias no mesmo padrão visual,
Para que nenhuma tela destoe do resto.

**Acceptance Criteria:**

**Given** a seção P2 do `EXPERIENCE.md`
**When** as telas são redesenhadas
**Then** "Minhas rotas" usa `RouteCard` (nome, origem → destino com ícone, descrição sem itálico), **sem ganhar entrada nova** (D-UX-6 recusada)
**And** o painel admin mostra `StateView` "Em breve" com a marca

**Camada:** Mobile · **Depende de:** 6.2 · **Prioridade:** P2 (pós-marco)

### Story 6.14 (P2, opcional): Consumo do Tema Escuro

Como usuário,
Quero que o app siga o tema escuro do sistema,
Para que eu use o app à noite sem ofuscamento.

**Acceptance Criteria:**

**Given** a trava de tema claro (spec-1-11b, D-UX-4)
**When** a trava é removida
**Then** o provider escolhe o tema pelo esquema do sistema e `app.json` passa a `userInterfaceStyle: "automatic"`
**And** os papéis de status ganham variantes on-dark com contraste AA, com a guarda de paleta atualizada
**And** todas as telas P0 são verificadas em claro e escuro

**Camada:** Mobile · **Depende de:** 6.12 · **Prioridade:** P2 (pós-defesa)

---

## Epic 7: Mapa Cartográfico no Acompanhamento do Ônibus

O MVP entregou o FR32 como última posição conhecida + distância/ETA
(`sprint-change-proposal-2026-08-28`), e isso atende a Jornada 1. O mapa volta agora como
**polish para a apresentação do TCC**, não por uma lacuna de requisito. Ele foi cortado em 28/08
porque não havia biblioteca de mapas com suporte web e o dev build ainda não existia. O dev build
existe desde o item 22 do Épico 6, e o escopo abaixo deixa o web de fora de propósito.

**Decisões (27/09/2026):**

- **Só no app nativo (Android dev build).** No Expo Web o `track-bus` continua exatamente como
  está: é o alvo dos testes Playwright e não ganha mapa.
- **Biblioteca: `react-native-maps` com provider Google.** O Maps SDK for Android é gratuito, mas
  exige uma API key de um projeto Google Cloud com faturamento ativado. A key fica restrita ao
  package do app + SHA-1 do keystore e nunca é commitada.
- **Backend e contrato intocados.** O mapa consome o mesmo `location.updated` e a mesma
  posição do aluno que a tela já calcula.

**Fora de escopo:** marcador animado (interpolação entre updates), mapa no web, estilo escuro
do mapa, traçado da rota ou dos pontos de parada, persistência de histórico de posições.

### Story 7.1: Mapa com Ônibus e Aluno no Acompanhar Ônibus

Como aluno,
Quero ver o ônibus e a minha posição num mapa,
Para que eu entenda de relance onde ele está em relação a mim.

**Acceptance Criteria:**

**Given** o app nativo com viagem ativa e posição do ônibus conhecida
**When** o aluno abre "Acompanhar ônibus"
**Then** um mapa aparece acima do `BusEtaCard`, com um marcador para o ônibus e outro para o aluno
(quando a posição do aluno for conhecida), e a câmera enquadra os dois
**And** cada `location.updated` move o marcador do ônibus para a nova posição (salto, sem
animação), e a câmera só se reposiciona se o ônibus sair da área visível
**And** com o GPS do ônibus sem sinal (estado degradado da 5.2), o marcador fica na última posição
com aparência atenuada, coerente com o chip "Sem sinal GPS há N min"
**And** com a localização do aluno negada, o mapa mostra só o ônibus e o `LocationPermissionCard`
continua como hoje
**And** os estados aguardando, sem viagem e erro não mostram mapa (seguem com `StateView`)
**And** no Expo Web a tela renderiza igual à `main` (o componente do mapa tem variante
`.web.tsx` que não renderiza nada), e a suíte Playwright passa sem alteração
**And** a key é lida do ambiente em build (`app.json` → `app.config.ts`, variável documentada no
`.env.example`), e a ausência da key não quebra `npm run web` nem o Jest
**And** o mapa tem `accessibilityLabel` descritivo; ETA e distância continuam no card, que segue
sendo a fonte acessível da informação

**Verificação:** teste Jest com `react-native-maps` mockado (marcadores presentes, marcador
atenuado no degradado, só o ônibus com permissão negada); Playwright web inalterado e verde;
verificação manual nos AVDs (motorista61 transmitindo, aluno61 acompanhando) com captura de
tela anexada ao plan, após gerar um dev build novo.

**Camada:** Mobile · **Depende de:** 5.2, 6.10 · **Prioridade:** P2 (polish da apresentação) ·
**Tamanho:** M · **Dependência nativa nova:** `react-native-maps` (exige rebuild do dev build) ·
**hitl:** criar a API key no Google Cloud (faturamento + restrição por package/SHA-1) e fazer a
verificação manual nos AVDs

---

## Validação de Cobertura Total

| Épico | FRs cobertos | Qtd |
|---|---|---|
| Epic 1 | Nenhum (habilitador técnico) | 0 |
| Epic 2 | FR1–FR10 | 10 |
| Epic 3 | FR11–FR25 | 15 |
| Epic 4 | FR26–FR30 | 5 |
| Epic 5 | FR31–FR35 | 5 |
| Epic 6 | Nenhum novo (NFR13, NFR18–NFR20) | 0 |
| Epic 7 | FR32 (evolução — mapa no app nativo, Fase 2) | 0 |
| **Total MVP** | | **35/37** |
| **Diferido (Fase 2)** | FR36, FR37 | 2 |

O refatiamento de 12/07/2026 em trilhas **não removeu nem realocou nenhum FR** — apenas redistribuiu FRs entre stories *dentro* do mesmo épico.

A revisão de **28/08/2026** (`sprint-change-proposal-2026-08-28`, aprovado) é a primeira que altera a cobertura: **FR36 e FR37 saem do MVP** para a Fase 2. Além disso, **FR30 e FR32 mudam de forma de entrega** (lembrete in-app em vez de push; última posição + ETA em vez de mapa cartográfico) — ambos permanecem cobertos.

### Contagem de Stories

| Épico | Antes | Depois | Detalhe |
|---|---|---|---|
| Épico | 12/07/2026 | 23/08/2026 | **28/08/2026** | Detalhe da última revisão |
|---|---|---|---|---|
| Epic 1 | 5 | 7 | **9** | +1.8 (shell de navegação, extraída da 3.6) e 1.9 (seed, renumerada de 1.8) |
| Epic 2 | 6 | 6 | **6** | intocado (done) |
| Epic 3 | 9 | 9 | **9** | contagem intocada; 3.4b e 3.6 reduzidas em escopo |
| Epic 4 | 12 | 12 | **6** | fatiamento vertical (1 contrato + 4 fatias + 1 E2E); broadcast cortado |
| Epic 5 | 7 | 7 | **4** | fatiamento vertical (1 contrato + 2 fatias + 1 E2E); 5.3b dobrada na 5.2 |
| **Total** | **39** | **41** | **34** | **−8 stories** |

> A tabela acima substitui a contagem "Antes/Depois" de 12/07/2026, que só comparava duas
> revisões. **Stories abertas em 28/08/2026: 25 → 18.**
