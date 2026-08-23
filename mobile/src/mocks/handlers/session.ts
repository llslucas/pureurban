// Sentinela de sessão compartilhada entre os handlers MSW.
//
// O MSW não tem noção de autenticação: nenhum handler consegue saber "quem está
// logado". O único ponto onde essa informação passa é o POST /auth/login, então
// os handlers de auth gravam o e-mail aqui e os demais leem para decidir qual
// variante de resposta devolver.
//
// Mora num módulo próprio (e não dentro de `routes.handlers.ts`, onde nasceu na
// Story 3.2b) porque `trip.handlers.ts` também precisa ler a sessão, e importar
// de `routes.handlers.ts` fecharia o ciclo auth → routes → auth.
let currentSessionEmail: string | null = null

export function setMockSessionEmail(email: string | null): void {
  currentSessionEmail = email
}

export function getMockSessionEmail(): string | null {
  return currentSessionEmail
}
