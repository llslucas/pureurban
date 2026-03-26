---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments: ['planning-artifacts/prd.md', 'planning-artifacts/architecture.md']
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
- FR30: Sistema envia lembrete automático ao aluno que embarcou na ida mas não fez check-in na volta após um período definido

**Localização em Tempo Real:**
- FR31: App do motorista transmite localização GPS durante viagens ativas
- FR32: Aluno pode visualizar localização do ônibus em tempo real no mapa
- FR33: Sistema interrompe transmissão de GPS quando a viagem é encerrada
- FR34: Sistema exibe último ponto conhecido quando há perda de sinal GPS
- FR35: Localização é atualizada via SSE com armazenamento em Redis

**Comunicação:**
- FR36: Motorista pode enviar aviso geral para todos os alunos da rota (ex: atraso, mudança)
- FR37: Aluno recebe avisos enviados pelo motorista da sua rota

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

Nenhum documento de UX Design foi encontrado. Requisitos de UX derivados dos NFRs do PRD (NFR18-NFR20) e das decisões de Architecture (React Native Paper, Zustand stores por domínio).

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
- FR36: Epic 4 — Aviso geral do motorista
- FR37: Epic 4 — Recebimento de avisos pelo aluno

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
Aluno pode avisar "não vou voltar" com um toque, motorista recebe instantaneamente, sistema envia lembrete automático — o maior problema (espera indevida) é eliminado. Motorista pode enviar avisos gerais.
**FRs cobertos:** FR26, FR27, FR28, FR29, FR30, FR36, FR37

### Epic 5: Localização em Tempo Real
Aluno vê o ônibus no mapa em tempo real, motorista transmite GPS automaticamente durante viagens — ansiedade de espera no ponto eliminada.
**FRs cobertos:** FR31, FR32, FR33, FR34, FR35

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

## Epic 3: Gestão de Viagens e Embarque Digital

Motorista inicia viagem, alunos fazem check-in via QR code, motorista vê lista de embarque atualizada com contagem — o fluxo principal do produto funciona end-to-end.

### Story 3.1: Iniciar e Encerrar Viagem (Backend + Mobile Motorista)

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

### Story 3.2: Geração e Exibição de QR Code do Aluno

Como aluno,
Quero ver meu QR code exclusivo no app,
Para que eu possa fazer check-in no embarque.

**Acceptance Criteria:**

**Given** aluno autenticado
**When** acessa tela `(student)/qr-code.tsx`
**Then** QR code é exibido contendo payload criptografado com `studentId` e `sessionId`
**And** QR code é estático por sessão de login (NFR8)
**And** QR code é gerado localmente (sem chamada à API)
**And** tela exibe nome do aluno e rota vinculada
**And** fluxo requer no máximo 2 toques para exibir QR code (NFR19)

### Story 3.3: Escaneamento de QR Code e Check-in (Backend + Mobile Motorista)

Como motorista,
Quero escanear o QR code dos alunos para registrar embarque,
Para que eu tenha controle digital de quem entrou no ônibus.

**Acceptance Criteria:**

**Given** viagem ativa
**When** motorista escaneia QR code válido via `(driver)/scan.tsx`
**Then** POST `/api/v1/boarding/check-in` registra embarque com `studentId`, `tripId`, `timestamp`
**And** sistema valida que aluno tem permissão ativa e está vinculado à rota (FR18)
**And** QR code inválido, expirado ou de aluno sem permissão retorna erro com feedback visual claro (FR20)
**And** check-in processado em menos de 2 segundos (NFR1)
**And** domain event `boarding.checked_in` é emitido
**And** câmera (`expo-camera`) abre rapidamente com área de escaneamento clara

### Story 3.4: Check-in Offline com Sincronização

Como motorista,
Quero registrar check-ins mesmo sem internet,
Para que trechos sem sinal não impeçam o embarque digital.

**Acceptance Criteria:**

**Given** motorista sem conexão de internet
**When** escaneia QR code
**Then** check-in é armazenado localmente via expo-sqlite com `syncStatus = PENDING`
**And** quando conexão retorna, check-ins pendentes são sincronizados automaticamente via `offline-queue`
**And** conflitos resolvidos via last-write-wins (NFR12)
**And** interface exibe indicador "Modo Offline — dados serão sincronizados" (NFR13)
**And** dados persistem mesmo com crash do app (NFR11)

### Story 3.5: Lista de Alunos e Status de Embarque (Backend + Mobile Motorista)

Como motorista,
Quero ver a lista completa dos alunos da viagem com status de embarque,
Para que eu saiba quem entrou e quem falta.

**Acceptance Criteria:**

**Given** viagem ativa
**When** motorista acessa `(driver)/student-list.tsx`
**Then** lista exibe todos os alunos vinculados à rota com status: `embarcou`, `não embarcou`, `não vai voltar`
**And** contagem resumida é exibida no topo (ex: "28/32 embarcados") (FR25)
**And** lista atualiza em tempo real quando aluno faz check-in (FR23)
**And** lista carrega em menos de 1 segundo (NFR4)
**And** lista é acessível em modo offline via expo-sqlite (FR24)
**And** interface otimizada para operação com uma mão — botões grandes, contraste alto (NFR18)

---

## Epic 4: Notificação de Ausência e Comunicação

Aluno pode avisar "não vou voltar" com um toque, motorista recebe instantaneamente, sistema envia lembrete automático — o maior problema (espera indevida) é eliminado. Motorista pode enviar avisos gerais.

### Story 4.1: Notificação "Não Vou Voltar" (Backend + Mobile Aluno)

Como aluno,
Quero avisar com um toque que não retornarei no ônibus,
Para que o motorista não precise esperar por mim.

**Acceptance Criteria:**

**Given** aluno que fez check-in na ida
**When** toca "Não vou voltar" na tela `(student)/home.tsx`
**Then** POST `/api/v1/boarding/not-returning` registra ausência com `studentId`, `tripId`
**And** fluxo requer no máximo 2 toques (NFR19) — botão proeminente na tela principal
**And** domain event `boarding.not_returning` é emitido
**And** sistema registra `notifiedAt` com timestamp

### Story 4.2: Recebimento de Notificação de Ausência pelo Motorista

Como motorista,
Quero ser notificado instantaneamente quando um aluno informa que não retornará,
Para que eu possa partir sem espera desnecessária.

**Acceptance Criteria:**

**Given** viagem de retorno ativa
**When** aluno notifica "não vou voltar"
**Then** motorista recebe atualização na lista de alunos em menos de 3 segundos (NFR3)
**And** na `(driver)/student-list.tsx`, o status do aluno muda para `NÃO VAI VOLTAR` com destaque visual
**And** contagem resumida atualiza automaticamente (ex: "28/32" → "28/31")
**And** notificação de ausência aparece como alerta/toast contextual no app do motorista

### Story 4.3: Cancelamento de Ausência e Período de Segurança

Como aluno,
Quero poder cancelar minha notificação de ausência dentro de um período seguro,
Para que eu possa mudar de ideia caso tenha apertado por engano.

**Acceptance Criteria:**

**Given** aluno que notificou "não vou voltar"
**When** toca "Cancelar" dentro de 2 minutos
**Then** POST `/api/v1/boarding/cancel-absence` reverte o status
**And** domain event `boarding.absence_cancelled` é emitido
**And** motorista recebe atualização do status revertido na lista
**Given** período de 2 minutos expirado
**When** aluno tenta cancelar
**Then** sistema retorna erro `CANCELLATION_PERIOD_EXPIRED`
**And** confirmação push antes de consolidar a ausência (após período)

### Story 4.4: Lembrete Automático de Check-in Pendente

Como aluno que embarcou na ida mas não fez check-in na volta,
Quero receber um lembrete perguntando se vou retornar,
Para que o motorista não precise esperar sem necessidade.

**Acceptance Criteria:**

**Given** aluno fez check-in na ida e viagem de retorno está ativa
**When** aluno não fez check-in de retorno após período definido (ex: 15 min após início da viagem de volta)
**Then** sistema envia notificação push: "Você vai retornar? Toque para confirmar"
**And** aluno pode responder "Não vou voltar" diretamente da notificação
**And** resposta gera os mesmos efeitos da Story 4.1
**And** jornada da Ana (edge case) é coberta

### Story 4.5: Avisos Gerais do Motorista para Alunos

Como motorista,
Quero enviar avisos para todos os alunos da minha rota,
Para que eu possa comunicar atrasos ou mudanças.

**Acceptance Criteria:**

**Given** motorista autenticado com rota
**When** envia aviso via POST `/api/v1/boarding/broadcast` com mensagem de texto
**Then** aviso é persistido e entregue a todos os alunos vinculados à rota
**And** alunos recebem aviso na tela `(student)/home.tsx` como notificação in-app
**And** motorista pode enviar avisos pré-definidos (ex: "Atraso de 15 minutos", "Mudança de ponto") ou texto livre
**And** apenas role `driver` pode enviar avisos

---

## Epic 5: Localização em Tempo Real

Aluno vê o ônibus no mapa em tempo real, motorista transmite GPS automaticamente durante viagens — ansiedade de espera no ponto eliminada.

### Story 5.1: Transmissão de Localização GPS pelo Motorista

Como motorista,
Quero que minha localização GPS seja transmitida automaticamente durante viagens,
Para que alunos possam me acompanhar em tempo real.

**Acceptance Criteria:**

**Given** viagem ativa (evento `trip.started` recebido)
**When** app do motorista está aberto
**Then** localização GPS é enviada via POST `/api/v1/tracking/location` a cada 5 segundos
**And** localização é armazenada no Redis com TTL curto (sobrescrita contínua)
**And** Redis Pub/Sub publica evento `location.updated` com coordenadas, `tripId`, `timestamp`
**And** transmissão para automaticamente quando viagem é encerrada (evento `trip.ended`) (FR33)
**And** GPS não é coletado fora de viagens ativas (NFR10)

### Story 5.2: Visualização do Ônibus no Mapa em Tempo Real (Mobile Aluno)

Como aluno,
Quero ver a localização do ônibus no mapa em tempo real,
Para que eu saiba quando ele vai chegar ao meu ponto.

**Acceptance Criteria:**

**Given** viagem ativa para a rota do aluno
**When** aluno acessa `(student)/track-bus.tsx`
**Then** mapa exibe posição do ônibus atualizada via SSE (EventSource)
**And** atualizações entregues com latência máxima de 5 segundos (NFR2)
**And** SSE controller (`tracking-sse.controller.ts`) faz subscribe no Redis Pub/Sub e streaming para o cliente
**And** mapa exibe rota do ônibus com marcador animado

### Story 5.3: Comportamento Degradado e Perda de Sinal GPS

Como aluno,
Quero ver a última localização conhecida quando o GPS perde sinal,
Para que eu tenha alguma referência mesmo em áreas sem cobertura.

**Acceptance Criteria:**

**Given** motorista perde sinal GPS
**When** nenhuma atualização chega por mais de 15 segundos
**Then** mapa exibe último ponto conhecido com indicador visual "Sem sinal GPS" (FR34)
**And** quando sinal retorna, mapa atualiza automaticamente para posição atual
**Given** viagem encerrada
**When** aluno acessa o mapa
**Then** mensagem "Nenhuma viagem ativa no momento" é exibida
**And** SSE connection é encerrada elegantemente quando viagem termina
