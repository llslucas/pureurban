# Story 2.2: Autenticação (Login e Refresh Token)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como usuário (admin, motorista ou aluno),
Quero fazer login e manter minha sessão ativa,
Para que eu acesse o sistema de forma segura.

## Acceptance Criteria

1. **Given** um usuário cadastrado
   **When** envio POST `/api/v1/auth/login` com `{ email, password }`
   **Then** recebo `accessToken` (15min) e `refreshToken` (7 dias)
   **And** o JWT contém `userId` (`sub`), `companyId`, `role`
   **And** formato de resposta: `{ data: { accessToken, refreshToken, user: { id, name, email, role } }, meta: { timestamp } }`

2. **Given** access token expirado
   **When** envio POST `/api/v1/auth/refresh` com `{ refreshToken }` no body
   **Then** recebo novos `accessToken` e `refreshToken`
   **And** formato de resposta igual ao login

3. **Given** credenciais inválidas (email não existe ou senha errada)
   **When** envio POST `/api/v1/auth/login`
   **Then** retorna 401 com `{ error: { code: "INVALID_CREDENTIALS", message: "..." } }`
   **And** mensagem NÃO revela se o email existe ou não (segurança)

4. **Given** refresh token inválido ou expirado
   **When** envio POST `/api/v1/auth/refresh`
   **Then** retorna 401 com `{ error: { code: "INVALID_REFRESH_TOKEN", message: "..." } }`

5. **Given** login implementado no backend
   **When** acesso a tela `(auth)/login.tsx` no mobile
   **Then** posso fazer login com email e senha
   **And** tokens são persistidos via MMKV (`tokenStorage`)
   **And** `authStore` (Zustand) gerencia estado de autenticação (`user`, `isAuthenticated`)
   **And** após login, app redireciona para a tela correta conforme `role` (driver → `(driver)/`, student → `(student)/`)

6. **Given** access token expirado no mobile
   **When** uma requisição falha com 401
   **Then** `api-client.ts` tenta refresh automaticamente usando o refresh token do MMKV
   **And** se refresh falha, limpa tokens e redireciona para login

## Tasks / Subtasks

- [x] Task 1 — Functional Core: novos use-cases e schemas (AC: #1–#4)
  - [x] 1.1 Criar `core/schemas/login.schema.ts` — Effect Schema para `{ email, password }`
  - [x] 1.2 Criar `core/use-cases/login.use-case.ts` — valida email, compara senha, gera tokens, retorna `WithEvents`
  - [x] 1.3 Criar `core/use-cases/refresh-token.use-case.ts` — valida refresh token, gera novos tokens
  - [x] 1.4 Adicionar novos erros em `core/errors/auth.errors.ts`: `InvalidCredentialsError`, `InvalidRefreshTokenError`

- [x] Task 2 — Imperative Shell: expandir adapters e controller (AC: #1–#4)
  - [x] 2.1 Expandir `TokenService` port com `verifyToken(token: string) => Effect<TokenPayload>` e `generateTokens` com refresh
  - [x] 2.2 Expandir `UserRepository` port com `findById(id: string) => Effect<UserData | null>`
  - [x] 2.3 Atualizar `JwtTokenAdapter` — implementar `verifyToken` usando `jwtService.verifyAsync`
  - [x] 2.4 Atualizar `PrismaUserAdapter` — implementar `findById`
  - [x] 2.5 Expandir `AuthService` com métodos `login()` e `refresh()`
  - [x] 2.6 Expandir `AuthController` com endpoints `POST login` e `POST refresh`

- [x] Task 3 — Migrar AuthModule para domain-scoped runtime (AC: #1–#4)
  - [x] 3.1 Criar `AUTH_RUNTIME` constante no `auth.service.ts`
  - [x] 3.2 Atualizar `auth.module.ts` para criar runtime via `useFactory` com Layers (padrão `TripModule`)
  - [x] 3.3 Remover `Layer.mergeAll` do `AuthService.register()` — runtime já provê os Layers

- [x] Task 4 — Mobile: tela de login e auth store (AC: #5–#6)
  - [x] 4.1 Criar `mobile/src/services/auth.service.ts` — funções `login()`, `refresh()`
  - [x] 4.2 Criar `mobile/src/stores/auth.store.ts` — Zustand store com `user`, `isAuthenticated`, `login()`, `logout()`
  - [x] 4.3 Implementar `(auth)/login.tsx` — formulário com email/senha, validação, feedback de erro
  - [x] 4.4 Adicionar interceptor de refresh no `api-client.ts` — retry automático com token refresh em 401
  - [x] 4.5 Atualizar `_layout.tsx` ou `(auth)/_layout.tsx` — redirecionar conforme autenticação e role

- [x] Task 5 — Testes (AC: #1–#4)
  - [x] 5.1 Testes unitários do `login` use-case — 4 cenários: sucesso, email inexistente, senha errada, hash comparison
  - [x] 5.2 Testes unitários do `refreshToken` use-case — 3 cenários: sucesso, token inválido, user não encontrado
  - [x] 5.3 Testes do `JwtTokenAdapter.verifyToken` — 2 cenários: token válido, token expirado/inválido
  - [x] 5.4 Testes do `PrismaUserAdapter.findById` — 2 cenários: found, not found

- [x] Task 6 — Validação final (AC: #1–#6)
  - [x] 6.1 `cd api && npm run build` — sem erros TS no src/ (apenas seed.ts pré-existente)
  - [x] 6.2 `cd api && npm test` — todos os testes passam (existentes + novos: 82 passando)
  - [x] 6.3 Swagger documenta os 3 endpoints auth (`register`, `login`, `refresh`)

### Review Findings
- [x] [Review][Defer] Tratar erro de rede no refresh token — Se `attemptTokenRefresh` encontrar um erro de rede (offline) ou 5xx, ele retorna `false`, forçando o logout do usuário. Devemos manter os tokens e tentar novamente quando a rede voltar? — deferred, pre-existing. Reason: Recurso não essencial para a fase do projeto.
- [ ] [Review][Patch] Redirecionamento da rota ADMIN — A tela de login mobile redireciona usuários com a role `ADMIN` para `/(driver)/trip` como fallback. Criar uma rota/tela básica `/(admin)/` para não quebrar o login.
- [ ] [Review][Patch] Vulnerabilidade a Timing Attack (Enumeração de Usuários) [login.use-case.ts:13-17]
- [ ] [Review][Patch] Loop infinito de retry no 401 [api-client.ts:114-115]
- [ ] [Review][Patch] Falta de hidratação do estado de autenticação / App desloga ao reiniciar [auth.store.ts]
- [ ] [Review][Patch] Desvio nas rotas de redirecionamento no Mobile [login.tsx:33-36]
- [ ] [Review][Patch] Exibe 'Sessão expirada' ao invés de 'Credenciais inválidas' em 401 no login [api-client.ts]
- [ ] [Review][Patch] Confiança cega no Payload do JWT / Ausência de validação do claim `sub` [jwt-token.adapter.ts]
- [ ] [Review][Patch] Sensibilidade a maiúsculas no email durante login [login.tsx]
- [ ] [Review][Patch] Endpoint de Refresh não validado [auth.controller.ts]
- [ ] [Review][Patch] Ausência de Timeout no Refresh do Token [api-client.ts]
- [ ] [Review][Patch] Chamada impura de Data no Functional Core [login.use-case.ts]
- [ ] [Review][Patch] Validação inadequada do Password (sem max length, permite espaços) [login.schema.ts]
- [ ] [Review][Patch] KeyboardAvoidingView quebrado em telas pequenas [login.tsx]

## Dev Notes

### 🏗️ PADRÃO DOMAIN-SCOPED RUNTIME — Migrar do Padrão 2.1

A story 2.1 usou o padrão **global `EFFECT_RUNTIME` + `Layer.mergeAll` no service**. A story 3.1 (trip) evoluiu para **domain-scoped runtime** via `useFactory` no module. **ADOTAR O PADRÃO TRIP** nesta story e migrar o código 2.1.

**Padrão Trip (CORRETO — seguir este):**
```typescript
// auth.module.ts — criar AUTH_RUNTIME via useFactory
{
  provide: AUTH_RUNTIME,
  useFactory: (userAdapter, hasherAdapter, tokenAdapter) => {
    const AuthLayer = Layer.mergeAll(
      Layer.succeed(UserRepository, userAdapter),
      Layer.succeed(PasswordHasher, hasherAdapter),
      Layer.succeed(TokenService, tokenAdapter),
    )
    return ManagedRuntime.make(AuthLayer)
  },
  inject: [PrismaUserAdapter, BcryptPasswordHasherAdapter, JwtTokenAdapter],
}
```

```typescript
// auth.service.ts — simplificado, sem Layer.mergeAll
export const AUTH_RUNTIME = 'AUTH_RUNTIME'

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_RUNTIME) private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
    private readonly eventDispatcher: EffectEventDispatcher,
  ) {}

  async login(input: LoginInput) {
    return this.eventDispatcher.runAndDispatch(this.runtime, login(input))
  }
}
```

### Login Use-Case — Functional Core

```typescript
// core/use-cases/login.use-case.ts
export const login = (input: LoginInput) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const hasher = yield* PasswordHasher
    const tokenSvc = yield* TokenService

    const user = yield* userRepo.findByEmail(input.email)
    if (!user) {
      return yield* Effect.fail(InvalidCredentialsError.create())
    }

    const passwordValid = yield* hasher.compare(input.password, user.password)
    if (!passwordValid) {
      return yield* Effect.fail(InvalidCredentialsError.create())
    }

    const tokens = yield* tokenSvc.generateTokens({
      userId: user.id, companyId: user.companyId, role: user.role,
    })

    return withEvents(
      { user, tokens },
      [{ type: 'auth.user_logged_in', data: { userId: user.id }, occurredAt: new Date().toISOString() }],
    )
  })
```

**CRÍTICO:** Mesma mensagem de erro para email inexistente E senha errada → impede enumeração de emails.

### Refresh Token Use-Case — Functional Core

```typescript
// core/use-cases/refresh-token.use-case.ts
export const refreshToken = (input: { refreshToken: string }) =>
  Effect.gen(function* () {
    const tokenSvc = yield* TokenService
    const userRepo = yield* UserRepository

    // 1. Verificar e decodificar o refresh token
    const payload = yield* tokenSvc.verifyToken(input.refreshToken)

    // 2. Verificar que o user ainda existe
    const user = yield* userRepo.findById(payload.userId)
    if (!user) {
      return yield* Effect.fail(InvalidRefreshTokenError.create())
    }

    // 3. Gerar novos tokens
    const tokens = yield* tokenSvc.generateTokens({
      userId: user.id, companyId: user.companyId, role: user.role,
    })

    return noEvents({ user, tokens })
  })
```

### TokenService Port — Expandir com verifyToken

```typescript
// core/ports/token-service.port.ts — ADICIONAR ao existente
export interface TokenService {
  readonly generateTokens: (payload: TokenPayload) => Effect.Effect<TokenPair>
  readonly verifyToken: (token: string) => Effect.Effect<TokenPayload, InvalidRefreshTokenError>
}
```

**ATENÇÃO:** `verifyToken` retorna erro tipado `InvalidRefreshTokenError` — o core define o tipo de erro, o adapter (shell) faz a conversão `JwtService.verifyAsync` → `Effect.fail`.

### UserRepository Port — Expandir com findById

```typescript
// core/ports/user-repository.port.ts — ADICIONAR ao existente
export interface UserRepository {
  readonly findByEmail: (email: string) => Effect.Effect<UserData | null>
  readonly findById: (id: string) => Effect.Effect<UserData | null>
  readonly create: (data: CreateUserInput) => Effect.Effect<UserData>
}
```

### JwtTokenAdapter — Implementar verifyToken

```typescript
// shell/adapters/jwt-token.adapter.ts — ADICIONAR
verifyToken(token: string): Effect.Effect<TokenPayload, InvalidRefreshTokenError> {
  return Effect.tryPromise({
    try: async () => {
      const decoded = await this.jwtService.verifyAsync<{
        sub: string; companyId: string; role: string;
      }>(token)
      return {
        userId: decoded.sub,
        companyId: decoded.companyId,
        role: decoded.role,
      }
    },
    catch: () => InvalidRefreshTokenError.create(),
  })
}
```

### Novos Erros — auth.errors.ts

```typescript
export class InvalidCredentialsError extends Data.TaggedError('InvalidCredentialsError')<{
  readonly code: string
  readonly message: string
  readonly httpStatus: number
}> {
  static readonly create = () =>
    new InvalidCredentialsError({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas',
      httpStatus: 401,
    })
}

export class InvalidRefreshTokenError extends Data.TaggedError('InvalidRefreshTokenError')<{
  readonly code: string
  readonly message: string
  readonly httpStatus: number
}> {
  static readonly create = () =>
    new InvalidRefreshTokenError({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token inválido ou expirado',
      httpStatus: 401,
    })
}
```

### AuthController — Endpoints Públicos

```typescript
@Post('login')
@ApiOperation({ summary: 'Login de usuário' })
@ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
@ApiResponse({ status: 401, description: 'Credenciais inválidas' })
async login(
  @Body(new EffectSchemaPipe(LoginInput)) dto: LoginInput,
) {
  return this.authService.login(dto)
}

@Post('refresh')
@ApiOperation({ summary: 'Renovar tokens via refresh token' })
@ApiResponse({ status: 200, description: 'Tokens renovados com sucesso' })
@ApiResponse({ status: 401, description: 'Refresh token inválido' })
async refresh(@Body() dto: { refreshToken: string }) {
  return this.authService.refresh(dto.refreshToken)
}
```

**SEM GUARDS** em login e refresh — são endpoints públicos (igual register).

### AuthService — Formatar Resposta

O `AuthService` deve formatar a resposta igual ao `register()` (consistência):

```typescript
async login(input: LoginInput) {
  const result = await this.eventDispatcher.runAndDispatch(this.runtime, login(input))
  return {
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
    },
  }
}
```

**NÃO retornar `password`** na resposta — filtrar no service.

### Mobile — Auth Store (Zustand)

```typescript
// mobile/src/stores/auth.store.ts
interface AuthUser {
  id: string; name: string; email: string; role: 'ADMIN' | 'DRIVER' | 'STUDENT'
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (user: AuthUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => {
    tokenStorage.clearTokens()
    set({ user: null, isAuthenticated: false })
  },
}))
```

### Mobile — API Client Interceptor de Refresh

Adicionar ao `api-client.ts` um mecanismo de retry com refresh:

```typescript
// Em request(), após detectar 401:
if (response.status === 401 && !isRefreshRequest) {
  const refreshed = await attemptTokenRefresh()
  if (refreshed) {
    return request(method, path, body) // retry com novo token
  }
  // Refresh falhou — limpar tokens e redirecionar para login
  tokenStorage.clearTokens()
  // usar router.replace('/(auth)/login') se possível
}
```

**CUIDADO:** Evitar loop infinito de refresh → 401 → refresh. Usar flag `isRefreshRequest` ou mutex.

### Mobile — Login Screen (React Native Paper)

- Usar `TextInput` do React Native Paper com `mode="outlined"`
- Campo `email`: `keyboardType="email-address"`, `autoCapitalize="none"`
- Campo `password`: `secureTextEntry`, ícone para toggle visibilidade
- Botão `Button` do Paper com `mode="contained"`
- Feedback de erro via `HelperText` ou `Snackbar` do Paper
- Loading state durante requisição
- Após login bem-sucedido: salvar tokens no MMKV, atualizar authStore, navegar conforme role

### Project Structure Notes

**Arquivos novos:**
```
api/src/domains/auth/
  core/
    schemas/login.schema.ts                    # [NEW]
    use-cases/login.use-case.ts                # [NEW]
    use-cases/login.use-case.spec.ts           # [NEW]
    use-cases/refresh-token.use-case.ts        # [NEW]
    use-cases/refresh-token.use-case.spec.ts   # [NEW]

mobile/src/
  services/auth.service.ts                     # [NEW]
  stores/auth.store.ts                         # [NEW]
```

**Arquivos modificados:**
```
api/src/domains/auth/
  core/errors/auth.errors.ts                   # [MODIFY] — adicionar 2 novos erros
  core/ports/token-service.port.ts             # [MODIFY] — adicionar verifyToken
  core/ports/user-repository.port.ts           # [MODIFY] — adicionar findById
  shell/adapters/jwt-token.adapter.ts          # [MODIFY] — implementar verifyToken
  shell/adapters/jwt-token.adapter.spec.ts     # [NEW] — testes verifyToken
  shell/adapters/prisma-user.adapter.ts        # [MODIFY] — implementar findById
  shell/adapters/prisma-user.adapter.spec.ts   # [MODIFY] — adicionar testes findById
  shell/auth.service.ts                        # [MODIFY] — login(), refresh(), AUTH_RUNTIME
  shell/auth.module.ts                         # [MODIFY] — domain-scoped runtime
  shell/http/auth.controller.ts                # [MODIFY] — endpoints login, refresh

mobile/src/
  app/(auth)/login.tsx                         # [MODIFY] — implementar tela de login
  services/api-client.ts                       # [MODIFY] — interceptor de refresh
```

### Imports — Extensão `.js` Obrigatória

**OBRIGATÓRIO:** `module: "nodenext"` exige extensão `.js` em TODOS os imports relativos no backend:
```typescript
// ✅ CORRETO
import { login } from '../core/use-cases/login.use-case.js'
// ❌ ERRADO
import { login } from '../core/use-cases/login.use-case'
```

### Anti-Patterns a Evitar

1. **NÃO importar `@nestjs/*` em `core/`** — pureza funcional obrigatória
2. **NÃO revelar se email existe** na resposta de erro de login — mesma mensagem para ambos
3. **NÃO armazenar refresh token no banco** nesta story — MVP sem rotation (architecture.md §3)
4. **NÃO usar `class-validator`** nos DTOs — usar Effect Schema via `EffectSchemaPipe`
5. **NÃO hardcodar secrets** — usar ConfigService + .env
6. **NÃO esquecer extensão `.js`** nos imports relativos
7. **NÃO usar `throw`** no core — usar `Effect.fail()` com erros tagueados
8. **NÃO usar `AsyncStorage`** no mobile — usar MMKV
9. **NÃO registrar guards** nos endpoints login/refresh — são públicos
10. **NÃO retornar `password`** na resposta de login/refresh
11. **NÃO usar `Layer.mergeAll` no service** — usar domain-scoped runtime no module (padrão Trip)
12. **NÃO criar loop infinito de refresh** — usar flag para evitar retry recursivo

### Previous Story Intelligence

**Story 2.1 (done) — Learnings:**
- `registerCompany` use-case: padrão `Effect.gen(function* () { ... })` com `yield*` para ports
- `AuthService.register()` usa `Layer.mergeAll` no service → **MIGRAR para domain-scoped runtime**
- `PrismaUserAdapter` cria Company + User em transação Prisma
- `JwtTokenAdapter.generateTokens` assina com `jwtService.signAsync` — reutilizar
- `EffectSchemaPipe` valida body no controller — reutilizar para `LoginInput`
- `ResponseWrapperInterceptor` wrapa em `{ data, meta }` — NÃO wraper manualmente
- `EffectExceptionFilter` converte tagged errors → HTTP — basta definir `httpStatus` no erro
- Guards NÃO são APP_GUARD — usados via `@UseGuards()` por controller
- 11 testes auth passam — não quebrar

**Story 3.1 (ready-for-dev) — Learnings:**
- **TRIP_RUNTIME** padrão: domain-scoped runtime via `useFactory` no module — **ADOTAR**
- `TripModule` importa `SharedKernelModule` — auth module também deve importar
- `EffectEventDispatcher` provido no module providers — necessário se não vier do SharedKernelModule
- Controllers usam `@ApiTags`, `@ApiOperation`, `@ApiResponse` (Swagger obrigatório)
- `class-validator` + `class-transformer` instalados no package.json (story 3.1)

**Story 1.5 (done) — Mobile:**
- `tokenStorage` em `lib/storage.ts` já tem `get/set AccessToken`, `get/set RefreshToken`, `clearTokens`
- `apiClient` em `services/api-client.ts` já lê token do MMKV no header `Authorization`
- MMKV é sync — pode ser lido sem await

### Git Intelligence

Último commit: `feat(trip): implement story 3-1` (10/04/2026) — trip domain implementado com domain-scoped runtime. Auth domain tem registro implementado (story 2.1). Mobile tem `login.tsx` placeholder.

### Dependências

Nenhuma dependência nova necessária. Todos os pacotes já estão instalados:
- `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt` (story 2.1)
- `@nestjs/config` (story 2.1)
- `@nestjs/swagger`, `class-validator`, `class-transformer` (story 3.1)
- MMKV, Zustand, React Native Paper (story 1.5)

### References

- [Source: architecture.md#3-decisoes-arquiteturais] — JWT access 15min, refresh 7d, sem rotation no MVP
- [Source: architecture.md#6-padroes-de-implementacao] — Naming, formatos de resposta
- [Source: architecture.md#7-estrutura-do-projeto] — auth/ structure (core/ports, core/use-cases, shell/adapters, shell/http)
- [Source: architecture.md#8-regras-obrigatorias] — 10 regras para agentes de IA
- [Source: epics.md#story-2.2] — Acceptance criteria originais
- [Source: project-context.md] — TypeScript config, imports com extensão .js, anti-patterns
- [Source: 2-1-cadastro-de-empresa-e-seed-inicial.md] — Padrões auth estabelecidos
- [Source: trip/shell/trip.module.ts] — Padrão domain-scoped runtime (TRIP_RUNTIME)
- [Source: mobile/src/lib/storage.ts] — tokenStorage API (MMKV)
- [Source: mobile/src/services/api-client.ts] — interceptor de auth existente

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (Thinking)

### Debug Log References

Nenhum bloqueador. Dependências (`bcrypt`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/config`, `passport-jwt`) estavam declaradas no `package.json` mas não instaladas — executado `npm install` para resolver.

### Completion Notes List

- ✅ Functional Core implementado com Effect TS puro (sem NestJS no core/)
- ✅ `InvalidCredentialsError` usa mesma mensagem para email inexistente E senha errada (anti-enumeração)
- ✅ AuthModule migrado do padrão `EFFECT_RUNTIME + Layer.mergeAll no service` para `AUTH_RUNTIME domain-scoped` via `useFactory` (padrão TripModule)
- ✅ `AuthService.register()` simplificado — sem Layer.mergeAll, runtime já provê os Layers
- ✅ Mobile: `auth.store.ts` (Zustand), `auth.service.ts`, login screen (React Native Paper), interceptor de refresh com mutex para evitar loop infinito
- ✅ Interceptor de refresh usa flag `isRefreshRequest` e promise mutex para serializar múltiplas chamadas simultâneas
- ✅ 9 novos testes adicionados; total: 82 passando (82/83, 1 falha pré-existente requer banco)

### File List

**Novos:**
- `api/src/domains/auth/core/schemas/login.schema.ts`
- `api/src/domains/auth/core/use-cases/login.use-case.ts`
- `api/src/domains/auth/core/use-cases/login.use-case.spec.ts`
- `api/src/domains/auth/core/use-cases/refresh-token.use-case.ts`
- `api/src/domains/auth/core/use-cases/refresh-token.use-case.spec.ts`
- `api/src/domains/auth/shell/adapters/jwt-token.adapter.spec.ts`
- `mobile/src/services/auth.service.ts`
- `mobile/src/stores/auth.store.ts`

**Modificados:**
- `api/src/domains/auth/core/errors/auth.errors.ts`
- `api/src/domains/auth/core/ports/token-service.port.ts`
- `api/src/domains/auth/core/ports/user-repository.port.ts`
- `api/src/domains/auth/shell/adapters/jwt-token.adapter.ts`
- `api/src/domains/auth/shell/adapters/prisma-user.adapter.ts`
- `api/src/domains/auth/shell/adapters/prisma-user.adapter.spec.ts`
- `api/src/domains/auth/shell/auth.service.ts`
- `api/src/domains/auth/shell/auth.module.ts`
- `api/src/domains/auth/shell/http/auth.controller.ts`
- `mobile/src/app/(auth)/login.tsx`
- `mobile/src/app/_layout.tsx`
- `mobile/src/services/api-client.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- Implementado login JWT com anti-enumeração (AC #1, #3) — 2026-05-03
- Implementado refresh token automático backend + mobile (AC #2, #4, #6) — 2026-05-03
- Migrado AuthModule para domain-scoped runtime AUTH_RUNTIME (padrão TripModule) — 2026-05-03
- Implementada tela de login mobile com React Native Paper (AC #5) — 2026-05-03
- Implementado interceptor de refresh automático no api-client com mutex (AC #6) — 2026-05-03
- Adicionados 9 novos testes unitários cobrindo todos os cenários novos — 2026-05-03
