import EventSource from 'react-native-sse'

import { tokenStorage } from '@/lib/storage'
import { refreshAccessToken } from '@/services/api-client'

// The ONE SSE client (wrap-4, epic-5-retro-item-19/R9): reconnect ladder,
// 409 as the contracted trip-end close, 401 → single-flight refresh with
// three consecutive failures ⇒ onUnrecoverable, and an explicit polling
// interval. DO NOT copy this file for a new stream — declare a config (URL +
// named events + callbacks) and consume connectSseStream. The first copy born
// after this file is a regression of the same item.

// Project ladder (Architecture §5): 1s, 2s, 4s, 8s… capped at 30s.
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 30_000

// Re-poll of the lib after a graceful close (2xx end of trip): without an
// explicit value the interval is the react-native-sse default of 5000ms —
// neither contract nor tested (R6). Pins the SAME observed value: changing it
// is a conscious decision, not silent dependence on a third party.
export const SSE_REPOLL_INTERVAL_MS = 5_000

// Consecutive failed refreshes on the 401 path before declaring the stream
// unrecoverable (reset on every successful open()).
const MAX_FAILED_REFRESHES = 3

function parsePayload<T>(data: string | null | undefined): T | null {
  if (data === null || data === undefined) return null
  try {
    return JSON.parse(data) as T
  } catch {
    // Corrupted payload must not take the screen down.
    return null
  }
}

export interface SseStreamConfig<TEvents extends Record<string, unknown>> {
  url: string
  // One listener per contract event type: each entry becomes an
  // addEventListener that parses the JSON payload and only fires with a
  // valid one. Transport pings get NO listener on purpose (ping proves
  // connectivity, never domain state).
  events: { [K in keyof TEvents]: (payload: TEvents[K]) => void }
  // (Re)establishment of the connection — including the first one: the
  // consumer reconciles state that may have changed during the network drop.
  onOpen?: () => void
  // 409 from the guard: contracted end-of-trip close, no retry.
  onTripEnded?: () => void
  // End of the stream with no automatic recovery in sight: three failed
  // refreshes in a row on the 401 path. NOT invoked on 409.
  onUnrecoverable?: () => void
}

export interface SseConnection {
  close: () => void
}

type EventName<TEvents extends Record<string, unknown>> = Extract<
  keyof TEvents,
  string
>

class SseStreamClient<TEvents extends Record<string, unknown>> {
  private source: EventSource<EventName<TEvents>> | null = null
  private closed = false
  private attempts = 0
  private failedRefreshes = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly config: SseStreamConfig<TEvents>) {}

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

  // One fresh connection PER attempt: the token is read from storage on every
  // open() — never in the URL (auth decision of 4.2) and never frozen on the
  // first connection, since the access token expires in 15m mid-stream.
  private open(): void {
    if (this.closed) return

    const token = tokenStorage.getAccessToken()
    const source: EventSource<EventName<TEvents>> = new EventSource(
      this.config.url,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        pollingInterval: SSE_REPOLL_INTERVAL_MS,
      },
    )
    this.source = source

    source.addEventListener('open', () => {
      this.attempts = 0
      this.failedRefreshes = 0
      this.config.onOpen?.()
    })

    source.addEventListener('error', (event) => {
      if (event.type === 'error') {
        void this.handleError(event)
      }
    })

    const names = Object.keys(this.config.events) as EventName<TEvents>[]
    for (const name of names) {
      source.addEventListener(name, (event) => {
        const payload = parsePayload<TEvents[typeof name]>(
          (event as { data?: string | null }).data,
        )
        if (payload) this.config.events[name](payload)
      })
    }
  }

  private async handleError(
    event: { xhrStatus: number; xhrState: number; message: string },
  ): Promise<void> {
    if (this.closed) return

    // Close the current instance BEFORE deciding: the lib reopens on its own
    // (poll-again) after errors — without close() two connections would run.
    this.source?.close()
    this.source = null

    if (event.xhrStatus === 409) {
      // Trip ended (or never existed): definitive end, no reconnect loop —
      // the guard's 409 is the contracted closing signal.
      this.close()
      this.config.onTripEnded?.()
      return
    }

    if (event.xhrStatus === 401) {
      // 15m access token expired mid-stream: single-flight refresh and
      // client rebuild.
      const refreshed = await refreshAccessToken()
      if (this.closed) return
      if (refreshed) {
        this.open()
        return
      }
      // Refresh failed: reconnecting to re-read the same expired token just
      // to loop forever on a passive screen is not recovery — after
      // MAX_FAILED_REFRESHES without an open() in between, close and signal
      // (RV1, epic-4 retro).
      this.failedRefreshes += 1
      if (this.failedRefreshes >= MAX_FAILED_REFRESHES) {
        this.close()
        this.config.onUnrecoverable?.()
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

export function connectSseStream<TEvents extends Record<string, unknown>>(
  config: SseStreamConfig<TEvents>,
): SseConnection {
  const client = new SseStreamClient(config)
  client.start()
  return { close: () => client.close() }
}
