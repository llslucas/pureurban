# Avaliação de Starter Templates

### Domínio Tecnológico Primário

Dois artefatos independentes identificados a partir da análise do PRD:
- **App Mobile** — Expo (React Native), cross-platform iOS + Android
- **API Backend** — NestJS (Node.js), monolito modular

### Versões Atuais Pesquisadas (Março/2026)

| Tecnologia | Versão | Observações |
|---|---|---|
| Expo SDK | 55 | `create-expo-app@latest`, template `default` inclui Expo Router + TypeScript |
| NestJS | v11.1.16 | SWC padrão (~20x mais rápido), Vitest padrão, ESM first-class, Express v5 / Fastify v5 |
| Prisma | v7.4.2 | Cliente TypeScript (~90% menor, ~3x mais rápido), ESM padrão. NestJS requer `moduleFormat = "cjs"` |
| Effect TS | Ativo | Integração manual (sem `@nestjs-effect` — ver decisão abaixo) |

### Starters Considerados

#### App Mobile: `create-expo-app` (Selecionado ✅)

**Comando de inicialização:**
```bash
npx create-expo-app@latest ./mobile --template default
```

**Decisões arquiteturais fornecidas pelo starter:**
- TypeScript configurado
- Expo Router (file-based routing)
- Metro bundler com hot reload
- Estrutura de projeto multi-tela
- Acesso a APIs nativas (câmera, GPS, notificações)

**Adicionar pós-inicialização:**
- Storage offline (expo-sqlite ou AsyncStorage)
- Leitura de QR code (expo-camera)
- Mapas para localização em tempo real
- Gerenciamento de estado
- EventSource para SSE

#### API Backend: `@nestjs/cli` (Selecionado ✅)

**Comando de inicialização:**
```bash
npx @nestjs/cli@latest new ./api --strict --package-manager npm
```

**Decisões arquiteturais fornecidas pelo starter:**
- TypeScript strict mode
- SWC como compilador
- Vitest para testes
- ESLint + Prettier
- Estrutura modular padrão NestJS
- ESM support

**Adicionar pós-inicialização:**
- Prisma ORM (PostgreSQL) com `moduleFormat = "cjs"`
- Effect TS (integração manual — ver abaixo)
- Redis (ioredis)
- JWT Auth (@nestjs/jwt + @nestjs/passport)
- Reorganização para Arquitetura Hexagonal

### Estrutura de Repositório

Monorepo de diretórios simples (sem Nx/Turborepo — adequado para dev solo):

```
pureurban/
├── mobile/          # Expo app (aluno + motorista)
├── api/             # NestJS backend
├── shared/          # (futuro) tipos compartilhados
└── docs/            # documentação
```

### Decisão de Integração: Effect TS ↔ NestJS

**Decisão:** Integração manual via Composition Root, sem bibliotecas de terceiros.

**Justificativa:** A biblioteca `@nestjs-effect` foi avaliada e descartada — 22 stars no GitHub, mantenedor único, pré-1.0, explicitamente "not production-ready", último publish há ~10 meses. Risco inaceitável de dependência.

**Padrão adotado: `useFactory` + `ManagedRuntime`**

O imperative shell (NestJS) injeta um runtime do Effect já montado com todas as dependências, via `useFactory` providers:

1. **Functional Core (Effect TS puro):** Define interfaces (Tags) e lógica de domínio. Zero imports de NestJS.
2. **Adapters:** Implementações concretas das portas (Prisma, Redis, etc.).
3. **Composition Root (`EffectRuntimeModule`):** `useFactory` do NestJS recebe dependências de infraestrutura (PrismaService, RedisService), monta os Layers do Effect e instancia um `ManagedRuntime`.
4. **Services do NestJS:** Recebem o runtime via `@Inject('EFFECT_RUNTIME')` e executam programas Effect com `runtime.runPromise(program)`.

**Benefícios:**
- Inversão de dependência explícita — core define interfaces, shell fornece implementações
- Atrito reduzido — services recebem runtime pronto, sem montagem repetitiva
- Testabilidade em dois níveis — core testável sem NestJS, integração testável via substituição de providers
- Material rico para TCC — demonstra concretamente coexistência de dois sistemas de DI distintos
- Lifecycle management — `ManagedRuntime` gerencia recursos, NestJS gerencia módulos

**Nota:** A inicialização do projeto usando estes comandos deve ser a primeira história de implementação.
