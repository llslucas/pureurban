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

**Camada:** Infraestrutura · **Depende de:** 1.6 · **FRs:** habilitador · **Desbloqueia:** 4.4b, 5.1b, 5.2b, NFR5, NFR18-NFR20

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
**And** cada item da fila exibe badge de estado (`✓` sincronizado, `⏳` pendente, `✗` falhou)
**And** quando a conexão retorna, a fila é drenada automaticamente com backoff de 1s a 30s e no máximo 5 tentativas por item
**And** cada requisição envia o header `X-Idempotency-Key` — a contraparte servidor já existe desde a Story 3.3a, então reenvios não duplicam check-ins (NFR12)
**And** os dados persistem mesmo com crash do app (NFR11)
**And** a falha da API não impede escanear e enfileirar novos check-ins (NFR14)

> **Nota:** esta story deixou de ter parte backend. A idempotência foi puxada para a Story 3.3a, onde pertence conceitualmente — é uma propriedade do endpoint, não do offline.

**Camada:** Mobile · **Depende de:** 3.3b · **FRs:** FR21 · **NFRs:** NFR11, NFR12, NFR13, NFR14

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

**Camada:** Integração · **Depende de:** 3.2b, 3.3a, 3.3b, 3.4b, 3.5a, 3.5b · **FRs:** valida FR11–FR25

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

**Composição:** 12 stories (1 contrato, 5 backend, 5 mobile, 1 integração).

### Story 4.0: Contrato de API — Ausência e Comunicação

Como desenvolvedor,
Quero o contrato de ausência e comunicação acordado e versionado antes da implementação,
Para que as trilhas de backend e mobile trabalhem em paralelo sem divergir.

**Acceptance Criteria:**

**Given** os endpoints de ausência e comunicação ainda não existem
**When** defino o contrato
**Then** `POST /api/v1/boarding/not-returning` está declarado com DTO de entrada (`tripId`), DTO de resposta (incluindo `notifiedAt` e `cancellableUntil`) e decorators Swagger completos
**And** `POST /api/v1/boarding/cancel-absence` está declarado
**And** `POST /api/v1/boarding/broadcast` está declarado com a mensagem e a lista de avisos pré-definidos
**And** `GET /api/v1/boarding/events` está declarado como stream SSE
**And** o **formato dos eventos SSE** está declarado como schema compartilhado: `boarding.not_returning`, `boarding.absence_cancelled`, `boarding.broadcast` — o mobile precisa mockar esses eventos, então eles são contrato tanto quanto os endpoints REST
**And** o endpoint de registro de push token do Expo está declarado (pré-requisito do lembrete automático da 4.4a)
**And** os códigos de erro tipados estão declarados (`CANCELLATION_PERIOD_EXPIRED`, `ALREADY_NOT_RETURNING`, `STUDENT_NOT_ON_TRIP`, `TRIP_NOT_ACTIVE`)
**And** o header `X-Idempotency-Key` está documentado nos endpoints de escrita
**And** `npm run openapi:export` regenera `api/openapi.json` com os novos endpoints e o arquivo está commitado
**And** o mobile regenera `src/types/api.d.ts` e cria handlers MSW para os endpoints REST **e** para o stream SSE
**And** os controllers retornam `501 Not Implemented`

**Camada:** Contrato · **Depende de:** Épico 3 concluído · **FRs:** habilitador

### Story 4.1a: Registro de Ausência "Não Vou Voltar" (Backend)

Como sistema,
Quero registrar que um aluno não retornará na viagem de volta,
Para que o motorista não precise esperar por ele.

**Acceptance Criteria:**

**Given** um aluno que fez check-in na viagem de ida
**When** `POST /api/v1/boarding/not-returning` é chamado com `tripId`
**Then** a ausência é persistida com `notifiedAt` (timestamp) e o status do aluno na viagem passa a `NOT_RETURNING` (FR26)
**And** o use case valida que o aluno pertence à rota da viagem — caso contrário retorna `STUDENT_NOT_ON_TRIP`
**And** notificar duas vezes retorna `ALREADY_NOT_RETURNING` sem duplicar o registro
**And** domain event `boarding.not_returning` é emitido via `WithEvents`
**And** a resposta inclui `cancellableUntil` (`notifiedAt` + 2 minutos) — o cliente não calcula essa janela
**And** o use case do core é testado sem infraestrutura (< 100ms por suite)

**Camada:** Backend · **Depende de:** 4.0 · **FRs:** FR26

### Story 4.1b: Botão "Não Vou Voltar" (Mobile Aluno)

Como aluno,
Quero avisar com um toque que não retornarei no ônibus,
Para que o motorista não precise esperar por mim.

**Acceptance Criteria:**

**Given** aluno autenticado com viagem de retorno ativa na sua rota
**When** acessa `(student)/home.tsx`
**Then** o botão "Não vou voltar" é proeminente na tela principal
**And** o fluxo completo exige no máximo 2 toques, incluindo a confirmação (NFR19)
**And** após confirmar, a tela mostra o estado "Ausência registrada" com o countdown de cancelamento alimentado por `cancellableUntil` do contrato
**And** os erros do contrato (`ALREADY_NOT_RETURNING`, `STUDENT_NOT_ON_TRIP`, `TRIP_NOT_ACTIVE`) têm mensagens claras ao aluno
**And** a story é desenvolvida contra os handlers MSW da Story 4.0

**Camada:** Mobile (Aluno) · **Depende de:** 4.0 · **FRs:** FR26 · **NFRs:** NFR19

### Story 4.2a: Canal de Eventos de Embarque em Tempo Real — SSE (Backend)

Como sistema,
Quero publicar os eventos de embarque num canal em tempo real,
Para que o app do motorista reflita ausências e avisos sem polling.

**Acceptance Criteria:**

**Given** os domain events de embarque sendo emitidos pelo core
**When** um evento `boarding.not_returning`, `boarding.absence_cancelled` ou `boarding.broadcast` é despachado
**Then** ele é publicado no Redis Pub/Sub pelo shell
**And** `GET /api/v1/boarding/events` faz subscribe no canal e faz streaming SSE para o cliente, filtrado por `tripId` e `companyId`
**And** o payload de cada evento segue exatamente o schema declarado na Story 4.0
**And** a latência entre o registro da ausência e a entrega do evento ao cliente é menor que 3 segundos (NFR3)
**And** a conexão SSE é encerrada elegantemente quando a viagem termina
**And** apenas o motorista atribuído à rota consegue abrir o stream daquela viagem

> **Nota de decomposição:** a Story 4.2 original misturava a infraestrutura de entrega com a experiência na tela. Esta story é só a infraestrutura; a experiência é a 4.2b.

**Camada:** Backend · **Depende de:** 4.1a · **FRs:** FR27 (entrega) · **NFRs:** NFR3

### Story 4.2b: Recebimento de Ausência em Tempo Real (Mobile Motorista)

Como motorista,
Quero ser notificado instantaneamente quando um aluno informa que não retornará,
Para que eu possa partir sem espera desnecessária.

**Acceptance Criteria:**

**Given** viagem de retorno ativa e a tela `(driver)/student-list.tsx` aberta
**When** chega um evento SSE `boarding.not_returning`
**Then** o status do aluno na lista muda para `NÃO VAI VOLTAR` com destaque visual (FR28)
**And** a contagem resumida se ajusta automaticamente (ex.: "28/32" → "28/31")
**And** um toast contextual anuncia a ausência sem bloquear a tela
**And** um evento `boarding.absence_cancelled` reverte o status e a contagem
**And** a reconexão do EventSource é automática após queda de rede, sem duplicar entradas na lista
**And** a story é desenvolvida contra o stream SSE mockado da Story 4.0

**Camada:** Mobile (Motorista) · **Depende de:** 4.0 · **FRs:** FR27, FR28 · **NFRs:** NFR3, NFR18

### Story 4.3a: Cancelamento de Ausência e Período de Segurança (Backend)

Como sistema,
Quero permitir o cancelamento da ausência dentro de uma janela de 2 minutos,
Para que um toque acidental do aluno não vire uma decisão irreversível.

**Acceptance Criteria:**

**Given** um aluno que notificou "não vou voltar" há menos de 2 minutos
**When** `POST /api/v1/boarding/cancel-absence` é chamado
**Then** a ausência é revertida e o status do aluno volta a `NOT_CHECKED_IN` (FR29)
**And** domain event `boarding.absence_cancelled` é emitido via `WithEvents`
**Given** a janela de 2 minutos expirada
**When** o aluno tenta cancelar
**Then** o sistema retorna o tagged error `CANCELLATION_PERIOD_EXPIRED`
**And** a regra dos 2 minutos vive no functional core, testável isoladamente com relógio injetado (< 100ms por suite)
**And** a duração da janela é configuração do core, não um número mágico espalhado pelo código

**Camada:** Backend · **Depende de:** 4.1a · **FRs:** FR29

### Story 4.3b: Cancelamento de Ausência (Mobile Aluno)

Como aluno,
Quero poder cancelar minha notificação de ausência dentro de um período seguro,
Para que eu possa mudar de ideia caso tenha apertado por engano.

**Acceptance Criteria:**

**Given** aluno que acabou de notificar "não vou voltar"
**When** a tela `(student)/home.tsx` está aberta
**Then** um botão "Cancelar" é exibido com countdown regressivo alimentado por `cancellableUntil` — o cliente **exibe** a janela, não a decide
**And** ao tocar "Cancelar" dentro da janela, o estado volta a "Retorno confirmado"
**And** quando a janela expira, o botão desaparece e a ausência é apresentada como consolidada
**And** o erro `CANCELLATION_PERIOD_EXPIRED` (corrida entre o toque e a expiração) é tratado com mensagem clara, sem travar a tela
**And** a story é desenvolvida contra os handlers MSW da Story 4.0

**Camada:** Mobile (Aluno) · **Depende de:** 4.1b · **FRs:** FR29 · **NFRs:** NFR19

### Story 4.4a: Lembrete Automático de Check-in Pendente (Backend)

Como sistema,
Quero lembrar automaticamente o aluno que embarcou na ida mas não fez check-in na volta,
Para que o motorista não espere sem necessidade — a jornada da Ana.

**Acceptance Criteria:**

**Given** um aluno que fez check-in na viagem de ida e uma viagem de retorno ativa na mesma rota
**When** passam 15 minutos do início da viagem de retorno sem check-in nem ausência registrada do aluno
**Then** um scheduler dispara uma push notification via Expo Push: "Você vai retornar? Toque para confirmar" (FR30)
**And** a notificação carrega os dados de ação (`tripId`, `studentId`) para permitir a resposta rápida da Story 4.4b
**And** o lembrete é enviado no máximo uma vez por aluno por viagem
**And** alunos que já notificaram ausência ou já fizeram check-in de retorno não recebem lembrete
**And** o período (15 min) é configuração do core, testável com relógio injetado
**And** o disparo do scheduler é lógica do shell; a decisão de "quem deve ser lembrado" é um use case do core, testado sem infraestrutura

**Camada:** Backend · **Depende de:** 4.1a · **FRs:** FR30

### Story 4.4b: Recebimento do Lembrete e Resposta Rápida (Mobile Aluno)

Como aluno que embarcou na ida mas não fez check-in na volta,
Quero receber um lembrete perguntando se vou retornar,
Para que eu possa responder sem abrir o app.

**Acceptance Criteria:**

**Given** o app do aluno com push token registrado no backend
**When** o lembrete da Story 4.4a chega
**Then** a notificação é exibida com a ação "Não vou voltar" respondível direto da notificação
**And** responder pela notificação produz exatamente os mesmos efeitos do botão da Story 4.1b (mesma chamada, mesmo estado)
**And** tocar a notificação sem responder abre `(student)/home.tsx` no estado correto
**And** o registro do push token acontece no login e é revogado no logout
**And** a jornada da Ana (edge case do PRD) é coberta ponta a ponta
**And** a story é desenvolvida contra os handlers MSW da Story 4.0

**Camada:** Mobile (Aluno) · **Depende de:** 4.1b · **FRs:** FR30 · **NFRs:** NFR19

### Story 4.5a: Avisos Gerais do Motorista — Broadcast (Backend)

Como sistema,
Quero entregar avisos do motorista a todos os alunos da rota,
Para que atrasos e mudanças sejam comunicados sem ligação telefônica.

**Acceptance Criteria:**

**Given** motorista autenticado com rota atribuída
**When** `POST /api/v1/boarding/broadcast` é chamado com uma mensagem
**Then** o aviso é persistido com autor, rota, `tripId` e timestamp (FR36)
**And** o evento `boarding.broadcast` é publicado e entregue a todos os alunos vinculados à rota pelo canal SSE da Story 4.2a
**And** apenas a role `driver` pode enviar avisos (RolesGuard)
**And** o motorista só consegue enviar avisos para rotas atribuídas a ele
**And** a mensagem é validada via Effect Schema (não vazia, limite de tamanho) — erro de validação retorna 400 tipado
**And** o use case do core é testado sem infraestrutura

**Camada:** Backend · **Depende de:** 4.2a · **FRs:** FR36

### Story 4.5b: Envio e Recebimento de Avisos (Mobile Motorista + Aluno)

Como motorista, quero enviar avisos aos alunos da minha rota; como aluno, quero recebê-los,
Para que atrasos e mudanças cheguem a todos de uma vez.

**Acceptance Criteria:**

**Given** motorista com viagem ativa
**When** abre o compositor de avisos na tela do motorista
**Then** pode escolher um aviso pré-definido (ex.: "Atraso de 15 minutos", "Mudança de ponto") ou digitar texto livre
**And** o envio é confirmado visualmente e o fluxo cabe em poucos toques com uma mão (NFR18, NFR19)
**Given** aluno com o app aberto
**When** chega um evento SSE `boarding.broadcast` da sua rota
**Then** o aviso aparece em `(student)/home.tsx` como notificação in-app (FR37)
**And** os avisos recentes da viagem ficam acessíveis (não somem ao serem dispensados)
**And** a story é desenvolvida contra o stream SSE mockado da Story 4.0

**Camada:** Mobile (Motorista + Aluno) · **Depende de:** 4.2b · **FRs:** FR36, FR37 · **NFRs:** NFR18, NFR19

### Story 4.6: Integração e E2E do Épico 4

Como desenvolvedor,
Quero substituir os mocks pela API real e provar os fluxos de ausência e comunicação end-to-end,
Para que o épico seja considerado entregue de fato.

**Acceptance Criteria:**

**Given** as trilhas API e Mobile do Épico 4 concluídas
**When** desligo os handlers MSW (REST e SSE) e aponto o app para a API real
**Then** o fluxo completo funciona: aluno toca "não vou voltar" → motorista vê o status mudar e a contagem se ajustar em menos de 3 segundos (NFR3)
**And** o fluxo de cancelamento funciona dentro da janela e é corretamente rejeitado fora dela
**And** o lembrete automático dispara para um aluno que embarcou na ida e não fez check-in na volta, e a resposta pela notificação registra a ausência
**And** um aviso enviado pelo motorista chega a todos os alunos da rota
**And** o `openapi.json` commitado não diverge do gerado a partir do código (drift check)
**And** teste E2E cobre: notificar ausência, cancelar dentro da janela, tentar cancelar fora da janela, receber aviso geral
**And** a latência de NFR3 é medida contra a API real, não contra mock

**Camada:** Integração · **Depende de:** 4.1a–4.5b · **FRs:** valida FR26–FR30, FR36, FR37

### Rastreabilidade FR → Story (Épico 4)

| FR | Story |
|---|---|
| FR26 | 4.1a + 4.1b |
| FR27 | 4.2a (entrega) + 4.2b (recebimento) |
| FR28 | 4.2b |
| FR29 | 4.3a + 4.3b |
| FR30 | 4.4a + 4.4b |
| FR36 | 4.5a + 4.5b |
| FR37 | 4.5b |

**Cobertura do épico: 7/7 FRs (FR26–FR30, FR36, FR37).**

---

## Epic 5: Localização em Tempo Real

Aluno vê o ônibus no mapa em tempo real, motorista transmite GPS automaticamente durante viagens — ansiedade de espera no ponto eliminada.

**Composição:** 7 stories (1 contrato, 2 backend, 3 mobile, 1 integração).

### Story 5.0: Contrato de API — Localização em Tempo Real

Como desenvolvedor,
Quero o contrato de rastreamento acordado e versionado antes da implementação,
Para que as trilhas de backend e mobile trabalhem em paralelo sem divergir.

**Acceptance Criteria:**

**Given** os endpoints de rastreamento ainda não existem
**When** defino o contrato
**Then** `POST /api/v1/tracking/location` está declarado com DTO de entrada (`tripId`, `latitude`, `longitude`, `accuracy`, `capturedAt`) e decorators Swagger completos
**And** `GET /api/v1/tracking/trips/:id/stream` está declarado como stream SSE
**And** `GET /api/v1/tracking/trips/:id/location` está declarado para o **último ponto conhecido** — é o estado inicial do mapa antes do primeiro evento SSE chegar (pré-requisito da Story 5.3b)
**And** o formato do evento `location.updated` está declarado como schema compartilhado (coordenadas, `tripId`, `timestamp`)
**And** os códigos de erro tipados estão declarados (`TRIP_NOT_ACTIVE`, `NO_LOCATION_AVAILABLE`)
**And** `npm run openapi:export` regenera `api/openapi.json` e o arquivo está commitado
**And** o mobile regenera `src/types/api.d.ts` e cria handlers MSW capazes de **emitir uma sequência de eventos `location.updated`** — o mock precisa simular movimento, não só uma resposta estática
**And** os controllers retornam `501 Not Implemented`

**Camada:** Contrato · **Depende de:** Épico 4 concluído · **FRs:** habilitador

### Story 5.1a: Ingestão de GPS — Redis e Pub/Sub (Backend)

Como sistema,
Quero receber e distribuir as coordenadas do motorista,
Para que os alunos possam acompanhar o ônibus em tempo real.

**Acceptance Criteria:**

**Given** uma viagem ativa
**When** `POST /api/v1/tracking/location` recebe as coordenadas do motorista
**Then** a posição é armazenada no Redis com TTL curto, sobrescrevendo a anterior (FR35)
**And** o Redis Pub/Sub publica `location.updated` com coordenadas, `tripId` e `timestamp`
**And** coordenadas enviadas para uma viagem não ativa são rejeitadas com `TRIP_NOT_ACTIVE`
**And** `GET /api/v1/tracking/trips/:id/location` retorna o último ponto conhecido ou `NO_LOCATION_AVAILABLE`
**And** posições **não são persistidas no PostgreSQL** — o histórico de trajeto está fora do escopo do MVP (Architecture: Redis é o único store de localização)
**And** apenas o motorista atribuído à viagem pode enviar coordenadas
**And** a lógica de ingestão é testada sem infraestrutura real (Redis via port do core)

**Camada:** Backend · **Depende de:** 5.0 · **FRs:** FR35

### Story 5.1b: Transmissão de GPS durante Viagem Ativa (Mobile Motorista)

Como motorista,
Quero que minha localização seja transmitida automaticamente durante as viagens,
Para que os alunos possam me acompanhar sem que eu precise fazer nada.

**Acceptance Criteria:**

**Given** o motorista inicia uma viagem
**When** a viagem passa a `ACTIVE`
**Then** o app começa a capturar GPS via `expo-location` e envia a posição a cada 5 segundos (FR31)
**And** a permissão de localização é solicitada com justificativa clara antes da primeira viagem
**Given** a viagem é encerrada
**When** o app recebe/observa o fim da viagem
**Then** a captura de GPS **para automaticamente** (FR33)
**And** o GPS não é coletado em nenhum momento fora de uma viagem ativa (NFR10) — o start/stop é amarrado ao ciclo de vida da viagem, nunca a um toque manual do motorista
**And** perda temporária de rede não derruba a captura: as posições são descartadas (não enfileiradas — posição velha não tem valor), e o envio retoma sozinho
**And** a story é desenvolvida contra os handlers MSW da Story 5.0

**Camada:** Mobile (Motorista) · **Depende de:** 5.0 · **FRs:** FR31, FR33 · **NFRs:** NFR10

### Story 5.2a: SSE de Localização (Backend)

Como sistema,
Quero fazer streaming das posições do ônibus para os alunos da rota,
Para que o mapa deles atualize sem polling.

**Acceptance Criteria:**

**Given** um aluno vinculado à rota de uma viagem ativa
**When** abre `GET /api/v1/tracking/trips/:id/stream`
**Then** o `tracking-sse.controller.ts` faz subscribe no canal Redis Pub/Sub daquela viagem e faz streaming dos eventos `location.updated` (FR35)
**And** o evento entregue segue exatamente o schema declarado na Story 5.0
**And** a latência entre o `POST` do motorista e a entrega ao aluno é menor que 5 segundos (NFR2)
**And** apenas alunos vinculados à rota conseguem abrir o stream daquela viagem (validação de permissão — FR6)
**And** a conexão SSE é encerrada elegantemente quando a viagem termina
**And** múltiplos alunos assistindo à mesma viagem compartilham o mesmo subscribe (não abre uma conexão Redis por cliente)

**Camada:** Backend · **Depende de:** 5.1a · **FRs:** FR35 · **NFRs:** NFR2

### Story 5.2b: Mapa do Ônibus em Tempo Real (Mobile Aluno)

Como aluno,
Quero ver a localização do ônibus no mapa em tempo real,
Para que eu saiba quando ele vai chegar ao meu ponto.

**Acceptance Criteria:**

**Given** viagem ativa na rota do aluno
**When** o aluno acessa `(student)/track-bus.tsx`
**Then** o mapa carrega com o último ponto conhecido (`GET /tracking/trips/:id/location`) e depois passa a atualizar via SSE (EventSource) (FR32)
**And** o marcador do ônibus é animado entre posições, sem "pular" a cada evento
**And** as atualizações aparecem com latência máxima de 5 segundos na percepção do aluno (NFR2)
**And** a tela é utilizável em dispositivo de 5" a 720p (NFR20)
**And** a story é desenvolvida contra o stream SSE mockado da Story 5.0, que emite uma sequência de posições
**And** a biblioteca de mapas escolhida tem suporte web ou variante `.web.tsx` (Architecture §8, regra 14) — `react-native-maps` não atende e exige alternativa

**Camada:** Mobile (Aluno) · **Depende de:** 5.0 · **FRs:** FR32 · **NFRs:** NFR2, NFR20

### Story 5.3b: Comportamento Degradado e Perda de Sinal (Mobile Aluno)

Como aluno,
Quero ver a última localização conhecida quando o sinal cai,
Para que eu tenha alguma referência mesmo em áreas sem cobertura.

**Acceptance Criteria:**

**Given** o mapa aberto com o ônibus em movimento
**When** nenhum evento `location.updated` chega por mais de 15 segundos
**Then** o mapa mantém o último ponto conhecido com o indicador visual "Sem sinal GPS" (FR34)
**And** quando os eventos voltam, o indicador some e o mapa atualiza para a posição atual
**Given** a viagem encerrada
**When** o aluno acessa o mapa
**Then** a mensagem "Nenhuma viagem ativa no momento" é exibida
**And** a conexão SSE é encerrada elegantemente
**And** a reconexão do EventSource após queda de rede é automática, com backoff

> **Nota de decomposição:** esta story é mobile-only. "Último ponto conhecido" e "sem sinal há 15s" são estado de cliente — o backend não precisa saber que o sinal caiu, porque a **ausência de eventos já é o sinal**.

**Camada:** Mobile (Aluno) · **Depende de:** 5.2b · **FRs:** FR34 · **NFRs:** NFR13

### Story 5.4: Integração e E2E do Épico 5

Como desenvolvedor,
Quero substituir os mocks pela API real e provar o rastreamento end-to-end,
Para que o épico seja considerado entregue de fato.

**Acceptance Criteria:**

**Given** as trilhas API e Mobile do Épico 5 concluídas
**When** desligo os handlers MSW e aponto o app para a API real
**Then** o fluxo completo funciona: motorista inicia viagem → GPS começa a transmitir → aluno abre o mapa e vê o ônibus se movendo
**And** encerrar a viagem interrompe a transmissão de GPS e encerra o stream do aluno (FR33, NFR10)
**And** o `openapi.json` commitado não diverge do gerado a partir do código (drift check)
**And** teste E2E cobre o caminho feliz (ônibus se movendo no mapa) e o degradado (sem eventos por 15s → "Sem sinal GPS" → recuperação)
**And** a latência de NFR2 (< 5s) é medida contra a API real, não contra mock

**Camada:** Integração · **Depende de:** 5.1a–5.3b · **FRs:** valida FR31–FR35

### Rastreabilidade FR → Story (Épico 5)

| FR | Story |
|---|---|
| FR31 | 5.1b |
| FR32 | 5.2b |
| FR33 | 5.1b (parada automática) + 5.4 (validação E2E) |
| FR34 | 5.3b |
| FR35 | 5.1a (Redis + Pub/Sub) + 5.2a (SSE) |

**Cobertura do épico: 5/5 FRs (FR31–FR35).**

---

## Validação de Cobertura Total

| Épico | FRs cobertos | Qtd |
|---|---|---|
| Epic 1 | Nenhum (habilitador técnico) | 0 |
| Epic 2 | FR1–FR10 | 10 |
| Epic 3 | FR11–FR25 | 15 |
| Epic 4 | FR26–FR30, FR36, FR37 | 7 |
| Epic 5 | FR31–FR35 | 5 |
| **Total** | | **37/37** |

O refatiamento dos Épicos 3, 4 e 5 em trilhas **não removeu nem realocou nenhum FR** — apenas redistribuiu FRs entre stories *dentro* do mesmo épico. O `FR Coverage Map` (FR → Épico) permanece válido e inalterado.

### Contagem de Stories

| Épico | Antes | Depois | Detalhe |
|---|---|---|---|
| Epic 1 | 5 | 7 | +1.6 e 1.7 (ambiente de execução — sprint-change-proposal-2026-08-23) |
| Epic 2 | 6 | 6 | intocado (done) |
| Epic 3 | 5 | 9 | 1 entregue + 1 contrato + 2 backend + 4 mobile + 1 integração |
| Epic 4 | 5 | 12 | 1 contrato + 5 backend + 5 mobile + 1 integração |
| Epic 5 | 3 | 7 | 1 contrato + 2 backend + 3 mobile + 1 integração |
| **Total** | **24** | **41** | 12 stories restantes viram 27, + 2 habilitadoras de ambiente |
