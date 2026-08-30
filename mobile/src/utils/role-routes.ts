import type { Href } from 'expo-router'

import type { UserRole } from '@/services/auth.service'

// Fonte única do roteamento por papel: o grupo que o shell monta e a rota de
// entrada. Os guards de `_layout.tsx` são derivados daqui e a tela de login lê
// `homeForRole` — adicionar um papel é uma edição só. Manter os guards escritos
// à mão em paralelo a este mapa era a divergência que produzia loop de redirect
// silencioso (o grupo some da árvore e o `+not-found` devolve para cá).
export const ROLE_ROUTES = {
  DRIVER: { group: '(driver)', home: '/(driver)/trip' },
  STUDENT: { group: '(student)', home: '/(student)/home' },
  ADMIN: { group: '(admin)', home: '/(admin)/home' },
} as const satisfies Record<UserRole, { group: string; home: Href }>

export const ROLES = Object.keys(ROLE_ROUTES) as UserRole[]

// `Object.hasOwn` e não indexação direta: um `role` que colida com uma chave de
// Object.prototype ("constructor", "toString") devolveria a função herdada —
// truthy, escapando do ramo `null` e chegando ao router como Href. A resposta da
// API é tipada, não validada, então a colisão é alcançável.
export function homeForRole(role: UserRole): Href | null {
  return Object.hasOwn(ROLE_ROUTES, role) ? ROLE_ROUTES[role].home : null
}
