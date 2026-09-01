import {
  reportSuccess,
  reportTransportFailure,
  startConnectivityListeners,
} from '@/lib/connectivity'
import { useAppStore } from '@/stores/app.store'

// O sinal de conectividade é o gatilho que ANTECIPA o dreno quando a rede volta.
// Sem estes testes, apagar `reportSuccess()`/`reportTransportFailure()` do
// `api-client` deixaria `isOnline` congelado e nada acusaria: a fila só voltaria
// a drenar no teto de 30s do backoff.

beforeEach(() => {
  useAppStore.getState().setOnline(true)
})

describe('conectividade derivada do desfecho das requisições', () => {
  it('falha de transporte marca offline; qualquer resposta HTTP marca online', () => {
    reportTransportFailure()
    expect(useAppStore.getState().isOnline).toBe(false)

    // Inclusive um 500: o que importa é que a resposta CHEGOU.
    reportSuccess()
    expect(useAppStore.getState().isOnline).toBe(true)
  })

  it('notifica os subscribers só na TRANSIÇÃO, não a cada requisição', () => {
    const transitions: boolean[] = []
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.isOnline !== prev.isOnline) transitions.push(state.isOnline)
    })

    reportSuccess()
    reportSuccess()
    reportTransportFailure()
    reportTransportFailure()
    reportTransportFailure()
    reportSuccess()

    unsubscribe()
    // Uma requisição bem-sucedida por segundo não pode acordar o dreno a cada vez.
    expect(transitions).toEqual([false, true])
  })

  it('a volta da rede é observável como false -> true, que é o gatilho do dreno', () => {
    let drains = 0
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.isOnline && !prev.isOnline) drains += 1
    })

    reportTransportFailure()
    reportSuccess()
    unsubscribe()

    expect(drains).toBe(1)
  })
})

describe('startConnectivityListeners', () => {
  // O runner do `jest-expo` é o ambiente react-native: `window` existe mas não
  // despacha eventos. Registramos os handlers por espião — o que importa é que
  // `online`/`offline` do browser cheguem ao mesmo sinal e sejam removidos.
  it('os eventos do browser antecipam o sinal e a limpeza os remove', () => {
    const handlers = new Map<string, () => void>()
    const removed: string[] = []
    // No ambiente react-native do `jest-expo` o `window` não tem
    // `addEventListener`; instalá-lo aqui é o que simula o alvo web.
    Object.assign(window, {
      addEventListener: (event: string, handler: () => void) => handlers.set(event, handler),
      removeEventListener: (event: string) => removed.push(event),
    })

    const stop = startConnectivityListeners()
    expect([...handlers.keys()].sort()).toEqual(['offline', 'online'])

    handlers.get('offline')!()
    expect(useAppStore.getState().isOnline).toBe(false)

    handlers.get('online')!()
    expect(useAppStore.getState().isOnline).toBe(true)

    stop()
    expect(removed.sort()).toEqual(['offline', 'online'])

    // @ts-expect-error — desfaz o alvo web simulado.
    delete window.addEventListener
    // @ts-expect-error — idem.
    delete window.removeEventListener
  })

  it('sem `addEventListener` (alvo nativo) é no-op e devolve uma limpeza chamável', () => {
    expect(typeof window.addEventListener).not.toBe('function')
    expect(() => startConnectivityListeners()()).not.toThrow()
  })
})
