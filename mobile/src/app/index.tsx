import { Redirect } from 'expo-router'
import { useEffect } from 'react'

import { useAuthStore } from '@/stores/auth.store'
import { homeForRole } from '@/utils/role-routes'

// Ponto de entrada (`/`) e destino de reabertura com sessão hidratada do MMKV:
// é aqui que a AC #2 fecha para quem NÃO passou pela tela de login.
export default function Index() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const destination = isAuthenticated && user ? homeForRole(user.role) : null
  const strandedSession = isAuthenticated && user !== null && destination === null

  // Sessão autenticada num papel sem destino. Redirecionar para o login sem
  // derrubar a sessão não resolve: o grupo `(auth)` só entra na árvore com
  // `!isAuthenticated`, então o destino não existe, o router cai no
  // `+not-found` — que reexporta este arquivo — e a decisão se repete. Derrubar
  // a sessão é o que torna `(auth)` alcançável, e é o mesmo tratamento que
  // `login.tsx` dá ao papel não suportado (lá com mensagem, porque há tela).
  useEffect(() => {
    if (strandedSession) logout()
  }, [strandedSession, logout])

  if (destination) return <Redirect href={destination} />

  return <Redirect href="/(auth)/login" />
}
