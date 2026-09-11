import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Queries NUNCA pausam (decisão AI5 da retro 3): com o default
      // `networkMode: 'online'`, no alvo web o onlineManager segue o evento
      // `offline` do window e um refetch fica em `fetchStatus: 'paused'` sem
      // nunca errar — a tela não reage e o Banner de dado velho não aparece
      // (bug DS7 da retro 3, que a disciplina por-query já deixou escapar em
      // duas telas). Também é o que alimenta a conectividade derivada da
      // 3.4b: query pausada não faz request e o api-client deixa de emitir o
      // desfecho de transporte que sustenta `isOnline` (a NFR14 conta "API
      // fora do ar" como offline — sinal de rádio, como o NetInfo, diria o
      // contrário). Quem quiser pausa tem que pinar `networkMode` explícito.
      networkMode: 'always',
      gcTime: 1000 * 60 * 60 * 24, // 24 horas — DEVE ser >= maxAge do persister
      staleTime: 1000 * 60, // 1 minuto
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
})
