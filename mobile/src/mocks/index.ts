export const MOCKS_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_USE_MOCKS === '1'

const GUARD = '__pureurbanMswBoot' as const
type MswGlobal = typeof globalThis & { [GUARD]?: Promise<void> }

async function startMocking(): Promise<void> {
  // Polyfills DEVEM ser importados antes de qualquer import do msw.
  await import('./polyfills')
  const { server } = await import('./server')

  // 'warn' e não 'bypass': com bypass, um path errado num handler vira uma
  // requisição silenciosa à rede real, e o dev fica caçando um mock que nunca
  // interceptou nada.
  server.listen({ onUnhandledRequest: 'warn' })

  console.log('[mocks] MSW ativo — requisições da API são interceptadas')
}

export function enableMocking(): Promise<void> {
  if (!MOCKS_ENABLED) return Promise.resolve()

  const g = globalThis as MswGlobal
  // Guarda em globalThis, não numa flag de módulo: o Fast Refresh reavalia o
  // módulo e zeraria a flag, reabrindo o segundo `server.listen()` no primeiro
  // save. Memoiza a promise (não um booleano) para que invocações concorrentes
  // compartilhem a mesma inicialização.
  //
  // Consequência aceita: como `startMocking()` nunca roda de novo, o conjunto de
  // handlers fica congelado pela vida da página. Editar `server.ts` ou um handler
  // constrói um `setupServer` novo que nunca faz `listen()`, enquanto o original
  // segue interceptando com os handlers antigos — a edição só vale após reload.
  // Rastrear a identidade do server para re-`listen()` reabriria o risco de duplo
  // `listen` que esta guarda existe para fechar, em código só-de-dev, e o preço
  // do trade-off é um F5.
  g[GUARD] ??= startMocking().catch((err: unknown) => {
    // listen() falhou: a rede nunca foi configurada, então uma próxima chamada
    // seria legítima. Hoje não existe nenhuma — `_layout.tsx` seta `mockError` e
    // curto-circuita o componente, de modo que o app fica na tela de erro até o
    // reload com ou sem esta limpeza. Ela está aqui para que a guarda não seja o
    // que impede um retry, caso um dia haja um.
    delete g[GUARD]
    throw err
  })

  return g[GUARD]
}
