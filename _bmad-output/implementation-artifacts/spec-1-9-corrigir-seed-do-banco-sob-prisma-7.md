---
title: 'Story 1.9: Corrigir seed do banco sob Prisma 7'
type: 'bugfix'
created: '2026-09-07'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O seed do banco está quebrado em três camadas desde a migração ao Prisma 7: `npm run seed` não existe como script (o hook `prisma.seed` do `package.json` é ignorado pelo Prisma 7), `npx prisma db seed` responde "No seed command configured" (a config de seed não migrou para `prisma.config.ts`) e `prisma/seed.ts` falha em `new PrismaClient()` sem driver adapter (obrigatório no cliente gerado do Prisma 7). Sem o seed, nenhuma story que dependa de dados semeados tem ambiente reproduzível — e o Épico 4 tem seu início condicionado a esta story por decisão registrada.

**Approach:** Alinhar o seed ao padrão já usado pelo `PrismaService` (adapter `PrismaPg` com `DATABASE_URL`), declarar o comando de seed em `prisma.config.ts` (`migrations.seed`, confirmado nos tipos do `@prisma/config` instalado) e expor `npm run seed`. Escopo de dados inalterado: Company "PureUrban Dev" + admin `admin@pureurban.dev`, idempotente.

</frozen-after-approval>

## Implementation Notes

- **Runner: `ts-node` → `tsx` (novo devDependency).** Surpresa da implementação: mesmo com o
  adapter corrigido, o `ts-node` em modo CJS não resolve o import relativo com extensão `.js`
  do cliente gerado (`../src/generated/prisma/client.js` → `client.ts`) — `MODULE_NOT_FOUND`.
  O `tsx` resolve `.js` → `.ts` sob nodenext nativamente. O `ts-node` permanece instalado mas
  ficou sem consumidor (o hook `prisma.seed` removido era seu único uso).
- `import 'dotenv/config'` no `seed.ts` para o processo do seed resolver `DATABASE_URL`
  independentemente do forwarding de env do Prisma (espelha o `prisma.config.ts`).
- `package.json`: script `seed` adicionado (`prisma db seed`); hook `prisma.seed` removido
  (config morta sob Prisma 7 — a declaração canônica vive em `prisma.config.ts`).
- `mobile/README.md`: nota "O seed não funciona" + workaround de curl substituídos por
  `npm run seed` (empresa `PureUrban Dev`, admin `admin@pureurban.dev` / `admin123456`).
- `api/tests/support/helpers/seed-helpers.ts`: comentário de cabeçalho citava "a Story 1.9
  está quebrada" como justificativa da política via-API; a política permanece (tenant
  isolado por spec), só a justificativa mudou.
- **Verificação executada (2026-09-07):** dev DB (dados pré-existentes da 1.6) → skip
  idempotente; banco novo `pureurban_seed_check` → `prisma migrate deploy` + seed criou
  Company + Admin (`$2b$12$`); `bcrypt.compare('admin123456', hash) === true`; 2ª execução
  pula; 206 testes unitários verdes; banco de teste descartado.
- Nota: o banco de dev já contém a empresa `PureUrban Dev` (criada via workaround de
  registro da Story 1.6), por isso o caminho de criação foi provado em banco scratch.
- **Review (blind-hunter, 07/09/2026): 9 findings → 5 patch, 2 defer, 2 rejected.**
  Patches: guard de `DATABASE_URL` com falha legível; header do seed reescrito (dev-only,
  pré-requisito `api/.env`, idempotência); frase de idempotência no `mobile/README.md`;
  `ts-node` e `tsconfig-paths` removidos (sem consumidor — verificado por grep). Defers e
  rejected: ver `## Review Triage Log` e `deferred-work.md`.

## Review Triage Log

- **Dead devDeps (`ts-node`, `tsconfig-paths`)** — low → **patched.** `ts-node` ficou órfão
  com a troca por `tsx` (causa desta mudança); `tsconfig-paths` pré-existente sem uso, mas a
  correção é deleção simples verificada (zero referências em configs/scripts).
- **Gate de idempotência só confere a empresa** (admin apagado → skip silencioso; e-mail sob
  outra empresa → P2002 cru) — medium, real (`findFirst` por nome; `@@unique([email])` em
  schema.prisma:49) → **deferred**: pré-existente, não causado pela mudança; a correção exige
  decidir semântica de re-seed parcial. Registrado em `deferred-work.md`.
- **README promete criação sem mencionar idempotência** — low → **patched** (frase
  "Idempotente: ... imprime `Skipping.`" no passo 5 do `mobile/README.md`).
- **Pré-requisito `api/.env` não documentado no seed** — low → **patched** (header do seed
  agora diz "requires ... api/.env — copy .env.example" e o guard imprime a instrução).
- **Cast `as string` sem guarda + sugestão de factory compartilhada de adapter** — split:
  guarda **patched** (falha legível apontando o `.env.example`); factory compartilhada
  **rejected** (low: dois call sites byte-idênticos ao `PrismaService` são o padrão do repo;
  abstrair acrescenta mais do que o dano que evita).
- **AGENTS.md sem `npm run seed` na lista de comandos** — low → **deferred** (o loop de
  review não edita AGENTS.md; registrado em `deferred-work.md` para edição avulsa).
- **Seed falha com `--omit=dev`** (prisma/tsx/dotenv são devDeps) — low → **patched** via
  "dev-only" no header do seed (seeding é operação de dev; prod usa `POST /auth/register`).
- **`.finally($disconnect)` morto no caminho de falha** (`process.exit` no catch) — low,
  **rejected**: pré-existente e sem efeito observável (o exit fecha os sockets e o Postgres
  limpa a conexão); reestruturar o cleanup funcional não vale o churn.
- **"Drift" `migrate dev` (seed.ts) vs `migrate deploy` (README)** — **false**: não há drift —
  o header segue o fluxo dev canônico do AGENTS.md (`migrate dev` + `generate`); o `deploy`
  do `mobile/README.md` atende outro momento (aplicar migrações existentes para rodar o app).
  Ambos chegam ao mesmo estado num clone novo.
