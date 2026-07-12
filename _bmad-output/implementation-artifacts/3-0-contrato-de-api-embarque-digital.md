---
baseline_commit: e01e9f988a6c871371ba7a7aeb2d3cedb9a2e2b3
---

# Story 3.0: Contrato de API — Embarque Digital

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero o contrato da API de embarque acordado e versionado antes de qualquer implementação,
Para que as trilhas de backend e mobile trabalhem em paralelo sem divergir.

## Acceptance Criteria

1. **Given** os endpoints de embarque ainda não existem
   **When** defino o contrato
   **Then** `POST /api/v1/boarding/check-in` está declarado com DTO de entrada, DTO de resposta e decorators Swagger completos (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)

2. **And** `GET /api/v1/trips/:id/students` está declarado com o shape da lista e os status possíveis (`CHECKED_IN`, `NOT_CHECKED_IN`, `NOT_RETURNING`)

3. **And** o payload do QR code está especificado como schema compartilhado (`studentId`, `sessionId`, formato de codificação) — é o contrato entre a tela do aluno (3.2b) e a validação do backend (3.3a)

4. **And** o header `X-Idempotency-Key` está documentado nos endpoints de escrita (pré-requisito do offline — Architecture §5, Tier 2)

5. **And** os códigos de erro tipados estão declarados (`INVALID_QR_CODE`, `STUDENT_NOT_ALLOWED`, `TRIP_NOT_ACTIVE`, `DUPLICATE_CHECK_IN`)

6. **And** `npm run openapi:export` gera `api/openapi.json` e o arquivo está commitado

7. **And** o mobile gera `src/types/api.d.ts` a partir do `openapi.json` via `openapi-typescript`

8. **And** handlers MSW para os endpoints do épico existem em `mobile/src/mocks/`, retornando respostas conformes ao contrato

9. **And** os controllers retornam `501 Not Implemented` — o contrato existe, a lógica não

**Camada:** Contrato · **Depende de:** — · **FRs:** habilitador (nenhum diretamente) · **Bloqueia:** 3.2b, 3.3a, 3.3b, 3.5b

## Tasks / Subtasks

- [x] Task 1 — Especificação do contrato: DTOs de boarding (AC: #1, #3, #4, #5)
  - [x] 1.1 Criar `api/src/domains/boarding/shell/http/dtos/check-in.dto.ts` com `CheckInRequestDto` (`studentId` UUID, `tripId` UUID) e `CheckInResponseDto` (`id`, `studentId`, `tripId`, `checkedInAt` ISO 8601, `status: 'CHECKED_IN'`) — todos os campos com `@ApiProperty` (description + example)
  - [x] 1.2 Criar `api/src/domains/boarding/shell/http/dtos/qr-code-payload.dto.ts` com `QrCodePayloadDto` (`studentId` UUID, `sessionId` UUID) e a documentação do formato de codificação (ver Dev Notes — Contrato do QR Code)
  - [x] 1.3 Criar `api/src/domains/boarding/shell/http/dtos/index.ts` com barrel exports (padrão do routing)

- [x] Task 2 — Especificação do contrato: DTOs de lista de alunos da viagem (AC: #2)
  - [x] 2.1 Criar `api/src/domains/trip/shell/http/dtos/trip-students.dto.ts` com enum `BoardingStatusDto` (`CHECKED_IN`, `NOT_CHECKED_IN`, `NOT_RETURNING`), `TripStudentItemDto` (`studentId`, `name`, `status`, `checkedInAt?` nullable) e `TripStudentsResponseDto` (`students: TripStudentItemDto[]`, `summary: { boarded: number, total: number }`)
  - [x] 2.2 O `summary` é declarado como DTO próprio (`BoardingSummaryDto`) para virar schema nomeado no openapi.json — a contagem NUNCA é calculada no cliente (FR25, pré-requisito da 3.5a/3.5b)

- [x] Task 3 — Envelope de resposta no contrato (AC: #1, #2, #6)
  - [x] 3.1 Criar decorator helper `api/src/domains/shared/shell/decorators/api-data-response.decorator.ts` que documenta o envelope real `{ data: T, meta: { timestamp } }` produzido pelo `ResponseWrapperInterceptor` (via `ApiExtraModels` + `getSchemaPath` — ver Dev Notes)
  - [x] 3.2 Criar `ErrorResponseDto` documentando o envelope de erro `{ error: { code, message, details? } }` produzido pelo `EffectExceptionFilter` — usar nos `@ApiResponse` de erro com os códigos por status
  - [x] 3.3 Aplicar o helper nos dois endpoints desta story — o openapi.json DEVE refletir o shape HTTP real, senão os tipos gerados no mobile mentem

- [x] Task 4 — Controller stub de boarding (AC: #1, #4, #5, #9)
  - [x] 4.1 Criar `api/src/domains/boarding/shell/http/boarding.controller.ts`: `@ApiTags('boarding')`, `@ApiBearerAuth()`, `@Controller('api/v1/boarding')`, `@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)`, `@Roles(['DRIVER'])` — seguir o padrão do `routing.controller.ts` (NÃO o do `trip.controller.ts`, que tem JwtAuthGuard pendente da review da 3.1)
  - [x] 4.2 `POST /check-in` com `@HttpCode(HttpStatus.CREATED)`, `@ApiOperation`, `@ApiHeader({ name: 'X-Idempotency-Key', required: true, description: ... })`, `@ApiBody({ type: CheckInRequestDto })` e `@ApiResponse` para 201 (envelope com `CheckInResponseDto`), 400 `INVALID_QR_CODE`, 401, 403 `STUDENT_NOT_ALLOWED`, 409 `TRIP_NOT_ACTIVE`, 409 `DUPLICATE_CHECK_IN`, 501
  - [x] 4.3 Corpo do método: `throw new NotImplementedException({ code: 'NOT_IMPLEMENTED', message: 'Contrato declarado na Story 3.0 — implementação na Story 3.3a' })` — ZERO lógica, zero core/, zero Prisma
  - [x] 4.4 Registrar `QrCodePayloadDto` como schema no documento OpenAPI via `@ApiExtraModels(QrCodePayloadDto)` no controller (o payload não aparece em nenhum request/response — sem isso ele não entra no openapi.json)
  - [x] 4.5 Criar `api/src/domains/boarding/shell/boarding.module.ts` (somente controller — sem providers, sem runtime Effect por enquanto) e importar `BoardingModule` no `app.module.ts`

- [x] Task 5 — Endpoint stub na TripController (AC: #2, #9)
  - [x] 5.1 Adicionar `@Get(':id/students')` ao `api/src/domains/trip/shell/http/trip.controller.ts` existente, com `@ApiOperation`, `@ApiParam('id')` e `@ApiResponse` para 200 (envelope com `TripStudentsResponseDto`), 401, 403, 404 `TRIP_NOT_FOUND`, 501 — corpo lança `NotImplementedException` (mesmo formato da Task 4.3)
  - [x] 5.2 NÃO alterar os endpoints existentes nem os guards do controller — o religamento do `JwtAuthGuard` e a correção de `@Roles(['driver'])` → `['DRIVER']` são escopo da review da Story 3.1 (em andamento). Declarar a rota DEPOIS de `@Get('active')` na ordem do arquivo (disciplina de resolução de rotas — lição da 2.6)

- [x] Task 6 — Script `openapi:export` (AC: #6)
  - [x] 6.1 Extrair a configuração Swagger de `api/src/main.ts` para `api/src/swagger.ts` exportando `createOpenApiDocument(app)` — main.ts e o script de export usam a MESMA função (evita drift entre Swagger runtime e contrato exportado)
  - [x] 6.2 Criar `api/scripts/export-openapi.ts`: `import 'dotenv/config'` → `NestFactory.create(AppModule, { logger: false })` → `createOpenApiDocument(app)` → `writeFileSync('openapi.json', JSON.stringify(doc, null, 2))` → `app.close()`. NÃO chamar `app.listen()` nem `app.init()` — é isso que evita o `$connect()` do PrismaService e permite exportar sem banco de pé (ver Dev Notes)
  - [x] 6.3 Adicionar script em `api/package.json`: `"openapi:export": "nest build && node dist/scripts/export-openapi.js"` — DESVIO CONSCIENTE do comando sugerido (`ts-node scripts/export-openapi.ts`): `ts-node` em modo CJS não resolve imports com extensão `.js` que apontam para `.ts` fonte (Node CJS resolver não remapeia `.js`→`.ts`; só o resolvedor de tipos do TS faz isso). Mesma limitação já existe latente em `prisma/seed.ts`. `nest build` já compila `scripts/` para `dist/scripts/` (tsconfig.build.json não restringe `include`), então rodar o `.js` compilado funciona de forma confiável e determinística.
  - [x] 6.4 Rodar `npm run openapi:export` e commitar `api/openapi.json`. Validar que o documento contém: os 2 paths, os schemas `CheckInRequestDto`, `CheckInResponseDto`, `QrCodePayloadDto`, `TripStudentsResponseDto`, `BoardingSummaryDto`, `ErrorResponseDto` e o enum de status com os 3 valores

- [x] Task 7 — Mobile: geração de tipos (AC: #7)
  - [x] 7.1 `cd mobile && npm i -D openapi-typescript` (v7.x — latest 7.13.0)
  - [x] 7.2 Adicionar script em `mobile/package.json`: `"openapi:types": "openapi-typescript ../api/openapi.json -o src/types/api.d.ts"`
  - [x] 7.3 Rodar e commitar `mobile/src/types/api.d.ts`. Validar com `npx tsc --noEmit`. REGRA ABSOLUTA: este arquivo nunca é editado à mão (Architecture §8, regra 11)

- [x] Task 8 — Mobile: handlers MSW (AC: #8)
  - [x] 8.1 `cd mobile && npm i -D msw` (v2.x)
  - [x] 8.2 Criar `mobile/src/mocks/polyfills.ts` (importado ANTES do MSW): `react-native-url-polyfill/auto`, `fast-text-encoding` (instalar ambos como deps) + stubs mínimos de `MessageEvent`/`Event`/`EventTarget`/`BroadcastChannel` se o Hermes reclamar na inicialização (ver Dev Notes — MSW em React Native)
  - [x] 8.3 Criar `mobile/src/mocks/handlers/boarding.handlers.ts` com handlers para `POST */api/v1/boarding/check-in` e `GET */api/v1/trips/:id/students` — respostas SEMPRE no envelope `{ data, meta }` (sucesso) e `{ error: { code, message } }` (erro), tipadas com os tipos gerados de `api.d.ts`
  - [x] 8.4 Comportamento dos handlers: (a) check-in feliz retorna 201; (b) repetir a MESMA `X-Idempotency-Key` retorna a MESMA resposta sem duplicar (Map em memória por key); (c) cada código de erro do contrato é disparável por `studentId` sentinela documentado em comentário (ex.: UUID terminado em `...0001` → `INVALID_QR_CODE`, `...0002` → `STUDENT_NOT_ALLOWED`, `...0003` → `TRIP_NOT_ACTIVE`, `...0004` → `DUPLICATE_CHECK_IN`); (d) estado em memória compartilhado: check-ins feitos refletem na lista de `GET /trips/:id/students` e no `summary.boarded` — isso é o que permite a 3.3b e a 3.5b se integrarem contra o mock
  - [x] 8.5 Criar `mobile/src/mocks/server.ts` (`setupServer` de **`msw/native`** — NUNCA `msw/node`) e `mobile/src/mocks/index.ts` com `enableMocking()` async
  - [x] 8.6 Ligar no root layout `mobile/src/app/_layout.tsx`: gate `isMockReady` no mesmo padrão do gate `isDbReady` existente, ativado somente quando `__DEV__ && process.env.EXPO_PUBLIC_USE_MOCKS === '1'` — desligar mocks na Story 3.6 é só remover a env var

- [x] Task 9 — Verificação e drift guard local (AC: todos)
  - [x] 9.1 `cd api && npm run build` — 0 erros
  - [x] 9.2 `cd api && npm test` — todos os testes existentes passando (144/144, nenhuma regressão; esta story não muda comportamento de nenhum endpoint existente)
  - [x] 9.3 `cd api && npm run lint` e `npm run format` limpos — `format` sem alterações; `lint` reporta 149 erros/59 warnings, todos em arquivos NÃO tocados por esta story (pré-existentes na baseline, confirmado via `git status --porcelain`); nenhum arquivo novo/modificado desta story aparece na saída do lint
  - [x] 9.4 Rodar `npm run openapi:export` uma segunda vez e conferir `git diff --exit-code api/openapi.json` — o export é determinístico e o commitado não diverge do gerado (é o drift check da §12, executado manualmente até o CI existir). Validado 2x nesta sessão (antes e depois da correção do tipo `checkedInAt`)
  - [x] 9.5 `cd mobile && npx tsc --noEmit` — tipos gerados compilam junto com o app; os 2 erros restantes (`login.tsx` typed routes) são pré-existentes na baseline (confirmado via `git stash`), não relacionados a esta story

### Review Findings

_Code review adversarial (3 camadas: Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 2026-07-12._

**Decisões resolvidas (Lucas, 2026-07-12) — viram patches:**

- [x] [Review][Decision] `INVALID_QR_CODE` (400) é um erro que o backend não tem como produzir — o body é `{ studentId, tripId }` já decodificado, então o servidor nunca vê o QR do qual concluiria invalidez. **Decisão: MANTER o código, redefinindo a semântica** para "`studentId`/`tripId` ausente ou malformado" (validação de shape do body). O nome fica infeliz, mas o código passa a ser alcançável, o AC #5 é satisfeito e o wire format não muda. Vira patch: atualizar a `description` do `@ApiResponse` 400 e o comentário de sentinela no mock para refletir a nova semântica.
- [x] [Review][Decision] `msw` em `devDependencies` sendo alcançável de código de app (Metro não faz code splitting; `npm ci --omit=dev` quebraria). **Decisão: MOVER `msw` para `dependencies`**, consistente com `react-native-url-polyfill` e `fast-text-encoding`, que já estão lá pelo mesmo motivo. Desvio consciente da Task 8.1 (que mandou `npm i -D msw`). Vira patch, junto com a correção da Completion Note "sem custo em produção" (o custo de runtime é zero; o de bundle não).

**Patches (fix não-ambíguo):**

- [x] [Review][Patch] Redefinir a semântica de `INVALID_QR_CODE` para "shape do body inválido" na `description` do `@ApiResponse` 400 e no comentário de sentinelas do mock (decisão acima) [api/src/domains/boarding/shell/http/boarding.controller.ts:53]
- [x] [Review][Patch] Mover `msw` de `devDependencies` para `dependencies` e corrigir a Completion Note "sem custo em produção" (decisão acima) [mobile/package.json:50]

- [x] [Review][Patch] `openapi.json` referencia o security scheme `bearer` sem nunca declará-lo — documento OpenAPI inválido [api/src/swagger.ts:5]
- [x] [Review][Patch] `GET /trips/{id}/students`: `@ApiParam` sem `type` → `schema: {}` no contrato → `id: unknown` nos tipos gerados, inutilizável pela 3.5b [api/src/domains/trip/shell/http/trip.controller.ts:100]
- [x] [Review][Patch] `GET /trips/{id}/students` sem `@ApiBearerAuth()` → contrato exportado não declara auth nenhuma, contradizendo a tabela de contrato §2 da própria story [api/src/domains/trip/shell/http/trip.controller.ts:96]
- [x] [Review][Patch] Mock aceita check-in SEM `X-Idempotency-Key`, que o contrato declara `required: true` — a 3.3b/3.4b desenvolvem contra um mock que aceita o que a API real deve rejeitar [mobile/src/mocks/handlers/boarding.handlers.ts:41]
- [x] [Review][Patch] Mock cacheia respostas de ERRO sob a idempotency key → um `TRIP_NOT_ACTIVE` transitório fica pinado para sempre naquela key, e a fila offline (que reenvia com a MESMA key) nunca consegue ter sucesso [mobile/src/mocks/handlers/boarding.handlers.ts:53]
- [x] [Review][Patch] Mock: check-in de `studentId` fora dos 3 alunos mockados retorna 201 mas não aparece na lista — inclui o exemplo documentado no próprio DTO. Quebra o invariante "check-in reflete na lista" que é a razão de existir do estado compartilhado (Task 8.4d) [mobile/src/mocks/handlers/boarding.handlers.ts:69]
- [x] [Review][Patch] Mock: `GET /trips/:id/students` ignora `:id` → todas as viagens compartilham o mesmo roster e o `404 TRIP_NOT_FOUND` declarado no contrato é inalcançável [mobile/src/mocks/handlers/boarding.handlers.ts:82]
- [x] [Review][Patch] Mock: `DUPLICATE_CHECK_IN` é inalcançável por estado real — segundo check-in do mesmo aluno com key diferente (a definição da própria story) retorna 201 e sobrescreve o `checkedInAt` [mobile/src/mocks/handlers/boarding.handlers.ts:69]
- [x] [Review][Patch] Mock: body malformado (`studentId` ausente ou não-string) estoura `TypeError` em `.slice(-4)` → o cliente vê falha de transporte em vez do `400 INVALID_QR_CODE` do contrato [mobile/src/mocks/handlers/boarding.handlers.ts:48]
- [x] [Review][Patch] Mock nunca produz `NOT_RETURNING` — o terceiro status que o contrato insiste em declarar AGORA porque "o mobile (3.5b) já renderiza os 3" não tem mock contra o qual ser desenvolvido [mobile/src/mocks/handlers/boarding.handlers.ts:21]
- [x] [Review][Patch] `enableMocking()` falhando abre o gate mesmo assim (`.catch(console.error).finally(setIsMockReady(true))`) → o app monta e vai à rede real enquanto o dev acredita estar em mock. Agravado por `onUnhandledRequest: 'bypass'`, que também esconde erro de path nos handlers [mobile/src/app/_layout.tsx:38]
- [x] [Review][Patch] AC #3 não satisfeito no artefato que importa: o formato de codificação do QR ("JSON compacto UTF-8, sem base64") existe só como docblock TS e não entra no `openapi.json` — a 3.2b, consumidora pretendida, nunca o vê [api/src/domains/boarding/shell/http/dtos/qr-code-payload.dto.ts:3]
- [x] [Review][Patch] Handlers MSW só parcialmente tipados contra `api.d.ts`: o handler do GET e todos os bodies de erro são objetos literais soltos. O "teste de conformidade dos mocks" (o `tsc`, segundo a própria seção Testing Requirements) tem buraco exatamente no endpoint do `summary` (FR25) [mobile/src/mocks/handlers/boarding.handlers.ts:82]
- [x] [Review][Patch] Contrato não declara `format: uuid` em `studentId`/`tripId` — o `@IsUUID()` do class-validator não emite nada para o Swagger (e é inerte, ver defer abaixo). O contrato, cuja função é ser inequívoco, não diz que esses campos são UUIDs [api/src/domains/boarding/shell/http/dtos/check-in.dto.ts:9]
- [x] [Review][Patch] `export-openapi.ts` escreve em path relativo ao `cwd` → rodado de qualquer lugar que não `api/`, grava o documento em outro lugar e o drift check da Task 9.4 (`git diff --exit-code api/openapi.json`) passa vacuamente. Promise flutuante sem `.catch`/exit code [api/scripts/export-openapi.ts:10]
- [x] [Review][Patch] `EXPO_PUBLIC_USE_MOCKS` é indescobrível: referenciado num único arquivo, sem `.env.example` no mobile, sem README. As trilhas paralelas que esta story existe para desbloquear não têm como saber ligar o mock [mobile/src/mocks/index.ts:2]
- [x] [Review][Patch] Os `@ApiResponse` de 501 não declaram `type: ErrorResponseDto` com base numa premissa falsa dos Dev Notes ("o 501 sai no formato default do NestJS"). O `EffectExceptionFilter` normaliza `HttpException` para `{ error: { code, message } }` — a única resposta que estes endpoints de fato retornam hoje é a única que o contrato não descreve [api/src/domains/boarding/shell/http/boarding.controller.ts:53]
- [x] [Review][Patch] `import { createOpenApiDocument } from './swagger'` sem extensão `.js`, violando a regra 3 dos Dev Notes (imports relativos com extensão em arquivos da API) [api/src/main.ts:4]

**Deferidos (pré-existentes, não causados por esta story):**

- [x] [Review][Defer] Tipos gerados são inúteis para 11 dos request bodies existentes — `TypeLiteralClass`/`RefineClass` colapsam em `Record<string, never>` colidentes [mobile/src/types/api.d.ts:383] — deferred, pre-existing (causa raiz: classes Effect Schema usadas como `@Body` em auth/driver/student/routing não produzem metadata Swagger)
- [x] [Review][Defer] Não existe `ValidationPipe` global na API — `@IsUUID()` e todo class-validator nos DTOs do shell são código morto [api/src/main.ts:1] — deferred, pre-existing (mesmo padrão já em `create-trip.dto.ts`; decidir entre `ValidationPipe` global e `EffectSchemaPipe` é escopo da 3.3a)
- [x] [Review][Defer] `api-client.ts` não expõe headers por requisição — `post<T>(path, body)` é estruturalmente incapaz de enviar o `X-Idempotency-Key` que o contrato exige [mobile/src/services/api-client.ts:155] — deferred, pre-existing (o cliente HTTP é escopo da 3.3b/3.4b; registrado aqui porque o contrato agora depende disso)

## Dev Notes

### O que esta story É e o que ela NÃO É

- **É:** declaração de contrato — DTOs anotados, controllers stub 501, `openapi.json` commitado, tipos gerados e mocks MSW. É a story que desbloqueia as trilhas paralelas do Épico 3 (Architecture §9, §12).
- **NÃO é:** implementação. ZERO código em `core/` (sem use-cases, sem ports, sem erros tagueados), ZERO mudança no `schema.prisma`, ZERO migração, ZERO runtime Effect novo. As entidades de boarding nascem na Story 3.3a.
- `api/src/domains/boarding/` já existe como scaffold vazio (só `.gitkeep`) — usar a estrutura existente, não recriar.

### Contrato — Decisões que precisam ficar cravadas no openapi.json

**1. `POST /api/v1/boarding/check-in`**

| Item | Valor |
|---|---|
| Auth | Bearer JWT, role `DRIVER` (motorista escaneia e envia) |
| Header | `X-Idempotency-Key: <uuid v4>` obrigatório — id gerado no cliente, chave da fila offline (Architecture §5 Tier 2) |
| Request | `{ studentId: uuid, tripId: uuid }` — o app do motorista DECODIFICA o QR e envia campos estruturados; o QR bruto nunca trafega |
| Response 201 | `{ data: { id, studentId, tripId, checkedInAt, status: 'CHECKED_IN' }, meta: { timestamp } }` |
| Erros | 400 `INVALID_QR_CODE` · 403 `STUDENT_NOT_ALLOWED` · 409 `TRIP_NOT_ACTIVE` · 409 `DUPLICATE_CHECK_IN` |

Semântica de idempotência a documentar na description do header (implementada na 3.3a): mesma key → retorna o resultado anterior com 201, sem duplicar. `DUPLICATE_CHECK_IN` é outra coisa: check-in repetido com key DIFERENTE.

**2. `GET /api/v1/trips/:id/students`**

| Item | Valor |
|---|---|
| Auth | Bearer JWT, role `DRIVER` (motorista atribuído à rota — validação na 3.5a) |
| Response 200 | `{ data: { students: [{ studentId, name, status, checkedInAt }], summary: { boarded, total } }, meta }` |
| `status` | enum `CHECKED_IN` \| `NOT_CHECKED_IN` \| `NOT_RETURNING` — os 3 valores entram AGORA no contrato; `NOT_RETURNING` só será produzido no Épico 4, mas o mobile (3.5b) já renderiza os 3 |
| Erros | 404 `TRIP_NOT_FOUND` |

Este endpoint vive no domínio **trip** (Architecture §7: `/api/v1/trips/*` → trip; `get-trip-students.use-case.ts` previsto no trip/core) — o stub entra no `trip.controller.ts` existente, NÃO num controller novo de boarding.

**3. Contrato do QR Code (`QrCodePayloadDto`) — AC #3**

- **Shape:** `{ "studentId": "<uuid>", "sessionId": "<uuid>" }`
- **Codificação:** string JSON compacta UTF-8, direto no QR (sem base64 — QR menor = leitura mais rápida em movimento, NFR1)
- **Semântica do `sessionId`:** o JWT atual NÃO carrega sessionId (payload = `sub`, `companyId`, `role` — ver `jwt.strategy.ts`). Decisão de contrato: `sessionId` é **UUID v4 gerado no cliente a cada login** e persistido em MMKV. É o que torna o QR "estático por sessão" (NFR8). O backend (3.3a) o trata como opaco no MVP — valida `studentId`/permissão/viagem, não o sessionId. A 3.2b gera o QR localmente com este schema; a 3.3b decodifica e valida contra o tipo gerado.
- **Registro no OpenAPI:** o payload não aparece em nenhum request/response HTTP, então só entra em `components.schemas` via `@ApiExtraModels(QrCodePayloadDto)` — sem isso a 3.2b não tem tipo gerado para validar (AC da 3.2b: "não há schema escrito à mão").

**4. Envelope de resposta — o contrato documenta o shape HTTP REAL**

O `ResponseWrapperInterceptor` (global, `app.module.ts`) envelopa TODA resposta de sucesso em `{ data, meta: { timestamp } }`, e o `EffectExceptionFilter` (global) produz `{ error: { code, message, details? } }`. O `api-client.ts` do mobile já desembrulha `.data` e parseia `.error`. Se o openapi.json declarar só o DTO interno, os tipos gerados mentem sobre o wire format e os handlers MSW divergem do backend real na 3.6.

Padrão do helper (documenta o envelope sem criar DTO wrapper por endpoint):

```typescript
// shared/shell/decorators/api-data-response.decorator.ts
import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export const ApiDataResponse = <T extends Type<unknown>>(
  model: T,
  status = 200,
  description = 'Sucesso',
) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description,
      schema: {
        properties: {
          data: { $ref: getSchemaPath(model) },
          meta: {
            type: 'object',
            properties: { timestamp: { type: 'string', format: 'date-time' } },
          },
        },
        required: ['data', 'meta'],
      },
    }),
  );
```

Para erros, criar `ErrorResponseDto` (`error: { code, message, details? }`) e referenciá-lo nos `@ApiResponse` de 400/401/403/404/409 com os códigos possíveis na description (ex.: `description: 'TRIP_NOT_ACTIVE | DUPLICATE_CHECK_IN'`).

**5. Stub 501**

`throw new NotImplementedException(...)` do `@nestjs/common`.

> **Corrigido na review (2026-07-12):** esta seção afirmava que "o corpo do 501 sai no formato default do NestJS (`{ statusCode, message }`), não no envelope `{ error: ... }`". **Isso é falso.** O `EffectExceptionFilter` (global) intercepta `HttpException`, lê o `getResponse()` e normaliza para `{ error: { code, message } }` — ver `effect-exception.filter.ts:55-75`. Como os stubs lançam `NotImplementedException({ code: 'NOT_IMPLEMENTED', message })`, o corpo real **é** `{ error: { code: 'NOT_IMPLEMENTED', ... } }`. Consequência da premissa errada: os `@ApiResponse` de 501 nasceram sem `type: ErrorResponseDto`, ou seja, a única resposta que estes endpoints de fato retornam hoje era a única que o contrato não descrevia. Corrigido nos dois controllers.

### Script de export — por que funciona sem banco

`SwaggerModule.createDocument(app, config)` só varre metadata dos decorators — não requer `app.init()` nem `app.listen()`. O `PrismaService.$connect()` roda em `onModuleInit`, que só dispara no `init()`. Logo: `NestFactory.create()` → `createDocument()` → `writeFileSync` → `app.close()` exporta o contrato **sem PostgreSQL de pé**. Duas ressalvas:

1. `PrismaService` constrói `PrismaPg` com `process.env.DATABASE_URL` no constructor — o script DEVE começar com `import 'dotenv/config'` (mesmo padrão dos testes, lição da Story 1.2) para a env existir.
2. As factories de runtime (`TRIP_RUNTIME` etc.) rodam no `create()` — são `Layer.succeed`/`ManagedRuntime.make`, não tocam o banco. Nada a fazer, só saber que rodam.

`ts-node` já é o runner do seed (`prisma.seed` em `api/package.json`) — usar o mesmo para o script. Se o ts-node reclamar de ESM/nodenext, o fallback é `ts-node --compilerOptions '{"module":"commonjs"}' scripts/export-openapi.ts`.

### MSW em React Native — armadilhas conhecidas

- **Import correto:** `setupServer` vem de **`msw/native`**. `msw/node` patcha `http`/`https` do Node, que não existem no RN — crasha o app.
- **Polyfills:** Hermes não tem `URL` completo nem `TextEncoder` — instalar `react-native-url-polyfill` e `fast-text-encoding` (dependencies, não devDeps — são importados em runtime dev) e importá-los ANTES de qualquer import do msw. Relatos da comunidade (MSW v2) apontam também referências a `MessageEvent`/`Event`/`EventTarget`/`BroadcastChannel` — se a inicialização crashar, adicionar stubs mínimos em `mocks/polyfills.ts`. Verificar contra a doc oficial: https://mswjs.io/docs/integrations/react-native/
- **Inicialização:** gate assíncrono no root `_layout.tsx` (o arquivo já tem o gate `isDbReady` — replicar o padrão com `isMockReady`). Condição: `__DEV__ && process.env.EXPO_PUBLIC_USE_MOCKS === '1'`. Com a flag desligada, `enableMocking()` retorna imediatamente — nenhum código MSW roda em produção nem no fluxo normal do Dev 1.
- **Matching de URL:** o `api-client.ts` monta `${API_BASE_URL}${path}` — usar wildcard nos handlers (`*/api/v1/boarding/check-in`) para funcionar com qualquer base URL de dev.
- **Épico 3 é só REST** — nenhum evento SSE neste contrato (SSE entra no 4.0/5.0). Não montar infraestrutura de stream agora.
- Mock **stateful** (Task 8.4d): um `Map` de check-ins em memória no módulo de mocks, compartilhado entre os dois handlers. É o que faz "check-in na tela de scan reflete na lista" (AC da 3.5b) funcionar contra mock. Reset no reload do app é aceitável.

### Regras arquiteturais que se aplicam AQUI

1. Controller DEVE ter `@ApiTags`, `@ApiOperation`, `@ApiResponse` completos (Architecture §8.1) — nesta story isso não é burocracia, É o produto
2. `@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)` + `@Roles(['DRIVER'])` + `@ApiBearerAuth()` no BoardingController — padrão do `routing.controller.ts` (roles em UPPERCASE: `'ADMIN' | 'DRIVER' | 'STUDENT'`; o `@Roles(['driver'])` minúsculo do trip.controller é legado pendente da review 3.1 — NÃO replicar)
3. Imports relativos com extensão `.js` (module nodenext) — em TODOS os arquivos novos da API
4. Mobile: imports internos SEMPRE via alias `@/*`
5. Endpoints kebab-case (`/check-in`), JSON camelCase, enums SCREAMING_SNAKE_CASE, datas ISO 8601 UTC (Architecture §6)
6. Tipos de API no mobile são GERADOS — editar `src/types/api.d.ts` à mão é violação de contrato (Architecture §8, regra 11)
7. Nenhum endpoint das stories 3.3a/3.5a pode nascer fora deste contrato (Architecture §8, regra 13) — se durante a implementação um campo se mostrar errado, a mudança é consciente: altera DTO, re-exporta openapi.json, regenera tipos e ajusta mocks NO MESMO PR (Architecture §12, drift check)

### Estado atual dos arquivos que serão MODIFICADOS

- **`api/src/app.module.ts`** — importa ConfigModule (global), EventEmitter, PrismaGlobal, EffectRuntime, SharedKernel, Auth/Driver/Student/Trip/Routing modules; providers globais `EffectExceptionFilter` (APP_FILTER) e `ResponseWrapperInterceptor` (APP_INTERCEPTOR). Mudança: +1 import (`BoardingModule`). Preservar tudo.
- **`api/src/domains/trip/shell/http/trip.controller.ts`** — 3 endpoints (`POST /`, `PATCH :id/end`, `GET active`), guards `TenantGuard, RolesGuard` SEM JwtAuthGuard (TODO da 3.1, em review), `@Roles(['driver'])` minúsculo (idem). Mudança: +1 endpoint stub `GET :id/students` com Swagger completo. NÃO tocar no resto — a review da 3.1 é quem religa o JwtAuthGuard.
- **`api/src/main.ts`** — Swagger já configurado (`DocumentBuilder` title 'PureUrban', version '0.2', `SwaggerModule.setup('api', ...)`). Mudança: extrair a montagem do documento para `api/src/swagger.ts` e consumir de lá (comportamento do `/api` em runtime idêntico).
- **`mobile/src/app/_layout.tsx`** — root layout com `PersistQueryClientProvider` + `PaperProvider` + gate `isDbReady` (initializeDatabase) + redirect de auth. Mudança: gate adicional `isMockReady` no mesmo padrão. Preservar a ordem: mocks prontos ANTES de `AppTabs` montar (senão a primeira query escapa do interceptor).
- **`api/package.json` / `mobile/package.json`** — só adição de scripts e devDeps (mobile: `openapi-typescript`, `msw` em devDeps; `react-native-url-polyfill`, `fast-text-encoding` em dependencies).

### Previous Story Intelligence (3.1 em review + retro do Épico 2)

- **Padrão de bounded context estabilizado** (retro E2): `core/errors|ports|schemas|use-cases` + `shell/adapters|http|service|module`. O boarding nasce nesse template — mas NESTA story só a fatia `shell/http` + module existe.
- **`RolesGuard` corrigido com `getAllAndOverride`** (fix da 2.6) — lê metadata de handler E classe; override por handler funciona (ex.: `@Get('mine')` no routing).
- **Ordem de rotas importa:** `@Get('active')` antes de rotas `:id` no trip.controller — declarar `:id/students` depois das rotas literais (lição `@Get('mine')` da 2.6).
- **Story 3.1 está em `review`** com pendências conhecidas (JwtAuthGuard comentado, roles minúsculas, `routeId` sem validação). Esta story NÃO resolve nada disso — só não pode piorar: o novo stub no trip.controller herda os guards atuais da classe e será protegido de verdade quando a review da 3.1 landar.
- **Swagger foi configurado depois da 3.1** (commit `d2c3bc2` "feat: configure swagger and openAPI integration on NestJS") — `@nestjs/swagger` 11.2.7 e `swagger-ui-express` já instalados. NÃO instalar nada novo na API.
- **Domain-scoped runtime (`{X}_RUNTIME`)** é o padrão para quando o boarding ganhar lógica (3.3a) — nesta story NÃO criar runtime (não há use case).
- **Mobile:** `api-client.ts` com refresh mutex funciona; tokens em MMKV via `tokenStorage`; stores existentes: `app.store.ts` (tem `isOnline`), `auth.store.ts`, `trip.store.ts`. Telas placeholder `(driver)/scan.tsx`, `(driver)/student-list.tsx`, `(student)/qr-code.tsx` já existem — esta story NÃO as toca.

### Git Intelligence

- Commits recentes: `e01e9f9` docs TCC · `466119c` docs(planning) refatiamento épicos 3-5 · `690bc5a` feat(routing) story 2.6 · `d2c3bc2` feat swagger/openAPI
- Convenção: `feat(scope): ...` — sugestão para esta story: `feat(contract): declare boarding api contract (story 3.0)` ou dividir em `feat(api)`/`feat(mobile)`
- Branch principal: `main`; conventional commits obrigatório

### Latest Tech Information (pesquisado em 2026-07-12)

- **openapi-typescript v7** (latest 7.13.0): `npx openapi-typescript ../api/openapi.json -o src/types/api.d.ts`. Gera `paths`/`components` como tipos puros (zero runtime). Requer `moduleResolution: "Bundler"` no tsconfig — o mobile estende `expo/tsconfig.base`, que já usa bundler resolution. Docs: https://openapi-ts.dev
- **msw v2**: integração RN documentada oficialmente (`msw/native`). Polyfills obrigatórios: URL + TextEncoder; comunidade reporta stubs adicionais necessários no Hermes (ver seção MSW acima). Docs: https://mswjs.io/docs/integrations/react-native/
- **@nestjs/swagger 11.2.7** (já instalado): `SwaggerModule.createDocument` é síncrono e não exige app inicializado; `getSchemaPath`/`ApiExtraModels` são o mecanismo padrão para schemas compostos e modelos fora de request/response.

### Testing Requirements

- Esta story tem ZERO lógica de domínio — não há use case para testar. O "teste" do contrato é o pipeline de artefatos:
  1. `npm run build` e `npm test` (api) verdes — nenhuma regressão nos 143+ testes existentes
  2. `openapi:export` determinístico (rodar 2x → sem diff) e documento contendo os paths/schemas esperados (Task 6.4 e 9.4)
  3. `npx tsc --noEmit` (mobile) verde com os tipos gerados e os handlers tipados contra eles — o typecheck dos handlers MSW contra `api.d.ts` É o teste de conformidade dos mocks
- NÃO escrever testes e2e autenticados contra os stubs 501 — seria testar o `NotImplementedException` do framework. Os e2e reais chegam na 3.6.

### Project Structure Notes

Arquivos desta story:

```
api/
├── openapi.json                                              # [NEW — GERADO, commitado]
├── package.json                                              # [UPDATE] script openapi:export
├── scripts/
│   └── export-openapi.ts                                     # [NEW]
└── src/
    ├── main.ts                                               # [UPDATE] usa swagger.ts
    ├── swagger.ts                                            # [NEW] createOpenApiDocument()
    ├── app.module.ts                                         # [UPDATE] +BoardingModule
    └── domains/
        ├── shared/shell/decorators/
        │   └── api-data-response.decorator.ts                # [NEW]
        ├── shared/shell/http/  (ou dtos compartilhados)
        │   └── error-response.dto.ts                         # [NEW] envelope { error }
        ├── boarding/shell/
        │   ├── boarding.module.ts                            # [NEW]
        │   └── http/
        │       ├── boarding.controller.ts                    # [NEW — stub 501]
        │       └── dtos/
        │           ├── check-in.dto.ts                       # [NEW]
        │           ├── qr-code-payload.dto.ts                # [NEW]
        │           └── index.ts                              # [NEW]
        └── trip/shell/http/
            ├── trip.controller.ts                            # [UPDATE] +GET :id/students stub
            └── dtos/
                └── trip-students.dto.ts                      # [NEW]

mobile/
├── package.json                                              # [UPDATE] devDeps + deps + script
└── src/
    ├── types/
    │   └── api.d.ts                                          # [NEW — GERADO, commitado, nunca editado]
    ├── mocks/
    │   ├── polyfills.ts                                      # [NEW]
    │   ├── server.ts                                         # [NEW] msw/native
    │   ├── index.ts                                          # [NEW] enableMocking()
    │   └── handlers/
    │       ├── index.ts                                      # [NEW]
    │       └── boarding.handlers.ts                          # [NEW — stateful]
    └── app/
        └── _layout.tsx                                       # [UPDATE] gate isMockReady
```

Variações conscientes vs. Architecture §7: `mobile/src/mocks/` e `mobile/src/types/` não constam do desenho original — foram introduzidos pela §12 (revisão 12/07/2026). `api/scripts/` segue o precedente de `api/prisma/seed.ts` (tooling fora de `src/`).

### Fora de escopo (não fazer nesta story)

- Workflow de CI com drift check (Architecture §12) — o repositório ainda não tem `.github/workflows/`; o drift check automatizado é setup de CI, não contrato. Até lá vale a verificação manual da Task 9.4. Se sobrar fôlego, é candidato natural à 3.6.
- Qualquer entidade Prisma de boarding (BoardingRecord etc.) — Story 3.3a.
- Fila offline / expo-sqlite — Story 3.4b (a tabela `offline_queue` já existe via `initializeDatabase`, intocada aqui).
- Religar JwtAuthGuard no trip.controller — review da Story 3.1.
- Endpoints/eventos dos Épicos 4 e 5 (`not-returning`, SSE, tracking) — Stories 4.0 e 5.0.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.0] — ACs e escopo
- [Source: _bmad-output/planning-artifacts/epics.md#Convenção de Fatiamento] — regras das trilhas X.0/X.Ya/X.Yb/X.N
- [Source: _bmad-output/planning-artifacts/architecture.md#12] — OpenAPI-first, fluxo por épico, drift check, deps de dev
- [Source: _bmad-output/planning-artifacts/architecture.md#8] — regras 1-13 (Swagger, guards, tipos gerados, MSW)
- [Source: _bmad-output/planning-artifacts/architecture.md#5] — Tier 2, X-Idempotency-Key, schema da fila
- [Source: _bmad-output/planning-artifacts/architecture.md#6] — naming, envelope { data, meta } / { error }
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-12.md] — racional da mudança para trilhas paralelas
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-05-11.md] — padrões estabilizados, riscos do Épico 3, pendências da 3.1
- [Source: _bmad-output/implementation-artifacts/3-1-iniciar-e-encerrar-viagem.md] — estado do domínio trip, TRIP_RUNTIME, TODOs
- [Source: _bmad-output/project-context.md] — regras TypeScript (extensão .js, alias @/), anti-patterns
- [Source: api/src/domains/routing/shell/http/routing.controller.ts] — padrão de controller pós-Épico 2 (guards, roles UPPERCASE, Swagger)
- [Source: api/src/domains/auth/shell/strategies/jwt.strategy.ts] — payload JWT real (sem sessionId)
- [Source: mobile/src/services/api-client.ts] — desembrulho de `{ data }`, parse de `{ error }`, refresh mutex
- openapi-typescript: https://openapi-ts.dev · MSW React Native: https://mswjs.io/docs/integrations/react-native/

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `ts-node scripts/export-openapi.ts` (comando sugerido na Task 6.3 original) falha em runtime com `MODULE_NOT_FOUND` para qualquer import relativo com extensão `.js` que aponte para um arquivo `.ts` fonte — o resolvedor CommonJS do Node não remapeia `.js`→`.ts` (só o compilador TS faz essa ponte, em tempo de type-check, para moduleResolution `nodenext`). Confirmado que o mesmo problema já existe latente em `api/prisma/seed.ts` (`ts-node prisma/seed.ts` também falha, pré-existente, fora do escopo desta story). O fallback `ts-node --compilerOptions '{"module":"commonjs"}'` sugerido nos Dev Notes NÃO resolve — o gap é de resolução de módulo em runtime, não do target de emissão. Solução adotada: `nest build && node dist/scripts/export-openapi.js` (tsconfig.build.json já compila `scripts/` para `dist/scripts/`, confirmado por inspeção). Validado determinístico (2 execuções, diff vazio) e funciona sem PostgreSQL no ar.
- `npx expo lint` no mobile detectou ausência de config ESLint e auto-instalou `eslint` + `eslint-config-expo` (229 pacotes) — revertido via `npm uninstall` e remoção de `eslint.config.js`, pois está fora do escopo desta story (Task 9 só pede `tsc --noEmit` para o mobile).
- `npx tsc --noEmit` no mobile reporta 2 erros em `src/app/(auth)/login.tsx` (typed routes `/(driver)/` e `/(student)/`) — confirmado pré-existente via `git stash` da baseline antes de qualquer mudança desta story.
- Teste `prisma.service.spec.ts > should be able to query the Company model` falha sem Postgres rodando — subido via `docker compose up -d` (Postgres 16 + Redis 7), depois 144/144 testes verdes.

### Completion Notes List

- Contrato declarado para `POST /api/v1/boarding/check-in` e `GET /api/v1/trips/:id/students`, ambos como stub `501 NotImplementedException` — zero lógica de domínio, zero Prisma, zero runtime Effect novo, conforme escopo da story.
- Envelope de resposta `{ data, meta }` documentado via decorator `ApiDataResponse` (novo, `shared/shell/decorators/`) e envelope de erro `{ error }` via `ErrorResponseDto` (novo, `shared/shell/http/`) — aplicados nos dois endpoints para que o `openapi.json` reflita o shape HTTP real.
- `QrCodePayloadDto` registrado via `@ApiExtraModels` no `BoardingController` (não aparece em request/response HTTP).
- `swagger.ts` extraído de `main.ts` (`createOpenApiDocument`) e reutilizado no script de export — comportamento do `/api` em runtime idêntico ao anterior (validado via `npm run build` + inspeção manual do bootstrap).
- `openapi.json` gerado e commitado: contém os 2 paths novos, os 6 schemas esperados (`CheckInRequestDto`, `CheckInResponseDto`, `QrCodePayloadDto`, `TripStudentsResponseDto`, `BoardingSummaryDto`, `ErrorResponseDto`) e o enum `status` com os 3 valores (`CHECKED_IN`, `NOT_CHECKED_IN`, `NOT_RETURNING`). Corrigido um caso de inferência de tipo incorreta (`checkedInAt: string | null` inferia `type: object` sem plugin CLI do Swagger — adicionado `type: 'string'` explícito no `@ApiProperty`).
- Mobile: `src/types/api.d.ts` gerado via `openapi-typescript` a partir do `openapi.json` — nunca editado à mão.
- Mocks MSW (`msw/native`, NUNCA `msw/node`) com handlers stateful para os dois endpoints: idempotência via Map em memória por `X-Idempotency-Key`, sentinelas de erro por sufixo de `studentId` (`...0001`–`...0004`), e lista de alunos que reflete os check-ins feitos (estado compartilhado em memória, reset aceitável no reload).
- Gate `isMockReady` adicionado ao `_layout.tsx` mobile no mesmo padrão do `isDbReady` existente — `enableMocking()` só carrega polyfills/MSW quando `__DEV__ && EXPO_PUBLIC_USE_MOCKS === '1'`. **Correção pós-review:** a nota original dizia "sem custo em produção", o que é impreciso — o custo de *runtime* é zero (o gate retorna antes de qualquer código MSW rodar), mas o Metro não faz code splitting, então o grafo do msw entra no bundle de qualquer forma. Por isso o `msw` foi movido para `dependencies` (ver Review Findings).
- Nenhum endpoint ou guard existente do `trip.controller.ts` foi alterado além do novo stub — `JwtAuthGuard` comentado e roles minúsculas permanecem como estavam (escopo da review da Story 3.1, não desta story).

### File List

**API (novo):**
- `api/openapi.json`
- `api/scripts/export-openapi.ts`
- `api/src/swagger.ts`
- `api/src/domains/boarding/shell/boarding.module.ts`
- `api/src/domains/boarding/shell/http/boarding.controller.ts`
- `api/src/domains/boarding/shell/http/dtos/check-in.dto.ts`
- `api/src/domains/boarding/shell/http/dtos/qr-code-payload.dto.ts`
- `api/src/domains/boarding/shell/http/dtos/index.ts`
- `api/src/domains/trip/shell/http/dtos/trip-students.dto.ts`
- `api/src/domains/shared/shell/decorators/api-data-response.decorator.ts`
- `api/src/domains/shared/shell/http/error-response.dto.ts`

**API (modificado):**
- `api/package.json` (script `openapi:export`)
- `api/src/app.module.ts` (+`BoardingModule`)
- `api/src/main.ts` (usa `swagger.ts`)
- `api/src/domains/trip/shell/http/trip.controller.ts` (+`GET :id/students` stub)

**Mobile (novo):**
- `mobile/src/types/api.d.ts` (gerado)
- `mobile/src/mocks/polyfills.ts`
- `mobile/src/mocks/server.ts`
- `mobile/src/mocks/index.ts`
- `mobile/src/mocks/handlers/index.ts`
- `mobile/src/mocks/handlers/boarding.handlers.ts`

**Mobile (modificado):**
- `mobile/package.json` (scripts `openapi:types`; deps `msw`, `openapi-typescript`, `react-native-url-polyfill`, `fast-text-encoding`)
- `mobile/package-lock.json`
- `mobile/src/app/_layout.tsx` (gate `isMockReady`)

**Implementation artifacts:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status da story)

## Change Log

- 2026-07-12: Implementação completa da Story 3.0 — contrato de API de embarque digital (DTOs, controllers stub 501, `openapi.json`, tipos gerados no mobile, mocks MSW). Status movido para `review`.
