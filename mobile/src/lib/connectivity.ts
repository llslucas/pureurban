import { useAppStore } from '@/stores/app.store'

// Conectividade DERIVADA, não sondada (Story 3.4b).
//
// NetInfo e `navigator.onLine` dizem que o rádio está ligado, não que a API
// responde — e a NFR14 trata "API fora do ar" como offline. O `api-client` já
// separa transporte de negócio, então o desfecho real das requisições é o sinal
// mais honesto disponível, e não custa uma dependência nova.

function setOnline(value: boolean): void {
  const state = useAppStore.getState()
  // Escrever só na transição: `setOnline` notifica todos os subscribers do
  // zustand, e o dreno é disparado por `false -> true`.
  if (state.isOnline !== value) state.setOnline(value)
}

/** Uma resposta HTTP chegou — qualquer status. O transporte funciona. */
export function reportSuccess(): void {
  setOnline(true)
}

/** Nenhuma resposta chegou: rede caída, DNS, API fora do ar ou timeout. */
export function reportTransportFailure(): void {
  setOnline(false)
}

/**
 * Eventos `online`/`offline` do browser, quando existirem (alvo web).
 *
 * Só ANTECIPAM o sinal: o backoff continua sendo o gatilho autoritativo do
 * dreno. `online` aqui é otimista de propósito — dispara uma tentativa que, se
 * a API ainda estiver fora, volta a `false` pelo próprio `api-client`.
 *
 * Retorna a função de limpeza; no-op nas plataformas sem `window`.
 */
export function startConnectivityListeners(): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => undefined
  }

  const handleOnline = () => reportSuccess()
  const handleOffline = () => reportTransportFailure()

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
