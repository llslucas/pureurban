import { QueryObserver, onlineManager } from '@tanstack/react-query'

import { queryClient } from '@/lib/query-client'

// Tranca a decisão AI5 da retro 3: `networkMode: 'always'` é default GLOBAL do
// queryClient — queries NUNCA pausam. Antes disso, no alvo web o onlineManager
// seguia o evento `offline` do window e um refetch ficava em
// `fetchStatus: 'paused'` sem nunca errar: a tela não reage e o Banner de dado
// velho não aparece (bug DS7, que a disciplina por-query já tinha deixado
// escapar em `['activeTrip']`). Se alguém remover o default, este teste volta a
// ver `paused` aqui e a regressão fica visível.

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('default global do queryClient — queries nunca pausam', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
    queryClient.clear()
  })

  it('sem `networkMode` explícito, refetch com o onlineManager offline ERRa em vez de pausar', async () => {
    onlineManager.setOnline(false)
    queryClient.setQueryData(['test', 'never-pauses'], { cached: true })

    const observer = new QueryObserver(queryClient, {
      queryKey: ['test', 'never-pauses'],
      queryFn: () => Promise.reject(new TypeError('Failed to fetch')),
      retry: false,
    })
    const unsubscribe = observer.subscribe(() => {})

    await observer.refetch().catch(() => {})
    await flush()

    const result = observer.getCurrentResult()
    expect(result.fetchStatus).toBe('idle')
    expect(result.isError).toBe(true)
    expect(result.data).toEqual({ cached: true })

    unsubscribe()
  })
})
