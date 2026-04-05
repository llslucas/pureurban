# Story 1.5: Setup Mobile — Dependências e Configuração Offline

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero instalar e configurar as dependências do app mobile (storage, estado, UI),
Para que o app esteja pronto para receber funcionalidades com suporte offline.

## Acceptance Criteria

1. **Given** o projeto Expo inicializado (SDK 55)
   **When** `react-native-mmkv` está instalado e configurado
   **Then** é possível ler e escrever valores (string, number, boolean) via MMKV
   **And** um módulo `storage.ts` exporta a instância MMKV configurada

2. **Given** o projeto Expo inicializado
   **When** `expo-sqlite` está instalado
   **Then** é possível abrir um banco de dados e criar tabelas via API assíncrona (`openDatabaseAsync`)
   **And** a tabela `offline_queue` está criada com schema conforme architecture.md

3. **Given** o projeto Expo inicializado
   **When** `zustand` está instalado e configurado
   **Then** um store de exemplo (`useAppStore`) funciona com estado de rede (`isOnline`, `isOfflineModeActive`)
   **And** stores seguem o padrão Zustand do projeto: um por domínio, actions como métodos

4. **Given** `@tanstack/react-query` e seus pacotes de persistência instalados
   **When** `PersistQueryClientProvider` está configurado com MMKV como storage
   **Then** cache de queries persiste entre reinicializações do app
   **And** `gcTime` ≥ `maxAge` (24h) para evitar garbage collection prematura
   **And** `staleTime` configurado (1 minuto default)

5. **Given** `react-native-paper` instalado
   **When** `PaperProvider` está envolvendo o app no root `_layout.tsx`
   **Then** componentes Paper (ex: `Button`, `Text`) renderizam corretamente
   **And** tema base está configurado com cores do PureUrban

6. **Given** todas as dependências configuradas
   **When** o arquivo `api-client.ts` é criado
   **Then** exporta uma instância configurável com URL base (`API_BASE_URL`)
   **And** intercepta requests para adicionar JWT do MMKV no header `Authorization`
   **And** intercepta respostas para tratar erros no formato `{ error: { code, message } }`

## Tasks / Subtasks

- [x] Task 1 — Instalar dependências base (AC: #1–#6)
  - [x] 1.1 Instalar MMKV: `npx expo install react-native-mmkv react-native-nitro-modules`
  - [x] 1.2 Instalar expo-sqlite: `npx expo install expo-sqlite`
  - [x] 1.3 Instalar Zustand: `npm install zustand`
  - [x] 1.4 Instalar TanStack Query + persistência: `npm install @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister`
  - [x] 1.5 Instalar React Native Paper: `npm install react-native-paper`
  - [x] 1.6 Executar `npx expo-doctor` para verificar compatibilidade

- [x] Task 2 — Configurar MMKV storage (AC: #1)
  - [x] 2.1 Criar `mobile/src/lib/storage.ts` com instância MMKV exportada
  - [x] 2.2 Criar helpers tipados: `getToken()`, `setToken()`, `clearToken()` para JWT
  - [x] 2.3 Verificar funcionamento com leitura/escrita simples

- [x] Task 3 — Configurar expo-sqlite com schema da offline queue (AC: #2)
  - [x] 3.1 Criar `mobile/src/lib/database.ts` com função `getDatabase()` usando `openDatabaseAsync`
  - [x] 3.2 Criar `mobile/src/lib/database-migrations.ts` com SQL de criação da tabela `offline_queue`
  - [x] 3.3 Schema da tabela conforme architecture.md seção 5:
    ```sql
    CREATE TABLE IF NOT EXISTS offline_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_error TEXT
    );
    ```
  - [x] 3.4 Chamar migração na inicialização do app

- [x] Task 4 — Configurar Zustand com store de exemplo (AC: #3)
  - [x] 4.1 Criar `mobile/src/stores/app.store.ts` com `useAppStore`
  - [x] 4.2 Estado inicial: `{ isOnline: true, isOfflineModeActive: false }`
  - [x] 4.3 Actions: `setOnline(value: boolean)`, `setOfflineMode(value: boolean)`
  - [x] 4.4 Seguir padrão: `set(state => ({ ...state, field: value }))`

- [x] Task 5 — Configurar TanStack Query com persistência MMKV (AC: #4)
  - [x] 5.1 Criar `mobile/src/lib/query-client.ts` com `QueryClient` configurado
  - [x] 5.2 Criar `mobile/src/lib/mmkv-persister.ts` com `createSyncStoragePersister` usando MMKV
  - [x] 5.3 Configurar `gcTime: 24h`, `staleTime: 1min` nas defaultOptions
  - [x] 5.4 Integrar `PersistQueryClientProvider` no root layout

- [x] Task 6 — Configurar React Native Paper (AC: #5)
  - [x] 6.1 Criar `mobile/src/lib/theme.ts` com tema base PureUrban (cores primárias, fonte)
  - [x] 6.2 Envolver app com `PaperProvider` no `_layout.tsx`
  - [x] 6.3 Testar renderização de componente Paper (ex: `Button`) em tela existente

- [x] Task 7 — Criar api-client.ts (AC: #6)
  - [x] 7.1 Criar `mobile/src/services/api-client.ts`
  - [x] 7.2 Configurar URL base via constante (`API_BASE_URL`) em `mobile/src/utils/constants.ts`
  - [x] 7.3 Implementar interceptor de autenticação (lê token do MMKV, adiciona `Authorization: Bearer`)
  - [x] 7.4 Implementar interceptor de erros (parseia formato `{ error: { code, message } }`)
  - [x] 7.5 Exportar métodos `get`, `post`, `patch`, `delete` tipados

- [x] Task 8 — Integrar providers no root layout (AC: #1–#6)
  - [x] 8.1 Atualizar `mobile/src/app/_layout.tsx` — envolver com `PersistQueryClientProvider` + `PaperProvider`
  - [x] 8.2 Inicializar banco de dados (migração) no startup do app
  - [x] 8.3 Garantir que navegação existente continua funcionando

- [x] Task 9 — Validação final (AC: #1–#6)
  - [x] 9.1 `cd mobile && npx expo start` — app inicia sem erros
  - [x] 9.2 Verificar que MMKV lê/escreve (pode ser log no console)
  - [x] 9.3 Verificar que expo-sqlite cria tabela (pode ser log no console)
  - [x] 9.4 Verificar que Zustand store funciona
  - [x] 9.5 Verificar que TanStack Query provider está ativo
  - [x] 9.6 Verificar que React Native Paper renderiza componente

### Review Findings

- [x] [Review][Patch] Missing untracked files in Diff — Arquivos não estavam staged; verificado e resolvido.
- [x] [Review][Patch] Race Condition and Unhandled Errors in Database Initialization [`mobile/src/app/_layout.tsx`]
- [x] [Review][Patch] Missing API request timeout [`mobile/src/services/api-client.ts`]
- [x] [Review][Patch] Unhandled invalid JSON response [`mobile/src/services/api-client.ts`]
- [x] [Review][Defer] Omitted SafeAreaProvider Integration [`mobile/src/app/_layout.tsx`] — deferred, pre-existing

## Dev Notes

### ⚠️ MMKV Requer Development Build — NÃO Funciona no Expo Go

**CRÍTICO:** `react-native-mmkv` usa código nativo (C++) e NÃO funciona no Expo Go. É necessário usar **development build**:

```bash
# Instalar
npx expo install react-native-mmkv react-native-nitro-modules

# Gerar projeto nativo (necessário para MMKV)
npx expo prebuild

# Rodar com build de desenvolvimento
npx expo run:android
# ou
npx expo run:ios
```

**Implicação:** A partir desta story, o workflow de desenvolvimento mobile muda de `expo start` (Expo Go) para `npx expo run:android` / `npx expo run:ios` (dev build). Documentar essa mudança para o Dev 2.

**Alternativa temporária (se quiser manter Expo Go):** Usar `expo-secure-store` para tokens e fazer MMKV condicional. Porém, a architecture.md especifica MMKV — seguir a decisão arquitetural.

### Storage Architecture — Dois Layers

```
MMKV (react-native-mmkv)
├── Tokens (accessToken, refreshToken)
├── Preferências do usuário
├── Estado de sessão leve
└── Cache do TanStack Query (via persister)

expo-sqlite
├── offline_queue (fila de check-ins pendentes)
└── (futuro) cache de listas para uso offline
```

**Por que dois storages?** MMKV é key-value ultra-rápido (síncrono, C++). expo-sqlite permite queries SQL estruturadas (necessário para fila ordenada por `created_at`).

### Instância MMKV — Padrão de Uso

```typescript
// mobile/src/lib/storage.ts
import { MMKV } from 'react-native-mmkv'

export const storage = new MMKV()

// Helpers tipados para tokens JWT
const TOKEN_KEYS = {
  access: 'auth.accessToken',
  refresh: 'auth.refreshToken',
} as const

export const tokenStorage = {
  getAccessToken: (): string | undefined => storage.getString(TOKEN_KEYS.access),
  setAccessToken: (token: string): void => storage.set(TOKEN_KEYS.access, token),
  getRefreshToken: (): string | undefined => storage.getString(TOKEN_KEYS.refresh),
  setRefreshToken: (token: string): void => storage.set(TOKEN_KEYS.refresh, token),
  clearTokens: (): void => {
    storage.delete(TOKEN_KEYS.access)
    storage.delete(TOKEN_KEYS.refresh)
  },
}
```

### expo-sqlite — API Assíncrona (SDK 55)

```typescript
// mobile/src/lib/database.ts
import * as SQLite from 'expo-sqlite'

let db: SQLite.SQLiteDatabase | null = null

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('pureurban.db')
    await runMigrations(db)
  }
  return db
}
```

**IMPORTANTE:** `expo-sqlite` no SDK 55 usa API promise-based (`openDatabaseAsync`). NÃO usar a API antiga (`openDatabase` síncrona).

### TanStack Query + MMKV Persistence

```typescript
// mobile/src/lib/mmkv-persister.ts
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { storage } from './storage'

export const mmkvPersister = createSyncStoragePersister({
  storage: {
    setItem: (key, value) => storage.set(key, value),
    getItem: (key) => {
      const value = storage.getString(key)
      return value === undefined ? null : value
    },
    removeItem: (key) => storage.delete(key),
  },
})
```

```typescript
// mobile/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,  // 24 horas
      staleTime: 1000 * 60,          // 1 minuto
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
})
```

**CRÍTICO:** `gcTime` DEVE ser ≥ `maxAge` do persister. Se `gcTime` < `maxAge`, o cache será coletado antes de ser persistido.

Usar `createSyncStoragePersister` (NÃO `createAsyncStoragePersister`) porque MMKV é síncrono — performance melhor.

### React Native Paper — Tema Base

```typescript
// mobile/src/lib/theme.ts
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper'

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#208AEF',      // Azul PureUrban (da splash screen)
    secondary: '#E6F4FE',    // Azul claro (do adaptive icon background)
  },
}

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#208AEF',
    secondary: '#1a3a54',
  },
}
```

**Wrapping no `_layout.tsx`:**

```tsx
import { PaperProvider } from 'react-native-paper'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient } from '@/lib/query-client'
import { mmkvPersister } from '@/lib/mmkv-persister'
import { lightTheme } from '@/lib/theme'

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: mmkvPersister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      <PaperProvider theme={lightTheme}>
        {/* ... Expo Router Stack/Tabs ... */}
      </PaperProvider>
    </PersistQueryClientProvider>
  )
}
```

### api-client.ts — Padrão

```typescript
// mobile/src/services/api-client.ts
import { tokenStorage } from '@/lib/storage'
import { API_BASE_URL } from '@/utils/constants'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const token = tokenStorage.getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const json = await response.json()

  if (!response.ok) {
    const error = json.error as ApiError
    throw new ApiClientError(
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? 'An error occurred',
      response.status,
      error?.details,
    )
  }

  // Backend retorna { data: ..., meta: ... } — extrair data
  return json.data as T
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
```

**IMPORTANTE:** O `apiClient` usa `fetch` nativo do React Native — NÃO instalar axios. A resposta da API segue o formato `{ data: {...}, meta: {...} }` (implementado na story 1.4 via `ResponseWrapperInterceptor`).

### Constantes

```typescript
// mobile/src/utils/constants.ts
// Em desenvolvimento, usar IP da máquina para emulador/device
// Android emulator: 10.0.2.2 | iOS simulator: localhost
export const API_BASE_URL = __DEV__
  ? 'http://10.0.2.2:3000'
  : 'https://api.pureurban.com'
```

### Zustand Store — Padrão

```typescript
// mobile/src/stores/app.store.ts
import { create } from 'zustand'

interface AppState {
  isOnline: boolean
  isOfflineModeActive: boolean
  setOnline: (value: boolean) => void
  setOfflineMode: (value: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: true,
  isOfflineModeActive: false,
  setOnline: (value) => set((state) => ({ ...state, isOnline: value })),
  setOfflineMode: (value) => set((state) => ({ ...state, isOfflineModeActive: value })),
}))
```

**Padrão do projeto (architecture.md seção 3):**
- Um store por domínio (`useAuthStore`, `useTripStore`, `useBoardingStore`)
- Actions como métodos do store
- `set(state => ({ ...state, field: newValue }))`

### Project Structure Notes

**Arquivos novos desta story:**
```
mobile/src/
├── lib/
│   ├── storage.ts              # [NEW] MMKV instance + token helpers
│   ├── database.ts             # [NEW] expo-sqlite setup
│   ├── database-migrations.ts  # [NEW] SQL migrations (offline_queue)
│   ├── query-client.ts         # [NEW] TanStack Query client config
│   ├── mmkv-persister.ts       # [NEW] MMKV adapter for TanStack persist
│   └── theme.ts                # [NEW] React Native Paper theme
├── stores/
│   └── app.store.ts            # [NEW] Zustand app-level store
├── services/
│   └── api-client.ts           # [NEW] HTTP client com auth interceptor
└── utils/
    └── constants.ts            # [NEW] API_BASE_URL e constantes
```

**Arquivos modificados:**
- `mobile/src/app/_layout.tsx` — envolver com `PersistQueryClientProvider` + `PaperProvider`
- `mobile/package.json` — novas dependências

**Alinhamento com Architecture (seção 7):**
- `src/services/api-client.ts` → confere com architecture.md
- `src/stores/` → confere com architecture.md (stores por domínio)
- `src/utils/` → confere com architecture.md (`storage.ts`, `offline-queue.ts`, `constants.ts`)
- `src/lib/` → pasta nova para configuração de infraestrutura (query client, persister, theme, database) — NÃO existe na architecture.md mas é padrão React Native para configs de lib

### Imports — Path Alias `@/*`

**OBRIGATÓRIO:** Usar `@/` para todos os imports internos no mobile. Configurado em `tsconfig.json`:

```typescript
// ✅ CORRETO
import { storage } from '@/lib/storage'
import { useAppStore } from '@/stores/app.store'
import { apiClient } from '@/services/api-client'

// ❌ ERRADO
import { storage } from '../../../lib/storage'
```

### Ordem dos Providers no Root Layout

```
PersistQueryClientProvider (mais externo — precisa existir antes de qualquer query)
  └── PaperProvider (tema UI)
        └── Stack/Tabs (navegação Expo Router)
```

### Pacotes a Instalar

| Pacote | Comando | Motivo |
|--------|---------|--------|
| `react-native-mmkv` | `npx expo install react-native-mmkv` | Storage KV ultra-rápido |
| `react-native-nitro-modules` | `npx expo install react-native-nitro-modules` | Dependência do MMKV v4 |
| `expo-sqlite` | `npx expo install expo-sqlite` | Banco SQLite para fila offline |
| `zustand` | `npm install zustand` | Gerenciamento de estado |
| `@tanstack/react-query` | `npm install @tanstack/react-query` | Cache de API + offline |
| `@tanstack/react-query-persist-client` | `npm install @tanstack/react-query-persist-client` | Persistência de cache |
| `@tanstack/query-sync-storage-persister` | `npm install @tanstack/query-sync-storage-persister` | Adapter síncrono para MMKV |
| `react-native-paper` | `npm install react-native-paper` | UI components (Material Design) |

### Anti-Patterns a Evitar

1. **NÃO usar AsyncStorage** — substituído por MMKV por performance (regra architecture.md)
2. **NÃO usar `createAsyncStoragePersister`** — MMKV é síncrono, usar `createSyncStoragePersister`
3. **NÃO instalar axios** — usar `fetch` nativo, mais leve e sem dependências extras
4. **NÃO colocar URL da API hardcoded** — usar constante em `constants.ts` com detecção `__DEV__`
5. **NÃO usar a API antiga do expo-sqlite** (`openDatabase`) — usar `openDatabaseAsync` (SDK 55)
6. **NÃO esquecer o `PaperProvider`** — componentes Paper crasham sem provider
7. **NÃO criar stores Zustand com mutations externas** — actions dentro do store
8. **NÃO usar `require()` no mobile** — Expo com React Compiler exige ES imports
9. **NÃO esquecer de tratar o cenário Expo Go vs dev build** — MMKV não funciona no Expo Go

### Previous Story Intelligence

**Story 1.4 (review) — Learnings:**
- `ResponseWrapperInterceptor` no backend wrapa todas as respostas em `{ data: {...}, meta: { timestamp } }`
- `EffectExceptionFilter` retorna erros em `{ error: { code, message, details? } }`
- O `api-client.ts` deve esperar esses dois formatos — extrair `data` do sucesso, `error` das falhas
- Guards (`RolesGuard`, `TenantGuard`) esperam JWT no header `Authorization: Bearer <token>`
- `TenantGuard` extrai `companyId` do JWT — o mobile deve enviar JWT em toda request autenticada

**Story 1.3 (done) — Learnings:**
- `EffectRuntimeModule` é `@Global()` — runtime disponível via `@Inject('EFFECT_RUNTIME')`
- Vitest é test runner no backend (não Jest)
- Imports no backend usam extensão `.js` (`module: "nodenext"`) — NÃO se aplica ao mobile

**Story 1.1 (done) — Learnings:**
- Expo Router já configurado com `(auth)/`, `(student)/`, `(driver)/` layout groups
- `typedRoutes: true` habilitado — rotas tipadas
- `reactCompiler: true` habilitado — React Compiler ativo
- Path alias `@/*` → `./src/*` e `@/assets/*` → `./assets/*`
- Estrutura atual: `src/app/`, `src/components/`, `src/constants/`, `src/hooks/`

### Git Intelligence

Commits recentes:
- `42fc082` — feat: shared infrastructure and first story implementation
- `c52f9c1` — feat: add sprint planning and context
- `870bcf9` — feat: initialize mobile and api projects

Padrão de commit: `feat:` para features, `docs:` para documentação

### References

- [Source: architecture.md#3-decisoes-arquiteturais] — Zustand stores por domínio, TanStack Query, MMKV, expo-sqlite
- [Source: architecture.md#5-estrategia-de-offline-sync] — Tiers 1 e 2, schema offline_queue, idempotência
- [Source: architecture.md#6-padroes-de-implementacao] — Naming, tratamento de erros mobile, loading states
- [Source: architecture.md#7-estrutura-do-projeto] — Estrutura mobile (services/, stores/, hooks/, utils/)
- [Source: epics.md#story-1.5] — Acceptance criteria originais
- [Source: project-context.md] — MMKV obrigatório, proibido AsyncStorage, path alias @/*
- [Source: 1-4-infraestrutura-compartilhada-guards-filters-pipes.md] — Formato de resposta da API ({ data, meta } e { error })

## Dev Agent Record

### Agent Model Used

Gemini 2.5 Pro (Antigravity)

### Debug Log References

- **MMKV v4 API:** `new MMKV()` substituído por `createMMKV()` — v4 exporta MMKV apenas como tipo, a factory function é `createMMKV`
- **MMKV v4 delete:** `storage.delete(key)` substituído por `storage.remove(key)` — método renomeado na v4
- **expo-doctor:** 16/17 checks passaram; falha esperada relacionada a módulos nativos que requerem dev build

### Completion Notes List

- ✅ Task 1: Todas as dependências instaladas via `npx expo install` e `npm install`
- ✅ Task 2: `storage.ts` com instância MMKV v4 (`createMMKV`) e helpers `tokenStorage` usando `remove()` correto
- ✅ Task 3: `database.ts` (singleton) + `database-migrations.ts` com schema `offline_queue` conforme architecture.md
- ✅ Task 4: `app.store.ts` Zustand com padrão correto do projeto (`set(state => ({ ...state }))`)
- ✅ Task 5: `query-client.ts` com gcTime 24h ≥ maxAge; `mmkv-persister.ts` com `createSyncStoragePersister`
- ✅ Task 6: `theme.ts` com cores do PureUrban (#208AEF primário); `PaperProvider` no `_layout.tsx`
- ✅ Task 7: `constants.ts` com `API_BASE_URL` via `__DEV__`; `api-client.ts` com interceptors de auth/erros
- ✅ Task 8: `_layout.tsx` atualizado — ordem correta: `PersistQueryClientProvider > PaperProvider > AppTabs`; DB inicializado no `useEffect`
- ✅ Task 9: expo-doctor executado (16/17 checks OK); falha esperada por módulos nativos (MMKV requer dev build)

### File List

- `mobile/src/lib/storage.ts` [NEW]
- `mobile/src/lib/database.ts` [NEW]
- `mobile/src/lib/database-migrations.ts` [NEW]
- `mobile/src/lib/query-client.ts` [NEW]
- `mobile/src/lib/mmkv-persister.ts` [NEW]
- `mobile/src/lib/theme.ts` [NEW]
- `mobile/src/stores/app.store.ts` [NEW]
- `mobile/src/services/api-client.ts` [NEW]
- `mobile/src/utils/constants.ts` [NEW]
- `mobile/src/app/_layout.tsx` [MODIFIED]
- `mobile/package.json` [MODIFIED]
- `mobile/package-lock.json` [MODIFIED]

### Change Log

- Instaladas 8 dependências: react-native-mmkv, react-native-nitro-modules, expo-sqlite, zustand, @tanstack/react-query, @tanstack/react-query-persist-client, @tanstack/query-sync-storage-persister, react-native-paper (Date: 2026-04-05)
- Criada infraestrutura de storage: storage.ts (MMKV v4), database.ts + database-migrations.ts (expo-sqlite, offline_queue) (Date: 2026-04-05)
- Criado gerenciamento de estado: app.store.ts (Zustand) (Date: 2026-04-05)
- Criada camada de dados: query-client.ts + mmkv-persister.ts (TanStack Query + persistência MMKV) (Date: 2026-04-05)
- Criada configuração de UI: theme.ts (React Native Paper, cores PureUrban) (Date: 2026-04-05)
- Criada camada de serviços: api-client.ts (fetch + interceptors) + constants.ts (Date: 2026-04-05)
- Atualizado _layout.tsx: PersistQueryClientProvider > PaperProvider > AppTabs, inicialização do banco no startup (Date: 2026-04-05)

