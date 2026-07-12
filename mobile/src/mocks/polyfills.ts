// Importado ANTES de qualquer import do msw — Hermes não tem URL completo
// nem TextEncoder, e a comunidade (MSW v2) reporta referências adicionais a
// MessageEvent/Event/EventTarget/BroadcastChannel faltando na inicialização.
// Ver: https://mswjs.io/docs/integrations/react-native/
import 'react-native-url-polyfill/auto'
import 'fast-text-encoding'

if (typeof (globalThis as { Event?: unknown }).Event === 'undefined') {
  class EventPolyfill {
    type: string
    constructor(type: string) {
      this.type = type
    }
  }
  ;(globalThis as unknown as { Event: unknown }).Event = EventPolyfill
}

if (typeof (globalThis as { EventTarget?: unknown }).EventTarget === 'undefined') {
  class EventTargetPolyfill {
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    addEventListener(type: string, listener: (...args: unknown[]) => void) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set())
      this.listeners.get(type)!.add(listener)
    }
    removeEventListener(type: string, listener: (...args: unknown[]) => void) {
      this.listeners.get(type)?.delete(listener)
    }
    dispatchEvent(event: { type: string }) {
      this.listeners.get(event.type)?.forEach((listener) => listener(event))
      return true
    }
  }
  ;(globalThis as unknown as { EventTarget: unknown }).EventTarget =
    EventTargetPolyfill
}

if (
  typeof (globalThis as { MessageEvent?: unknown }).MessageEvent ===
  'undefined'
) {
  class MessageEventPolyfill {
    type: string
    data: unknown
    constructor(type: string, init?: { data?: unknown }) {
      this.type = type
      this.data = init?.data
    }
  }
  ;(globalThis as unknown as { MessageEvent: unknown }).MessageEvent =
    MessageEventPolyfill
}

if (
  typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel ===
  'undefined'
) {
  class BroadcastChannelPolyfill {
    name: string
    onmessage: ((event: unknown) => void) | null = null
    constructor(name: string) {
      this.name = name
    }
    postMessage() {
      // No-op: cada instância do app roda isolada, sem outras abas/tabs.
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  ;(globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel =
    BroadcastChannelPolyfill
}
