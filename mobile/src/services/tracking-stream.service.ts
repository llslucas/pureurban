import EventSource from 'react-native-sse'
import type { components } from '@/types/api'

import { tokenStorage } from '@/lib/storage'
import { refreshAccessToken } from '@/services/api-client'
import { API_BASE_URL } from '@/utils/constants'

// Tipos gerados a partir de `api/openapi.json` — nunca escritos à mão.
export type LocationUpdatedEvent =
  components['schemas']['LocationUpdatedEventDto']

// O contrato 5.0 não tem evento de fim de viagem no stream: o servidor encerra
// a conexão e a reconexão recebe 409 TRIP_NOT_ACTIVE — é isso que fecha
// definitivamente a conexão aqui (close em handleError) e avisa a tela via
// onTripEnded.
export interface TrackingStreamHandlers {
  onLocationUpdated: (event: LocationUpdatedEvent) => void
  // (Re)estabelecimento da conexão — inclusive a primeira: o consumidor
  // reconcilia o estado que pode ter mudado durante a queda de rede.
  onOpen?: () => void
  // Stream fechado com 409 (viagem encerrada no servidor entre os eventos):
  // fechamento contratado, sem retry — a tela mostra "Nenhuma viagem ativa
  // no momento" e volta a consultar a descoberta.
  onTripEnded?: () => void
  // Fim do stream sem perspectiva de recuperação automática: três refreshes
  // falhados em sequência no caminho 401 (mesma regra do boarding, RV1).
  onUnrecoverable?: () => void
}

export interface TrackingEventsConnection {
  close: () => void
}

// Escada do projeto (Architecture §5): 1s, 2s, 4s, 8s… com teto de 30s.
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 30_000

// Refreshes falhados consecutivos no caminho 401 antes de declarar o stream
// irrecuperável (reset a cada open() bem-sucedido).
const MAX_FAILED_REFRESHES = 3

function parsePayload<T>(data: string | null): T | null {
  if (data === null) return null
  try {
    return JSON.parse(data) as T
  } catch {
    // Payload corrompido não pode derrubar a tela do aluno.
    return null
  }
}

type TypedEventSource = EventSource<'location.updated'>

class TrackingEventsClient {
  private source: TypedEventSource | null = null
  private closed = false
  private attempts = 0
  private failedRefreshes = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly tripId: string,
    private readonly handlers: TrackingStreamHandlers,
  ) {}

  start(): void {
    this.open()
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.source?.close()
    this.source = null
  }

  // Uma conexão nova POR tentativa: o token vem do storage a cada open() —
  // nunca na URL (decisão de auth da 4.2) e nunca congelado na primeira
  // conexão, já que o access token expira em 15m no meio do stream.
  private open(): void {
    if (this.closed) return

    const token = tokenStorage.getAccessToken()
    const source: TypedEventSource = new EventSource(
      `${API_BASE_URL}/api/v1/tracking/trips/${this.tripId}/stream`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    this.source = source

    source.addEventListener('open', () => {
      this.attempts = 0
      this.failedRefreshes = 0
      this.handlers.onOpen?.()
    })

    source.addEventListener('error', (event) => {
      if (event.type === 'error') {
        void this.handleError(event)
      }
    })

    // Heartbeats (`ping`) NÃO têm listener de propósito: ping prova conexão,
    // não sinal GPS — e é o onLocationUpdated que alimenta o timer do
    // indicador "Sem sinal GPS" na tela.

    source.addEventListener('location.updated', (event) => {
      const payload = parsePayload<LocationUpdatedEvent>(event.data)
      if (payload) this.handlers.onLocationUpdated(payload)
    })
  }

  private async handleError(
    event: { xhrStatus: number; xhrState: number; message: string },
  ): Promise<void> {
    if (this.closed) return

    // Fecha a instância atual ANTES de decidir: a lib reabre por conta própria
    // (poll-again) após erros — sem close(), ficariam duas conexões correndo.
    this.source?.close()
    this.source = null

    if (event.xhrStatus === 409) {
      // Viagem encerrada (ou inexistente): fim definitivo, sem loop de
      // reconexão — o 409 do guard é o sinal contratado de fechamento.
      this.close()
      this.handlers.onTripEnded?.()
      return
    }

    if (event.xhrStatus === 401) {
      // Access token de 15m expirou no meio do stream: refresh single-flight
      // e reconstrução do cliente.
      const refreshed = await refreshAccessToken()
      if (this.closed) return
      if (refreshed) {
        this.open()
        return
      }
      // Refresh falhou: reconectar relendo o mesmo token expirado só para o
      // loop ser infinito numa tela passiva não é recuperação — após
      // MAX_FAILED_REFRESHES sem open() no meio, encerra e sinaliza (RV1).
      this.failedRefreshes += 1
      if (this.failedRefreshes >= MAX_FAILED_REFRESHES) {
        this.close()
        this.handlers.onUnrecoverable?.()
        return
      }
    }

    const delay = Math.min(
      BACKOFF_BASE_MS * 2 ** this.attempts,
      BACKOFF_MAX_MS,
    )
    this.attempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }
}

export function connectTrackingEvents(
  tripId: string,
  handlers: TrackingStreamHandlers,
): TrackingEventsConnection {
  const client = new TrackingEventsClient(tripId, handlers)
  client.start()
  return { close: () => client.close() }
}
