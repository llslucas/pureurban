# AGENTS.md

Instruções para agentes de código (ZCode) trabalhando neste repositório.

## Regras de arquitetura e stack

**Antes de implementar qualquer código, leia `_bmad-output/project-context.md`.**
Esse arquivo é a fonte de verdade para stack, arquitetura hexagonal (core/shell), Effect TS,
Prisma multi-schema, multi-tenancy e padrões de teste.

## Monorepo

`api/` (NestJS) e `mobile/` (Expo) são projetos independentes — não há workspaces.
Instale dependências e rode comandos **dentro de cada diretório**, nunca da raiz.
Node 22 (`api/.nvmrc`).

## Comandos

Infra local (obrigatória para e2e e testes de integração, que usam banco real):

```bash
docker compose up -d   # PostgreSQL 16 (5432) + Redis 7 (6379)
```

API (`cd api`):

- `npm run start:dev` — dev em watch mode
- `npm test` — unit (Vitest) | `npm run test:e2e` — e2e Vitest (`vitest.config.e2e.ts`)
- `npm run test:pw:api` / `npm run test:pw:e2e` — Playwright (API sem browser / E2E com Chrome)
- Um único teste: `npx vitest run -t "nome do teste"` ou `npx vitest run caminho/do/arquivo.spec.ts`
- `npm run lint` (ESLint com `--fix`) | `npm run format` (Prettier em `src/` e `test/`)
- `npm run openapi:export` — regenera `api/openapi.json`

Mobile (`cd mobile`):

- `npm start` | `npm run web` (Expo Web na porta 8081, fixa — a API libera essa origem no CORS)
- `npm test` (Jest via `jest-expo`) | `npm run test:watch` — roda sem device, rede ou `.env`
- `npm run lint` — `expo lint` (não há Prettier configurado aqui)
- `npm run openapi:types` — regenera `src/types/api.d.ts` a partir de `../api/openapi.json`.
  Rode `openapi:export` na API antes.

## Gotchas

- API usa `module: "nodenext"`: imports relativos **precisam** da extensão `.js`.
  Mobile usa o alias `@/*` → `./src/*`.
- Após alterar `api/prisma/schema.prisma`: `npx prisma migrate dev` e depois `npx prisma generate`
  (client vai para `api/src/generated/prisma`).
- `api/.env` nunca é commitado; use `api/.env.example` como referência.
  `JWT_SECRET` precisa ser gerado; `CORS_ORIGIN` é obrigatória em produção.
- Não há CI configurado — rode lint e testes localmente antes de abrir PR.

## Comentários no código

Comente apenas o que não é óbvio: o *porquê* de uma decisão, workaround ou invariante.
Nunca comente o que o código já diz. Sem JSDoc obrigatório. Ao editar um arquivo, remova
comentários redundantes que encontrar nele.

## Fluxo de trabalho: branch → commits atômicos → PR

Toda feature, fix ou refactor segue este fluxo. Nunca commite direto na `main`.

1. **Branch própria** a partir da `main` atualizada, uma por feature:
   `<tipo>/<numero-da-story>-<slug>` quando a mudança vem de uma story do sprint
   (ex.: `feat/3-2b-qr-code-do-aluno`), ou `<tipo>/<slug>` para trabalho avulso.
   Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`.
2. **Commits atômicos**: um commit por mudança coerente e autocontida, cada um deixando o
   repositório em estado funcional. Não agrupe mudanças não relacionadas nem acumule tudo
   em um commit final. Conventional Commits com escopo e, quando houver, a story:
   `fix(boarding): allow only one check-in in flight at a time (story 3.3b)`.
3. **PR ao finalizar, sempre pedindo minha confirmação antes de abrir.** Rode lint e testes,
   faça push da branch, apresente título e descrição do PR e **espere minha aprovação
   explícita** para executar `gh pr create` contra a `main`. Nunca abra um PR sem ela.

Idioma: commits, PRs e comentários de código em **inglês**; `docs/` e `_bmad-output/` em **português**.

## Planejamento (BMAD)

Stories, epics, sprint status e change proposals ficam em `_bmad-output/`
(`implementation-artifacts/sprint-status.yaml` é o estado corrente do sprint).
Documentos de arquitetura e PRD estão em `docs/` e `_bmad-output/planning-artifacts/`.
