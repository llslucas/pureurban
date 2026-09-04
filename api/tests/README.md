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

## E2E do Épico 3 (integração real, sem MSW)

Os specs em `tests/e2e/boarding-*.e2e.spec.ts` (projeto Playwright `e2e`, Chrome)
dirigem o **Expo Web do motorista** contra a **API real** e provam o fluxo do
produto ponta a ponta: login → viagem ativa → scan de QR → check-in 201 → a
lista de alunos atualiza com `{boarded, total}`. Cobrem também QR inválido /
aluno não permitido, o cenário offline (check-in sem rede → reconexão → sync sem
duplicata) e as latências de NFR1 (< 2s) e NFR4 (< 1s com 50+ alunos, este em
`tests/api/roster-nfr4.spec.ts`, API-only).

### Pré-requisitos (dois servidores de pé)

Não há `webServer` no Playwright: subir API + Expo Web juntos pelo runner é
frágil (o bundle inicial do Metro leva minutos e não sinaliza "pronto"). Suba os
dois à mão antes:

```bash
# 1. Infra
docker compose up -d              # Postgres 16 + Redis 7

# 2. API em :3000  (terminal separado, dentro de api/)
npm run start:dev

# 3. Expo Web em :8081  (terminal separado, dentro de mobile/)
EXPO_PUBLIC_USE_MOCKS=0 EXPO_PUBLIC_API_URL=http://localhost:3000 EXPO_PUBLIC_E2E=1 npm run web
```

`EXPO_PUBLIC_E2E=1` liga, só sob `__DEV__`, o hook `globalThis.__E2E_INJECT_SCAN__`
em `(driver)/scan.tsx` — o E2E injeta a string do QR por aí, já que roda no web
sem câmera. Sem essa env o hook é nulo e nada é exposto.

### Rodar

```bash
cd api && npm run test:pw:e2e
```

Com os servidores no ar os specs rodam; **sem eles, auto-skipam** (não falham):
`e2eServersUnavailable()` checa `:3000` + `:8081` (specs `e2e`) e
`apiUnavailable()` checa só `:3000` (`tests/api/roster-nfr4.spec.ts`, que semeia
via API real). Ambos com timeout de 3s por probe. Para exigir a infra (CI), rode
com `E2E_SERVERS_UP=1` e a ausência vira falha.

Os specs `e2e` rodam **seriais** — dividem um único Expo dev server
(`playwright.config.ts`: `fullyParallel:false` no projeto + `--workers=1` nos
scripts `test:pw`, `test:pw:e2e`, `test:pw:headed`).

### Caveats

- **OPFS / wa-sqlite headless:** `boarding-offline-sync.e2e.spec.ts` passou
  headless na verificação da 3.6. A persistência da fila offline usa wa-sqlite;
  se algum ambiente não servir os headers COOP/COEP, o `SyncAccessHandle` do OPFS
  fica indisponível em headless e o spec precisa de `npm run test:pw:headed`.
- **Revalidação do roster no spec offline:** `context.setOffline` do Playwright é
  CDP puro e não redispara os eventos DOM que o app usa para revalidar queries;
  além disso o dreno da fila não invalida o cache do roster (só o caminho ONLINE
  do scan faz — AC #4 da 3.5b). Por isso `boarding-offline-sync` prova o "aparece
  exatamente uma vez" pela API (`GET /trips/:id/students`), que é a fonte da
  contagem que a lista renderiza, e não pelo DOM da lista.
- **Latências:** as asserções de NFR medem só a chamada de rede, nunca o render.
  NFR1 lê o `timing()` do resource (`responseEnd - requestStart`), não um
  `Date.now()` em volta da injeção. NFR4 mede o `GET` direto. Números reais no
  `console.log` (`[NFR1]` / `[NFR4]`); a folga de ambiente local está nos tetos.
- **Sem cleanup:** cada spec semeia um tenant isolado via `seedEpic3Scenario`
  (e-mail faker único). Lixo no Postgres de teste local é aceito.
