export const MOCKS_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_USE_MOCKS === '1'

export async function enableMocking(): Promise<void> {
  if (!MOCKS_ENABLED) {
    return
  }

  // Polyfills DEVEM ser importados antes de qualquer import do msw.
  await import('./polyfills')
  const { server } = await import('./server')

  // 'warn' e não 'bypass': com bypass, um path errado num handler vira uma
  // requisição silenciosa à rede real, e o dev fica caçando um mock que nunca
  // interceptou nada.
  server.listen({ onUnhandledRequest: 'warn' })

  console.log('[mocks] MSW ativo — requisições da API são interceptadas')
}
