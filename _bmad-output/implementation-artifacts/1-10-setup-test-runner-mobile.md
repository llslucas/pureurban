---
title: 'Story 1.10: Setup do Test Runner no Mobile (jest-expo)'
type: 'chore'
created: '2026-08-30'
status: 'done'
review_loop_iteration: 0
baseline_commit: '4f350cc1e5256d4354f28ef6c618504cfe6970c0'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O `mobile/` não tem test runner desde a Story 1.5 — sem script `test`,
sem framework nas `devDependencies`. O custo já apareceu: a divergência `ROLE_ROUTES` ×
guards de `_layout.tsx` produz loop de redirect silencioso sem nada vigiando (defer da
1.8); `decodeQrPayload` e o mapa código-de-erro → feedback foram verificados só no olho
(open question #1 das 3.2b/3.3b); e a Story 3.4b (fila offline: FIFO, backoff 1s→30s,
≤5 tentativas, idempotência entre reinícios) é inviável de validar manualmente. A 3.4b
está bloqueada por esta story.

**Approach:** Instalar o preset oficial `jest-expo` + `@testing-library/react-native`,
adicionar `babel.config.js` e a config do Jest, expor `npm test` / `npm run test:watch`,
e provar o harness com uma suíte inicial sobre a lógica pura que motivou a decisão —
`role-routes` e `qr-payload` — mais um render de componente para exercer a metade RN.
Nenhum arquivo de produto muda.

## Boundaries & Constraints

**Always:**
- `jest-expo` como preset; versão resolvida por `npx expo install` (autoridade sobre o npm).
- Testes em `src/**/*.test.ts(x)`; cada arquivo passa em `npx tsc --noEmit` e `npm run lint`.
- `npm test` roda sem device, emulador, rede, Docker ou `.env`.
- A suíte inicial cobre só funções puras já existentes + um render trivial — nada exige
  mock de módulo nativo.

**Ask First:**
- Adicionar dependência além de `jest-expo`, `jest`, `@types/jest`,
  `@testing-library/react-native`, `react-test-renderer`.
- Testar código que abre `expo-sqlite`/wa-sqlite sob Jest — driver/mock do SQLite é
  decisão de design da 3.4b, não resolver aqui.

**Never:**
- Alterar comportamento de arquivo `src/` que não seja teste (ex.: extrair `describeFailure`
  de `scan.tsx` é outra story). Tocar em `api/`.
- Vitest, ts-jest, runner caseiro, ou snapshots de componentes RN.
- Configurar CI. Marcar subtask de verificação sem ter rodado o comando.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `npm test` sem device/rede/`.env` | branch da story | exit 0, 0 falhas, < 30s | — |
| `homeForRole` papel válido / chave de protótipo | `'DRIVER'` / `'constructor'` | `/(driver)/trip` / `null` (não a função herdada) | retorna null, não lança |
| `ROLES` × `ROLE_ROUTES` | — | todo papel tem `group`+`home`; `home` começa com seu `group` | — |
| `decodeQrPayload` round-trip / forjado | saída de `encodeQrPayload` / QR de URL, JSON truncado, sem campo, UUID inválido, extras | objeto com 2 campos válidos / `null`, extras nunca vazam | retorna null, nunca lança |
| render de componente RN | componente do codebase sem dep nativa sob `render()` | monta e encontra o texto esperado | — |

</frozen-after-approval>

## Code Map

- `mobile/package.json` -- sem script `test`; devDeps = `@types/react`, `eslint`,
  `eslint-config-expo`, `openapi-typescript`, `typescript`. Runner entra aqui.
- `mobile/babel.config.js` -- **não existe**. O app builda porque o Metro injeta
  `babel-preset-expo`; o `babel-jest` do `jest-expo` lê a config do projeto e sem esse
  arquivo não aplica os transforms → `import 'react-native'` quebra.
- `mobile/eslint.config.js` -- flat config: `expoConfig` + `ignores: ["dist/*"]`. Pode
  precisar de um bloco `jest` restrito aos globs de teste.
- `mobile/tsconfig.json` -- `extends expo/tsconfig.base`, `strict`, paths `@/*`. Sem `types`
  explícito — `@types/jest` deve ser captado automaticamente.
- `mobile/metro.config.js` -- COOP/COEP + `assetExts` wasm (wa-sqlite). Contexto: node/jsdom
  não tem OPFS — testar a fila é problema da 3.4b.
- `mobile/src/utils/role-routes.ts` -- `ROLE_ROUTES`, `ROLES`, `homeForRole`. Puro. Alvo
  (defer da 1.8, `deferred-work.md` ~linha 150).
- `mobile/src/utils/qr-payload.ts` -- `encodeQrPayload` / `decodeQrPayload` (este da 3.3b).
  Puro. Alvo (open question #1 das 3.2b/3.3b).
- `mobile/src/hooks/use-theme.ts` (+ `use-color-scheme.ts`) -- candidato ao render de smoke
  test (consome `useColorScheme`, sem dep nativa).
- `mobile/src/app/(driver)/scan.tsx` -- `describeFailure` é inline e não exportado; **não
  extrair aqui** — anotado para 3.4b/3.5b.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- adicionar
  `1-10-setup-test-runner-mobile: backlog` no Epic 1; anotar que bloqueia a 3.4b.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 2 itens endereçados. Append,
  não editar entradas existentes.
- `CLAUDE.md` -- bloco "Comandos" / Mobile não cita `npm test`.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/package.json` -- `npx expo install jest-expo` (resolveu `~55.0.22`, movido para
  devDeps); adicionadas `jest@^29`, `@types/jest@^29`, `@testing-library/react-native` e
  `react-test-renderer@19.2.0` às devDeps; scripts `"test": "jest"` e `"test:watch": "jest --watch"`.
  Nota: `@testing-library/react-native` fixado em `^13` — a v14 exige o peer `test-renderer@^1`
  (novo renderer do RN) inexistente no SDK 55; a v13 usa `react-test-renderer@19.2.0`.
- [x] `mobile/babel.config.js` -- novo; forma de função com `api.cache(true)`, `presets: ['babel-preset-expo']`.
- [x] `mobile/jest.config.js` -- novo; `preset: 'jest-expo'`; `testMatch` estende o default do Jest
  (`src/**/*.{test,spec}.{ts,tsx,js,jsx}` + `src/**/__tests__/**`); `collectCoverage: false`.
  `setupFilesAfterEnv` não foi necessário. Sem `moduleNameMapper` — nenhum teste importa CSS.
- [x] `mobile/eslint.config.js` -- não alterado: `npm run lint` já passa limpo sobre os arquivos
  de teste (os globals de Jest são reconhecidos). Nenhum bloco extra necessário.
- [x] `mobile/src/utils/role-routes.test.ts` -- novo; `homeForRole` (válido, chaves de
  `Object.prototype` → null, role desconhecido não lança) e cobertura da união `UserRole`
  (`ROLES` sorted === `['ADMIN','DRIVER','STUDENT']`) + `group`/`home` de cada papel.
- [x] `mobile/src/utils/qr-payload.test.ts` -- novo; round-trip + normalização de UUID maiúsculo +
  descarte de extras + tabela de 15 entradas forjadas/malformadas, todas → `null`, nenhuma lança.
- [x] `mobile/src/smoke-render.test.tsx` -- novo (renomeado de `use-theme.test.tsx` no review);
  renderiza `<Text>ok</Text>` sob `render()` e assere via `screen.getByText('ok')`. Sem
  acoplamento a módulo de produto/template — prova só o transform RN ponta a ponta.
- [x] `mobile/.nvmrc` -- novo; `22` (padrão do repo; o toolchain do Jest foi verificado em Node 24).
- [x] `mobile/README.md` -- `npm test` / `npm run test:watch` na seção "Convenções".
- [x] `_bmad-output/project-context.md` -- parágrafo "Mobile (Story 1.10)" na seção "Regras de Testes".
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `1-10-setup-test-runner-mobile: in-progress`
  logo após a 1.9, com comentário; nota de bloqueio na 3.4b; `last_updated` atualizado.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- nova seção "Endereçado pela Story 1.10",
  append ao fim. Entradas existentes intactas.
- [x] `CLAUDE.md` -- `npm test` / `npm run test:watch` adicionados ao bloco Mobile de "Comandos".

**Acceptance Criteria:**
- Given a branch da story, when `cd mobile && npm test`, then a suíte roda sem
  device/emulador/rede/`.env` e todos passam (≥ 3 arquivos: role-routes, qr-payload, render RN).
- Given `cd mobile && npx tsc --noEmit`, then 0 erros com os testes incluídos.
- Given `cd mobile && npm run lint`, then limpo (0/0), sem `eslint-disable` novo.
- Given a 3.4b prestes a começar, then existe `npm test` verde e o bloqueio no
  `sprint-status.yaml` está resolvido.

## Design Notes

- **`babel.config.js` novo:** o app compila sem ele (Metro injeta `babel-preset-expo`), mas
  o `babel-jest` do `jest-expo` lê a config do projeto; sem o arquivo os transforms de
  Flow/TSX/React-Compiler não rodam e todo `import 'react-native'` quebra.
- **Só puras + 1 render na suíte inicial:** provar o harness e travar as duas propriedades
  que já quebraram (mapa de papéis, parser de QR). Cobertura de telas é das stories que as tocam.
- **Fila da 3.4b fora:** `expo-sqlite` sob node/jsdom não tem SQLite nativo nem OPFS; a
  escolha entre mock do `jest-expo`, `better-sqlite3` de teste, ou abstrair o storage da fila
  é design da 3.4b.
- `react-test-renderer` fixado em `19.2.0` para casar com `react`.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: todos verdes, exit 0, sem "Cannot find module", < 30s.
- `cd mobile && npx tsc --noEmit` -- expected: 0 erros.
- `cd mobile && npm run lint` -- expected: limpo, 0/0.
- `cd mobile && env -u EXPO_PUBLIC_API_URL npm test` -- expected: passa sem `.env`.
- `git diff --stat` -- expected: nenhum arquivo `src/` fora de `*.test.*`; nenhum `api/`.

## Suggested Review Order

**O que é o runner (comece aqui)**

- Preset `jest-expo`, `testMatch` que ESTENDE o default do Jest (`.spec` e `__tests__/` inclusos), coverage off.
  [`jest.config.js:5`](../../mobile/jest.config.js#L5)

- Forma de função com `api.cache(true)` — o `babel-jest` precisa desta config; o app já buildava sem ela via Metro.
  [`babel.config.js:4`](../../mobile/babel.config.js#L4)

- Cinco devDeps novas; `@testing-library/react-native` em `^13` (a v14 exige um peer ausente no SDK 55).
  [`package.json:58`](../../mobile/package.json#L58)

- Node fixado em 22, alinhado a `api/.nvmrc` (o toolchain foi verificado em 24).
  [`.nvmrc:1`](../../mobile/.nvmrc#L1)

**A suíte-semente (prova o harness + trava o que já quebrou)**

- `homeForRole` com chave de `Object.prototype` → `null`, e a união `UserRole` travada em runtime (não só via `satisfies`).
  [`role-routes.test.ts:12`](../../mobile/src/utils/role-routes.test.ts#L12)

- Parser de QR não confiável: round-trip, normalização de UUID e 15 entradas forjadas → `null` sem lançar.
  [`qr-payload.test.ts:33`](../../mobile/src/utils/qr-payload.test.ts#L33)

- Render de um primitivo `react-native` puro — prova o transform RN sem acoplar a módulo de produto/template.
  [`smoke-render.test.tsx:6`](../../mobile/src/smoke-render.test.tsx#L6)

**Planejamento e docs**

- Story entra no Epic 1 como `in-progress`; comentário de bloqueio na 3.4b.
  [`sprint-status.yaml:99`](sprint-status.yaml#L99)

- O que a 1.10 fecha, o que fica aberto (metade da open question #1, fila da 3.4b, migração RNTL v14).
  [`deferred-work.md:151`](deferred-work.md#L151)

- Runner do mobile documentado na seção de testes; comandos em `CLAUDE.md` e `mobile/README.md`.
  [`project-context.md:130`](../project-context.md#L130)
