# Decisões Arquiteturais Core

### Análise de Prioridade das Decisões

**Decisões Críticas (Bloqueiam Implementação):**
- Modelagem de dados (Prisma schema único)
- Estratégia de validação (Effect Schema)
- Padrão de autorização (NestJS Guards + RBAC)
- Gerenciamento de estado mobile (Zustand + TanStack Query)
- Armazenamento offline (MMKV + expo-sqlite)

**Decisões Importantes (Moldam a Arquitetura):**
- Tratamento de erros tipados (Effect → HTTP)
- Documentação da API (Swagger)
- Biblioteca de componentes UI (React Native Paper)
- Ambiente de desenvolvimento (Docker Compose)

**Decisões Deferidas (Pós-MVP):**
- Rate limiting → Fase 2 (sem exposição pública)
- Refresh token rotation → Fase 2 (simple refresh suficiente para protótipo)
- CI/CD → Fase 2 (dev solo, distribuição via Expo Go)
- Monitoramento externo → Fase 2 (logger NestJS v11 suficiente)
- Cache de listas de alunos em Redis → Fase 2 (overhead desnecessário no MVP)

### Arquitetura de Dados

**Schema Prisma:**
- Decisão: Schema único (`schema.prisma`) com separação lógica por comentários
- Rationale: MVP com ~5-8 entidades não justifica multi-file schemas. A separação DDD se expressa no código (modules, ports, adapters no Effect core), não na camada de schema
- Afeta: Todos os bounded contexts

**Validação de Dados:**
- Decisão: Effect Schema
- Rationale: Mantém validação no functional core (testável sem NestJS), coerente com ecossistema Effect. Na camada NestJS, um Pipe customizado converte erros Effect Schema → respostas HTTP
- Afeta: DTOs, domain entities, API input validation

**Cache (Redis):**
- Decisão: Redis para localização GPS (TTL curto, sobrescrita contínua) + blacklist de tokens JWT invalidados
- Rationale: GPS é o caso de uso principal confirmado no PRD. Blacklist necessária para logout seguro. Cache de dados frequentes deferido para Fase 2
- Afeta: Módulo de localização, módulo de autenticação

### Autenticação & Segurança

**Autorização (RBAC):**
- Decisão: NestJS Guards + decorators customizados (`@Roles('admin', 'driver', 'student')`)
- Padrão: `TenantGuard` extrai `tenantId` do JWT e injeta no request. Todas as queries filtradas por tenant — sem exceção
- 3 roles: `admin` (empresa), `driver` (motorista), `student` (aluno)
- Afeta: Todos os controllers, middleware layer

**Refresh Token:**
- Decisão: Simples sem rotation para MVP. Refresh token fixo por 7 dias
- Evolução: Design do JWT module no Effect core já prevê interface de token store para rotation futura (Fase 2)
- Afeta: Auth module

### API & Padrões de Comunicação

**Tratamento de Erros:**
- Decisão: Erros tipados do Effect mapeados para HTTP no imperative shell
- Padrão: Functional core retorna tagged errors (`StudentNotFound`, `InvalidQRCode`, `TenantMismatch`). NestJS ExceptionFilter converte → HTTP status codes + body `{ code: string, message: string, details?: object }`
- Rationale: Core agnóstico de HTTP, demonstra separação na tese
- Afeta: Todos os endpoints, ExceptionFilter global

**Documentação da API:**
- Decisão: Swagger/OpenAPI via `@nestjs/swagger`
- Rationale: Quase zero esforço, documentação interativa útil para desenvolvimento e apresentação do TCC
- Afeta: Controllers (decorators de Swagger)

**Rate Limiting:**
- Decisão: Deferido para Fase 2
- Rationale: Protótipo acadêmico sem exposição pública

### Arquitetura Frontend (Mobile)

**Gerenciamento de Estado:**
- Decisão: Zustand (estado local/UI) + TanStack Query (server state)
- Zustand: Estado da sessão, viagem ativa, modo offline, preferências
- TanStack Query: Cache de chamadas à API (lista de alunos, rotas), suporte offline via `persistQueryClient`
- Rationale: Dois tools com responsabilidades distintas, ambos leves e pragmáticos
- Afeta: Toda a camada de estado do app mobile

**Armazenamento Offline:**
- Decisão: MMKV (dados rápidos) + expo-sqlite (dados estruturados)
- MMKV: Tokens, preferências, estado da sessão — leitura/escrita ultra-rápida
- expo-sqlite: Lista de alunos offline, queue de check-ins pendentes — queries estruturadas
- Rationale: Cada storage no seu sweet spot de performance e complexidade
- Afeta: Módulo de sync offline, auth persistence, boarding queue

**Biblioteca de Componentes UI:**
- Decisão: React Native Paper (Material Design)
- Rationale: Maduro, boa documentação, componentes acessíveis prontos (botões grandes, contraste alto — alinha com NFR18/NFR19). Adequado para dev solo com prazo apertado
- Afeta: Toda a camada de UI

### Infraestrutura & Deploy

**Ambiente de Desenvolvimento:**
- Decisão: Docker Compose para desenvolvimento local (PostgreSQL + Redis + API)
- Rationale: Ambiente reproduzível, sem dependências locais complexas

**Hospedagem (Demo/Apresentação):**
- Decisão: Railway ou Render para deploy de demonstração
- Rationale: Deploy fácil, PostgreSQL + Redis managed, free tier generoso. Adequado para apresentação do TCC

**CI/CD:**
- Decisão: Deferido para Fase 2
- Rationale: Dev solo, GitHub como repositório suficiente. GitHub Actions para lint + testes pode ser adicionado depois

**Logging & Monitoramento:**
- Decisão: Logger padrão do NestJS v11 (JSON log melhorado)
- Rationale: Sem tooling externo no MVP. Suficiente para debug e demonstração

### Análise de Impacto das Decisões

**Sequência de Implementação:**
1. Inicialização dos projetos (Expo + NestJS starters)
2. Docker Compose (PostgreSQL + Redis)
3. Prisma schema + migrations
4. Effect TS setup + Composition Root (`EffectRuntimeModule`)
5. Auth module (JWT + Guards + RBAC)
6. Primeiro bounded context com CRUD (Rotas/Turmas)
7. Embarque digital (QR code + offline sync)
8. Localização em tempo real (SSE + Redis)
9. Notificações de ausência
10. Swagger documentation

**Dependências entre Decisões:**
- Effect Schema depende do setup Effect TS (passo 4)
- Auth Guards dependem do JWT module (passo 5)
- Offline sync depende de MMKV + expo-sqlite (configurados no passo 1)
- SSE depende de Redis (passo 2) + Effect runtime (passo 4)
- TanStack Query com persistência depende de MMKV (passo 1)
