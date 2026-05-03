import { create } from 'zustand'
import { tokenStorage } from '@/lib/storage'
import type { AuthUser } from '@/services/auth.service'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (user: AuthUser) => void
  logout: () => void
}

// Hidrata o estado de autenticação a partir do MMKV no startup.
// Se há um accessToken persistido, consideramos o usuário autenticado.
// O _layout.tsx tentará usar o token e redirecionará para login se ele estiver expirado
// (o interceptor de refresh fará uma tentativa de renovação automática antes disso).
const hasPersistedToken = Boolean(tokenStorage.getAccessToken())

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: hasPersistedToken,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => {
    tokenStorage.clearTokens()
    set({ user: null, isAuthenticated: false })
  },
}))

