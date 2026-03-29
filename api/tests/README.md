# Testes — PureUrban API

## Estrutura

```
api/
├── test/                        # NestJS e2e tests (Vitest + Supertest)
│   └── app.e2e-spec.ts
├── tests/                       # Playwright API & E2E tests
│   ├── api/                     # Testes de integração API (sem browser)
│   │   └── health.api.spec.ts
│   ├── e2e/                     # Testes E2E (com browser, futuro)
│   │   └── example.spec.ts
│   └── support/                 # Infraestrutura de teste
│       ├── merged-fixtures.ts   # Fixtures combinadas (mergeTests)
│       ├── custom-fixtures.ts   # Fixtures customizadas PureUrban
│       ├── auth/                # Auth provider JWT
│       ├── factories/           # Data factories (@faker-js/faker)
│       └── helpers/             # Seed helpers
├── vitest.config.ts             # Config unitária (src/**/*.spec.ts)
├── vitest.config.e2e.ts         # Config e2e NestJS (test/**/*.e2e-spec.ts)
└── playwright.config.ts         # Config Playwright (tests/**)
```

## Scripts

| Script | Descrição |
|---|---|
| `npm test` | Roda testes unitários (Vitest) |
| `npm run test:watch` | Testes unitários em modo watch |
| `npm run test:cov` | Testes unitários com cobertura |
| `npm run test:e2e` | Testes e2e NestJS (Supertest) |
| `npm run test:pw` | Todos os testes Playwright |
| `npm run test:pw:api` | Apenas testes API (sem browser) |
| `npm run test:pw:e2e` | Apenas testes E2E (com browser) |
| `npm run test:pw:debug` | Playwright em modo debug |

## Factories

```typescript
import { createUser, createAdmin, createCompany } from './support/factories';

// Criar usuário com defaults aleatórios
const user = createUser();

// Criar admin com empresa específica
const admin = createAdmin({ companyId: 'abc-123' });

// Override qualquer campo
const driver = createUser({ role: 'driver', name: 'João Silva' });
```

## Padrões

- **Given/When/Then** para estrutura de teste
- **Factories com overrides** para dados de teste (nunca hardcoded)
- **API seeding** para setup (nunca UI)
- **merged-fixtures.ts** como ponto único de importação do Playwright
