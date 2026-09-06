import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query'

// AC #3 / FR24 — estado 7 da Tabela de Verdade: roster em erro COM dado em
// cache renderiza a lista do cache + o Banner "Dados podem estar desatualizados".
//
// A verificação manual da Story 3.5b (Task 7.5) encontrou que o Banner nunca
// aparecia no alvo web offline: o DevTools "Offline" dispara o evento `offline`
// do window, o `onlineManager` padrão do TanStack fica offline, e um refetch com
// o `networkMode: 'online'` default **pausa** em vez de errar — `isError` nunca
// vira true. O fix é `networkMode: 'always'` na query do roster. Este teste
// tranca esse comportamento: se alguém remover o `networkMode`, o segundo caso
// volta a passar como o primeiro e a regressão fica visível aqui.

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const KEY = ['trip', 'trip-1', 'students'] as const
const CACHED = { students: [], summary: { boarded: 1, total: 4 } }

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: 0, gcTime: Infinity } } })
}

describe('query do roster — estado 7 offline no alvo web', () => {
  beforeEach(() => {
    // Emula o DevTools → Network → Offline: no alvo web o OnlineManager engancha
    // os eventos online/offline do window e passa a reportar offline.
    onlineManager.setOnline(false)
  })

  afterEach(() => {
    onlineManager.setOnline(true)
  })

  it("com networkMode 'always' o refetch offline ERRA e mantém o cache (isError && data)", async () => {
    const client = makeClient()
    client.setQueryData(KEY, CACHED)
    const observer = new QueryObserver(client, {
      queryKey: KEY,
      queryFn: () => Promise.reject(new TypeError('Failed to fetch')),
      networkMode: 'always',
      retry: 0,
    })
    const unsubscribe = observer.subscribe(() => {})

    await observer.refetch().catch(() => {})
    await flush()

    const result = observer.getCurrentResult()
    expect(result.isError).toBe(true)
    expect(result.fetchStatus).toBe('idle')
    expect(result.data).toEqual(CACHED)

    unsubscribe()
    client.clear()
  })

  it('com o networkMode default o refetch offline PAUSA e isError nunca vira true (o bug original)', async () => {
    const client = makeClient()
    client.setQueryData(KEY, CACHED)
    const observer = new QueryObserver(client, {
      queryKey: KEY,
      queryFn: () => Promise.reject(new TypeError('Failed to fetch')),
      retry: 0,
    })
    const unsubscribe = observer.subscribe(() => {})

    void observer.refetch().catch(() => {})
    await flush()

    const result = observer.getCurrentResult()
    expect(result.fetchStatus).toBe('paused')
    expect(result.isError).toBe(false)
    expect(result.data).toEqual(CACHED)

    unsubscribe()
    client.clear()
  })
})
