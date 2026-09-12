/**
 * Controlador puro da captura de GPS do motorista (Story 5.1).
 *
 * A lógica de cadência vive AQUI, sem React e sem expo-location: as deps
 * (getLocation, send, schedule) são injetadas, então o teste usa fakes com
 * fake timers e o hook `use-trip-gps-capture` é só a adaptação. Regras:
 * - `start()` dispara o primeiro envio imediatamente e reagenda a cada 5s;
 * - falha de captura OU de envio descarta a posição e mantém a cadência
 *   (posição é last-write-wins e descartável — sem fila, sem retry);
 * - um envio em voo por vez (tick lento não empilha POSTs);
 * - `stop()` cancela o tick agendado e nada mais é enviado (NFR10).
 */

/** Cadência da 5.1: um POST a cada ~5s enquanto a viagem está ativa. */
export const GPS_CAPTURE_INTERVAL_MS = 5_000

export interface GpsPosition {
  latitude: number
  longitude: number
  accuracy?: number
  capturedAt: string
}

export interface GpsCaptureDeps {
  /** Lê a posição atual do device (no app: `getCurrentPositionAsync`). */
  getLocation: () => Promise<GpsPosition>
  /** Envia a posição para a API. Rejeita em falha de transporte ou de negócio. */
  send: (position: GpsPosition) => Promise<unknown>
  /**
   * Agenda o próximo tick. `delayMs === null` cancela o agendamento pendente
   * (é assim que o stop interrompe a cadência).
   */
  schedule: (delayMs: number | null, tick: () => void) => void
}

export type ScheduleFn = GpsCaptureDeps['schedule']

/** Scheduler real sobre `setTimeout`, usado pelo hook; o teste injeta o dele. */
export function createTimeoutSchedule(): ScheduleFn {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (delayMs, tick) => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (delayMs === null) return
    timer = setTimeout(() => {
      timer = null
      void tick()
    }, delayMs)
  }
}

export interface GpsCapture {
  start: () => void
  stop: () => void
}

export function createGpsCapture(deps: GpsCaptureDeps): GpsCapture {
  let running = false
  let inFlight = false

  const tick = (): void => {
    if (!running) return
    // O próximo tick é agendado ANTES da captura: a cadência é medida do
    // início de um tick ao início do seguinte, então um getLocation/send lento
    // não estica o intervalo — e a falha logo abaixo não precisa reagendar.
    deps.schedule(GPS_CAPTURE_INTERVAL_MS, tick)
    if (inFlight) return
    inFlight = true
    void deps
      .getLocation()
      .then((position) => deps.send(position))
      .catch(() => {
        // Posição perdida é descartada: velha não tem valor (last-write-wins).
      })
      .finally(() => {
        inFlight = false
      })
  }

  return {
    start: () => {
      if (running) return
      running = true
      tick()
    },
    stop: () => {
      running = false
      deps.schedule(null, tick)
    },
  }
}
