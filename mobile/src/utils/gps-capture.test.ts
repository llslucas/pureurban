import { ApiClientError } from '@/services/api-error'
import {
  createGpsCapture,
  createTimeoutSchedule,
  GPS_CAPTURE_INTERVAL_MS,
  type GpsPosition,
} from '@/utils/gps-capture'

const POSITION: GpsPosition = {
  latitude: -20.755549,
  longitude: -42.881728,
  accuracy: 12.5,
  capturedAt: '2026-09-12T12:00:00.000Z',
}

/**
 * Deps falsas: o `schedule` gravador registra cada chamada (delay + tick) em
 * vez de usar timer real — a cadência é provada invocando os ticks capturados
 * e conferindo o delay pedido. `jest.useFakeTimers` fica só para o teste do
 * `createTimeoutSchedule`, que é quem realmente usa setTimeout.
 */
function createFakeDeps() {
  const scheduled: { delayMs: number | null; tick: () => void }[] = []
  const getLocation = jest.fn()
  const send = jest.fn()
  const deps = {
    getLocation,
    send,
    schedule: (delayMs: number | null, tick: () => void) => {
      scheduled.push({ delayMs, tick })
    },
  }
  const lastTick = () => scheduled[scheduled.length - 1].tick
  return { scheduled, getLocation, send, deps, lastTick }
}

// Microtasks não são afetadas pelos fake timers; a cadeia
// getLocation().then(send).catch().finally() assenta em no máximo meia dúzia.
const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('createGpsCapture', () => {
  it('nunca envia nada antes do start — a captura só existe com viagem ativa + permissão', async () => {
    const { getLocation, send, deps } = createFakeDeps()
    getLocation.mockResolvedValue(POSITION)
    const capture = createGpsCapture(deps)

    await flushMicrotasks()

    expect(getLocation).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()

    capture.start()
    await flushMicrotasks()

    expect(getLocation).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(POSITION)
  })

  it('start: primeiro envio imediato e próximo tick agendado com a cadência de 5s', async () => {
    const { scheduled, getLocation, deps } = createFakeDeps()
    getLocation.mockResolvedValue(POSITION)
    const capture = createGpsCapture(deps)

    capture.start()
    await flushMicrotasks()

    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].delayMs).toBe(GPS_CAPTURE_INTERVAL_MS)

    // Tick seguinte chega: outro envio, outro agendamento de 5s.
    scheduled[0].tick()
    await flushMicrotasks()

    expect(getLocation).toHaveBeenCalledTimes(2)
    expect(scheduled).toHaveLength(2)
    expect(scheduled[1].delayMs).toBe(GPS_CAPTURE_INTERVAL_MS)
  })

  it('start duas vezes não duplica a cadência', async () => {
    const { scheduled, getLocation, deps } = createFakeDeps()
    getLocation.mockResolvedValue(POSITION)
    const capture = createGpsCapture(deps)

    capture.start()
    capture.start()
    await flushMicrotasks()

    expect(getLocation).toHaveBeenCalledTimes(1)
    expect(scheduled).toHaveLength(1)
  })

  it('falha de envio: posição descartada e a cadência segue no próximo tick', async () => {
    const { scheduled, send, deps } = createFakeDeps()
    deps.getLocation.mockResolvedValue(POSITION)
    send.mockRejectedValue(new TypeError('Network request failed'))
    const capture = createGpsCapture(deps)

    capture.start()
    await flushMicrotasks()

    expect(send).toHaveBeenCalledTimes(1)
    // A falha NÃO interrompe a cadência: o tick de 5s já foi agendado.
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].delayMs).toBe(GPS_CAPTURE_INTERVAL_MS)

    // O envio seguinte volta ao normal.
    send.mockResolvedValue(undefined)
    scheduled[0].tick()
    await flushMicrotasks()

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('erro classificado fatal (409/403): PARA a captura — sem tick novo e sem envio depois', async () => {
    const { scheduled, getLocation, send, deps } = createFakeDeps()
    deps.getLocation.mockResolvedValue(POSITION)
    send.mockRejectedValue(
      new ApiClientError('TRIP_NOT_ACTIVE', 'A viagem não está ativa', 409),
    )
    const classifySendError = jest.fn(() => 'fatal' as const)
    const capture = createGpsCapture({ ...deps, classifySendError })

    capture.start()
    await flushMicrotasks()

    // O classificador viu o erro determinístico e o cancelamento foi pedido.
    expect(classifySendError).toHaveBeenCalledWith(expect.any(ApiClientError))
    expect(scheduled).toHaveLength(2)
    expect(scheduled[1].delayMs).toBeNull()

    // Um tick órfão que dispare depois é no-op: a captura acabou.
    scheduled[0].tick()
    await flushMicrotasks()
    expect(getLocation).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('erro classificado transitório: cadência de 5s preservada', async () => {
    const { scheduled, send, deps } = createFakeDeps()
    deps.getLocation.mockResolvedValue(POSITION)
    send.mockRejectedValue(new TypeError('Network request failed'))
    const capture = createGpsCapture({
      ...deps,
      classifySendError: () => 'transient',
    })

    capture.start()
    await flushMicrotasks()

    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].delayMs).toBe(GPS_CAPTURE_INTERVAL_MS)

    send.mockResolvedValue(undefined)
    scheduled[0].tick()
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('classificador é consultado em TODA falha da cadeia, inclusive de captura', async () => {
    const { getLocation, deps } = createFakeDeps()
    getLocation.mockRejectedValue(new Error('Position unavailable'))
    const classifySendError = jest.fn(() => 'transient' as const)
    const capture = createGpsCapture({ ...deps, classifySendError })

    capture.start()
    await flushMicrotasks()

    expect(classifySendError).toHaveBeenCalledTimes(1)
  })

  it('falha de captura: idem — descarta e mantém a cadência', async () => {
    const { scheduled, getLocation, send, deps } = createFakeDeps()
    getLocation.mockRejectedValue(new Error('Position unavailable'))
    const capture = createGpsCapture(deps)

    capture.start()
    await flushMicrotasks()

    expect(send).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].delayMs).toBe(GPS_CAPTURE_INTERVAL_MS)

    getLocation.mockResolvedValue(POSITION)
    scheduled[0].tick()
    await flushMicrotasks()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('tick lento não empilha envio concorrente — um POST em voo por vez', async () => {
    const { scheduled, getLocation, deps } = createFakeDeps()
    let releaseLocation: (position: GpsPosition) => void = () => {}
    getLocation.mockReturnValue(
      new Promise<GpsPosition>((resolve) => {
        releaseLocation = resolve
      }),
    )
    const capture = createGpsCapture(deps)

    capture.start()
    await flushMicrotasks()
    expect(getLocation).toHaveBeenCalledTimes(1)

    // Segundo tick chega com o primeiro ainda em voo: reagenda, mas não captura.
    scheduled[scheduled.length - 1].tick()
    await flushMicrotasks()
    expect(getLocation).toHaveBeenCalledTimes(1)

    releaseLocation(POSITION)
    await flushMicrotasks()

    expect(scheduled[scheduled.length - 1].delayMs).toBe(GPS_CAPTURE_INTERVAL_MS)
  })

  it('stop: cancela o tick agendado (delay null) e nenhum envio acontece depois', async () => {
    const { scheduled, getLocation, send, deps, lastTick } = createFakeDeps()
    getLocation.mockResolvedValue(POSITION)
    const capture = createGpsCapture(deps)

    capture.start()
    await flushMicrotasks()
    expect(scheduled).toHaveLength(1)

    capture.stop()

    // O cancelamento é o agendamento com delay null.
    expect(scheduled).toHaveLength(2)
    expect(scheduled[1].delayMs).toBeNull()

    // Um tick órfão que por acaso dispare depois do stop é ignorado.
    lastTick()()
    await flushMicrotasks()

    expect(getLocation).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stop durante envio em voo: o POST em curso termina, mas nada novo parte', async () => {
    const { scheduled, getLocation, send, deps } = createFakeDeps()
    let releaseLocation: (position: GpsPosition) => void = () => {}
    getLocation.mockReturnValue(
      new Promise<GpsPosition>((resolve) => {
        releaseLocation = resolve
      }),
    )
    const capture = createGpsCapture(deps)

    capture.start()
    capture.stop()
    await flushMicrotasks()

    // O tick imediato do start já passou da checagem `running` e está em voo.
    releaseLocation(POSITION)
    await flushMicrotasks()

    expect(send).toHaveBeenCalledTimes(1)
    // Mas o tick que o start tinha agendado foi cancelado pelo stop...
    expect(scheduled[1].delayMs).toBeNull()
    // ...e dispará-lo manualmente (cenário hipotético pós-cancelamento) é no-op.
    scheduled[0].tick()
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('createTimeoutSchedule', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('agenda o tick no delay pedido', () => {
    const schedule = createTimeoutSchedule()
    const tick = jest.fn()

    schedule(5_000, tick)
    jest.advanceTimersByTime(GPS_CAPTURE_INTERVAL_MS - 1)
    expect(tick).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it('schedule(null) cancela o agendamento pendente', () => {
    const schedule = createTimeoutSchedule()
    const tick = jest.fn()

    schedule(5_000, tick)
    schedule(null, tick)
    jest.advanceTimersByTime(60_000)

    expect(tick).not.toHaveBeenCalled()
  })

  it('novo agendamento substitui o pendente — nunca há dois timers vivos', () => {
    const schedule = createTimeoutSchedule()
    const first = jest.fn()
    const second = jest.fn()

    schedule(5_000, first)
    schedule(1_000, second)
    jest.advanceTimersByTime(1_000)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
