import * as Crypto from 'expo-crypto'
import { create } from 'zustand'
import { mmkvPersister } from '@/lib/mmkv-persister'
import { queryClient } from '@/lib/query-client'
import { qrSessionStorage, tokenStorage, userStorage } from '@/lib/storage'
import type { AuthUser } from '@/services/auth.service'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (user: AuthUser) => void
  logout: () => void
}

// Hidrata o estado de autenticação a partir do MMKV no startup.
// Um token sem usuário é sessão inutilizável (o QR não tem studentId/name para
// renderizar) — por isso isAuthenticated exige os dois, não só o token.
const hasPersistedToken = Boolean(tokenStorage.getAccessToken())
const persistedUser = userStorage.getUser()

// Token órfão (build antigo que nunca gravou `auth.user`, ou registro de usuário
// corrompido): sem isso os tokens ficam para sempre no MMKV e qualquer requisição
// disparada antes do próximo login sairia com o Bearer da identidade anterior.
if (hasPersistedToken && !persistedUser) {
  tokenStorage.clearTokens()
  qrSessionStorage.clearSessionId()
}

// O cache do TanStack é persistido em MMKV por 24h e as chaves não têm segmento
// de usuário (`['routes','mine']` é a mesma para todo mundo). Sem limpar aqui, o
// próximo aluno a logar no mesmo aparelho recebe a rota do anterior direto do
// cache reidratado — quebra de isolamento entre alunos, não só dado stale.
function clearPersistedQueryCache(): void {
  queryClient.clear()
  void mmkvPersister.removeClient()
}

export const useAuthStore = create<AuthState>((set) => ({
  user: persistedUser,
  isAuthenticated: hasPersistedToken && Boolean(persistedUser),
  login: (user) => {
    // Cache do usuário anterior não pode atravessar a troca de conta.
    clearPersistedQueryCache()
    userStorage.setUser(user)
    // sessionId novo a cada login — QR estático por sessão (NFR8), não por conta.
    qrSessionStorage.setSessionId(Crypto.randomUUID())
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    tokenStorage.clearTokens()
    userStorage.clearUser()
    qrSessionStorage.clearSessionId()
    clearPersistedQueryCache()
    set({ user: null, isAuthenticated: false })
  },
}))
