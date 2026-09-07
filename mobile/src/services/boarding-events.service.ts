import EventSource from 'react-native-sse'
import type { components } from '@/types/api'

import { tokenStorage } from '@/lib/storage'
import { refreshAccessToken } from '@/services/api-client'
import { API_BASE_URL } from '@/utils/constants'

// Tipos gerados a partir de `api/openapi.json` — nunca escritos à mão.
export type BoardingNotReturningEvent =
  components['schemas']['BoardingNotReturningEventDto']
export type BoardingAbsenceCancelledEvent =
  components['schemas']['BoardingAbsenceCancelledEventDto']
export type BoardingCheckinReminderEvent =
  components['schemas']['BoardingCheckinReminderEventDto']

// O contrato 4.0 não tem evento de fim de viagem no stream: o servidor encerra
// a conexão e a reconexão recebe 409 TRIP_NOT_ACTIVE — é isso que fecha
// definitivamente a conexão aqui (close em handleError).
export interface BoardingEventHandlers {
  onNotReturning: (event: BoardingNotReturningEvent) => void
  onAbsenceCancelled: (event: BoardingAbsenceCancelledEvent) => void
  // Lembrete do canal (Story 4.4): a story 4.2 só faz forwarding — nenhum
  // consumidor no motorista ainda.
  onCheckinReminder?: (event: BoardingCheckinReminderEvent) => void
}

export interface BoardingEventsConnection {
  close: () => void
}

const EVENTS_PATH = '/api/v1/boarding/events'

// Escada do projeto (Architecture §5): 1s, 2s, 4s, 8s… com teto de 30s.
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 30_000

function parsePayload<T>(data: string | null): T | null {
  if (data === null) return null
  try {
    return JSON.parse(data) as T
  } catch {
    // Payload corrompido não pode derrubar a tela do motorista.
    return null
  }
}

type TypedEventSource = EventSource<
  | 'boarding.not_returning'
  | 'boarding.absence_cancelled'
  | 'boarding.checkin_reminder'
>

class BoardingEventsClient {
  private source: TypedEventSource | null = null
  private closed = false
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly tripId: string,
    private readonly handlers: BoardingEventHandlers,
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
    const source = new EventSource<
      'boarding.not_returning' | 'boarding.absence_cancelled' | 'boarding.checkin_reminder'
    >(`${API_BASE_URL}${EVENTS_PATH}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    this.source = source

    source.addEventListener('open', () => {
      this.attempts = 0
    })

    source.addEventListener('error', (event) => {
      if (event.type === 'error') {
        void this.handleError(event)
      }
    })

    source.addEventListener('boarding.not_returning', (event) => {
      const payload = parsePayload<BoardingNotReturningEvent>(event.data)
      if (payload) this.handlers.onNotReturning(payload)
    })

    source.addEventListener('boarding.absence_cancelled', (event) => {
      const payload = parsePayload<BoardingAbsenceCancelledEvent>(event.data)
      if (payload) this.handlers.onAbsenceCancelled(payload)
    })

    source.addEventListener('boarding.checkin_reminder', (event) => {
      const payload = parsePayload<BoardingCheckinReminderEvent>(event.data)
      if (payload) this.handlers.onCheckinReminder?.(payload)
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
      return
    }

    if (event.xhrStatus === 401) {
      // Access token de 15m expirou no meio do stream: refresh single-flight
      // e reconstrução do cliente. Falha no refresh cai no backoff abaixo
      // (a sessão inteira vai ser encerrada pelo api-client noutro fluxo).
      const refreshed = await refreshAccessToken()
      if (this.closed) return
      if (refreshed) {
        this.open()
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

export function connectBoardingEvents(
  tripId: string,
  handlers: BoardingEventHandlers,
): BoardingEventsConnection {
  const client = new BoardingEventsClient(tripId, handlers)
  client.start()
  return { close: () => client.close() }
}
